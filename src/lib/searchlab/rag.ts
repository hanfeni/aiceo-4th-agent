/**
 * RAG 실습 — 검색 → LLM 해석 (스트리밍).
 *
 * 사용자 결정 2026-05-19: 검색 실습에 RAG 모드 추가. 같은 검색을
 * 돌린 뒤 top-N 문서를 컨텍스트로 LLM 이 출처 기반 답변을 생성.
 * 노드 그래프(검색→LLM해석→완료) + 단계 입출력 모달.
 *
 * 패턴: metalab/run.ts SSE 제너레이터 동형 — stage_start/stage_io
 * 로 노드 상태·입출력, token 으로 LLM 답변 실시간 스트리밍.
 * 모델·검색은 기존 자산 재사용(createModel / searchlab.search).
 */

import { createModel, type ModelEnv } from "@/lib/agent/harness/model";
import { extractContentText } from "@/lib/agent/utils/chunkFilter";
import { search, type SearchParams, type SearchHit } from "./search";

export interface RagParams extends SearchParams {
  /** RAG 컨텍스트로 넣을 상위 문서 수 (검색 topK 와 별개, 기본 5) */
  ragTopK?: number;
}

/** RAG SSE 이벤트 (메타랩 MetaEvent 와 별개·동형) */
export type RagEvent =
  | { type: "system"; text: string }
  // 노드 그래프: 단계 시작(running) / 완료(io 확정).
  // step=retrieve|generate|done (ragStageNodes RAG_STEP_TO_STAGE).
  | { type: "stage_start"; step: string }
  | { type: "stage_io"; step: string; input: string; output: string }
  // 검색 근거(UI 가 결과 리스트로 렌더) — 그래프와 별개로 즉시 표시
  | { type: "hits"; hits: SearchHit[] }
  // LLM 답변 토큰 실시간 스트리밍
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * RAG 시스템 프롬프트.
 *
 * 학생이 "RAG 가 LLM 에게 무엇을 시키는지"를 화면에서 직접 보는 게
 * 실습 핵심 → 코드 상수로 분리, SSE 로 함께 노출(metalab prompts.ts
 * 패턴 동형). 두 핵심 규칙을 담아야 함:
 *  1) grounding — 검색 결과에만 근거, 없으면 "모른다" (환각 방지)
 *  2) 출처 표기 — 답변에 [1] [3] 처럼 문서 번호 인용 (추적 가능)
 * 도메인 중립 — 5개 도메인 어디에도 피팅하지 않음(범용 RAG).
 *
 * 초안 작성(사용자 결정 2026-05-19): grounding + 출처표기 명시.
 * 도메인 중립(사용자 결정 2026-05-19: 5개 도메인에 피팅 금지) —
 * 어느 코퍼스에도 동일 적용. 메타랩 prompts.ts 톤 정합.
 */
export const RAG_SYSTEM = `당신은 제공된 검색 근거만으로 질문에 답하는 RAG 어시스턴트입니다.
사용자가 근거를 깊이 이해하도록 충실하고 상세하게 답하되, 아래 규칙을 반드시 지키세요.

1. 근거 한정: 제공된 [번호] 근거 문서의 내용에만 기반해 답합니다.
   사전 지식·추측으로 보완하지 마세요.
2. 충실한 답변: 질문에 직접 답한 뒤, 근거 문서에서 관련된 사실·세부
   내용·맥락을 빠짐없이 끌어와 풍부하게 설명합니다. 근거에 여러 항목이
   있으면 각각을 짚어 정리하고, 가능하면 항목별 목록·소제목으로 구조화해
   가독성을 높입니다. 단순 한두 문장으로 끝내지 말고, 근거가 담은 정보를
   최대한 활용해 자세히 풀어 씁니다.
3. 모르면 모른다: 근거에 답이 없거나 부족하면 "제공된 자료로는
   확인할 수 없습니다"라고 명확히 밝힙니다. 다만 이때도 짧게 끝내지 말고,
   ① 근거 문서가 실제로 무엇을 담고 있는지 요약하고 ② 질문에 답하려면
   어떤 정보가 더 필요한지 구체적으로 안내합니다. 억지로 답을 지어내지
   마세요.
4. 출처 표기: 사용한 근거를 문장 끝에 [1] [3] 처럼 번호로
   인용합니다. 여러 근거면 [1][2] 처럼 묶어 표기합니다.
5. 형식: 한국어로 작성. 핵심 결론을 먼저 제시한 뒤 근거 기반 상세 설명을
   이어갑니다. 내용이 많으면 목록·소제목으로 나눠 정리합니다. 코드펜스·
   머리말 없이 본문만 작성합니다.`;

/** 검색 근거 → LLM user 메시지(번호 매긴 컨텍스트 블록) */
function buildContext(hits: SearchHit[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.title}\n${h.snippet}`,
    )
    .join("\n\n");
}

function modelEnv(): ModelEnv {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

/** 메인 제너레이터 — API route 가 SSE 로 직렬화 */
export async function* runRag(
  params: RagParams,
): AsyncGenerator<RagEvent> {
  const ragTopK = Math.min(Math.max(params.ragTopK ?? 5, 1), 10);

  // 학생이 RAG 시스템 인스트럭션을 먼저 보게 (실습 핵심)
  yield { type: "system", text: RAG_SYSTEM };

  // ── ① 검색 (Retrieval) ──────────────────────────────
  yield { type: "stage_start", step: "retrieve" };
  let hits: SearchHit[];
  try {
    // 컨텍스트로 ragTopK 건 필요 → 검색 topK 를 그만큼 보장
    hits = await search({
      ...params,
      topK: Math.max(params.topK ?? ragTopK, ragTopK),
    });
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  const ctxHits = hits.slice(0, ragTopK);
  yield { type: "hits", hits: ctxHits };
  const context = buildContext(ctxHits);
  yield {
    type: "stage_io",
    step: "retrieve",
    input:
      `[검색어] ${params.query}\n[방식] ${params.mode}` +
      (params.mode === "hybrid"
        ? ` · ${params.hybridMethod ?? "default"}`
        : ""),
    output:
      ctxHits.length > 0
        ? `검색 근거 ${ctxHits.length}건:\n\n${context}`
        : "검색 결과 없음 — LLM 이 근거 부족을 명시할 것",
  };

  // ── ② LLM 해석 (Generation) — 토큰 스트리밍 ─────────
  yield { type: "stage_start", step: "generate" };
  let model;
  try {
    model = createModel(modelEnv());
  } catch (e) {
    yield {
      type: "error",
      message:
        (e instanceof Error ? e.message : String(e)) +
        " — RAG 는 LLM 키가 필요합니다(.env.local).",
    };
    return;
  }

  const userMsg =
    `다음은 검색으로 찾은 근거 문서입니다.\n\n${context}\n\n` +
    `질문: ${params.query}\n\n` +
    `위 근거에만 기반해 답하고, 사용한 근거를 [번호]로 인용하세요.`;

  let answer = "";
  try {
    const stream = await model.stream([
      { role: "system", content: RAG_SYSTEM },
      { role: "user", content: userMsg },
    ]);
    for await (const chunk of stream) {
      const t = extractContentText(chunk.content);
      if (t) {
        answer += t;
        yield { type: "token", text: t };
      }
    }
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  yield {
    type: "stage_io",
    step: "generate",
    input: `[SYSTEM]\n${RAG_SYSTEM}\n\n[USER]\n${userMsg}`,
    output: answer,
  };

  // ── ③ 완료 ──────────────────────────────────────────
  yield { type: "stage_start", step: "done" };
  yield {
    type: "stage_io",
    step: "done",
    input: `근거 ${ctxHits.length}건 + LLM 답변 ${answer.length}자`,
    output: "RAG 파이프라인 완료 — 근거와 답변을 함께 확인하세요.",
  };
  yield { type: "done" };
}

/**
 * 메타라벨링 실습 — LLM 실작동 (스트리밍).
 *
 * 두 작업:
 *  - "label"   : 선택 문서 N건을 1건씩 LLM 분류 → 메타 JSON
 *  - "discover": N건을 한 묶음으로 LLM 에 던져 스키마 후보 제안
 *
 * 모델은 기존 createModel(env) 재사용 (R1·R2 — 새 모델 경로 안 만듦).
 * BaseChatModel.stream() 토큰을 그대로 SSE 로 흘려 학생이 LLM 이
 * 실제 작동하는 모습을 본다.
 *
 * 데이터: 검색 메뉴와 동일하게 GitHub public raw URL 에서 fetch
 * (domains.fetchCorpus 재사용). 2026-05-19 결정(사용자): 두 메뉴
 * 모두 로컬 training 경로 의존 제거 — 학생 노트북에 training 리포가
 * 없어도 인터넷만 되면 동작(자기완결, 검색 색인과 단일 소스).
 */

import { createModel, type ModelEnv } from "@/lib/agent/harness/model";
import { extractContentText } from "@/lib/agent/utils/chunkFilter";
import { fetchCorpus, type SearchDomain } from "@/lib/searchlab/domains";
import {
  systemFor,
  CONVERGE_SYSTEM,
  buildClassifierSystem,
  type MetaTask,
} from "./prompts";

export interface MetaRunParams {
  domain: SearchDomain;
  task: MetaTask;
  /** 처리할 문서 수 (label/discover 용. allinone 은 미사용·옵션) */
  count?: number;
}

interface RawDoc {
  doc_id: string;
  title: string;
  body: string;
}

/** SSE 이벤트 (메타라벨링 전용 — chat SseEvent 와 별개) */
export type MetaEvent =
  | { type: "system"; task: MetaTask; text: string }
  | { type: "doc_start"; index: number; total: number; title: string }
  | { type: "token"; text: string }
  | { type: "doc_end"; index: number }
  | { type: "phase"; step: string; text: string }
  // 올인원 노드 그래프 모달용: 단계 시작(running)/완료(io 확정).
  // step=discover|converge|fix|classify (metaStageNodes STEP_TO_STAGE).
  | { type: "stage_start"; step: string }
  | {
      type: "stage_io";
      step: string;
      input: string;
      output: string;
      // 발굴 ×10·실분류 5건만 채움 — 모달 스와이프 단위.
      // 미설정(수렴·픽스)이면 모달이 output 단일 표시.
      cases?: { label: string; text: string }[];
    }
  | { type: "done" }
  | { type: "error"; message: string };

// ── 올인원 파라미터 (사용자 확정 2026-05-19) ────────────
const ALLINONE_PER_SET = 20; // 발굴 회당 샘플 수
const ALLINONE_SETS = 10; // 발굴 횟수
const ALLINONE_CLASSIFY = 5; // 실분류 건수 (10→5, 사용자 결정 + 병렬)
const ALLINONE_SAMPLE = ALLINONE_PER_SET * ALLINONE_SETS; // 200 (비복원)

/**
 * Fisher-Yates 셔플 (seed 고정 — 재현성, training 03 프롬프트 규칙).
 * 한 번 셔플한 풀을 분할하므로 회 간 문서 중복이 구조적으로 0.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0; // LCG
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function modelEnv(): ModelEnv {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

/** 메인 제너레이터 — API route 가 이걸 SSE 로 직렬화 */
export async function* runMetaLab(
  params: MetaRunParams,
): AsyncGenerator<MetaEvent> {
  const { domain, task } = params;

  // 올인원은 샘플링·단계 구조가 달라(200 비복원, 4단계) 전용 경로로
  // 위임. 기존 label/discover 로직은 아래 그대로 보존(미변경).
  if (task === "allinone") {
    yield* runAllInOne(domain);
    return;
  }

  const count = Math.min(Math.max(params.count ?? 5, 1), 30);
  const system = systemFor(task);

  // 학생이 시스템 인스트럭션을 먼저 보게 (실습 핵심)
  yield { type: "system", task, text: system };

  let docs: RawDoc[];
  try {
    // 검색 색인과 동일 소스(GitHub raw). count 건만 fetch.
    const corpus = await fetchCorpus(domain, count);
    docs = corpus.map((d) => ({
      doc_id: d.doc_id,
      title: d.title,
      body: d.body,
    }));
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }

  let model;
  try {
    model = createModel(modelEnv());
  } catch (e) {
    yield {
      type: "error",
      message:
        (e instanceof Error ? e.message : String(e)) +
        " — 메타라벨링은 LLM 키가 필요합니다(.env.local).",
    };
    return;
  }

  if (task === "discover") {
    // N건을 한 묶음으로 — 스키마 후보 1회 제안
    const corpus = docs
      .map(
        (d, i) =>
          `[문서 ${i + 1}] ${d.title}\n${d.body.slice(0, 600)}`,
      )
      .join("\n\n");
    yield {
      type: "doc_start",
      index: 0,
      total: 1,
      title: `${docs.length}건 묶음 분석`,
    };
    try {
      const stream = await model.stream([
        { role: "system", content: system },
        { role: "user", content: corpus },
      ]);
      for await (const chunk of stream) {
        // chunk.content 는 OpenAI Responses API 에서 string 이 아니라
        // [{type:"text",text:"..."}] 파트 배열일 수 있다 → 챗과 동일한
        // 추출 유틸 재사용(JSON.stringify 금지, raw 객체 노출 버그 원인).
        const t = extractContentText(chunk.content);
        if (t) yield { type: "token", text: t };
      }
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }
    yield { type: "doc_end", index: 0 };
    yield { type: "done" };
    return;
  }

  // label: 1건씩 분류
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    yield { type: "doc_start", index: i, total: docs.length, title: d.title };
    try {
      const stream = await model.stream([
        { role: "system", content: system },
        {
          role: "user",
          content: `제목: ${d.title}\n\n본문:\n${d.body.slice(0, 4000)}`,
        },
      ]);
      for await (const chunk of stream) {
        const t = extractContentText(chunk.content);
        if (t) yield { type: "token", text: t };
      }
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }
    yield { type: "doc_end", index: i };
  }
  yield { type: "done" };
}

/**
 * 올인원 — 4단계 자동 파이프라인 (사용자 확정 2026-05-19).
 *
 *  ① 발굴 ×10: 코퍼스 비복원 200건 → 20개씩 10묶음, 각 묶음을
 *     DISCOVER 로 분류체계 제안 (10개 발굴 결과)
 *  ② 수렴: 10개 결과를 CONVERGE 로 재투입 → 후보 라벨 선정·확정
 *  ③ 분류기 픽스: 확정 스키마로 분류기 인스트럭션 동적 생성
 *  ④ 실분류 ×10: 픽스된 분류기로 (샘플 안 쓴) 문서 10건 라벨링
 *
 * 중복 없음: 한 번 셔플한 풀을 분할 → 발굴 10회 간 문서 중복 0.
 * ④ 는 발굴에 안 쓰인 뒤쪽 문서 사용(발굴/분류 문서도 비중복).
 */
async function* runAllInOne(
  domain: SearchDomain,
): AsyncGenerator<MetaEvent> {
  // 시작 시 발굴 시스템 인스트럭션 노출 (실습 핵심)
  yield { type: "system", task: "allinone", text: systemFor("discover") };

  let docs: RawDoc[];
  try {
    const corpus = await fetchCorpus(domain); // 전체 fetch
    docs = corpus.map((d) => ({
      doc_id: d.doc_id,
      title: d.title,
      body: d.body,
    }));
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }

  let model;
  try {
    model = createModel(modelEnv());
  } catch (e) {
    yield {
      type: "error",
      message:
        (e instanceof Error ? e.message : String(e)) +
        " — 메타라벨링은 LLM 키가 필요합니다(.env.local).",
    };
    return;
  }

  // 비복원 추출: 셔플 → 발굴용 200 + 분류용 10 (서로 비중복)
  const shuffled = seededShuffle(docs, 20260519);
  const need = ALLINONE_SAMPLE + ALLINONE_CLASSIFY;
  if (shuffled.length < need) {
    yield {
      type: "phase",
      step: "warn",
      text:
        `⚠ 코퍼스 ${shuffled.length}건 < 필요 ${need}건 — 가능한 만큼만 ` +
        `진행(발굴 묶음·분류 건수 자동 축소, 중복 없음 유지).`,
    };
  }
  const discoverPool = shuffled.slice(0, ALLINONE_SAMPLE);
  const classifyPool = shuffled.slice(
    ALLINONE_SAMPLE,
    ALLINONE_SAMPLE + ALLINONE_CLASSIFY,
  );

  // 노드 그래프 모달용: 각 단계 stage_start(running) → 작업 →
  // stage_io(input/output 확정, done). 토큰 스트리밍은 제거 —
  // 결과는 모달로(사용자 결정 2026-05-19 "결과물은 모달로 이식").

  // ── ① 발굴 (병렬) ────────────────────────────────────
  yield { type: "stage_start", step: "discover" };
  const sets = Math.ceil(discoverPool.length / ALLINONE_PER_SET);
  const batches: RawDoc[][] = [];
  for (let s = 0; s < sets; s++) {
    const b = discoverPool.slice(
      s * ALLINONE_PER_SET,
      (s + 1) * ALLINONE_PER_SET,
    );
    if (b.length > 0) batches.push(b);
  }

  let findings: string[];
  try {
    findings = await Promise.all(
      batches.map(async (batch) => {
        const corpusText = batch
          .map(
            (d, i) => `[문서 ${i + 1}] ${d.title}\n${d.body.slice(0, 500)}`,
          )
          .join("\n\n");
        const res = await model.invoke([
          { role: "system", content: systemFor("discover") },
          { role: "user", content: corpusText },
        ]);
        return extractContentText(res.content) ?? "";
      }),
    );
  } catch (e) {
    yield {
      type: "error",
      message:
        (e instanceof Error ? e.message : String(e)) +
        " (발굴 병렬 실행 중 — OpenAI rate limit 가능)",
    };
    return;
  }
  yield {
    type: "stage_io",
    step: "discover",
    input:
      `[시스템 인스트럭션]\n${systemFor("discover")}\n\n` +
      `[입력] 비복원 ${discoverPool.length}건을 ${batches.length}묶음` +
      `(회당 ${ALLINONE_PER_SET}건)으로 나눠 ${batches.length}회 병렬 발굴`,
    output: findings
      .map((f, i) => `── 발굴 ${i + 1}회차 ──\n${f}`)
      .join("\n\n"),
    // 회차별 스와이프 (1 회차 = 1 LLM 발굴 결과)
    cases: findings.map((f, i) => ({
      label: `발굴 ${i + 1}회차 (${batches[i].length}건)`,
      text: f,
    })),
  };

  // ── ② 수렴 ───────────────────────────────────────────
  yield { type: "stage_start", step: "converge" };
  let convergedRaw = "";
  const convergeUser = findings
    .map((f, i) => `[발굴 ${i + 1} 결과]\n${f}`)
    .join("\n\n");
  try {
    const res = await model.invoke([
      { role: "system", content: CONVERGE_SYSTEM },
      { role: "user", content: convergeUser },
    ]);
    convergedRaw = extractContentText(res.content) ?? "";
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  yield {
    type: "stage_io",
    step: "converge",
    input:
      `[시스템 인스트럭션]\n${CONVERGE_SYSTEM}\n\n` +
      `[입력] ${findings.length}개 발굴 결과 종합`,
    output: convergedRaw,
  };

  // ── ③ 분류기 인스트럭션 픽스 ──────────────────────────
  yield { type: "stage_start", step: "fix" };
  let schema: { domain_summary?: string; mid_category?: string[] } = {};
  try {
    const m = convergedRaw.match(/\{[\s\S]*\}/);
    if (m) schema = JSON.parse(m[0]);
  } catch {
    schema = {}; // 파싱 실패 → buildClassifierSystem 기본값(기타)
  }
  const classifierSystem = buildClassifierSystem(schema);
  yield {
    type: "stage_io",
    step: "fix",
    input: `[입력] 수렴 확정 스키마\n${JSON.stringify(schema, null, 2)}`,
    // 사용자가 특히 원한 것: 동적 생성된 분류기 인스트럭션 전문
    output: `[생성된 분류기 인스트럭션 — 이후 ④에서 고정 사용]\n\n${classifierSystem}`,
  };

  // ── ④ 실분류 (병렬 — 사용자 결정 2026-05-19, 5건) ─────
  yield { type: "stage_start", step: "classify" };
  let labels: string[];
  try {
    labels = await Promise.all(
      classifyPool.map(async (d) => {
        const res = await model.invoke([
          { role: "system", content: classifierSystem },
          {
            role: "user",
            content: `제목: ${d.title}\n\n본문:\n${d.body.slice(0, 4000)}`,
          },
        ]);
        return extractContentText(res.content) ?? "";
      }),
    );
  } catch (e) {
    yield {
      type: "error",
      message:
        (e instanceof Error ? e.message : String(e)) +
        " (분류 병렬 실행 중 — OpenAI rate limit 가능)",
    };
    return;
  }
  yield {
    type: "stage_io",
    step: "classify",
    input:
      `[고정 분류기 인스트럭션]\n${classifierSystem}\n\n` +
      `[입력] 발굴 미사용 ${classifyPool.length}건 병렬 분류`,
    output: classifyPool
      .map(
        (d, i) =>
          `── ${i + 1}. ${d.title} ──\n${labels[i]}`,
      )
      .join("\n\n"),
    // 문서별 스와이프 (1 문서 = 1 분류 결과)
    cases: classifyPool.map((d, i) => ({
      label: `${i + 1}. ${d.title}`,
      text: labels[i],
    })),
  };

  yield { type: "done" };
}

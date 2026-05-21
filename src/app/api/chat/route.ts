export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { createStream } from "@/lib/agent/agent";
import { ALLOWED_MODELS } from "@/lib/agent/harness/models";
import { SEARCH_DOMAINS } from "@/lib/searchlab/domains";
import { SQL_DOMAINS } from "@/lib/sqllab/domains";
import { WORKSPACE_IDS } from "@/lib/agent/harness/profiles";
import { GRAPH_DATASET_IDS } from "@/lib/graphlab/config";
import {
  MAX_QUERY_LEN,
  MAX_IMAGES_PER_TURN,
  MAX_IMAGE_DATA_URL_LEN,
  IMAGE_DATA_URL_RE,
} from "@/lib/files/limits";
import type { SseEvent } from "@/types";

/**
 * POST /api/chat — SSE 스트리밍 진입점 (FR-01 / AC-1).
 *
 * R7 — SQLite/네이티브 의존 → edge 불가. 최상단 runtime="nodejs" /
 *      dynamic="force-dynamic" (위 2줄, 어떤 import 보다 먼저).
 * R2 — 라우트는 thin. 하네스 토글 분기(if(toggleEnabled)) 0줄. 모든
 *      하네스 로직은 agent.ts / buildAgentOptions 가 흡수한다.
 *      이 파일에는 E2E_MOCK/MOCK_MODE 분기도 0줄(CLAUDE.md Mock 금지).
 *
 * AD-4 — Zod 검증 실패/빈·공백 query 는 **HTTP 400 + application/json
 *        { error }** 로 고정(SSE 아님). 정상 흐름만 text/event-stream.
 * AD-5(a) — SSE 인코더는 이벤트를 `data: <JSON.stringify>\n\n` 한 줄로
 *        직렬화한다. JSON 문자열에는 raw 개행이 없으므로(\n 은 \\n 으로
 *        이스케이프) 프로바이더 에러 본문에 "\n", "\r", "data:", "event:"
 *        가 섞여도 SSE 프레임을 위조/주입할 수 없다. raw 텍스트를 프레임
 *        문법에 절대 직접 보간하지 않는다. ReadableStream.cancel() 은
 *        진행 중 createStream 제너레이터를 실제로 중단(return())해 클라이언트
 *        disconnect 시 LLM 스트림이 좀비로 남지 않게 한다(과금 0).
 */

// 본문 계약 (PRD §1.3 FR-01 / AD-4). 알 수 없는 필드는 zod 기본 정책대로
// 무시(strict 아님 — TC-16.3 "무시 후 정상 진행" 일관성).
// FR-14·FR-15 / AD-14 / Plan Critic C5 — model 검증 SSOT 는 이 zod enum.
// 화이트리스트 밖/타입오류는 safeParse 실패 → 기존 badRequest(AD-4: JSON
// 400, SSE 아님) 경로로 자동 처리(route 에 수동 if 검증 추가 0줄 — R2).
// E1/E2/A1 (Plan Critic) — 검증 SSOT 는 이 zod. 한도는 lib/files/limits
// 상수(클라이언트와 공유 — 정책 단일화). 위반은 safeParse 실패 → 기존
// badRequest(AD-4: JSON 400, SSE 아님) 경로로 자동 처리(수동 if 0줄 — R2).
//  - query: 길이 상한(추출 텍스트 폭주 차단)
//  - images: data URL prefix 화이트리스트(임의 바이너리 주입 차단) +
//    개별 크기 상한 + 턴당 개수 상한(checkpointer 누적 완화)
const bodySchema = z.object({
  query: z.string().max(MAX_QUERY_LEN),
  conversationId: z.string().optional(),
  model: z.enum(ALLOWED_MODELS).optional(),
  images: z
    .array(
      z
        .string()
        .regex(IMAGE_DATA_URL_RE)
        .max(MAX_IMAGE_DATA_URL_LEN),
    )
    .max(MAX_IMAGES_PER_TURN)
    .optional(),
  // 인덱스 검색 도구 세션 도메인(챗 우측 드롭다운). 5개 코퍼스
  // 중 1개면 그 도메인 index_search 도구가 그래프에 포함된다.
  // 미지정/생략=기존 챗(도구 없음). 변경 시 새 그래프=세션 리프레시.
  idxDomain: z.enum(SEARCH_DOMAINS).optional(),
  // 데이터 조회(SQL) 도구 세션 도메인. idxDomain 과 독립 — 둘
  // 다 가능. 미지정=도구 없음. 변경 시 새 그래프=세션 리프레시.
  sqlDomain: z.enum(SQL_DOMAINS).optional(),
  // 에이전트 프로필 id(A/B/C). 그래프 격리·thread 정체성용. 미지정/
  // 생략=기존 챗(회귀 0). 화이트리스트 밖 값은 safeParse 실패 → 400.
  profileId: z.enum(WORKSPACE_IDS).optional(),
  // 온톨로지 조회(graph) 도구 세션 데이터셋. 지정 시 그 데이터셋
  // 바인딩 graph_query 도구가 그래프에 포함된다(수업1·3 연결). 미지정
  // =도구 없음(회귀 0). 화이트리스트 밖 값은 safeParse 실패 → 400.
  graphDataset: z.enum(GRAPH_DATASET_IDS as [string, ...string[]]).optional(),
  // 요청별 하네스 토글 오버라이드(에이전트 패널 4요소 토글 상태).
  // 각 키 boolean — 있으면 env 위에 강제 적용, 없으면 env 디폴트.
  // 미지정=오버라이드 0(회귀 0). 알 수 없는 키는 strict 아님→무시.
  overrides: z
    .object({
      planning: z.boolean().optional(),
      filesystem: z.boolean().optional(),
      subagents: z.boolean().optional(),
      skills: z.boolean().optional(),
    })
    .optional(),
  // 동적 시스템 인스트럭션 id(하네스 관리에서 만든 인스트럭션 선택).
  // 미지정=default 본문(회귀 0). 임의 문자열 허용 — 미존재 id 는 서버
  // getSystemPromptBody 가 default 로 graceful 폴백(화이트리스트 불요).
  instructionId: z.string().max(128).optional(),
  // 커스텀 에이전트 id(하네스 "에이전트 생성"에서 만든 에이전트).
  // 지정 시 resolveAgentComposition(id) 로 subagentNames/skillNames/
  // instructionId 를 로드해 buildHarnessConfig 의 selection 에 주입한다.
  // profileId 와 상호 배타: customAgentId 있으면 customAgent 경로 우선.
  // 미지정=기존 챗(회귀 0). 화이트리스트 불요(미존재 id 는 graceful 폴백).
  customAgentId: z.string().max(64).optional(),
});

/** AD-4 — 검증 실패 응답은 SSE 아닌 JSON 400 으로 고정. */
function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * AD-5(a) — SSE 한 프레임 인코딩. 이벤트 객체를 통째로 JSON.stringify 해
 * 단일 `data:` 라인으로 만든다. JSON 직렬화 결과에는 raw LF/CR 가 없으므로
 * (text 내부 개행은 `\\n` 으로 escape) 프레임 경계가 깨질 수 없다.
 */
function encodeSse(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  // --- 본문 파싱 (AD-4: 파싱 실패 → 400 JSON, 스트림 미시작) ---
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("요청 본문을 JSON 으로 파싱할 수 없습니다.");
  }

  // --- Zod 검증 (AD-4: 실패 → 400 JSON, createStream 미호출) ---
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest("요청 본문이 올바르지 않습니다. { query: string, conversationId?: string } 형식이어야 합니다.");
  }

  // --- 빈/공백 query 는 route 경계에서 거부(모델 위임 아님, AD-4) ---
  const query = parsed.data.query;
  if (query.trim().length === 0) {
    return badRequest("query 는 비어 있거나 공백만으로 구성될 수 없습니다.");
  }

  // conversationId 미존재 시 발급(FR-01). 클라이언트가 thread 이벤트로 받아 영속.
  const conversationId = parsed.data.conversationId ?? crypto.randomUUID();

  // --- 정상 흐름: text/event-stream ---
  // 진행 중 제너레이터 핸들. cancel() 이 .return() 으로 LLM 스트림을
  // 실제 중단할 수 있게 ReadableStream 외부 스코프에 보관(AD-5a).
  let gen: AsyncGenerator<SseEvent> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // FIRST: thread 이벤트(클라이언트가 conversationId 영속).
      controller.enqueue(encodeSse({ type: "thread", conversationId }));

      try {
        gen = await createStream({
          query,
          conversationId,
          model: parsed.data.model,
          images: parsed.data.images,
          idxDomain: parsed.data.idxDomain,
          sqlDomain: parsed.data.sqlDomain,
          profileId: parsed.data.profileId,
          graphDataset: parsed.data.graphDataset,
          overrides: parsed.data.overrides,
          instructionId: parsed.data.instructionId,
          customAgentId: parsed.data.customAgentId,
        });
        for await (const ev of gen) {
          controller.enqueue(encodeSse(ev));
        }
        controller.enqueue(encodeSse({ type: "done" }));
      } catch (err) {
        // 제너레이터 throw(rate limit/5xx 등) → error 이벤트 후 종료(좀비 0).
        // 보안(Gate 3 LOW): provider SDK 에러 원문에 민감정보(키 일부·
        // 내부 경로)가 담길 수 있으므로 클라이언트엔 **일반화 메시지**만
        // 보내고, 상세(message+stack)는 서버 로그에만 남긴다.
        console.error("[/api/chat] stream error:", err);
        controller.enqueue(
          encodeSse({
            type: "error",
            message:
              "응답 생성 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          }),
        );
      } finally {
        controller.close();
      }
    },
    // AD-5(a) — client disconnect: 진행 중 제너레이터를 실제로 중단.
    // .return() 이 createStream 의 for-await(graph.stream) 루프를
    // finally 로 빠져나가게 해 LLM 스트림이 좀비로 남지 않게 한다.
    async cancel() {
      await gen?.return(undefined);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

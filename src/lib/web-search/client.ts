import { OpenAI } from "openai";
import type {
  WebSearchRawResult,
  WebSearchStep,
  WebSearchCitation,
} from "./types";

/**
 * OpenAI Responses API web_search 직호출 클라이언트 (Slice 2).
 *
 * ClientTool(webSearchTool) 의 실행 함수가 호출한다. OpenAI 가 응답
 * 생성 중 web_search 를 내부에서 N번(search/open_page/find_in_page)
 * 자율 호출하며, 그 N스텝·최종본문·출처를 우리 경계 타입
 * WebSearchRawResult 로 좁혀 반환한다(R8 — SDK 타입 직노출 0).
 * dart/api/client.ts 동형(외부 API 직호출 + graceful).
 *
 * Plan Critic 해소:
 *  - 항목5: 실패 reason 분리(no_api_key/model_unsupported/network/
 *    api_error/empty) — formatter 가 reason 별 안내
 *  - 항목3: AbortSignal 파라미터로 취소 전파 + timeout 동기호출 방어
 *  - R8: open_page.url 등 SDK nullable/deprecated 함정을 여기서 흡수
 */

/**
 * 검색 모델 — 사용자 지정 상수 고정(HITL 2026-05-19). web_search 는
 * OpenAI 전용이라 메인 LLM provider(anthropic 가능)와 분리. 모델 id
 * 는 학습지식 단정 금지(R8) — 사용자가 명시한 값을 그대로 핀하고,
 * 미지원 시 model_unsupported 로 graceful(formatter 가 안내).
 */
const WS_OPENAI_MODEL = "gpt-5.4-mini";

/** 동기 호출 지연 방어 — OpenAI 내부 N검색이 길 수 있어 보수값. */
const WS_TIMEOUT_MS = 60_000;

export interface RunWebSearchOptions {
  /** 사용자 stop 시 OpenAI fetch 까지 취소 전파(Plan Critic 항목3). */
  signal?: AbortSignal;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** SDK action(any) → 우리 WebSearchStep (nullable/미지 graceful). */
function normalizeStep(action: unknown): WebSearchStep | null {
  if (!isRecord(action) || typeof action.type !== "string") return null;
  switch (action.type) {
    case "search": {
      // queries[](정식) 우선, query(deprecated) 폴백 — 실측 R8
      const qs = Array.isArray(action.queries)
        ? action.queries.filter((q): q is string => typeof q === "string")
        : typeof action.query === "string"
          ? [action.query]
          : [];
      return { kind: "search", queries: qs };
    }
    case "open_page":
      // url?: string | null (SDK nullable 함정) → "" 정규화
      return {
        kind: "open_page",
        url: typeof action.url === "string" ? action.url : "",
      };
    case "find_in_page":
      return {
        kind: "find_in_page",
        pattern: typeof action.pattern === "string" ? action.pattern : "",
        url: typeof action.url === "string" ? action.url : "",
      };
    default:
      // 미지 action.type — 버리지 말고 보존(R8 passthrough, 투명성)
      return { kind: "other", type: action.type };
  }
}

/** message item 의 output_text → 본문 + url_citation 들. */
function extractMessage(item: Record<string, unknown>): {
  text: string;
  citations: WebSearchCitation[];
} {
  let text = "";
  const citations: WebSearchCitation[] = [];
  const content = Array.isArray(item.content) ? item.content : [];
  for (const c of content) {
    if (!isRecord(c) || c.type !== "output_text") continue;
    if (typeof c.text === "string") text += c.text;
    const anns = Array.isArray(c.annotations) ? c.annotations : [];
    for (const a of anns) {
      if (!isRecord(a) || a.type !== "url_citation") continue;
      if (typeof a.url === "string") {
        citations.push({
          url: a.url,
          title: typeof a.title === "string" ? a.title : a.url,
        });
      }
    }
  }
  return { text, citations };
}

/** 에러를 reason 으로 분류 (400+model 키워드 → model_unsupported). */
function classifyError(
  e: unknown,
): { reason: "model_unsupported" | "network"; detail: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const status =
    isRecord(e) && typeof e.status === "number" ? e.status : undefined;
  if (status === 400 && /model|web_search|unsupported|not support/i.test(msg)) {
    return { reason: "model_unsupported", detail: msg };
  }
  return { reason: "network", detail: msg };
}

/**
 * 웹검색 1회 — 쿼리를 받아 OpenAI Responses API 직호출, N검색 결과를
 * 우리 경계 타입으로 정규화해 반환. throw 0 (모든 실패 → ok:false).
 *
 * @param query 메인 LLM 이 도구에 넘긴 검색 질의
 * @param opts  AbortSignal 등
 */
export async function runWebSearch(
  query: string,
  opts: RunWebSearchOptions = {},
): Promise<WebSearchRawResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // 호출 전 차단 — 과금 0, import 시점 throw 방지(lazy)
    return { ok: false, reason: "no_api_key" };
  }

  let response: unknown;
  try {
    const client = new OpenAI({ apiKey });
    response = await client.responses.create(
      {
        model: WS_OPENAI_MODEL,
        input: query,
        tools: [{ type: "web_search" }],
        stream: false,
      } as Parameters<typeof client.responses.create>[0],
      { timeout: WS_TIMEOUT_MS, signal: opts.signal },
    );
  } catch (e) {
    const { reason, detail } = classifyError(e);
    return { ok: false, reason, detail };
  }

  const output =
    isRecord(response) && Array.isArray(response.output)
      ? response.output
      : [];

  const steps: WebSearchStep[] = [];
  let answer = "";
  const citations: WebSearchCitation[] = [];

  for (const item of output) {
    if (!isRecord(item) || typeof item.type !== "string") continue;
    if (item.type === "web_search_call") {
      const step = normalizeStep(item.action);
      if (step) steps.push(step);
    } else if (item.type === "message") {
      const { text, citations: cs } = extractMessage(item);
      answer += text;
      citations.push(...cs);
    }
  }

  if (steps.length === 0 && answer.trim() === "") {
    return { ok: false, reason: "empty" };
  }
  return { ok: true, steps, answer, citations };
}

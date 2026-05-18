/**
 * chunkFilter — 스트림 청크에서 UI 본문 텍스트만 추출하는 순수 함수 (R5 / FR-09).
 *
 * 설계 근거(실측): docs/notes/live-stream-events.md
 * - U2: streamMode "messages" → 각 part 는 [AIMessageChunk(직렬화), meta] 2-튜플.
 * - U3: gpt-5.4-mini 경로에선 `kwargs.content` 가 string (빈 문자열 "" 다수 —
 *       스트림 시작/종료/툴 경계 마커). 빈 문자열은 스킵. provider 추상화 대비
 *       배열 content(Anthropic thinking / OpenAI o3 reasoning)도 방어적으로 처리:
 *       `type==="text"` 블록만 통과, thinking/reasoning/redacted_thinking 폐기.
 *       tool_call_chunks 비어있지 않으면 본문 아님.
 * - U4: `meta.langgraph_node === "model_request"` 인 청크만 메인 답변. 그 외
 *       (subagent/tool 노드) → 본문 미혼입(함정 5).
 *
 * @langchain/* 런타임을 import 하지 않는다(plain shape 만 다룸 → LLM 호출 없이
 * 단위 테스트 가능, R5/AC-10).
 */

/** U4 실측: 메인 어시스턴트 답변 노드 식별자. */
export const MAIN_ANSWER_NODE = "model_request";

/** UI 본문에서 제외하는 사고/추론 블록 type 문자열(R5). */
const NON_BODY_BLOCK_TYPES = new Set(["thinking", "reasoning", "redacted_thinking"]);

/** 직렬화된 AIMessageChunk 의 본 필터가 사용하는 부분만 기술한 최소 shape. */
interface SerializedChunk {
  kwargs?: {
    content?: unknown;
    tool_call_chunks?: unknown;
  };
}

/** 스트림 part[1] 메타데이터의 본 필터가 사용하는 부분. */
interface ChunkMeta {
  langgraph_node?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** content 배열에서 text 블록만 추출해 이어 붙인다(R5). */
function extractTextFromBlocks(blocks: unknown[]): string {
  let out = "";
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const type = block.type;
    if (typeof type !== "string") continue;
    if (NON_BODY_BLOCK_TYPES.has(type)) continue; // thinking/reasoning/redacted_thinking 폐기
    if (type === "text" && typeof block.text === "string") {
      out += block.text;
    }
  }
  return out;
}

/**
 * 스트림 청크에서 UI 에 보여줄 본문 텍스트를 추출한다.
 *
 * @param msg  직렬화된 AIMessageChunk (part[0]). 임의 unknown 안전.
 * @param meta 스트림 메타데이터 (part[1]). langgraph_node 로 출처 식별.
 * @returns 본문 텍스트(비어있지 않은 string) 또는 null(스킵 — 본문 아님).
 */
export function filterChunk(msg: unknown, meta: unknown): string | null {
  // U4: 메인 답변 노드(model_request)가 아니면 본문 미혼입(함정 5).
  const m = meta as ChunkMeta | undefined | null;
  if (!isRecord(m) || m.langgraph_node !== MAIN_ANSWER_NODE) {
    return null;
  }

  if (!isRecord(msg)) return null;
  const kwargs = (msg as SerializedChunk).kwargs;
  if (!isRecord(kwargs)) return null;

  // tool_call_chunks 가 비어있지 않으면 도구 호출 — 본문 미혼입(U3/함정 4·5).
  const toolCallChunks = kwargs.tool_call_chunks;
  if (Array.isArray(toolCallChunks) && toolCallChunks.length > 0) {
    return null;
  }

  const content = kwargs.content;

  // U3: content 가 string 이면 그대로(빈 문자열은 스트림 마커 → 스킵).
  if (typeof content === "string") {
    return content.length > 0 ? content : null;
  }

  // provider 추상화 대비: content 가 배열이면 text 블록만 추출(R5).
  if (Array.isArray(content)) {
    const text = extractTextFromBlocks(content);
    return text.length > 0 ? text : null;
  }

  // content 가 undefined/객체 등 → 본문 없음.
  return null;
}

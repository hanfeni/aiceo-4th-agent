/**
 * chunkFilter — 스트림 청크에서 UI 본문 텍스트만 추출하는 순수 함수 (R5 / FR-09).
 *
 * 설계 근거(실측): docs/notes/live-stream-events.md + Slice 9 런타임 재실측
 * - U2: streamMode "messages" → 각 part 는 [AIMessageChunk, meta] 2-튜플.
 * - U3 (Slice 9 정정): probe 의 JSON.stringify 관찰은 직렬화형(`kwargs.content`)
 *       이었으나, for-await 로 순회하는 **실제 런타임 객체는 살아있는 LangChain
 *       AIMessageChunk 인스턴스**라 텍스트가 `msg.content`(직접)에 있다.
 *       양쪽 형태를 모두 방어: `content` = msg.content ?? msg.kwargs.content,
 *       `tool_call_chunks` = msg.tool_call_chunks ?? msg.kwargs.tool_call_chunks.
 *       string 이면 그대로(빈 문자열 "" = 스트림 마커 → 스킵). 배열이면
 *       (Anthropic thinking / OpenAI o3) `type==="text"` 블록만 통과,
 *       thinking/reasoning/redacted_thinking 폐기.
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

/**
 * AIMessageChunk 의 본 필터가 쓰는 부분. 런타임 인스턴스는 content/
 * tool_call_chunks 가 최상위(직접)에, 직렬화형은 kwargs 안에 있다 —
 * 양쪽 모두 안전하게 본다.
 */
interface ChunkShape {
  content?: unknown;
  tool_call_chunks?: unknown;
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
  const chunk = msg as ChunkShape;
  const kwargs = isRecord(chunk.kwargs) ? chunk.kwargs : undefined;

  // 런타임 인스턴스는 최상위, 직렬화형은 kwargs 안 — 양쪽 폴백.
  const toolCallChunks = chunk.tool_call_chunks ?? kwargs?.tool_call_chunks;
  if (Array.isArray(toolCallChunks) && toolCallChunks.length > 0) {
    return null;
  }

  const content = chunk.content ?? kwargs?.content;

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

/** content 배열에서 thinking/reasoning 블록의 텍스트만 이어 붙인다. */
function extractThinkingFromBlocks(blocks: unknown[]): string {
  let out = "";
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const type = block.type;
    if (typeof type !== "string" || !NON_BODY_BLOCK_TYPES.has(type)) continue;
    // provider별 사고 텍스트 필드가 다르다(실측):
    //  - OpenAI Responses: {type:"reasoning", reasoning:"..."} (.reasoning)
    //  - Anthropic:        {type:"thinking",  thinking:"..."}  (.thinking)
    //  - 기타:             {type:..., text:"..."}              (.text)
    const txt =
      typeof block.reasoning === "string"
        ? block.reasoning
        : typeof block.thinking === "string"
          ? block.thinking
          : typeof block.text === "string"
            ? block.text
            : "";
    out += txt;
  }
  return out;
}

/**
 * 스트림 청크에서 **사고 과정(thinking/reasoning) 텍스트만** 추출한다.
 *
 * filterChunk 의 거울상 — filterChunk 는 본문만(thinking 폐기), 이 함수는
 * thinking 만(본문 폐기) 반환한다. FR-09/R5 는 그대로 유지된다: 본문
 * 토큰 스트림엔 thinking 이 0 이고, thinking 은 **별도 채널**로만 흐른다
 * (medigate-manager/new 의 thinkingSteps[] 분리 패턴과 동일).
 *
 * gpt-5.4-mini 경로는 reasoning 이 거의 없으나(Slice 1 실측), provider
 * 추상화로 o3/Anthropic 전환 시 thinking 블록 배열이 흐른다.
 *
 * @returns 사고 텍스트(비어있지 않은 string) 또는 null(사고 없음).
 */
export function extractThinking(msg: unknown, meta: unknown): string | null {
  const m = meta as ChunkMeta | undefined | null;
  if (!isRecord(m) || m.langgraph_node !== MAIN_ANSWER_NODE) {
    return null;
  }
  if (!isRecord(msg)) return null;
  const chunk = msg as ChunkShape & {
    additional_kwargs?: { reasoning_content?: unknown };
    kwargs?: { additional_kwargs?: { reasoning_content?: unknown } };
  };
  const kwargs = isRecord(chunk.kwargs) ? chunk.kwargs : undefined;

  // 1) content 가 배열이면 thinking/reasoning/redacted_thinking 블록만.
  const content = chunk.content ?? kwargs?.content;
  if (Array.isArray(content)) {
    const t = extractThinkingFromBlocks(content);
    return t.length > 0 ? t : null;
  }

  // 2) OpenAI o-계열: additional_kwargs.reasoning_content (string).
  const ak = chunk.additional_kwargs ?? kwargs?.additional_kwargs;
  if (isRecord(ak) && typeof ak.reasoning_content === "string") {
    const t = ak.reasoning_content;
    return t.length > 0 ? t : null;
  }

  return null;
}

/** 도구 호출 청크 1건(부분). args 는 스트리밍 중 점진 누적된다. */
export interface ToolCallDelta {
  id?: string;
  name?: string;
  args?: string;
}

/**
 * 스트림 청크에서 **도구 호출(tool_call_chunk) 델타**를 추출한다.
 *
 * 실측(scripts/tool-probe.mts): model_request 노드의 청크가
 * tool_call_chunks: [{ name, args, id, index }] 를 점진 방출한다
 * (첫 청크에 name+id, 이후 청크에 args 조각). 본문/thinking 과
 * 분리된 별도 채널(FR-09 유지) — filterChunk 는 이미 tool_call_chunks
 * 있으면 본문에서 제외한다.
 *
 * @returns 도구 호출 델타 배열(비어있으면 null).
 */
export function extractToolCalls(
  msg: unknown,
  meta: unknown,
): ToolCallDelta[] | null {
  const m = meta as ChunkMeta | undefined | null;
  if (!isRecord(m) || m.langgraph_node !== MAIN_ANSWER_NODE) return null;
  if (!isRecord(msg)) return null;
  const chunk = msg as ChunkShape;
  const kwargs = isRecord(chunk.kwargs) ? chunk.kwargs : undefined;
  const tcc = chunk.tool_call_chunks ?? kwargs?.tool_call_chunks;
  if (!Array.isArray(tcc) || tcc.length === 0) return null;

  const out: ToolCallDelta[] = [];
  for (const c of tcc) {
    if (!isRecord(c)) continue;
    out.push({
      id: typeof c.id === "string" ? c.id : undefined,
      name: typeof c.name === "string" ? c.name : undefined,
      args: typeof c.args === "string" ? c.args : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

/** 도구 실행 결과 1건(OUT). */
export interface ToolResultDelta {
  name: string;
  result: string;
}

/**
 * 스트림 청크에서 **도구 실행 결과(tool 메시지)**를 추출한다.
 *
 * 실측: tools 노드의 청크가 type:"tool"(또는 ToolMessage 인스턴스),
 * name=도구명, content=결과 문자열. model_request 가 아닌 노드라
 * filterChunk/extractThinking 은 이미 이를 본문/사고에서 제외한다 —
 * 이 함수만 도구 결과 채널로 분리 수집한다(함정 5 / FR-09 유지).
 *
 * @returns { name, result } 또는 null(도구 결과 아님).
 */
export function extractToolResult(
  msg: unknown,
  _meta: unknown,
): ToolResultDelta | null {
  if (!isRecord(msg)) return null;
  const chunk = msg as ChunkShape & {
    type?: unknown;
    name?: unknown;
    kwargs?: { content?: unknown; name?: unknown };
  };
  const kwargs = isRecord(chunk.kwargs) ? chunk.kwargs : undefined;
  const type =
    typeof chunk.type === "string"
      ? chunk.type
      : typeof (chunk as { id?: unknown }).id === "object"
        ? undefined
        : undefined;
  // 런타임 ToolMessage 는 type==="tool"; 직렬화형은 id 배열에 ToolMessage.
  const isTool =
    type === "tool" ||
    (Array.isArray((chunk as { id?: unknown }).id) &&
      ((chunk as { id?: unknown[] }).id?.some?.(
        (x) => typeof x === "string" && x.includes("ToolMessage"),
      ) ??
        false));
  if (!isTool) return null;

  const name =
    typeof chunk.name === "string"
      ? chunk.name
      : typeof kwargs?.name === "string"
        ? kwargs.name
        : "tool";
  const content = chunk.content ?? kwargs?.content;
  const result =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? extractTextFromBlocks(content)
        : "";
  return result.length > 0 ? { name, result } : null;
}

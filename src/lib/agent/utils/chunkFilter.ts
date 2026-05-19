/**
 * chunkFilter — 스트림 청크에서 UI 본문 텍스트만 추출하는 순수 함수 (R5 / FR-09).
 *
 * 설계 근거(실측): U2 스트림 형태 + Slice 9 런타임 재실측
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
  additional_kwargs?: { tool_outputs?: unknown };
  kwargs?: {
    content?: unknown;
    tool_call_chunks?: unknown;
    additional_kwargs?: { tool_outputs?: unknown };
  };
}

/**
 * OpenAI ServerTool(web_search 등) 호출의 실측 구조 (probe ws-log-probe).
 *   kwargs.additional_kwargs.tool_outputs[] = [{ id:"ws_...",
 *     type:"web_search_call", status:"completed",
 *     action:{ type:"search", queries:[...], query:"..." } }]
 * ClientTool 의 tool_call_chunks(점진 델타)와 경로·형태가 다르다.
 * `extractToolOutputs` 가 인라인으로 안전 접근(별도 인터페이스 불요).
 */

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
 * **ClientTool 단일 채널.** ServerTool(web_search 등 provider 측 실행,
 * additional_kwargs.tool_outputs)은 `extractToolOutputs` 가 전담한다.
 * 한 청크를 양쪽이 잡아 tool_call 이 이중 emit 되던 문제를 일원화
 * (code-review 권장 — agent.ts 에서 두 추출기를 별도 호출, 채널 분리).
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

  // ClientTool 경로만 — tool_call_chunks 점진 델타. ServerTool 은
  // extractToolOutputs 단일 채널(중복 emit 일원화).
  const tcc = chunk.tool_call_chunks ?? kwargs?.tool_call_chunks;
  if (Array.isArray(tcc) && tcc.length > 0) {
    const out: ToolCallDelta[] = [];
    for (const c of tcc) {
      if (!isRecord(c)) continue;
      out.push({
        id: typeof c.id === "string" ? c.id : undefined,
        name: typeof c.name === "string" ? c.name : undefined,
        args: typeof c.args === "string" ? c.args : undefined,
      });
    }
    if (out.length > 0) return out;
  }

  return null;
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
export function extractToolResult(msg: unknown): ToolResultDelta | null {
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

/** ServerTool(web_search 등) 호출 1건. ClientTool 과 채널이 다르다. */
export interface ToolOutputDelta {
  id: string;
  name: string;
  args: string;
  /**
   * 결과 표시값. web_search 는 **undefined**(검색 진행 — 출처는 별도
   * annotations 청크에서 와서 store reduceToolResult name 폴백으로 채움.
   * status "completed" 를 그대로 쓰면 OUT 이 무의미해 사용자 보고 버그).
   * 그 외 ServerTool(code_interpreter 등)은 status 원문.
   */
  result: string | undefined;
}

/**
 * 스트림 청크에서 **ServerTool 호출(additional_kwargs.tool_outputs)**
 * 을 추출한다.
 *
 * 실측(scripts/ws2-probe.mts): OpenAI built-in web_search 는
 * ClientTool 의 tool_call_chunk/ToolMessage 경로가 **아니라**,
 * model_request 노드 청크의 additional_kwargs.tool_outputs 에
 * `{ id, type:"web_search_call", status, action:{type:"search",
 * queries:[...] } }` 형태로 온다. 그래서 extractToolCalls/Result 가
 * 못 잡는다(사용자 보고: "웹검색만 마크 안 됨"의 원인). 이 함수가
 * ServerTool 채널을 **단독** 전담한다(extractToolCalls 의 ServerTool
 * 경로 제거 — 이중 emit 일원화). FR-09 유지(본문 미혼입 — 별도 채널).
 *
 * 정책:
 *  - args = JSON.stringify({ queries }) — 모델이 던진 **전체 검색어
 *    배열**을 사고 패널 IN 칸에 풍부하게 표시(디버깅·투명성 우선).
 *  - result = web_search 면 undefined(검색 진행 — OUT 은 별도 청크의
 *    annotations 에서 옴, `extractWebSearchCitations` 가 전담). 그 외
 *    ServerTool 은 status 원문(기존 동작 유지). web_search 의
 *    "completed" 만 OUT 에 박혀 무의미하던 사용자 보고 버그 수정.
 *
 * @returns ServerTool 호출 배열 또는 null.
 */
export function extractToolOutputs(
  msg: unknown,
  meta: unknown,
): ToolOutputDelta[] | null {
  const m = meta as ChunkMeta | undefined | null;
  if (!isRecord(m) || m.langgraph_node !== MAIN_ANSWER_NODE) return null;
  if (!isRecord(msg)) return null;
  const chunk = msg as ChunkShape & {
    additional_kwargs?: { tool_outputs?: unknown };
    kwargs?: { additional_kwargs?: { tool_outputs?: unknown } };
  };
  const ak = chunk.additional_kwargs ?? chunk.kwargs?.additional_kwargs;
  if (!isRecord(ak) || !Array.isArray(ak.tool_outputs)) return null;

  const out: ToolOutputDelta[] = [];
  for (const o of ak.tool_outputs) {
    if (!isRecord(o)) continue;
    const type = typeof o.type === "string" ? o.type : "";
    if (!type) continue;
    // web_search_call → name="web_search", args=검색어, result=상태
    const action = isRecord(o.action) ? o.action : undefined;
    const queries =
      action && Array.isArray(action.queries)
        ? action.queries.filter((q): q is string => typeof q === "string")
        : [];
    const name = type.replace(/_call$/, ""); // web_search_call → web_search
    const isWebSearch = type === "web_search_call";
    const rawStatus = typeof o.status === "string" ? o.status : "";
    // Slice N — web_search 의 OUT 표시값은 status('검색 완료')가
    // 아니라 **검색 결과(citations)** 다(사용자: OUT=검색결과,
    // status는 완료판정용). 따라서 web_search 는 status 무관 항상
    // result=undefined → citations 가 올 때까지 '실행 중…',
    // 도착하면 reduceToolResult 가 모든 web_search step OUT 에
    // 동일 출처를 채운다. status='completed' 를 OUT 으로 쓰던
    // Slice K 롤백. 비-web_search ServerTool 은 기존대로 status
    // (누락 시 "completed" 기본 — 계약 범위 web_search 한정).
    const result: string | undefined = isWebSearch
      ? undefined
      : rawStatus || "completed";
    out.push({
      id: typeof o.id === "string" ? o.id : "",
      name,
      args: queries.length > 0 ? JSON.stringify({ queries }) : "",
      result,
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * web_search OUT(출처) 추출 — content 블록의 `annotations[]`.
 *
 * 실측(scripts/ws-log-probe deep dump): OpenAI built-in web_search 는
 * 검색 결과 본문(스니펫)을 스트림에 **싣지 않는다**(모델이 소비해 최종
 * 답변에 녹임). 대신 답변 text 블록에 출처를 붙여 보낸다:
 *   content:[{ type:"text", text:"...", annotations:[
 *     { type:"citation", source:"url_citation",
 *       url:"https://...", title:"...", startIndex, endIndex } ] }]
 *
 * 이 청크는 `extractToolOutputs` 가 보는 web_search_call 청크와 **별개**
 * (검색 실행 청크가 먼저, 출처 붙은 답변 청크가 나중). 그래서 같은
 * web_search step 에 id 가 없다 → store `reduceToolResult` 의 name 폴백
 * (name 일치 + result===undefined 인 step)으로 채워진다(extractToolOutputs
 * 가 result=undefined 로 둔 이유). medigate 의 OUT(검색 출처) UX 와 동형.
 *
 * FR-09 유지: text 본문 자체는 건드리지 않는다(filterChunk 가 계속
 * 전담 — 본문 누출 0). 여기선 annotations 메타만 읽는다.
 *
 * @returns "참고 출처 N건:\n• 제목 (url)\n…" 또는 url_citation 부재 시 null.
 */
export function extractWebSearchCitations(
  msg: unknown,
  meta: unknown,
): string | null {
  const m = meta as ChunkMeta | undefined | null;
  if (!isRecord(m) || m.langgraph_node !== MAIN_ANSWER_NODE) return null;
  if (!isRecord(msg)) return null;
  const chunk = msg as ChunkShape;
  const content = chunk.content ?? chunk.kwargs?.content;
  if (!Array.isArray(content)) return null;

  // url 중복 제거(여러 청크/블록에 같은 출처 반복) — 순서 보존.
  // RAW 체계화(사용자 요구): 출처 줄(• 제목 (url))은 거울함수
  // parseCitationText 호환 형식 그대로 유지하고, annotation 의
  // startIndex/endIndex(인용 위치 RAW)는 `↳ 인용 위치: a–b자`
  // **들여쓰기 별줄**로 덧붙인다. `•` 로 시작 안 하므로
  // parseCitationText 가 무시 → SourcesPanel 무손상. 검색어는
  // IN(args)에 이미 있어 OUT 에선 제외(중복 방지 — 사용자 지시).
  const seen = new Set<string>();
  const lines: string[] = [];
  let n = 0;
  for (const block of content) {
    if (!isRecord(block)) continue;
    const annotations = block.annotations;
    if (!Array.isArray(annotations)) continue;
    for (const a of annotations) {
      if (!isRecord(a)) continue;
      if (a.source !== "url_citation") continue;
      const url = typeof a.url === "string" ? a.url : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      n++;
      const title = typeof a.title === "string" ? a.title.trim() : "";
      lines.push(title.length > 0 ? `• ${title} (${url})` : `• ${url}`);
      // 인용 위치 RAW — startIndex/endIndex 가 둘 다 유효 숫자일 때만.
      const s = a.startIndex;
      const e = a.endIndex;
      if (typeof s === "number" && typeof e === "number") {
        lines.push(`  ↳ 인용 위치: ${s}–${e}자`);
      }
    }
  }
  if (n === 0) return null;
  return `참고 출처 ${n}건:\n${lines.join("\n")}`;
}

/** WebSource 와 동형(타입 import 회피 — chunkFilter 는 LLM/타입 비의존). */
interface ParsedCitation {
  title: string;
  url: string;
}

/**
 * `extractWebSearchCitations` 의 거울 함수 — 그 출력 텍스트를 다시
 * `{title,url}[]` 로 복원한다(답변 하단 References 패널 데이터원).
 *
 * 입력: "참고 출처 N건:\n• 제목 (url)\n• url\n…"
 *  - 각 항목은 `• ` 로 시작. 마지막 `(http(s)://...)` 가 url, 그 앞이
 *    제목(없으면 url 자체를 제목 자리에 — SourcesPanel 폴백).
 *  - http/https 만 url 로 인정(javascript: 등 스킴 차단 — 링크 안전).
 *
 * 사고 패널 일반 result("completed"/"검색 완료" 등)와 구분: 유효
 * 항목이 0개면 null(→ sources 미적재, 패널 미표시).
 *
 * agent.ts/chunkFilter 기존 코드 무변경 — 신규 export 만 추가(다른
 * 에이전트 동시 작업과 git 충돌 0). 순수 함수(LLM 무관, 단위 테스트).
 */
export function parseCitationText(text: string): ParsedCitation[] | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const out: ParsedCitation[] = [];
  // 마지막 (http(s)://...) 캡처 — 제목에 괄호가 있어도 url 만 분리.
  const urlTail = /^(.*?)\s*\((https?:\/\/[^\s)]+)\)\s*$/;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("•")) continue;
    const body = line.replace(/^•\s*/, "").trim();
    const m = body.match(urlTail);
    if (m) {
      const title = m[1].trim();
      const url = m[2];
      out.push({ title: title.length > 0 ? title : url, url });
      continue;
    }
    // 제목 없이 url 단독 — "• https://..."
    if (/^https?:\/\/\S+$/.test(body)) {
      out.push({ title: body, url: body });
    }
  }
  return out.length > 0 ? out : null;
}

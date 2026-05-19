import type { ChatMessage, ThinkingStep } from "@/types";
import {
  MAIN_ANSWER_NODE,
  filterChunk,
  extractThinking,
  extractToolCalls,
} from "@/lib/agent/utils/chunkFilter";
import {
  reduceReasoning,
  reduceToolCall,
} from "@/lib/agent/utils/thinkingSteps";

/**
 * 대화 복원 순수 코어 (Slice 2 / Plan Critic C8).
 *
 * 입력: checkpoint BLOB 의 `channel_values.messages`(이미 JSON.parse 된
 * LangChain serialized 배열 — 실측 docs/notes/conversation-history-probe.md).
 * 출력: 클라이언트가 그대로 store 에 적재하는 ChatMessage[].
 *
 * 핵심 원칙(최소 코드): "복원 = checkpoint 메시지를 스트리밍 청크와 **동일한**
 * 추출기·리듀서에 재생(replay)". 새 파싱 로직 0 — filterChunk /
 * extractThinking / extractToolOutputs / reduce* 는 이미 스트리밍 경로에서
 * 검증된 자산이다. checkpoint 의 AIMessageChunk 는 스트림 청크와 같은
 * 형상({kwargs:{content:[...blocks], additional_kwargs:{...}}})이므로
 * 그대로 통과한다.
 *
 * 함정(실측): 추출기들은 `meta.langgraph_node === MAIN_ANSWER_NODE` 일 때만
 * 동작한다(스트림 노드 가드). checkpoint BLOB 엔 meta 가 없으므로 복원 시
 * 상수 meta 를 주입한다(저장된 AIMessage = 메인 답변 노드 출력 확정).
 *
 * C8: 이 모듈은 better-sqlite3 를 import 하지 않는다(순수, 결정적 단위테스트).
 * C4: 역할 판별은 messages[0] 단정이 아니라 LangChain serialized 의 id
 * 배열 마지막 요소("HumanMessage" | "AIMessageChunk")로 한다.
 * C10: 깨진/미지(SystemMessage 등) 메시지는 throw 없이 skip 한다.
 */

const REPLAY_META = { langgraph_node: MAIN_ANSWER_NODE } as const;
const TITLE_MAX = 50;

/** LangChain serialized 메시지의 클래스명(id 배열 마지막). 실패 시 "". */
function messageClass(msg: unknown): string {
  if (typeof msg !== "object" || msg === null) return "";
  const id = (msg as { id?: unknown }).id;
  if (Array.isArray(id) && id.length > 0) {
    const last = id[id.length - 1];
    return typeof last === "string" ? last : "";
  }
  return "";
}

/** HumanMessage content(string) 안전 추출. 비문자열이면 "". */
function humanContent(msg: unknown): string {
  const kwargs = (msg as { kwargs?: unknown }).kwargs;
  const content =
    kwargs && typeof kwargs === "object"
      ? (kwargs as { content?: unknown }).content
      : undefined;
  return typeof content === "string" ? content : "";
}

/**
 * AIMessageChunk → assistant ChatMessage(본문 + thinkingSteps 재구성).
 * additional_kwargs.reasoning.summary[].text 를 reasoning 으로,
 * tool_outputs[](web_search 등)를 tool step 으로 재생한다(전체 복원 정책).
 */
function replayAssistant(msg: unknown): ChatMessage {
  const content = filterChunk(msg, REPLAY_META) ?? "";

  let steps: ThinkingStep[] = [];

  // 1) reasoning — content 의 reasoning 블록 + additional_kwargs.reasoning
  //    .summary[].text 양쪽. filterChunk/extractThinking 와 동일 추출기.
  const inlineThinking = extractThinking(msg, REPLAY_META);
  const summaryThinking = extractReasoningSummary(msg);
  const reasoningText = [inlineThinking, summaryThinking]
    .filter((t): t is string => !!t && t.length > 0)
    .join("\n\n");
  if (reasoningText.length > 0) {
    steps = reduceReasoning(steps, reasoningText, steps.length);
  }

  // 2) ClientTool 호출(있으면) — 스트리밍과 동일 reducer. ToolCallDelta
  //    필드는 모두 옵셔널이라 reduceToolCall 계약에 맞춰 폴백.
  const calls = extractToolCalls(msg, REPLAY_META);
  if (calls) {
    for (const c of calls) {
      steps = reduceToolCall(
        steps,
        { id: c.id ?? "", name: c.name ?? "", args: c.args ?? "" },
        steps.length,
      );
    }
  }

  // (ServerTool 재생 제거 — web_search 가 ClientTool 로 교체되어
  //  additional_kwargs.tool_outputs 채널 소멸. web_search 는 이제 위
  //  extractToolCalls + checkpoint ToolMessage 일반 ClientTool 경로로
  //  복원된다 — dartTool 동형, 라이브=히스토리 유지. 베이스라인 이전
  //  ServerTool checkpoint 는 비호환(ClientTool 전면 교체의 의도된
  //  트레이드오프 — 신규 대화는 정상).)

  const out: ChatMessage = { role: "assistant", content };
  if (steps.length > 0) out.thinkingSteps = steps;
  return out;
}

/** additional_kwargs.reasoning.summary[].text 합치기(실측 OpenAI Responses). */
function extractReasoningSummary(msg: unknown): string | null {
  const kwargs = (msg as { kwargs?: unknown }).kwargs;
  const ak =
    kwargs && typeof kwargs === "object"
      ? (kwargs as { additional_kwargs?: unknown }).additional_kwargs
      : undefined;
  const reasoning =
    ak && typeof ak === "object"
      ? (ak as { reasoning?: unknown }).reasoning
      : undefined;
  const summary =
    reasoning && typeof reasoning === "object"
      ? (reasoning as { summary?: unknown }).summary
      : undefined;
  if (!Array.isArray(summary)) return null;
  const parts = summary
    .map((s) =>
      s && typeof s === "object" && typeof (s as { text?: unknown }).text === "string"
        ? (s as { text: string }).text
        : "",
    )
    .filter((t) => t.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * checkpoint messages[] → ChatMessage[]. 알 수 없는/깨진 메시지는 skip
 * (C10 — LangGraph 스키마 변경/혼합 메시지에도 크래시 0).
 */
export function replayMessages(messages: unknown[]): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    const cls = messageClass(msg);
    if (cls === "HumanMessage") {
      const content = humanContent(msg);
      if (content.length > 0) out.push({ role: "user", content });
    } else if (cls === "AIMessageChunk" || cls === "AIMessage") {
      out.push(replayAssistant(msg));
    }
    // 그 외(SystemMessage / ToolMessage / 깨진 객체) → skip.
  }
  return out;
}

/**
 * 대화 제목 = 첫 HumanMessage 의 content 앞 TITLE_MAX 자(medigate-manager
 * buildTitleFromQuery 패턴). C4: messages[0] 단정 폐기 — 첫 HumanMessage
 * 를 찾아서. 없으면 "(제목 없음)".
 */
export function extractTitle(messages: unknown[]): string {
  if (!Array.isArray(messages)) return "(제목 없음)";
  for (const msg of messages) {
    if (messageClass(msg) !== "HumanMessage") continue;
    const raw = humanContent(msg).trim().replace(/\s+/g, " ");
    if (raw.length === 0) continue;
    return raw.length > TITLE_MAX ? `${raw.slice(0, TITLE_MAX)}…` : raw;
  }
  return "(제목 없음)";
}

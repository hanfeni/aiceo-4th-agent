// 공유 타입 단일 파일 (PRD §1.7 — types: single file).
// LLM/하네스 비의존. ChatMessage / SseEvent / HarnessConfig / SubagentSpec.
// checkpointer·tools 는 느슨하게 둔다(Slice 4/5 에서 정밀화 — CLAUDE.md R8).

/** 채팅 메시지 한 건 (Zustand 스토어 + UI 렌더 단위). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 서버 → 클라이언트 SSE 이벤트 (discriminated union).
 * route.ts 가 thread → token(*) → done|error 순으로 emit
 * (docs/notes/live-stream-events.md / PRD §1.6).
 */
export type SseEvent =
  | { type: "thread"; conversationId: string }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * 서브에이전트 명세. deepagents subagents[] 슬롯에 합성된다.
 * (PRD FR-12 / harness/subagents/ — Slice 5 에서 레지스트리 합성.)
 */
export interface SubagentSpec {
  name: string;
  description: string;
  systemPrompt: string;
}

/**
 * 하네스 요소 조립 계약 (PRD §1.3 FR-08 / §1.10 AD-1·AD-6).
 * buildHarnessConfig(env) 가 이 형태를 단일 지점에서 조립한다.
 * checkpointer / tools 는 이 레벨에서 느슨하게 둔다 — Slice 4/5 가
 * 실제 타입(BaseCheckpointSaver / StructuredTool)으로 정밀화한다(R8).
 */
export interface HarnessConfig {
  planning: { enabled: boolean };
  filesystem: { enabled: boolean };
  subagents: SubagentSpec[];
  tools: unknown[];
  checkpointer: unknown;
}

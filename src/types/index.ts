// 공유 타입 단일 파일 (PRD §1.7 — types: single file).
// LLM/하네스 비의존. ChatMessage / SseEvent / HarnessConfig / SubagentSpec.
// checkpointer·tools 는 느슨하게 둔다(Slice 4/5 에서 정밀화 — CLAUDE.md R8).

/** 채팅 메시지 한 건 (Zustand 스토어 + UI 렌더 단위). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /**
   * 사고 과정(thinking/reasoning) 누적 텍스트 — assistant 만. 본문
   * content 와 분리된 별도 채널(FR-09/R5: 본문 누출 0 유지). 사고 패널
   * (ThinkingPanel_A)이 이 값을 렌더한다. 없으면 미설정(패널 미표시).
   */
  thinking?: string;
  /**
   * 도구 호출 단계 — assistant 만. 본문과 분리된 별도 채널(FR-09 유지).
   * 사고 패널의 도구 IN/OUT step(디자인 IOMini)을 렌더한다.
   */
  toolSteps?: ToolStep[];
}

/**
 * 도구 호출 1건 (사고 패널 IN/OUT step). id 로 호출-결과를 매칭한다.
 * 실측(scripts/tool-probe.mts): model_request 노드의 tool_call_chunk
 * 가 {name,args,id} 를 점진 누적(IN), tools 노드의 tool 메시지가
 * content 로 결과를 준다(OUT).
 */
export interface ToolStep {
  /** tool_call id (call_...). 호출↔결과 매칭 키. */
  id: string;
  /** 도구명 (예: current_time). */
  name: string;
  /** 누적된 인자 JSON 문자열(스트리밍 중 점진 완성). */
  args: string;
  /** 도구 실행 결과(OUT). 미수신 시 undefined(실행 중). */
  result?: string;
}

/**
 * 서버 → 클라이언트 SSE 이벤트 (discriminated union).
 * route.ts 가 thread → token(*) → done|error 순으로 emit
 * (docs/notes/live-stream-events.md / PRD §1.6).
 */
export type SseEvent =
  | { type: "thread"; conversationId: string }
  | { type: "token"; text: string }
  | { type: "thinking"; text: string }
  // 도구 호출 IN(model_request 노드의 tool_call_chunk 누적).
  | { type: "tool_call"; id: string; name: string; args: string }
  // 도구 실행 결과 OUT(tools 노드의 tool 메시지).
  | { type: "tool_result"; id: string; name: string; result: string }
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

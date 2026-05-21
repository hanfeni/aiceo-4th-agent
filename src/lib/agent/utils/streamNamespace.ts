/**
 * streamNamespace — subgraphs:true 스트림의 part 정규화 + 서브에이전트
 * 식별 (순수 함수, LLM 호출 0 → 단위 테스트 가능 — NFR-11/R5 원칙).
 *
 * 배경(실측 — scripts/subagent-probe.mts):
 *  - streamMode "messages" + subgraphs:true → part 형태가 바뀐다.
 *      · 루트(메인) 청크:   [msg, meta]            (2-튜플, 기존과 동일)
 *      · 서브그래프 청크:   [namespace[], [msg, meta]]  (3-튜플)
 *    namespace 는 에이전트 계층 경로. 실측 관측값:
 *      ["model_request:UUID"]                         ← 메인 LLM
 *      ["tools:UUID"]                                 ← task 도구 실행
 *      ["tools:UUID", "model_request:UUID"]           ← 서브에이전트 내부 LLM
 *  - deepagents 공식: "events from a tools:UUID namespace → that
 *    subagent is actively executing".
 *
 * 이 모듈은 part 를 항상 {msg, meta, namespace[]} 로 정규화한다. agent.ts
 * 는 이 정규화 결과만 쓰므로 chunkFilter 5종 추출기는 **무수정**으로
 * 재사용된다(R5 격리 유지 — filterChunk 가 계속 langgraph_node===
 * "model_request" 만 본문 통과 → 서브에이전트 본문 누출 0, FR-09).
 */

/** subgraphs:true 스트림 part 의 정규화 형태. */
export interface NormalizedPart {
  /** AIMessageChunk (직렬화/런타임 양형 — chunkFilter 가 방어). */
  msg: unknown;
  /** 스트림 메타데이터(langgraph_node 등). */
  meta: unknown;
  /** 에이전트 계층 경로. 루트면 빈 배열. */
  namespace: string[];
  /**
   * 다중 streamMode 시 이 part 의 모드("messages" | "tools" 등).
   * 단일 streamMode("messages")면 "messages" 로 본다(하위호환).
   * "tools" 면 msg 는 StreamToolsOutput(on_tool_start|end|error).
   */
  mode: string;
}

/**
 * "tools" streamMode part 의 도구 실행 결과 (R8 실측 —
 * @langchain/langgraph StreamToolsOutput). on_tool_end.output 은
 * ToolMessage(직렬화형: kwargs.content = 우리 정제 string).
 */
export interface ToolEvent {
  event: "on_tool_start" | "on_tool_end" | "on_tool_error";
  toolCallId?: string;
  name: string;
  /** on_tool_start. */
  input?: unknown;
  /** on_tool_end — ToolMessage(kwargs.content = 도구 반환 string). */
  output?: unknown;
  /** on_tool_error. */
  error?: unknown;
}

/**
 * subgraphs:true 스트림의 part 를 {msg, meta, namespace} 로 정규화한다.
 *
 * 2-튜플(루트)·3-튜플(서브그래프) 양형을 모두 안전 처리한다. part 가
 * 예상 밖이면 msg/meta=undefined, namespace=[] (chunkFilter 가 안전
 * 스킵 — null 반환). 이 함수 자체는 throw 하지 않는다(스트림 견고성).
 */
export function normalizePart(part: unknown): NormalizedPart {
  if (!Array.isArray(part)) {
    return { msg: undefined, meta: undefined, namespace: [], mode: "messages" };
  }
  // 다중 streamMode + subgraphs: [namespace[], modeName(string), data]
  // (R8 실측 — ["messages", "tools"] 구독 시 3-튜플의 [1]이 모드명).
  //  · "messages" → data = [msg, meta]
  //  · "tools"    → data = StreamToolsOutput(객체) → msg 로 전달
  if (Array.isArray(part[0]) && typeof part[1] === "string") {
    const ns = (part[0] as unknown[]).filter(
      (s): s is string => typeof s === "string",
    );
    const mode = part[1] as string;
    const data = part[2];
    if (mode === "messages" && Array.isArray(data)) {
      const inner = data as unknown[];
      return { msg: inner[0], meta: inner[1], namespace: ns, mode };
    }
    // "tools" 등 — data 객체를 msg 로(meta 없음). chunkFilter 추출기는
    // langgraph_node 메타가 없으면 null 반환 → 본문 누출 0(R5 유지).
    return { msg: data, meta: undefined, namespace: ns, mode };
  }
  // 3-튜플(단일 messages + subgraphs): [namespace[], [msg, meta]]
  if (Array.isArray(part[0]) && Array.isArray(part[1])) {
    const ns = (part[0] as unknown[]).filter(
      (s): s is string => typeof s === "string",
    );
    const inner = part[1] as unknown[];
    return { msg: inner[0], meta: inner[1], namespace: ns, mode: "messages" };
  }
  // 2-튜플: [msg, meta]  (루트 청크 — 기존 형태와 동일)
  return { msg: part[0], meta: part[1], namespace: [], mode: "messages" };
}

/**
 * "tools" 모드 part 의 msg(StreamToolsOutput)에서 도구 완료 결과를
 * 추출한다(순수 — NFR-11). on_tool_end 만 결과 보유. output 은
 * ToolMessage 직렬화형이라 kwargs.content(우리 정제 string) 또는
 * 런타임 .content 양형을 방어한다(chunkFilter 동일 정신).
 *
 * task(서브에이전트 위임)는 trackTaskCompletion 가 별도 처리하므로
 * 여기선 제외(중복 emit 방지 — name==="task" skip).
 *
 * @returns { id, name, result } 또는 null(완료 이벤트 아님/task).
 */
export function extractToolEventResult(
  msg: unknown,
): { id: string; name: string; result: string } | null {
  if (typeof msg !== "object" || msg === null) return null;
  const e = msg as Partial<ToolEvent>;
  if (e.event !== "on_tool_end") return null;
  if (typeof e.name !== "string" || e.name === "task") return null;
  const out = e.output;
  let content: unknown;
  if (typeof out === "string") {
    content = out;
  } else if (typeof out === "object" && out !== null) {
    const o = out as { content?: unknown; kwargs?: { content?: unknown } };
    content = o.content ?? o.kwargs?.content;
  }
  // content 가 string 이면 그대로, 배열이면 type==="text" 블록에서 추출.
  // read_file 등 FilesystemMiddleware 도구는 on_tool_end output.kwargs.content
  // 가 [{type:"text", text:"..."}] 배열로 온다(web_search ClientTool 과 다름).
  let result: string;
  if (typeof content === "string") {
    result = content;
  } else if (Array.isArray(content)) {
    result = content
      .filter((b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text",
      )
      .map((b) => b.text)
      .join("");
  } else {
    return null;
  }
  if (result.length === 0) return null;
  return {
    id: typeof e.toolCallId === "string" ? e.toolCallId : "",
    name: e.name,
    result,
  };
}

/**
 * namespace 가 서브에이전트(task 위임) 실행 컨텍스트인지 판정한다.
 *
 * deepagents 규칙(실측 — subagent-probe.mts): namespace 세그먼트 중
 * `tools:` 로 시작하는 것이 있으면 그 청크는 서브에이전트 서브그래프
 * 안이다(메인이 task 도구로 위임). 루트(빈 namespace)·`model_request:`
 * 단독은 메인 에이전트.
 *
 * agent.ts 는 이 판정이 true 인 청크를 메인 추출기에서 **제외(skip)**
 * 만 한다. medigate-new 패턴: 서브에이전트 진행은 그 내부 토큰이
 * 아니라 메인이 emit 하는 task 도구 step 으로 표현하므로, 서브에이전트
 * 내부 본문을 별도 추출할 필요가 없다(FR-09 무손상 + 패널 과부하 0).
 * 그래서 식별 키/텍스트 추출기는 두지 않는다(불필요 — 단순함 우선).
 *
 * @returns 서브에이전트 컨텍스트면 true
 */
export function isSubagentNamespace(namespace: string[]): boolean {
  return namespace.some((seg) => seg.startsWith("tools:"));
}

/**
 * task(서브에이전트 위임) 완료 추적 상태 (순수 — NFR-11).
 *
 * 배경(실측 — subagent-probe.mts): deepagents 는 task **완료**를
 * tool_result ToolMessage 로 주지 않는다. 그래서 사고 패널의 "에이전트
 * 실행 중" step 이 "완료"로 전환되지 않는다(thinkingSteps.reduceTool
 * Result 가 매칭할 OUT 이 없음). 보완: 서브에이전트 namespace 청크를
 * 거친 뒤 메인(루트) 청크로 **복귀(탈출)**하면 그 task 가 끝난 것으로
 * 보고 task tool_result 를 합성 emit 한다.
 *
 * 상태는 agent.ts 의 stream 루프가 보관하고, 전이 판정만 이 순수
 * 함수가 한다(루프는 thin — 테스트는 이 함수로).
 */
/** 진행 중 task 1건(완료 emit 시 id·args 필요 — args=subagent_type 라벨). */
export interface PendingTask {
  id: string;
  args: string;
}

/**
 * 다중 task 완료 추적 상태(순수 — NFR-11). 단일 pendingTaskId 로는
 * deep-web-research 의 **한 턴 3개 동시 위임**에서 마지막 1개만
 * 완료 처리되는 한계가 실측됐다(subagent-probe: taskCalls 3 /
 * taskResults 1). → 진행 중 task 를 FIFO 큐로 쌓는다.
 *
 * 매칭 한계(실측): 서브에이전트 namespace 의 UUID(`tools:UUID`)는
 * task tool_call id(`call_xxx`)와 **다른 값**이라 "이 서브에이전트
 * 청크가 어느 task 인지" 1:1 매칭이 불가능하다. 그래서 정밀 매칭이
 * 아니라 **개수/순서(FIFO) 기반**으로 완료를 흘린다 — medigate 도
 * task 별 정밀 매칭이 아니라 step 단위 표시이므로 충분(UX 등가).
 */
export interface TaskTrackState {
  /** 진행 중 task 큐(위임 순서 = FIFO). */
  pending: PendingTask[];
  /** 서브에이전트 namespace 청크를 본 횟수 누계(탈출 카운팅용). */
  subagentSeen: boolean;
}

export function initTaskTrack(): TaskTrackState {
  return { pending: [], subagentSeen: false };
}

/**
 * 한 청크를 보고 task 완료 전이를 판정한다(순수, 다중 추적).
 *
 * 규칙(FIFO 탈출):
 *  - rootToolCall.name==="task" → 큐에 push(위임 시작, 완료 없음).
 *  - 서브에이전트 청크 → subagentSeen=true(진입 마킹).
 *  - subagentSeen 인 상태에서 루트 청크로 복귀 → 큐 head 1개를
 *    완료 처리(가장 오래된 task 부터). subagentSeen 리셋해 다음
 *    서브에이전트 진입→탈출이 다음 task 를 완료시키게 한다.
 *
 * 정밀 1:1 이 아니라 "탈출 1회 = 가장 오래된 진행 task 1개 완료"
 * 다(매칭 불가 — 위 주석). 3개 위임 → 3회 탈출 → 3개 순서대로 완료.
 *
 * @returns next: 갱신 상태 / completed: 이번에 완료된 task(없으면 null)
 */
export function trackTaskCompletion(
  state: TaskTrackState,
  isSubagentChunk: boolean,
  rootToolCall: { id: string; name: string; args: string } | null,
): { next: TaskTrackState; completed: PendingTask | null } {
  // 새 task 위임 → 큐에 추가(중복 id 는 무시 — tool_call 델타 분할).
  if (rootToolCall && rootToolCall.name === "task" && rootToolCall.id) {
    if (state.pending.some((p) => p.id === rootToolCall.id)) {
      return { next: state, completed: null };
    }
    return {
      next: {
        pending: [
          ...state.pending,
          { id: rootToolCall.id, args: rootToolCall.args },
        ],
        subagentSeen: state.subagentSeen,
      },
      completed: null,
    };
  }
  // 서브에이전트 청크 → 진입 마킹(완료 대기 큐 있을 때만 의미).
  if (isSubagentChunk) {
    if (state.subagentSeen || state.pending.length === 0) {
      return { next: state, completed: null };
    }
    return {
      next: { ...state, subagentSeen: true },
      completed: null,
    };
  }
  // 서브에이전트 진입 후 루트 복귀 → 큐 head 1개 완료(FIFO).
  if (!isSubagentChunk && state.subagentSeen && state.pending.length > 0) {
    const [head, ...rest] = state.pending;
    return {
      next: { pending: rest, subagentSeen: false },
      completed: head,
    };
  }
  return { next: state, completed: null };
}

/**
 * 스트림 종료 시 남아있는 진행 task 를 모두 완료 처리한다(순수).
 * 마지막 task(들)는 탈출 후 더는 루트 청크가 없을 수 있어 큐에
 * 잔류한다 → 종료 시 일괄 마감(medigate 도 스트림 끝에 미완 step
 * 을 완료로 정리). 반환 순서 = FIFO(위임 순).
 */
export function drainPendingTasks(state: TaskTrackState): PendingTask[] {
  return state.pending;
}

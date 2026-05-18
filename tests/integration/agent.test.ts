import { describe, it, expect, vi, beforeEach } from "vitest";

// agent.ts 통합 테스트 — deepagents/@langchain 그래프 모킹(LLM 0, 과금 0).
// 매핑: TC-21.2(동시 cold-start ≤1회), TC-15.2(thread_id 전달),
//       TC-15.3(수동 history 누적 0), TC-2.2, TC-15.4(checkpointer 주입)
//
// 핵심 계약 (Slice 5 / AD-3 / R3 / R6):
//   - globalThis 싱글톤이 Promise 를 메모이즈 → 동시 첫 요청 N개라도
//     createDeepAgent 는 최대 1회 호출(AD-3).
//   - createStream({query, conversationId}) 가 graph.stream(input, config)
//     를 streamMode "messages" + configurable.thread_id 로 호출.
//   - 각 [msg,meta] 청크를 chunkFilter 로 매핑해 SseEvent{type:'token'} yield.
//   - input.messages 에 현재 turn query 만(수동 conversationHistory 누적 0, R3).

// --- deepagents createDeepAgent 모킹 (실 그래프/LLM 없음) ---
const { createDeepAgentSpy, streamSpy } = vi.hoisted(() => ({
  createDeepAgentSpy: vi.fn(),
  streamSpy: vi.fn(),
}));

vi.mock("deepagents", () => ({
  createDeepAgent: (...args: unknown[]) => {
    createDeepAgentSpy(...args);
    return {
      // streamMode "messages" → 각 part 는 [serializedChunk, meta] 2-튜플.
      stream: async function* (input: unknown, config: unknown) {
        streamSpy(input, config);
        const meta = { langgraph_node: "model_request" };
        yield [{ kwargs: { content: "안" } }, meta];
        yield [{ kwargs: { content: "" } }, meta]; // 빈 마커 — 스킵돼야 함
        yield [{ kwargs: { content: "녕" } }, meta];
        // 다른 노드(subagent) — 본문에서 제외돼야 함
        yield [{ kwargs: { content: "secret" } }, { langgraph_node: "tools" }];
      },
    };
  },
  registerHarnessProfile: vi.fn(),
}));

// 모델/checkpointer 생성자도 모킹 — 실 키/네이티브 바인딩 불필요.
vi.mock("@langchain/openai", () => ({ ChatOpenAI: class {} }));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    getName() {
      return "ChatAnthropic";
    }
  },
}));
vi.mock("@langchain/langgraph-checkpoint-sqlite", () => ({
  SqliteSaver: class {
    static fromConnString() {
      return new this();
    }
  },
}));

function setEnv() {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.LLM_MODEL = "claude-test";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.HARNESS_CHECKPOINTER = "memory";
}

describe("agent.ts — globalThis 싱글톤 + createStream (AD-3 / R3 / R6)", () => {
  beforeEach(() => {
    createDeepAgentSpy.mockClear();
    streamSpy.mockClear();
    setEnv();
    // globalThis 싱글톤 클린 — 매 테스트 cold-start 재현.
    delete (globalThis as Record<string, unknown>).__agent;
    vi.resetModules();
  });

  // TC-21.2 — 동시 cold-start 2+ 요청 → createDeepAgent 최대 1회 호출.
  it("TC-21.2: 동시 첫 요청 2개 createStream → createDeepAgent 정확히 1회 호출(AD-3 Promise 메모이즈)", async () => {
    const { createStream } = await import("@/lib/agent/agent");

    // 두 cold-start 를 동시에 발사 — Promise 메모이즈 안 되면 2회 호출됨.
    const [s1, s2] = await Promise.all([
      createStream({ query: "안녕", conversationId: "c1" }),
      createStream({ query: "안녕", conversationId: "c2" }),
    ]);

    // 스트림 소비(생성기 실행) — 어쨌든 그래프는 한 번만 빌드돼야 함.
    for await (const _ of s1) void _;
    for await (const _ of s2) void _;

    expect(createDeepAgentSpy).toHaveBeenCalledTimes(1);
  });

  // TC-15.2 / TC-2.2 — graph.stream 이 configurable.thread_id + streamMode "messages" 로 호출.
  it("TC-15.2/2.2: createStream → graph.stream 이 configurable.thread_id=conversationId, streamMode 'messages' 로 호출", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const stream = await createStream({ query: "안녕", conversationId: "conv-42" });
    for await (const _ of stream) void _;

    expect(streamSpy).toHaveBeenCalled();
    const [input, config] = streamSpy.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    const cfg = config as { configurable?: { thread_id?: string }; streamMode?: string };
    expect(cfg.configurable?.thread_id).toBe("conv-42");
    expect(cfg.streamMode).toBe("messages");

    // TC-15.3/R3 — input.messages 는 현재 turn query 만(수동 history 누적 0).
    const msgs = (input.messages ?? []) as Array<{ role?: string; content?: string }>;
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[0]?.content).toBe("안녕");
  });

  // chunkFilter 통합 — 본문 텍스트만 SseEvent token 으로, 빈/타노드 청크 제외.
  it("createStream: 청크를 chunkFilter 로 매핑 → 본문만 SseEvent{type:'token'} (빈/subagent 노드 제외)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const stream = await createStream({ query: "안녕", conversationId: "c9" });

    const events: Array<{ type: string; text?: string }> = [];
    for await (const ev of stream) events.push(ev);

    // model_request 노드의 "안","녕"만 토큰. ""(마커)·"secret"(tools 노드) 제외.
    expect(events.every((e) => e.type === "token")).toBe(true);
    const text = events.map((e) => e.text).join("");
    expect(text).toBe("안녕");
    expect(text).not.toContain("secret");
  });

  // TC-15.4 — checkpointer 가 createDeepAgent 인자에 주입됨(멀티턴 무상태 퇴화 차단).
  it("TC-15.4: createDeepAgent 옵션에 checkpointer 가 truthy 로 주입됨(LLM 0 어설션)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const stream = await createStream({ query: "안녕", conversationId: "c1" });
    for await (const _ of stream) void _;

    expect(createDeepAgentSpy).toHaveBeenCalledTimes(1);
    const opts = (createDeepAgentSpy.mock.calls[0]?.[0] ?? {}) as {
      checkpointer?: unknown;
    };
    expect(opts.checkpointer).toBeTruthy();
  });
});

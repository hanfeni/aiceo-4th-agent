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
  // skills/index.ts 가 import-시점 `FilesystemBackend` 를 참조 — mock
  // 표면을 실 deepagents export 와 정합(model.test 의 tools.webSearch
  // 보강과 동일 패턴 — 누락 시 "No FilesystemBackend export" FAIL).
  FilesystemBackend: class {
    constructor(_opts?: unknown) {}
  },
}));

// 모델/checkpointer 생성자도 모킹 — 실 키/네이티브 바인딩 불필요.
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {},
  // webSearchTool.ts import-시점 tools.webSearch() 평가 (probe note §6-A).
  tools: { webSearch: () => ({ type: "web_search" }) },
}));
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
    const cfg = config as {
      configurable?: { thread_id?: string };
      streamMode?: string | string[];
    };
    expect(cfg.configurable?.thread_id).toBe("conv-42");
    // streamMode 다중 구독: "messages"(LLM 토큰) + "tools"(도구
    // 라이프사이클 — 메인 ClientTool OUT 공급, R8 실측).
    expect(cfg.streamMode).toEqual(["messages", "tools"]);

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

  // --- 런타임 모델 선택: 모델별 그래프 캐시 (AD-13 / FR-14·FR-18 / C6·C12) ---

  // 같은 모델 동시 cold-start → 그 모델 그래프는 정확히 1회 빌드(AD-3 모델별 유지).
  it("같은 model 동시 2요청 → createDeepAgent 1회(모델별 Promise 메모이즈)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const [s1, s2] = await Promise.all([
      createStream({ query: "q", conversationId: "c1", model: "gpt-5.5" }),
      createStream({ query: "q", conversationId: "c2", model: "gpt-5.5" }),
    ]);
    for await (const _ of s1) void _;
    for await (const _ of s2) void _;
    expect(createDeepAgentSpy).toHaveBeenCalledTimes(1);
  });

  // 서로 다른 모델 → 각 모델별 그래프 별도 빌드(캐시 키 분리).
  it("다른 model 2요청 → createDeepAgent 2회(모델별 캐시 엔트리 분리)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const s1 = await createStream({ query: "q", conversationId: "c1", model: "gpt-5.5" });
    for await (const _ of s1) void _;
    const s2 = await createStream({ query: "q", conversationId: "c2", model: "gpt-5.4" });
    for await (const _ of s2) void _;
    expect(createDeepAgentSpy).toHaveBeenCalledTimes(2);
  });

  // C12 — 화이트리스트 한정이라 캐시 엔트리는 모델 수만큼만(같은 모델 재요청 무빌드).
  it("같은 model 재요청은 캐시 재사용(추가 빌드 0 — C12 bound)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const s1 = await createStream({ query: "q", conversationId: "c1", model: "gpt-5.4-mini" });
    for await (const _ of s1) void _;
    const s2 = await createStream({ query: "q", conversationId: "c2", model: "gpt-5.4-mini" });
    for await (const _ of s2) void _;
    expect(createDeepAgentSpy).toHaveBeenCalledTimes(1);
  });

  // 무회귀 — model 미지정 시 기존 env 경로(단일 캐시) 그대로.
  it("model 미지정 동시 2요청 → 기존대로 createDeepAgent 1회(무회귀)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const [s1, s2] = await Promise.all([
      createStream({ query: "q", conversationId: "c1" }),
      createStream({ query: "q", conversationId: "c2" }),
    ]);
    for await (const _ of s1) void _;
    for await (const _ of s2) void _;
    expect(createDeepAgentSpy).toHaveBeenCalledTimes(1);
  });

  // R3 — 모델 지정해도 thread_id/streamMode 계약 불변(히스토리 이어받기 AD-15).
  it("model 지정 시에도 graph.stream 은 thread_id=conversationId, streamMode messages", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const stream = await createStream({
      query: "안녕",
      conversationId: "conv-m",
      model: "gpt-5.5",
    });
    for await (const _ of stream) void _;
    const [input, config] = streamSpy.mock.calls[0] as [
      Record<string, unknown>,
      { configurable?: { thread_id?: string }; streamMode?: string | string[] },
    ];
    expect(config.configurable?.thread_id).toBe("conv-m");
    expect(config.streamMode).toEqual(["messages", "tools"]);
    const msgs = (input.messages ?? []) as Array<{ content?: string }>;
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.content).toBe("안녕");
  });

  // --- 멀티모달: images → content 블록배열 (Slice D / LangChain v1 형식) ---

  it("images 없으면 content 는 string(기존 경로 무회귀)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const s = await createStream({ query: "안녕", conversationId: "c1" });
    for await (const _ of s) void _;
    const [input] = streamSpy.mock.calls[0] as [Record<string, unknown>];
    const msgs = input.messages as Array<{ content: unknown }>;
    expect(typeof msgs[0].content).toBe("string");
    expect(msgs[0].content).toBe("안녕");
  });

  it("images 있으면 content 는 [text 블록, image_url 블록…] 배열", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const img = "data:image/png;base64,iVBORw0KGgo=";
    const s = await createStream({
      query: "설명해줘",
      conversationId: "c2",
      images: [img],
    });
    for await (const _ of s) void _;
    const [input] = streamSpy.mock.calls[0] as [Record<string, unknown>];
    const msgs = input.messages as Array<{ content: unknown }>;
    const content = msgs[0].content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toMatchObject({ type: "text", text: "설명해줘" });
    const imgBlock = content.find((b) => b.type === "image_url");
    expect(imgBlock).toBeTruthy();
    expect((imgBlock?.image_url as { url?: string })?.url).toBe(img);
  });

  it("이미지 여러 장 → text 1 + image_url N (순서 보존)", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const imgs = [
      "data:image/png;base64,AAA=",
      "data:image/jpeg;base64,BBB=",
    ];
    const s = await createStream({
      query: "비교해줘",
      conversationId: "c3",
      images: imgs,
    });
    for await (const _ of s) void _;
    const [input] = streamSpy.mock.calls[0] as [Record<string, unknown>];
    const content = (input.messages as Array<{ content: unknown }>)[0]
      .content as Array<Record<string, unknown>>;
    expect(content.filter((b) => b.type === "image_url")).toHaveLength(2);
    expect(content[0].type).toBe("text");
  });

  it("R3: images 있어도 thread_id/streamMode 계약 불변", async () => {
    const { createStream } = await import("@/lib/agent/agent");
    const s = await createStream({
      query: "q",
      conversationId: "conv-img",
      images: ["data:image/png;base64,AAA="],
    });
    for await (const _ of s) void _;
    const [, config] = streamSpy.mock.calls[0] as [
      unknown,
      { configurable?: { thread_id?: string }; streamMode?: string | string[] },
    ];
    expect(config.configurable?.thread_id).toBe("conv-img");
    expect(config.streamMode).toEqual(["messages", "tools"]);
  });
});

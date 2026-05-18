import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "@/components/chat/useChat";
import { chatStore } from "@/store";

// useChat 단위 테스트 (LLM 비의존 — fetch + SSE 파서 모킹).
// 매핑: TC-1.8, TC-3.5, TC-20.2/20.4/20.5/20.6, TC-23.1/23.2 / FR-03/04/06 / AC-5
//
// 핵심 회귀 가드(TC-20.4): 정상/에러/throw 어느 경로든 finally 에서
// setStreaming(false) + finalizeLastAssistant() 가 반드시 호출된다
// (미호출 시 입력 영구 잠금 — AC-5 명시 가드).
//
// R3: conversationId 는 턴 간 재사용한다(서버+checkpointer 가 히스토리 처리,
// 클라이언트는 현재 query 만 전송 — 수동 history 누적 금지).

const enc = new TextEncoder();

/** SSE 바이트 청크 배열을 fetch Response.body(ReadableStream)로 감싼다. */
function sseBody(events: object[]): ReadableStream<Uint8Array> {
  const frames = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(enc.encode(frames[i++]));
      } else {
        controller.close();
      }
    },
  });
}

/** fetch 를 SSE 200 응답으로 모킹. 호출 인자 캡처용 spy 반환. */
function mockFetchOk(events: object[]): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(
    new Response(sseBody(events), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function resetStore(): void {
  chatStore.setState({
    messages: [],
    conversationId: null,
    isStreaming: false,
    error: null,
    provider: "",
    model: "",
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useChat — 전송 가드 (TC-23.1/23.2)", () => {
  // TC-23.1 — 빈 입력은 전송 차단(fetch 0건)
  it("TC-23.1: 빈 문자열 입력 → fetch 미호출, store messages 불변", async () => {
    const spy = mockFetchOk([{ type: "done" }]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("");
    });
    expect(spy).not.toHaveBeenCalled();
    expect(chatStore.getState().messages).toHaveLength(0);
  });

  // TC-23.1 — 공백/개행만 → 차단(AD-4 client side)
  it("TC-23.1: 공백/개행만 입력 → fetch 미호출", async () => {
    const spy = mockFetchOk([{ type: "done" }]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("  \n\t  ");
    });
    expect(spy).not.toHaveBeenCalled();
    expect(chatStore.getState().messages).toHaveLength(0);
  });

  // TC-23.2 — 공백+텍스트 혼합은 trim 후 전송(UC-1 합류)
  it("TC-23.2: 공백+실제 텍스트 혼합 → trim 후 정상 전송", async () => {
    const spy = mockFetchOk([
      { type: "thread", conversationId: "c-1" },
      { type: "token", text: "hi" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("  안녕  ");
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toBe("안녕");
  });
});

describe("useChat — 정상 스트리밍 → store 구동 (TC-1.x/20.2)", () => {
  // TC-20.2 — thread→token×2→done 시퀀스가 store 액션을 순서대로 구동
  it("TC-20.2: thread→token×2→done → setConversationId + 점진 append + finalize", async () => {
    mockFetchOk([
      { type: "thread", conversationId: "conv-abc" },
      { type: "token", text: "안녕" },
      { type: "token", text: "하세요" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("질문");
    });
    const s = chatStore.getState();
    expect(s.conversationId).toBe("conv-abc");
    // user 1 + assistant 1
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]).toMatchObject({ role: "user", content: "질문" });
    expect(s.messages[1]).toMatchObject({
      role: "assistant",
      content: "안녕하세요",
    });
    // 정상 종료 → 입력 잠금 해제
    expect(s.isStreaming).toBe(false);
  });

  // TC-20.6 — token 0개 후 done(모델 빈 응답): assistant 빈 상태 finalize, 크래시 0
  it("TC-20.6: token 0개 후 done → assistant 빈 버블 finalize(크래시 0)", async () => {
    mockFetchOk([{ type: "thread", conversationId: "c-empty" }, { type: "done" }]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("질문");
    });
    const s = chatStore.getState();
    expect(s.messages).toHaveLength(2);
    expect(s.messages[1]).toMatchObject({ role: "assistant", content: "" });
    expect(s.isStreaming).toBe(false);
  });
});

describe("useChat — error 이벤트 + finally 회귀 가드 (TC-1.8/20.4/20.5)", () => {
  // TC-1.8 / TC-20.5 — error 이벤트 → setError + finally 입력 잠금 해제
  it("TC-1.8: error 이벤트 → setError(message), finally 에서 입력 잠금 해제", async () => {
    mockFetchOk([
      { type: "thread", conversationId: "c-err" },
      { type: "error", message: "rate limit exceeded" },
    ]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("질문");
    });
    const s = chatStore.getState();
    expect(s.error).toBe("rate limit exceeded");
    // 터미널 상태 아님 — 입력 잠금 해제(재전송 가능)
    expect(s.isStreaming).toBe(false);
  });

  // TC-20.4 — fetch 가 throw 해도 finally 가 setStreaming(false) 보장
  it("TC-20.4: fetch 가 throw 해도 finally 에서 setStreaming(false) 호출(입력 고착 회귀 FAIL 가드)", async () => {
    const spy = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", spy);
    const finalizeSpy = vi.spyOn(chatStore.getState(), "finalizeLastAssistant");
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("질문");
    });
    const s = chatStore.getState();
    // 입력 영구 잠금 방지: 반드시 false 로 복귀
    expect(s.isStreaming).toBe(false);
    expect(finalizeSpy).toHaveBeenCalled();
    // 에러도 표면화
    expect(s.error).toBe("network down");
  });

  // TC-20.4 — 정상 done 경로에서도 finalizeLastAssistant() 가 호출됨
  it("TC-20.4: 정상 done 경로에서도 finalizeLastAssistant() 호출", async () => {
    mockFetchOk([
      { type: "thread", conversationId: "c-ok" },
      { type: "token", text: "x" },
      { type: "done" },
    ]);
    const finalizeSpy = vi.spyOn(chatStore.getState(), "finalizeLastAssistant");
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("질문");
    });
    expect(finalizeSpy).toHaveBeenCalled();
    expect(chatStore.getState().isStreaming).toBe(false);
  });

  // non-200(JSON 400) 응답 → setError, finally 잠금 해제
  it("non-200 JSON 응답 → setError, isStreaming=false", async () => {
    const spy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", spy);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("질문");
    });
    const s = chatStore.getState();
    expect(s.error).toBe("bad request");
    expect(s.isStreaming).toBe(false);
  });
});

describe("useChat — conversationId 재사용 (R3 / TC-3.5)", () => {
  // R3 — 2턴째 전송 시 1턴에서 받은 conversationId 를 body 에 포함(턴 간 재사용)
  it("R3: 2번째 send 는 1번째에서 받은 conversationId 를 body 에 포함", async () => {
    const spy = mockFetchOk([
      { type: "thread", conversationId: "thread-keep" },
      { type: "token", text: "a" },
      { type: "done" },
    ]);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("1턴");
    });
    // 2턴: 같은 conversationId 가 실려야 함(수동 history 누적 아님 — query 만)
    mockFetchOk([
      { type: "thread", conversationId: "thread-keep" },
      { type: "token", text: "b" },
      { type: "done" },
    ]);
    await act(async () => {
      await result.current.send("2턴");
    });
    const secondCall = (
      globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    const body = JSON.parse((secondCall[1] as RequestInit).body as string);
    expect(body.conversationId).toBe("thread-keep");
    expect(body.query).toBe("2턴");
    // 1턴 send 의 첫 호출엔 conversationId 가 없어야 함(최초)
    const firstBody = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(firstBody.conversationId).toBeUndefined();
  });
});

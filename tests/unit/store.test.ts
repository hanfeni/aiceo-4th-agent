import { describe, it, expect, beforeEach } from "vitest";
import { createChatStore } from "@/store";
import type { StoreApi } from "zustand";
import type { ChatStore } from "@/store";

// store 단위 테스트 (LLM 비의존, 순수 상태 머신).
// 매핑: TC-25.8~25.12, TC-3.2/3.4/3.5/3.6, TC-20.2 / FR-04, FR-06 / AC-7, AC-10
// 각 테스트는 격리된 store 인스턴스(factory)를 사용해 싱글톤 오염을 방지한다.

describe("chat store", () => {
  let store: StoreApi<ChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  // TC-25.8 — 초기 상태
  it("초기 상태: messages=[], conversationId=null, isStreaming=false, error=null", () => {
    const s = store.getState();
    expect(s.messages).toEqual([]);
    expect(s.conversationId).toBeNull();
    expect(s.isStreaming).toBe(false);
    expect(s.error).toBeNull();
    expect(typeof s.provider).toBe("string");
    expect(typeof s.model).toBe("string");
  });

  // TC-25.9 — addMessage (user/assistant)
  it("addMessage: user/assistant 메시지를 순서대로 추가한다", () => {
    store.getState().addMessage({ role: "user", content: "안녕" });
    store.getState().addMessage({ role: "assistant", content: "" });
    const { messages } = store.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "안녕" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "" });
  });

  // TC-25.10 / TC-20.2 — appendToLastAssistant 점진 누적, 다른 메시지 불변
  it("appendToLastAssistant: 마지막 assistant 에 점진 append, 다른 메시지 불변", () => {
    store.getState().addMessage({ role: "user", content: "질문" });
    store.getState().addMessage({ role: "assistant", content: "" });
    store.getState().appendToLastAssistant("안");
    store.getState().appendToLastAssistant("녕하세요");
    const { messages } = store.getState();
    expect(messages[0]).toMatchObject({ role: "user", content: "질문" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "안녕하세요" });
  });

  // TC-3.5 — appendToLastAssistant race: 마지막이 assistant 가 아니면 섞이지 않음
  it("appendToLastAssistant race(TC-3.5): assistant 메시지 없으면 무시(메시지 0개 유지)", () => {
    // resetChat 직후(메시지 0개)에 이전 스트림 잔여 token 이 도착하는 시나리오
    store.getState().resetChat();
    store.getState().appendToLastAssistant("잔여토큰");
    expect(store.getState().messages).toHaveLength(0);
  });

  it("appendToLastAssistant race: 마지막 메시지가 user 면 append 하지 않는다", () => {
    store.getState().addMessage({ role: "user", content: "질문" });
    store.getState().appendToLastAssistant("새지말것");
    const { messages } = store.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "user", content: "질문" });
  });

  // TC-25.11 — setConversationId: conversationId 갱신, 그 외 상태 불변
  it("setConversationId: conversationId 만 갱신하고 다른 상태는 불변", () => {
    store.getState().addMessage({ role: "user", content: "x" });
    const before = store.getState();
    store.getState().setConversationId("conv-123");
    const after = store.getState();
    expect(after.conversationId).toBe("conv-123");
    expect(after.messages).toEqual(before.messages);
    expect(after.isStreaming).toBe(before.isStreaming);
    expect(after.error).toBe(before.error);
    expect(after.provider).toBe(before.provider);
    expect(after.model).toBe(before.model);
  });

  // TC-3.2 / TC-25.12 — resetChat: 새 conversationId + messages=[] + error=null + isStreaming=false, provider/model 불변
  it("resetChat(TC-3.2): 새 conversationId + 상태 초기화, provider/model 불변", () => {
    store.getState().setConversationId("old-conv");
    store.getState().addMessage({ role: "user", content: "안녕" });
    store.getState().addMessage({ role: "assistant", content: "응답" });
    store.getState().setError("boom");
    store.getState().setStreaming(true);
    const provBefore = store.getState().provider;
    const modelBefore = store.getState().model;

    store.getState().resetChat();

    const s = store.getState();
    expect(s.conversationId).not.toBe("old-conv");
    expect(typeof s.conversationId).toBe("string");
    expect(s.conversationId).toBeTruthy();
    expect(s.messages).toEqual([]);
    expect(s.error).toBeNull();
    expect(s.isStreaming).toBe(false);
    expect(s.provider).toBe(provBefore);
    expect(s.model).toBe(modelBefore);
  });

  // TC-3.4 — resetChat 멱등 안전 (messages 이미 0개)
  it("resetChat(TC-3.4): messages 이미 0개여도 새 conversationId 발급, messages 0개 유지", () => {
    store.getState().setConversationId("prev");
    store.getState().resetChat();
    const s = store.getState();
    expect(s.conversationId).not.toBe("prev");
    expect(s.messages).toHaveLength(0);
  });

  // TC-3.6 — resetChat 빠르게 연속 2회: 매 호출마다 새 conversationId, messages 0개
  it("resetChat(TC-3.6): 연속 2회 호출 시 매번 새 conversationId, messages 0개 유지", () => {
    store.getState().resetChat();
    const first = store.getState().conversationId;
    store.getState().resetChat();
    const second = store.getState().conversationId;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(store.getState().messages).toHaveLength(0);
  });

  // setError
  it("setError: error 메시지를 설정/해제한다", () => {
    store.getState().setError("실패했습니다");
    expect(store.getState().error).toBe("실패했습니다");
    store.getState().setError(null);
    expect(store.getState().error).toBeNull();
  });

  // setStreaming
  it("setStreaming: isStreaming 토글", () => {
    store.getState().setStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
    store.getState().setStreaming(false);
    expect(store.getState().isStreaming).toBe(false);
  });

  // finalizeLastAssistant — TC-20.2 / TC-20.4 (입력 고착 회귀 가드)
  it("finalizeLastAssistant: 호출해도 메시지 내용은 보존된다(멱등)", () => {
    store.getState().addMessage({ role: "user", content: "q" });
    store.getState().addMessage({ role: "assistant", content: "부분 응답" });
    store.getState().finalizeLastAssistant();
    const { messages } = store.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ role: "assistant", content: "부분 응답" });
  });

  it("finalizeLastAssistant: assistant 메시지 없을 때 호출해도 안전(무시)", () => {
    expect(() => store.getState().finalizeLastAssistant()).not.toThrow();
    expect(store.getState().messages).toHaveLength(0);
  });

  // 팩토리 격리 — 두 store 인스턴스가 상태를 공유하지 않음
  it("createChatStore 팩토리: 인스턴스 간 상태 격리", () => {
    const a = createChatStore();
    const b = createChatStore();
    a.getState().addMessage({ role: "user", content: "only-a" });
    expect(a.getState().messages).toHaveLength(1);
    expect(b.getState().messages).toHaveLength(0);
  });

  // --- 런타임 모델 선택: setModel (FR-16 / AD-15) ---
  it("setModel: 선택 모델을 store.model 에 설정한다", () => {
    store.getState().setModel("gpt-5.5");
    expect(store.getState().model).toBe("gpt-5.5");
  });

  it("setModel 후 resetChat: model 은 보존된다(AD-15 — 새 대화에도 선택 유지)", () => {
    store.getState().setModel("gpt-5.4");
    store.getState().resetChat();
    expect(store.getState().model).toBe("gpt-5.4");
    // resetChat 의 다른 효과는 무회귀(messages 0).
    expect(store.getState().messages).toHaveLength(0);
  });

  it("setModel: provider 등 다른 상태는 건드리지 않는다", () => {
    store.setState({ provider: "openai", model: "gpt-5.4-mini" });
    store.getState().setModel("gpt-5.5");
    expect(store.getState().model).toBe("gpt-5.5");
    expect(store.getState().provider).toBe("openai");
  });

  // Slice 4 / Plan Critic C1 — loadConversation: 과거 대화 복원.
  // resetChat 의 대칭(새 thread + 빈 messages ↔ 기존 thread + 복원 messages).
  // 핵심 불변식: conversationId 와 messages 를 **단일 set 으로 원자 커밋**.
  // 그래야 복원 직후 useChat.send 가 chatStore.getState().conversationId 를
  // 읽을 때 반드시 복원한 thread_id 가 서버로 가서 checkpointer 가 맥락을
  // 이어받는다(분리 액션 2개면 중간 상태/순서 의존으로 새 thread 발급 위험).
  describe("loadConversation (C1 — 복원 원자성)", () => {
    it("conversationId + messages 를 동시 커밋, error/streaming 리셋", () => {
      store.getState().setError("이전 에러");
      store.setState({ isStreaming: true });
      const restored = [
        { role: "user" as const, content: "과거 질문" },
        { role: "assistant" as const, content: "과거 답변" },
      ];
      store.getState().loadConversation("past-thread-id", restored);

      const s = store.getState();
      expect(s.conversationId).toBe("past-thread-id");
      expect(s.messages).toEqual(restored);
      expect(s.error).toBeNull();
      expect(s.isStreaming).toBe(false);
    });

    it("provider/model 은 보존(FR-07 — resetChat 과 동일 정책)", () => {
      store.setState({ provider: "openai", model: "gpt-5.4-mini" });
      store.getState().loadConversation("tid", [
        { role: "user", content: "q" },
      ]);
      expect(store.getState().provider).toBe("openai");
      expect(store.getState().model).toBe("gpt-5.4-mini");
    });

    it("복원 후 conversationId 가 그대로 유지되어 send 가 같은 thread 로 이어진다", () => {
      // useChat.send 는 chatStore.getState().conversationId 를 읽어 body 에 실음.
      store.getState().loadConversation("thread-XYZ", [
        { role: "user", content: "이전" },
        { role: "assistant", content: "응답" },
      ]);
      // 복원 직후 conversationId 가 truthy 여야 send 가 새 UUID 발급을 안 함.
      expect(store.getState().conversationId).toBe("thread-XYZ");
      // 이어서 addMessage(send 흐름) 해도 conversationId 불변.
      store.getState().addMessage({ role: "user", content: "추가 질문" });
      expect(store.getState().conversationId).toBe("thread-XYZ");
      expect(store.getState().messages).toHaveLength(3);
    });

    it("thinkingSteps 포함 메시지도 그대로 복원(전체 복원 C5)", () => {
      const withThinking = [
        {
          role: "assistant" as const,
          content: "답변",
          thinkingSteps: [
            { kind: "reasoning" as const, title: "분석", content: "사고", order: 0 },
          ],
        },
      ];
      store.getState().loadConversation("t", withThinking);
      expect(store.getState().messages[0].thinkingSteps).toHaveLength(1);
    });

    it("빈 messages 복원도 안전(대화는 있으나 메시지 0 — graceful)", () => {
      store.getState().loadConversation("empty-thread", []);
      expect(store.getState().conversationId).toBe("empty-thread");
      expect(store.getState().messages).toEqual([]);
    });
  });

  // Slice M — 사고 패널 동적 게이트용 lastStreamEvent.
  // SSE 이벤트 순서 신호: 마지막 이벤트가 'token'(답변 출력 중)이면
  // ThinkingPanel 이 실시간 표시를 숨긴다. 출력 멈추고 thinking/tool
  // 이 다시 오면 재표시. done/reset 은 null(스트림 종료/새 대화).
  describe("lastStreamEvent — 출력/사고 동적 게이트 신호", () => {
    it("초기값은 null", () => {
      expect(store.getState().lastStreamEvent).toBeNull();
    });

    it("setLastStreamEvent 로 'token'/'thinking'/'tool'/null 설정", () => {
      store.getState().setLastStreamEvent("token");
      expect(store.getState().lastStreamEvent).toBe("token");
      store.getState().setLastStreamEvent("thinking");
      expect(store.getState().lastStreamEvent).toBe("thinking");
      store.getState().setLastStreamEvent("tool");
      expect(store.getState().lastStreamEvent).toBe("tool");
      store.getState().setLastStreamEvent(null);
      expect(store.getState().lastStreamEvent).toBeNull();
    });

    it("setStreaming(true) 는 lastStreamEvent 를 건드리지 않는다(독립)", () => {
      store.getState().setLastStreamEvent("thinking");
      store.getState().setStreaming(true);
      expect(store.getState().lastStreamEvent).toBe("thinking");
    });

    it("resetChat 은 lastStreamEvent 를 null 로 초기화(새 대화)", () => {
      store.getState().setLastStreamEvent("token");
      store.getState().resetChat();
      expect(store.getState().lastStreamEvent).toBeNull();
    });

    it("출력 중(token)→사고 재개(tool) 동적 전이가 그대로 반영", () => {
      const g = store.getState;
      g().setLastStreamEvent("thinking"); // 사고 중
      g().setLastStreamEvent("token"); // 출력 시작
      expect(g().lastStreamEvent).toBe("token");
      g().setLastStreamEvent("tool"); // 출력 멈추고 도구 재개
      expect(g().lastStreamEvent).toBe("tool");
    });
  });
});

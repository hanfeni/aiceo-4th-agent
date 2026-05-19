// Zustand v5 챗 스토어 — 단일 파일(팩토리 + 싱글톤 + useChatStore 훅).
// PRD §1.7 상태/액션 계약. 순수 클라이언트 상태(LLM 비의존, globalThis 불필요).
// 매핑: FR-04, FR-06 / AC-7, AC-10 / TC-25.8~25.12, TC-3.2/3.4/3.5/3.6, TC-20.2

import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { ChatMessage, WebSource } from "@/types";
import {
  reduceReasoning,
  reduceToolCall,
  reduceToolResult,
} from "@/lib/agent/utils/thinkingSteps";

/**
 * 마지막으로 도착한 스트림 이벤트 종류(Slice M — 사고 패널 동적
 * 게이트). 'token'=답변 본문 출력 중(중간·최종 무관), 'thinking'/
 * 'tool'=사고/도구 진행 중, null=스트림 종료(done) 또는 미시작.
 * ThinkingPanel 이 'token' 이면 실시간 표시를 숨기고, thinking/tool
 * 로 바뀌면 다시 보여준다(출력↔사고 동적 토글).
 */
export type StreamEventKind = "token" | "thinking" | "tool" | null;

export interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  isStreaming: boolean;
  /** 직전 SSE 이벤트 종류. 사고 패널 출력/사고 동적 게이트용. */
  lastStreamEvent: StreamEventKind;
  error: string | null;
  provider: string;
  model: string;
}

export interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  appendToLastAssistant: (text: string) => void;
  /** 마지막 assistant 메시지의 thinking(사고 채널)에 누적. 본문과 분리. */
  appendThinkingToLastAssistant: (text: string) => void;
  /** 도구 호출 IN 델타 머지(id/name + args 점진 누적). 본문과 분리. */
  appendToolCallToLastAssistant: (delta: {
    id: string;
    name: string;
    args: string;
  }) => void;
  /** 도구 실행 결과 OUT 를 매칭 tool step 에 기록(id 우선, name 폴백). */
  setToolResultOnLastAssistant: (
    name: string,
    result: string,
    id?: string,
  ) => void;
  /**
   * 마지막 assistant 메시지의 참고 출처(References 패널)를 교체한다.
   * web_search citations 유래. 본문/사고와 분리된 별도 채널(FR-09).
   * 같은 출처가 누적 청크로 여러 번 와도 멱등(전체 교체 — 최신 우선).
   */
  setSourcesOnLastAssistant: (sources: WebSource[]) => void;
  setConversationId: (conversationId: string) => void;
  /**
   * 과거 대화 복원 (Plan Critic C1). conversationId 와 messages 를 **단일
   * set 으로 원자 커밋**한다. resetChat 의 대칭(새 thread+빈 messages ↔
   * 기존 thread+복원 messages). 분리 액션 2개로 쪼개면 복원 직후 send 가
   * 읽는 conversationId 가 중간 상태일 수 있어 새 thread 발급 위험.
   */
  loadConversation: (conversationId: string, messages: ChatMessage[]) => void;
  setStreaming: (isStreaming: boolean) => void;
  /**
   * 직전 SSE 이벤트 종류 기록(Slice M). useChat 이 이벤트 분기마다
   * 호출. ThinkingPanel 이 'token'(출력 중)이면 실시간 숨김.
   */
  setLastStreamEvent: (kind: StreamEventKind) => void;
  /** 런타임 선택 모델 설정(FR-16). resetChat 에도 보존됨(AD-15). */
  setModel: (model: string) => void;
  finalizeLastAssistant: () => void;
  setError: (error: string | null) => void;
  resetChat: () => void;
}

export type ChatStore = ChatState & ChatActions;

const initialState: ChatState = {
  messages: [],
  conversationId: null,
  isStreaming: false,
  lastStreamEvent: null,
  error: null,
  provider: "",
  model: "",
};

/**
 * 격리된 store 인스턴스를 생성한다(테스트·SSR 안전).
 * 싱글톤(chatStore)과 useChatStore 훅은 이 팩토리를 재사용한다.
 */
export function createChatStore(): StoreApi<ChatStore> {
  return createStore<ChatStore>((set) => ({
    ...initialState,

    addMessage: (message) =>
      set((state) => ({ messages: [...state.messages, message] })),

    // 마지막 메시지가 assistant 일 때만 점진 append.
    // resetChat 직후·user 직후 잔여 token 도착 시 섞이지 않도록 가드(TC-3.5).
    appendToLastAssistant: (text) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant") return state;
        const updated: ChatMessage = {
          ...last,
          content: last.content + text,
        };
        return {
          messages: [...state.messages.slice(0, -1), updated],
        };
      }),

    // 본문과 분리된 사고 채널 누적(FR-09 유지). last 가 assistant 일 때만.
    // 단일 thinkingSteps[] 에 시간순 누적(교차 보존). 순수 reducer 위임.
    appendThinkingToLastAssistant: (text) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant") return state;
        const prev = last.thinkingSteps ?? [];
        const steps = reduceReasoning(prev, text, prev.length);
        if (steps === prev) return state;
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, thinkingSteps: steps },
          ],
        };
      }),

    appendToolCallToLastAssistant: (delta) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant") return state;
        const prev = last.thinkingSteps ?? [];
        const steps = reduceToolCall(prev, delta, prev.length);
        if (steps === prev) return state;
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, thinkingSteps: steps },
          ],
        };
      }),

    setToolResultOnLastAssistant: (name, result, id) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant" || !last.thinkingSteps) {
          return state;
        }
        const prev = last.thinkingSteps;
        const steps = reduceToolResult(prev, name, result, id);
        if (steps === prev) return state;
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, thinkingSteps: steps },
          ],
        };
      }),

    // 참고 출처 전체 교체(멱등). last 가 assistant 일 때만.
    // 빈 배열이면 무시(검색했으나 인용 0 — 패널 미표시 유지).
    setSourcesOnLastAssistant: (sources) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant") return state;
        if (sources.length === 0) return state;
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, sources },
          ],
        };
      }),

    setConversationId: (conversationId) => set({ conversationId }),

    setStreaming: (isStreaming) => set({ isStreaming }),

    setLastStreamEvent: (kind) => set({ lastStreamEvent: kind }),

    setModel: (model) => set({ model }),

    // 스트림 종료 마커. 현재는 부수효과 없음(메시지 내용 보존, 멱등).
    // useChat 의 finally 입력-잠금-해제 회귀 가드 지점(TC-20.4).
    finalizeLastAssistant: () => set((state) => state),

    setError: (error) => set({ error }),

    // 새 conversationId 발급 + 대화 상태 초기화. provider/model 은 불변(FR-07).
    resetChat: () =>
      set((state) => ({
        conversationId: crypto.randomUUID(),
        messages: [],
        error: null,
        isStreaming: false,
        lastStreamEvent: null,
        provider: state.provider,
        model: state.model,
      })),

    // 과거 대화 복원 (C1). resetChat 과 대칭 — 단일 set 원자 커밋으로
    // conversationId(=기존 thread_id) + messages 를 동시 교체한다. 복원
    // 직후 useChat.send 가 이 conversationId 를 읽어 body 에 실으면
    // 서버 checkpointer 가 같은 thread 히스토리를 이어받는다(맥락 연속).
    // provider/model 은 보존(FR-07 — resetChat 동일 정책).
    loadConversation: (conversationId, messages) =>
      set((state) => ({
        conversationId,
        messages,
        error: null,
        isStreaming: false,
        provider: state.provider,
        model: state.model,
      })),
  }));
}

/** 앱 전역 싱글톤 인스턴스(클라이언트 단일 대화 상태). */
export const chatStore: StoreApi<ChatStore> = createChatStore();

/** React 컴포넌트용 selector 훅. 인자 없으면 전체 상태 반환. */
export function useChatStore<T>(selector: (state: ChatStore) => T): T;
export function useChatStore(): ChatStore;
export function useChatStore<T>(
  selector?: (state: ChatStore) => T,
): T | ChatStore {
  return useStore(
    chatStore,
    selector ?? ((state) => state as unknown as T),
  );
}

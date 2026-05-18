// Zustand v5 챗 스토어 — 단일 파일(팩토리 + 싱글톤 + useChatStore 훅).
// PRD §1.7 상태/액션 계약. 순수 클라이언트 상태(LLM 비의존, globalThis 불필요).
// 매핑: FR-04, FR-06 / AC-7, AC-10 / TC-25.8~25.12, TC-3.2/3.4/3.5/3.6, TC-20.2

import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { ChatMessage, ToolStep } from "@/types";

export interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  isStreaming: boolean;
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
  /** 도구 실행 결과 OUT 를 매칭되는 toolStep 에 기록(name 매칭). */
  setToolResultOnLastAssistant: (name: string, result: string) => void;
  setConversationId: (conversationId: string) => void;
  setStreaming: (isStreaming: boolean) => void;
  finalizeLastAssistant: () => void;
  setError: (error: string | null) => void;
  resetChat: () => void;
}

export type ChatStore = ChatState & ChatActions;

const initialState: ChatState = {
  messages: [],
  conversationId: null,
  isStreaming: false,
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
    appendThinkingToLastAssistant: (text) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant") return state;
        const updated: ChatMessage = {
          ...last,
          thinking: (last.thinking ?? "") + text,
        };
        return {
          messages: [...state.messages.slice(0, -1), updated],
        };
      }),

    // 도구 호출 IN 머지. id 가 있으면 그 id 의 step, 없으면(args 조각)
    // 마지막 step 에 args 이어붙임(스트리밍: 첫 델타에 id/name, 이후 args).
    appendToolCallToLastAssistant: (delta) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant") return state;
        const steps: ToolStep[] = last.toolSteps ? [...last.toolSteps] : [];
        if (delta.id) {
          const idx = steps.findIndex((s) => s.id === delta.id);
          if (idx >= 0) {
            steps[idx] = {
              ...steps[idx],
              name: delta.name || steps[idx].name,
              args: steps[idx].args + delta.args,
            };
          } else {
            steps.push({
              id: delta.id,
              name: delta.name,
              args: delta.args,
            });
          }
        } else if (steps.length > 0) {
          const li = steps.length - 1;
          steps[li] = { ...steps[li], args: steps[li].args + delta.args };
        } else {
          return state; // id 없는 첫 델타 — 매칭 불가, 무시
        }
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, toolSteps: steps },
          ],
        };
      }),

    // 도구 결과 OUT — name 으로 result 미설정인 step 을 채운다(FIFO).
    setToolResultOnLastAssistant: (name, result) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== "assistant" || !last.toolSteps) {
          return state;
        }
        const steps = [...last.toolSteps];
        const idx = steps.findIndex(
          (s) => s.name === name && s.result === undefined,
        );
        if (idx < 0) return state;
        steps[idx] = { ...steps[idx], result };
        return {
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, toolSteps: steps },
          ],
        };
      }),

    setConversationId: (conversationId) => set({ conversationId }),

    setStreaming: (isStreaming) => set({ isStreaming }),

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

// Zustand v5 챗 스토어 — 단일 파일(팩토리 + 싱글톤 + useChatStore 훅).
// PRD §1.7 상태/액션 계약. 순수 클라이언트 상태(LLM 비의존, globalThis 불필요).
// 매핑: FR-04, FR-06 / AC-7, AC-10 / TC-25.8~25.12, TC-3.2/3.4/3.5/3.6, TC-20.2

import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import type { ChatMessage, SseEvent, WebSource } from "@/types";
import {
  reduceReasoning,
  reduceToolCall,
  reduceToolResult,
} from "@/lib/agent/utils/thinkingSteps";
import { parseSseStream } from "@/lib/agent/utils/sseStreamParser";
import { parseCitationText } from "@/lib/agent/utils/chunkFilter";
import type { HarnessOverrides } from "@/lib/agent/harness/profiles";

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
  /**
   * 인덱스 검색 도구 세션 도메인(챗 우측 드롭다운). null=도구 없음
   * (기존 챗). 5개 코퍼스 중 1개면 그 도메인 index_search 도구가
   * 그래프에 포함. 변경 시 resetChat 으로 세션 리프레시(서버
   * getGraph 캐시 키도 달라져 새 그래프 — 사용자 결정 2026-05-19).
   */
  idxDomain: string | null;
  /**
   * 데이터 조회(SQL) 도구 세션 도메인. idxDomain 과 독립(둘 다
   * 선택 가능). null=도구 없음. 변경 시 resetChat 으로 세션
   * 리프레시(서버 getGraph 캐시 키 변경 — 사용자 결정 2026-05-19).
   */
  sqlDomain: string | null;
  /**
   * 온톨로지 조회(graph) 도구 세션 데이터셋 id. idx/sqlDomain 과
   * 독립(셋 다 선택 가능). null=도구 없음. 변경 시 resetChat 으로
   * 세션 리프레시(서버 getGraph 캐시 키 변경). 수업1·3 연결.
   */
  graphDataset: string | null;
  /**
   * 워크스페이스 하네스 프로필 id(workspace1|2|3). null=기존 /chat
   * (차단 없음 — body 에 미동봉, 서버 회귀 0). 워크스페이스 store
   * 인스턴스가 마운트 시 1회 세팅한다. startStream 이 body.profileId
   * 로 동봉해 서버 그래프가 그 워크스페이스 차단 정책을 적용·격리한다.
   */
  profileId: string | null;
  /**
   * 하네스 토글 오버라이드(에이전트 패널 4요소 토글 상태). 키 있으면
   * 그 값으로 서버 env 위에 강제. 빈 객체=오버라이드 0(env 디폴트).
   * 에이전트 store 가 마운트 시 프로필 defaults 로 시드, 사용자가 토글.
   * startStream 이 body.overrides 로 동봉(비어있지 않을 때만).
   */
  harnessOverrides: HarnessOverrides;
  /**
   * 선택된 시스템 인스트럭션 id(하네스 관리에서 만든 것 중). null=
   * default 본문(body 미동봉, 회귀 0). 에이전트 패널에서 선택.
   */
  instructionId: string | null;
  /**
   * 커스텀 에이전트 id(하네스 "에이전트 생성"에서 만든 에이전트).
   * null=기존 챗(body 미동봉, 회귀 0). /custom-agent/[id] 페이지가
   * 마운트 시 1회 세팅한다. startStream 이 body.customAgentId 로 동봉.
   */
  customAgentId: string | null;
  /**
   * assistant 응답 렌더 방식 토글(입력창 하단 스위치). true=마크다운
   * 렌더(ChatMarkdown, 기본), false=원문 텍스트 그대로(스타일/기호 해석
   * 없이 pre). UI 표시 전용 — 서버 미전송, resetChat 보존.
   */
  markdownEnabled: boolean;
  /**
   * 세션 제목(헤더 왼쪽 표시). null=미생성 → "새 대화" 표시. 새 세션의
   * 첫 질의 시 gpt-5.4-nano(/api/chat/title)로 생성해 채운다. resetChat
   * 시 null 로 리셋(새 세션은 다시 "새 대화"부터).
   */
  conversationTitle: string | null;
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
  loadConversation: (
    conversationId: string,
    messages: ChatMessage[],
    title?: string | null,
  ) => void;
  /**
   * SSE 스트리밍을 store 싱글톤에서 시작·소비한다(메뉴 이동 지속의 핵심).
   *
   * fetch + SSE 루프가 이 액션 클로저(=store 인스턴스)에 묶이므로
   * ChatPanel 언마운트와 무관하게 끝까지 돈다. 재진입 시 컴포넌트는
   * store 의 messages/isStreaming 을 그냥 구독하면 진행 상태가 그대로
   * 보인다(웹 조사 확인: Zustand 모듈 싱글톤은 클라이언트 SPA 생애 persist).
   *
   * 관심사 분리: 첨부 추출/이미지 변환(@/lib/files 동적 import)은 호출부
   * (useChat)에 남기고, 이 액션은 **이미 준비된 입력**만 받아 fetch+SSE
   * 만 담당한다(store 의 LLM/파일 비의존 원칙 유지).
   *
   * 중복 가드: 이미 진행 중(isStreaming)이면 no-op(사용자 결정 — 진행
   * 중이면 무시). user+assistant 메시지 추가까지 이 액션 안에서 원자적
   * 으로 수행한다(추가 시점과 스트림 시작 사이 race 차단 — loadConversation
   * 원자성과 동일 정신).
   */
  startStream: (input: {
    /** 서버 전송용 쿼리(첨부 텍스트 추출분이 합쳐진 최종 형태). */
    query: string;
    /** 메시지 버블에 표시할 원본 사용자 입력(첨부 추출 전 trim 값). */
    displayContent?: string;
    images?: string[];
    /** user 메시지 버블의 첨부 칩 메타(파일명·썸네일). */
    attachments?: ChatMessage["attachments"];
  }) => Promise<void>;
  /**
   * 실제 진행 중인 SSE fetch 가 있는지(=AbortController 살아있음).
   * isStreaming 플래그와 구분되는 신뢰 신호: ChatPanel 의 stale 복구
   * effect 가 "stale true(진짜 fetch 없음)" 와 "live true(메뉴 다녀와도
   * 스트림 진행 중)" 를 구분하는 데 쓴다(무조건 false 화 → 살아있는
   * 스트림 끊김 버그 차단). state 아님 — 액션 호출로 현재값 조회.
   */
  isStreamActive: () => boolean;
  setStreaming: (isStreaming: boolean) => void;
  /**
   * 직전 SSE 이벤트 종류 기록(Slice M). useChat 이 이벤트 분기마다
   * 호출. ThinkingPanel 이 'token'(출력 중)이면 실시간 숨김.
   */
  setLastStreamEvent: (kind: StreamEventKind) => void;
  /** 런타임 선택 모델 설정(FR-16). resetChat 에도 보존됨(AD-15). */
  setModel: (model: string) => void;
  /** 인덱스 검색 도메인 설정(null=도구 없음). 호출처가 변경
   *  직후 resetChat 을 불러 세션 리프레시(서버 그래프 재빌드). */
  setIdxDomain: (domain: string | null) => void;
  /** 데이터 조회(SQL) 도메인 설정(null=도구 없음). 호출처가
   *  변경 직후 resetChat 으로 세션 리프레시. */
  setSqlDomain: (domain: string | null) => void;
  /** 온톨로지 데이터셋 설정(null=도구 없음). 호출처가 변경
   *  직후 resetChat 으로 세션 리프레시. */
  setGraphDataset: (dataset: string | null) => void;
  /** 워크스페이스 프로필 id 설정(null=기존 챗). 워크스페이스
   *  store 인스턴스가 마운트 시 1회 호출(이후 불변). */
  setProfileId: (profileId: string | null) => void;
  /** 하네스 토글 1개 설정(에이전트 패널). 호출처가 변경 직후
   *  resetChat 으로 세션 리프레시(서버 그래프 재빌드). */
  setHarnessOverride: (element: keyof HarnessOverrides, value: boolean) => void;
  /** 전체 오버라이드 교체(마운트 시 프로필 defaults 시드용). */
  setHarnessOverrides: (overrides: HarnessOverrides) => void;
  /** 시스템 인스트럭션 선택(null=default). 변경 직후 resetChat. */
  setInstructionId: (instructionId: string | null) => void;
  /** 커스텀 에이전트 id 설정(null=기존 챗). 마운트 시 1회 호출(이후 불변). */
  setCustomAgentId: (customAgentId: string | null) => void;
  /** 마크다운 렌더 토글(입력창 하단 스위치). UI 전용 — resetChat 무관. */
  setMarkdownEnabled: (enabled: boolean) => void;
  /** 세션 제목 설정(첫 질의 → nano 생성분). null=미생성("새 대화"). */
  setConversationTitle: (title: string | null) => void;
  /**
   * 첫 질의로 제목 생성을 요청한다(POST /api/chat/title → nano).
   * 메인 SSE 와 독립(fire-and-forget). 성공 시 conversationTitle 갱신,
   * 실패(키 없음·오류)는 조용히 무시("새 대화" 유지). startStream 이
   * 첫 turn 에 호출.
   */
  requestTitle: (query: string) => Promise<void>;
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
  idxDomain: null,
  sqlDomain: null,
  graphDataset: null,
  profileId: null,
  harnessOverrides: {},
  instructionId: null,
  customAgentId: null,
  markdownEnabled: true,
  conversationTitle: null,
};

/**
 * SSE raw 이벤트를 타입 가드로 좁힌다(파서는 unknown 을 yield).
 * useChat 에 있던 동일 가드를 store 로 이동(SSE 소비가 store 로 이사 —
 * 단일 소비처). 순수 함수 — LLM/파일 비의존(store 원칙 유지).
 */
function asSseEvent(raw: unknown): SseEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const ev = raw as Record<string, unknown>;
  switch (ev.type) {
    case "thread":
      return typeof ev.conversationId === "string"
        ? { type: "thread", conversationId: ev.conversationId }
        : null;
    case "token":
      return typeof ev.text === "string"
        ? { type: "token", text: ev.text }
        : null;
    case "thinking":
      return typeof ev.text === "string"
        ? { type: "thinking", text: ev.text }
        : null;
    case "tool_call":
      return typeof ev.name === "string" || typeof ev.args === "string"
        ? {
            type: "tool_call",
            id: typeof ev.id === "string" ? ev.id : "",
            name: typeof ev.name === "string" ? ev.name : "",
            args: typeof ev.args === "string" ? ev.args : "",
          }
        : null;
    case "tool_result":
      return typeof ev.result === "string"
        ? {
            type: "tool_result",
            id: typeof ev.id === "string" ? ev.id : "",
            name: typeof ev.name === "string" ? ev.name : "tool",
            result: ev.result,
          }
        : null;
    case "done":
      return { type: "done" };
    case "error":
      return {
        type: "error",
        message:
          typeof ev.message === "string" ? ev.message : "알 수 없는 오류",
      };
    default:
      return null;
  }
}

/**
 * 격리된 store 인스턴스를 생성한다(테스트·SSR 안전).
 * 싱글톤(chatStore)과 useChatStore 훅은 이 팩토리를 재사용한다.
 */
export function createChatStore(): StoreApi<ChatStore> {
  // 진행 중 스트림의 AbortController. state 가 아니라 팩토리 클로저의
  // 비-상태 변수 — set 으로 넣으면 불필요한 리렌더 유발, 그리고 인스턴스
  // 별 격리(테스트 안전). 명시 중단(stopStream)은 이번 범위 외지만
  // 핸들은 보관해 둔다(후속 슬라이스 + 재전송 시 정리).
  let activeController: AbortController | null = null;

  return createStore<ChatStore>((set, get) => ({
    ...initialState,

    // 실제 fetch 진행 신호 = AbortController 보유 여부(클로저 변수).
    // startStream 진입 시 set, finally 에서 null. ChatPanel stale
    // 복구가 이 신호로 live/stale 을 가른다.
    isStreamActive: () => activeController !== null,

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
    setIdxDomain: (idxDomain) => set({ idxDomain }),
    setSqlDomain: (sqlDomain) => set({ sqlDomain }),
    setGraphDataset: (graphDataset) => set({ graphDataset }),
    setProfileId: (profileId) => set({ profileId }),
    setHarnessOverride: (element, value) =>
      set((state) => ({
        harnessOverrides: { ...state.harnessOverrides, [element]: value },
      })),
    setHarnessOverrides: (harnessOverrides) => set({ harnessOverrides }),
    setInstructionId: (instructionId) => set({ instructionId }),
    setCustomAgentId: (customAgentId) => set({ customAgentId }),
    setMarkdownEnabled: (markdownEnabled) => set({ markdownEnabled }),
    setConversationTitle: (conversationTitle) => set({ conversationTitle }),

    // 첫 질의 제목 생성(메인 SSE 와 독립 fire-and-forget). 별도 라우트
    // /api/chat/title 가 nano 로 제목 1줄을 만들어 돌려준다. 실패·null
    // 은 조용히 무시("새 대화" 유지). 이미 제목이 생긴 뒤(재호출)엔
    // 덮어쓰지 않는다(과거 대화 복원 제목 보호).
    requestTitle: async (query) => {
      const seed = query.trim();
      if (!seed) return;
      try {
        const res = await fetch("/api/chat/title", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: seed }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: unknown };
        const title =
          typeof data.title === "string" && data.title.trim()
            ? data.title.trim()
            : null;
        // 응답 도착 사이 사용자가 새 대화로 리셋했을 수 있다 — 현재
        // 제목이 비어 있을 때만 채운다(stale 응답이 새 세션 헤더를
        // 덮어쓰지 않게).
        if (title && get().conversationTitle === null) {
          set({ conversationTitle: title });
        }
      } catch {
        // 네트워크 오류 등 — 제목 없이 진행("새 대화" 유지).
      }
    },

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
        // 새 세션 → 제목 리셋("새 대화"로). 첫 질의 시 다시 생성.
        conversationTitle: null,
        provider: state.provider,
        model: state.model,
        // idx/sql/graph 도메인 보존 — resetChat 은 세션(thread)만
        // 새로, 사용자가 고른 도메인 선택은 유지(model 과 동일 정책).
        idxDomain: state.idxDomain,
        sqlDomain: state.sqlDomain,
        graphDataset: state.graphDataset,
        // profileId·하네스 토글·인스트럭션·customAgentId 보존 — 에이전트
        // 정체성과 사용자가 고른 설정은 새 대화에도 불변(model 동일 정책).
        profileId: state.profileId,
        harnessOverrides: state.harnessOverrides,
        instructionId: state.instructionId,
        customAgentId: state.customAgentId,
      })),

    // 과거 대화 복원 (C1). resetChat 과 대칭 — 단일 set 원자 커밋으로
    // conversationId(=기존 thread_id) + messages 를 동시 교체한다. 복원
    // 직후 useChat.send 가 이 conversationId 를 읽어 body 에 실으면
    // 서버 checkpointer 가 같은 thread 히스토리를 이어받는다(맥락 연속).
    // provider/model 은 보존(FR-07 — resetChat 동일 정책).
    loadConversation: (conversationId, messages, title) =>
      set((state) => ({
        conversationId,
        messages,
        error: null,
        isStreaming: false,
        // 복원 대화의 제목(목록 title). 미전달이면 null("새 대화").
        conversationTitle: title ?? null,
        provider: state.provider,
        model: state.model,
        // 워크스페이스 정체성은 복원에도 불변(같은 워크스페이스 내 복원).
        profileId: state.profileId,
      })),

    // SSE 소비를 store 싱글톤으로(메뉴 이동 지속의 핵심). fetch+루프가
    // 이 액션 클로저(store 인스턴스)에 묶여 ChatPanel 언마운트와 무관
    // 하게 끝까지 돈다. useChat 에 있던 fetch+SSE 루프를 그대로 이사
    // (FR-09 분기 로직 무변경 — token/thinking 분리 동일).
    startStream: async ({ query, displayContent, images, attachments }) => {
      // 중복 가드(사용자 결정: 진행 중이면 무시). store 레벨로 끌어
      // 올려 어디서 호출돼도 단일 진실(이전엔 useChat 가드).
      if (get().isStreaming) return;

      // 세션 첫 질의 판별 — messages 0개면 이번이 첫 질의다(user+assistant
      // 를 아래 set 으로 추가하기 "전"에 캡처). 첫 질의면 nano 제목 생성을
      // fire-and-forget 으로 병행(메인 SSE 와 독립 — 응답을 기다리지 않음).
      // 입력은 displayContent(첨부 추출 전 사용자 원문) 우선 — 긴 합본 query
      // 대신 사용자가 실제 친 텍스트로 제목을 짓는다.
      const isFirstTurn = get().messages.length === 0;
      if (isFirstTurn) {
        const titleSeed = (displayContent ?? query).trim();
        if (titleSeed) void get().requestTitle(titleSeed);
      }

      // user + 빈 assistant 메시지를 원자 추가 + 스트리밍 시작(추가
      // 시점과 스트림 사이 race 차단 — loadConversation 원자성 정신).
      // 버블엔 displayContent(첨부 추출 전 원문)를 쓰고, 서버엔 query
      // (추출 텍스트 합본)를 보낸다(첨부 칩 + 추출본 둘 다 보존).
      const userMsg: ChatMessage = {
        role: "user",
        content: displayContent ?? query,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      };
      set((state) => ({
        error: null,
        isStreaming: true,
        messages: [
          ...state.messages,
          userMsg,
          { role: "assistant", content: "" },
        ],
      }));

      activeController = new AbortController();
      try {
        // R3 — body 엔 현재 turn 입력만. conversationId/model 동봉
        // (턴 재사용 / 런타임 모델). 검증은 서버 zod enum 이 SSOT.
        const {
          conversationId,
          model,
          idxDomain,
          sqlDomain,
          graphDataset,
          profileId,
          harnessOverrides,
          instructionId,
          customAgentId,
        } = get();
        const body: {
          query: string;
          conversationId?: string;
          model?: string;
          images?: string[];
          idxDomain?: string;
          sqlDomain?: string;
          graphDataset?: string;
          profileId?: string;
          overrides?: HarnessOverrides;
          instructionId?: string;
          customAgentId?: string;
        } = { query };
        if (conversationId) body.conversationId = conversationId;
        if (model) body.model = model;
        if (images) body.images = images;
        // 도메인 선택 시에만 동봉 — 미선택(null)이면 서버 zod
        // 가 미수신 → 도구 없는 기존 챗(회귀 0). 서버 enum SSOT.
        if (idxDomain) body.idxDomain = idxDomain;
        if (sqlDomain) body.sqlDomain = sqlDomain;
        if (graphDataset) body.graphDataset = graphDataset;
        // 에이전트 진입 시에만 동봉 — null(기존 /chat)이면 미수신
        // → 기존 챗(회귀 0). 서버 zod enum SSOT.
        if (profileId) body.profileId = profileId;
        // 토글 오버라이드 — 키가 1개라도 있을 때만 동봉(빈 객체=env
        // 디폴트=회귀 0). 인스트럭션도 선택 시에만 동봉.
        if (harnessOverrides && Object.keys(harnessOverrides).length > 0)
          body.overrides = harnessOverrides;
        if (instructionId) body.instructionId = instructionId;
        // 커스텀 에이전트 id — null(기존 챗)이면 미동봉(회귀 0).
        if (customAgentId) body.customAgentId = customAgentId;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: activeController.signal,
        });

        // 비-200(AD-4: Zod/공백 거부 → 400 JSON {error}) 처리.
        if (!res.ok) {
          let message = `요청 실패 (HTTP ${res.status})`;
          try {
            const data = (await res.json()) as { error?: unknown };
            if (typeof data.error === "string") message = data.error;
          } catch {
            /* JSON 아님 — 기본 메시지 유지 */
          }
          set({ error: message });
          return;
        }

        // 정상 흐름: SSE 파싱 → 스토어 구동(이벤트 분기 무변경 — FR-09
        // token/thinking 분리 그대로 이사. set/get 으로 직접 구동).
        for await (const raw of parseSseStream(res.body)) {
          const ev = asSseEvent(raw);
          if (!ev) continue;
          const s = get();
          if (ev.type === "thread") {
            s.setConversationId(ev.conversationId);
          } else if (ev.type === "token") {
            s.setLastStreamEvent("token");
            s.appendToLastAssistant(ev.text);
          } else if (ev.type === "thinking") {
            s.setLastStreamEvent("thinking");
            s.appendThinkingToLastAssistant(ev.text);
          } else if (ev.type === "tool_call") {
            s.setLastStreamEvent("tool");
            s.appendToolCallToLastAssistant({
              id: ev.id,
              name: ev.name,
              args: ev.args,
            });
          } else if (ev.type === "tool_result") {
            s.setLastStreamEvent("tool");
            s.setToolResultOnLastAssistant(ev.name, ev.result, ev.id);
            if (ev.name === "web_search") {
              const sources = parseCitationText(ev.result);
              if (sources) s.setSourcesOnLastAssistant(sources);
            }
          } else if (ev.type === "error") {
            s.setError(ev.message);
            break;
          } else if (ev.type === "done") {
            break;
          }
        }
      } catch (err) {
        // fetch/스트림 throw(네트워크 단절 등) → 에러 표면화(터미널 아님).
        const message = err instanceof Error ? err.message : String(err);
        set({ error: message });
      } finally {
        // 어떤 경로든 입력 잠금 해제 + finalize(누락 시 입력 고착).
        activeController = null;
        const s = get();
        s.setStreaming(false);
        s.setLastStreamEvent(null);
        s.finalizeLastAssistant();
      }
    },
  }));
}

/** 앱 전역 싱글톤 인스턴스(클라이언트 단일 대화 상태). */
export const chatStore: StoreApi<ChatStore> = createChatStore();

/**
 * 워크스페이스 격리용 store Context.
 *
 * 기본값은 전역 싱글톤(chatStore). Provider 가 없으면(=기존 /chat) 모든
 * 컴포넌트가 전역 싱글톤을 그대로 쓴다(회귀 0). 워크스페이스 페이지는
 * ChatStoreProvider 로 자신만의 store 인스턴스를 주입해 messages/
 * conversationId/profileId 를 다른 워크스페이스·/chat 과 완전히 격리한다.
 *
 * useChatStore/useChatStoreApi 가 이 Context 를 읽으므로, 같은 컴포넌트
 * (ChatPanel/HeaderControls/MessageList/ConversationHistory)가 Provider
 * 유무에 따라 전역 또는 워크스페이스 store 를 자동 선택한다.
 */
const ChatStoreContext = createContext<StoreApi<ChatStore>>(chatStore);

/**
 * 워크스페이스별 store 인스턴스를 주입하는 Provider.
 * store 는 호출부(워크스페이스 페이지)가 useState 등으로 1회 생성해
 * 마운트 동안 안정적으로 유지해야 한다(매 렌더 재생성 금지 — 상태 소실).
 */
export function ChatStoreProvider({
  store,
  children,
}: {
  store: StoreApi<ChatStore>;
  children: ReactNode;
}): ReactNode {
  return createElement(ChatStoreContext.Provider, { value: store }, children);
}

/**
 * 현재 컨텍스트의 store 인스턴스(StoreApi)를 반환한다. 명령형 접근
 * (.getState()/.setState())용. Provider 없으면 전역 싱글톤.
 */
export function useChatStoreApi(): StoreApi<ChatStore> {
  return useContext(ChatStoreContext);
}

/**
 * React 컴포넌트용 selector 훅. 인자 없으면 전체 상태 반환.
 *
 * 현재 컨텍스트의 store(Provider 있으면 워크스페이스, 없으면 전역
 * 싱글톤)를 구독한다. 기존 /chat 은 Provider 가 없어 전역 싱글톤을
 * 구독하던 종전과 100% 동일(회귀 0).
 */
export function useChatStore<T>(selector: (state: ChatStore) => T): T;
export function useChatStore(): ChatStore;
export function useChatStore<T>(
  selector?: (state: ChatStore) => T,
): T | ChatStore {
  const store = useContext(ChatStoreContext);
  return useStore(
    store,
    selector ?? ((state) => state as unknown as T),
  );
}

"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Brain, ChevronDown, SquarePen, Check } from "lucide-react";
import { useChatStore, chatStore } from "@/store";
import { ConversationHistory } from "@/components/chat/ConversationHistory";
import {
  ALLOWED_MODELS,
  resolveInitialModel,
} from "@/lib/agent/harness/models";

/**
 * HeaderControls — 디자인 탑바 우측 액션 클러스터 (chat.jsx:183-225).
 *
 * 기능(실 백엔드 연결):
 *  - FR-07: active provider/model 표시. 값은 서버 환경변수에서 유래(props
 *    로 주입 — API 키 절대 미노출). store.provider/model 에 1회 하이드레이트.
 *  - FR-06: "새 대화" 버튼 → resetChat()(새 conversationId + messages 0) +
 *    입력창 포커스(onNewChat 콜백).
 *
 *  - 대화 기록(history): 실 동작(Slice 4). ConversationHistory Popover —
 *    checkpointer SQLite 재활용 목록/복원 + store.loadConversation(C1).
 *
 * 시각 전용 mock(미구현=mock): ModelPicker 드롭다운(표시만, 클릭 비활성).
 * (북마크 버튼은 실 기능 부재로 제거됨 — 디자인 chat.jsx:191 polyfill 폐기.)
 *
 * 픽셀값 인용(chat.jsx):
 *  - ModelPicker 버튼: padding 5px 10px, radius 8, border t-neutral-8 (:360)
 *  - 구분선: width 1, height 18, var(--t-neutral-12) (:186)
 *  - headerIconBtn: 32x32 radius 8 (:817)
 */

const headerIconBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background .12s",
};

export interface HeaderControlsProps {
  /** 서버 환경변수 유래(키 제외) — FR-07. */
  provider: string;
  model: string;
  /** "새 대화" 후 입력창 포커스 콜백(ChatPanel 연결) — FR-06. */
  onNewChat: () => void;
}

export function HeaderControls({
  provider,
  model,
  onNewChat,
}: HeaderControlsProps): ReactNode {
  // 서버 유래 값을 store 에 1회 하이드레이트(FR-07 — 키 미포함 식별자만).
  useEffect(() => {
    chatStore.setState({ provider, model });
  }, [provider, model]);

  const storeProvider = useChatStore((s) => s.provider);
  const storeModel = useChatStore((s) => s.model);
  const isStreaming = useChatStore((s) => s.isStreaming);

  // 표시는 props(서버 환경변수 유래 — 진실의 원천)를 1순위로 한다. store 는
  // useEffect 하이드레이션 이후에야 채워져 첫 렌더(SSR)에서 "모델 미설정"
  // 으로 굳는 버그가 있으므로 props 우선, store 2순위 폴백.
  const effProvider = provider || storeProvider;

  // FR-16/AD-15 — 선택 가능 모델은 화이트리스트로 한정. 서버 env model 이
  // 화이트리스트 밖(claude-* 등)이어도 드롭다운 현재 선택이 항상 화이트리스트
  // 멤버가 되도록 resolveInitialModel 로 정규화(Plan Critic C11 해소).
  const selectedModel = resolveInitialModel(storeModel || model);

  // store.model 이 비어 있으면(초기) 정규화된 선택 모델로 시드 — 드롭다운
  // 현재 표시와 useChat 이 보낼 model 을 일치시킨다.
  useEffect(() => {
    if (!chatStore.getState().model) {
      chatStore.getState().setModel(selectedModel);
    }
  }, [selectedModel]);

  const modelLabel = effProvider
    ? `${effProvider} · ${selectedModel}`
    : selectedModel;

  // C7/FR-17 — 스트리밍 중에는 모델 변경 잠금(진행 응답과 표시 모델 불일치
  // 방지). 드롭다운은 컴포넌트 로컬 상태.
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePickerToggle = (): void => {
    if (isStreaming) return; // 잠금 — 열지 않음
    setPickerOpen((v) => !v);
  };

  const handleSelectModel = (m: string): void => {
    chatStore.getState().setModel(m); // 같은 모델 재선택도 안전(no-op)
    setPickerOpen(false);
  };

  const handleNewChat = (): void => {
    chatStore.getState().resetChat(); // FR-06: 새 thread_id + 상태 초기화
    onNewChat();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {/* ModelPicker — 실 드롭다운(FR-16). 스트리밍 중 disabled(C7). */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={handlePickerToggle}
          disabled={isStreaming}
          title={isStreaming ? "응답 생성 중에는 변경할 수 없습니다" : "모델 선택"}
          aria-label={`모델: ${modelLabel}`}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--t-neutral-8)",
            background: "var(--surface-default)",
            fontSize: 12,
            color: "var(--text-default)",
            cursor: isStreaming ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: isStreaming ? 0.6 : 1,
          }}
        >
          <Brain size={12} style={{ color: "var(--agent-500)" }} aria-hidden />
          <span data-testid="model-label">{modelLabel}</span>
          <ChevronDown
            size={11}
            style={{ color: "var(--text-subtle)" }}
            aria-hidden
          />
        </button>

        {pickerOpen && !isStreaming && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 168,
              background: "var(--surface-default)",
              border: "1px solid var(--t-neutral-8)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              padding: 4,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {ALLOWED_MODELS.map((m) => {
              const active = m === selectedModel;
              return (
                <button
                  key={m}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectModel(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: active ? "var(--t-neutral-4)" : "transparent",
                    color: "var(--text-default)",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span>{m}</span>
                  {active && (
                    <Check
                      size={13}
                      style={{ color: "var(--agent-500)" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span
        style={{
          width: 1,
          height: 18,
          background: "var(--t-neutral-12)",
          margin: "0 6px",
        }}
      />

      {/* 대화 기록 — 실 동작(Slice 4). checkpointer SQLite 재활용:
          목록/복원 API + store.loadConversation 원자 커밋(C1).
          (북마크 버튼은 실 기능 부재로 제거 — placeholder UI 폐기.) */}
      <ConversationHistory iconBtnStyle={headerIconBtn} />

      {/* 새 대화 — 실 동작(FR-06). */}
      <button
        type="button"
        onClick={handleNewChat}
        title="새 대화"
        aria-label="새 대화"
        style={{ ...headerIconBtn, color: "var(--text-default)", cursor: "pointer" }}
      >
        <SquarePen size={15} aria-hidden />
      </button>
    </div>
  );
}

export default HeaderControls;

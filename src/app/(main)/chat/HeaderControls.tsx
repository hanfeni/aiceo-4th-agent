"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Brain, ChevronDown, Bookmark, History, SquarePen } from "lucide-react";
import { useChatStore, chatStore } from "@/store";

/**
 * HeaderControls — 디자인 탑바 우측 액션 클러스터 (chat.jsx:183-225).
 *
 * 기능(실 백엔드 연결):
 *  - FR-07: active provider/model 표시. 값은 서버 환경변수에서 유래(props
 *    로 주입 — API 키 절대 미노출). store.provider/model 에 1회 하이드레이트.
 *  - FR-06: "새 대화" 버튼 → resetChat()(새 conversationId + messages 0) +
 *    입력창 포커스(onNewChat 콜백).
 *
 * 시각 전용 mock(미구현=mock): ModelPicker 드롭다운(표시만, 클릭 비활성),
 * 북마크, 대화 기록(history) 토글 — disabled + title="준비 중".
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

  const modelLabel =
    storeModel && storeProvider
      ? `${storeProvider} · ${storeModel}`
      : storeModel || storeProvider || "모델 미설정";

  const handleNewChat = (): void => {
    chatStore.getState().resetChat(); // FR-06: 새 thread_id + 상태 초기화
    onNewChat();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {/* ModelPicker — 시각 전용 mock(표시만). 실 provider/model 노출. */}
      <button
        type="button"
        disabled
        title="준비 중"
        aria-label={`모델: ${modelLabel}`}
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
          cursor: "not-allowed",
          fontWeight: 500,
        }}
      >
        <Brain
          size={12}
          style={{ color: "var(--agent-500)" }}
          aria-hidden
        />
        <span data-testid="model-label">{modelLabel}</span>
        <ChevronDown
          size={11}
          style={{ color: "var(--text-subtle)" }}
          aria-hidden
        />
      </button>

      <span
        style={{
          width: 1,
          height: 18,
          background: "var(--t-neutral-12)",
          margin: "0 6px",
        }}
      />

      <button type="button" disabled title="준비 중" aria-label="북마크" style={headerIconBtn}>
        <Bookmark size={15} aria-hidden />
      </button>

      <button
        type="button"
        disabled
        title="준비 중"
        aria-label="대화 기록"
        style={headerIconBtn}
      >
        <History size={15} aria-hidden />
      </button>

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

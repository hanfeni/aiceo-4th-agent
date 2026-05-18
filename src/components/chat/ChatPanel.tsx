"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useChatStore } from "@/store";
import { useChat } from "@/components/chat/useChat";
import { MessageList } from "@/components/common/BaseChat/MessageList";
import { ChatInput } from "@/components/common/BaseChat/ChatInput";
import { HeaderControls } from "@/app/(main)/chat/HeaderControls";

/**
 * ChatPanel — 디자인 메인 채팅 (chat.jsx:169-266 `<main>`).
 *
 * MessageList + ChatInput 을 직접 조합한다(BaseChat 래퍼 금지 — PRD §1.8).
 * 탑바(chat.jsx:170-226): 활성 타이틀 + "N개 메시지" + HeaderControls
 * (ModelPicker 시각 mock + 북마크/기록 mock + 새 대화 실동작).
 *
 * 실 백엔드 연결: useChat().send 로 SSE 스트리밍 전송. EmptyState 추천칩
 * 클릭 시 ChatInput 에 초기값 주입(initialValue 키 리마운트).
 *
 * 픽셀값 인용(chat.jsx):
 *  - 탑바: padding 10px 20px, borderBottom t-neutral-8, height 56 (:171-176)
 *  - 타이틀: fontSize 14.5 weight 600 (:179), 카운트 11.5 subtle (:180)
 */

export interface ChatPanelProps {
  /** 서버 환경변수 유래(키 제외) — FR-07. page.tsx(Server)에서 주입. */
  provider: string;
  model: string;
}

export function ChatPanel({ provider, model }: ChatPanelProps): ReactNode {
  const { send } = useChat();
  const messageCount = useChatStore((s) => s.messages.length);
  // EmptyState 추천칩 → ChatInput 초기값 주입. key 변경으로 리마운트.
  const [seed, setSeed] = useState<{ value: string; key: number }>({
    value: "",
    key: 0,
  });
  const isStreaming = useChatStore((s) => s.isStreaming);

  const onPickPrompt = useCallback((text: string) => {
    setSeed((s) => ({ value: text, key: s.key + 1 }));
  }, []);

  const onNewChat = useCallback(() => {
    // resetChat 은 HeaderControls 에서 호출됨 — 여기선 입력 시드만 비운다.
    setSeed((s) => ({ value: "", key: s.key + 1 }));
  }, []);

  const onSend = useCallback(
    (value: string) => {
      void send(value);
    },
    [send],
  );

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        background: "var(--surface-default)",
        height: "100%",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          borderBottom: "1px solid var(--t-neutral-8)",
          background: "var(--surface-default)",
          height: 56,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            className="truncate"
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: "var(--text-default)",
              letterSpacing: "-0.005em",
              lineHeight: 1,
            }}
          >
            새 대화
          </span>
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-subtle)",
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
          >
            · {messageCount}개 메시지
          </span>
        </div>

        <HeaderControls
          provider={provider}
          model={model}
          onNewChat={onNewChat}
        />
      </div>

      {/* Messages area */}
      <MessageList onPickPrompt={onPickPrompt} />

      {/* Input bar — key 로 추천칩 주입 시 리마운트(초기값 반영) */}
      <ChatInput
        key={seed.key}
        onSend={onSend}
        streaming={isStreaming}
        initialValue={seed.value}
      />
    </main>
  );
}

export default ChatPanel;

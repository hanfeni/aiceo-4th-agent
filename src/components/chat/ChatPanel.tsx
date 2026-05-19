"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useChatStore, chatStore } from "@/store";
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

  // stale isStreaming 복구 (SSE 가 store 싱글톤으로 이사된 뒤 핵심 분기).
  //
  // 이전엔 마운트 시 isStreaming=true 면 무조건 false 화했다. 그러나
  // 이제 SSE 루프가 store.startStream 에서 돌므로, 메뉴 다녀와
  // ChatPanel 이 재마운트될 때 **실제 진행 중인 스트림**이 있을 수 있다.
  // 무조건 false 화하면 살아있는 스트림 UI 가 끊긴다(원래 버그의 변형).
  //
  // 구분: isStreaming=true 이면서
  //  - isStreamActive()=true  → live(메뉴 다녀와도 진행 중) → 건드리지 X
  //  - isStreamActive()=false → stale(dev HMR/비정상 종료 잔여) → false 화
  //
  // TODO(learning): 아래 shouldRecover() 의 stale 판정을 확정하라.
  // 핵심 트레이드오프 — dev HMR 로 store 모듈이 재평가되면 클로저
  // 변수 activeController 가 새로 만들어져 isStreamActive()=false 가
  // 될 수 있다(live 인데 stale 로 오판 → 진행 스트림 끊김). 반대로
  // 너무 보수적이면(항상 live 로 간주) 진짜 stale 잠금이 안 풀린다.
  // 고려: ① isStreamActive() 만으로 충분한가 ② messages 마지막이
  // 빈 assistant + isStreaming 인 조합을 보조 신호로 쓸까 ③ dev
  // (process.env.NODE_ENV)에서만 공격적 복구할까. 5~10줄로 확정.
  const shouldRecover = (): boolean => {
    const s = chatStore.getState();
    // PLACEHOLDER — 사용자가 stale 판정 정책을 확정할 지점.
    // 기본 골격: live 신호 없을 때만 복구(가장 단순·안전한 출발점).
    return s.isStreaming && !s.isStreamActive();
  };

  useEffect(() => {
    if (shouldRecover()) {
      chatStore.getState().setStreaming(false);
    }
  }, []);

  const onPickPrompt = useCallback((text: string) => {
    setSeed((s) => ({ value: text, key: s.key + 1 }));
  }, []);

  const onNewChat = useCallback(() => {
    // resetChat 은 HeaderControls 에서 호출됨 — 여기선 입력 시드만 비운다.
    setSeed((s) => ({ value: "", key: s.key + 1 }));
  }, []);

  const onSend = useCallback(
    (value: string, files?: File[]) => {
      void send(value, files);
    },
    [send],
  );

  // 추천 질문 칩 클릭 → 그 질문을 즉시 전송(사용자 결정 — 입력창
  // 주입 onPickPrompt 와 구분). startStream 의 중복 가드가 진행 중
  // 연타를 흡수하므로 별도 잠금 불필요.
  const onRecQuery = useCallback(
    (text: string) => {
      void send(text);
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
      <MessageList onPickPrompt={onPickPrompt} onRecQuery={onRecQuery} />

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

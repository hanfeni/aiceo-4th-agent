"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Copy,
  RefreshCw,
} from "lucide-react";
import { useChatStore } from "@/store";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";
import type { ChatMessage } from "@/types";

/**
 * MessageList — 디자인 메시지 영역 (chat.jsx:229-252 + MessageBubble:442).
 *
 * 기능(실 백엔드 연결): store 의 messages/isStreaming 구독. 토큰 도착·
 * 스트리밍 변화 시 하단 자동 스크롤(chat.jsx:35-39). assistant 콘텐츠는
 * <ChatMarkdown> 으로 렌더, 스트리밍 중 깜빡임 커서(chat.jsx:499).
 * messages 0 개면 EmptyState(chat.jsx:391).
 *
 * 시각 전용 mock(미구현=mock): 메시지 액션 행(thumbs/copy/regenerate).
 * 복사(copy)는 trivial+useful 이라 실제 클립보드 복사 허용, like/regenerate
 * 는 disabled + title="준비 중". SourcesPanel 은 실 데이터 없음 → 미렌더.
 *
 * 픽셀값 인용(chat.jsx):
 *  - 컨테이너: maxWidth 760, padding 0 28px, gap 24 (:233)
 *  - user 버블: var(--medi-gray-100), padding 10px 14px, radius 14 (:448)
 *  - assistant avatar: 28x28 radius 9 violet gradient (:484)
 *  - 커서: 6x14 var(--agent-500), animation blink 1s (:499)
 */

const SUGGESTED_PROMPTS: { icon: ReactNode; text: string }[] = [
  {
    icon: <Sparkles size={12} strokeWidth={2.1} aria-hidden />,
    text: "LangGraph와 일반 LLM 호출의 차이를 쉽게 설명해줘",
  },
  {
    icon: <Sparkles size={12} strokeWidth={2.1} aria-hidden />,
    text: "아래 글을 3문장으로 요약해줘 (글은 이어서 붙여넣을게)",
  },
  {
    icon: <Sparkles size={12} strokeWidth={2.1} aria-hidden />,
    text: "주간 회고를 작성하려는데 어떤 항목을 넣으면 좋을까?",
  },
  {
    icon: <Sparkles size={12} strokeWidth={2.1} aria-hidden />,
    text: "재귀 함수를 단계별로 디버깅하는 방법을 알려줘",
  },
];

const msgAction: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function EmptyState({
  onPick,
}: {
  onPick: (text: string) => void;
}): ReactNode {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "20px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        minHeight: "100%",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 20,
          background: "linear-gradient(135deg, var(--agent-400), var(--agent-600))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          boxShadow: "0 10px 30px -10px var(--agent-400)",
        }}
      >
        <Sparkles size={28} strokeWidth={2} aria-hidden />
      </div>
      <div style={{ textAlign: "center", maxWidth: 460 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-default)",
            letterSpacing: "-0.01em",
          }}
        >
          무엇을 도와드릴까요?
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: "var(--text-subtle)",
            marginTop: 6,
            lineHeight: 1.6,
          }}
        >
          궁금한 것을 자연어로 자유롭게 질문하세요.
          <br />
          추천 질문을 선택하거나 직접 입력하실 수 있습니다.
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          width: "100%",
          maxWidth: 600,
        }}
      >
        {SUGGESTED_PROMPTS.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(p.text)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid var(--t-neutral-8)",
              background: "var(--surface-default)",
              fontSize: 12.5,
              color: "var(--text-default)",
              cursor: "pointer",
              textAlign: "left",
              lineHeight: 1.45,
              transition: "all .15s",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                flexShrink: 0,
                background: "var(--agent-100)",
                color: "var(--agent-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {p.icon}
            </span>
            <span style={{ flex: 1 }}>{p.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ content }: { content: string }): ReactNode {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          maxWidth: "78%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <div
          style={{
            background: "var(--medi-gray-100)",
            padding: "10px 14px",
            borderRadius: 14,
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--text-default)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}): ReactNode {
  const onCopy = (): void => {
    // 복사는 trivial+useful — 실제 클립보드 복사 허용(스코프 예외 명시).
    void navigator.clipboard?.writeText(content);
  };
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          flexShrink: 0,
          background: "linear-gradient(135deg, var(--agent-400), var(--agent-600))",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <Sparkles size={14} strokeWidth={2.1} aria-hidden />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-default)",
            }}
          >
            에이전트
          </span>
        </div>
        <div style={{ minHeight: 22 }}>
          <ChatMarkdown content={content} />
          {streaming && (
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 6,
                height: 14,
                background: "var(--agent-500)",
                marginLeft: 2,
                verticalAlign: "-2px",
                animation: "blink 1s steps(2) infinite",
              }}
            />
          )}
        </div>

        {/* 메시지 액션 행 — 시각 전용 mock(미구현). copy 만 실제 동작. */}
        {!streaming && content.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              marginTop: 10,
              color: "var(--text-subtle)",
            }}
          >
            <button
              type="button"
              disabled
              title="준비 중"
              aria-label="좋아요"
              style={msgAction}
            >
              <ThumbsUp size={13} aria-hidden />
            </button>
            <button
              type="button"
              disabled
              title="준비 중"
              aria-label="별로예요"
              style={msgAction}
            >
              <ThumbsDown size={13} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onCopy}
              title="복사"
              aria-label="복사"
              style={{ ...msgAction, cursor: "pointer" }}
            >
              <Copy size={13} aria-hidden />
            </button>
            <button
              type="button"
              disabled
              title="준비 중"
              aria-label="재생성"
              style={msgAction}
            >
              <RefreshCw size={13} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export interface MessageListProps {
  /** EmptyState 추천칩 클릭 시 입력창에 텍스트 주입(ChatPanel 연결). */
  onPickPrompt: (text: string) => void;
}

export function MessageList({ onPickPrompt }: MessageListProps): ReactNode {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 스트리밍 append 시 마지막 메시지 길이 변화로도 스크롤 트리거.
  const messageCount = messages.length;
  const lastLen = lastContentLength(messages);

  // 토큰 도착·스트리밍 변화 시 하단 자동 스크롤(chat.jsx:35-39).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, lastLen, isStreaming]);

  return (
    <div
      ref={scrollRef}
      className="thin-scroll"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 0",
        background: "var(--surface-default)",
      }}
    >
      {messages.length === 0 ? (
        <EmptyState onPick={onPickPrompt} />
      ) : (
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "0 28px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={i} content={m.content} />
            ) : (
              <AssistantBubble
                key={i}
                content={m.content}
                streaming={isStreaming && i === messages.length - 1}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** 마지막 메시지 내용 길이(스트리밍 append 시 스크롤 트리거용). */
function lastContentLength(messages: ChatMessage[]): number {
  const last = messages[messages.length - 1];
  return last ? last.content.length : 0;
}

export default MessageList;

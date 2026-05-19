"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Copy,
  RefreshCw,
  Paperclip,
} from "lucide-react";
import { useChatStore } from "@/store";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";
import { ThinkingPanel } from "@/components/common/BaseChat/ThinkingPanel";
import { SourcesPanel } from "@/components/common/BaseChat/SourcesPanel";
import type { ChatMessage } from "@/types";

/**
 * MessageList — 디자인 메시지 영역 (chat.jsx:229-252 + MessageBubble:442).
 *
 * 기능(실 백엔드 연결): store 의 messages/isStreaming 구독. 토큰 도착·
 * 스트리밍 변화 시 하단 자동 스크롤(chat.jsx:35-39). assistant 콘텐츠는
 * <ChatMarkdown> 으로 렌더(스트리밍 중 깜빡임 커서는 제거 — 사용자
 * 요청). messages 0 개면 EmptyState(chat.jsx:391).
 *
 * 시각 전용 mock(미구현=mock): 메시지 액션 행(thumbs/copy/regenerate).
 * 복사(copy)는 trivial+useful 이라 실제 클립보드 복사 허용, like/regenerate
 * 는 disabled + title="준비 중". SourcesPanel 은 실 데이터 없음 → 미렌더.
 *
 * 픽셀값 인용(chat.jsx):
 *  - 컨테이너: maxWidth 760, padding 0 28px, gap 24 (:233)
 *  - user 버블: var(--medi-gray-100), padding 10px 14px, radius 14 (:448)
 *  - assistant avatar: 28x28 radius 9 violet gradient (:484)
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

function UserBubble({
  content,
  attachments,
}: {
  content: string;
  attachments?: ChatMessage["attachments"];
}): ReactNode {
  const hasAttachments = !!attachments && attachments.length > 0;
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
        {/* 첨부 흔적(I1) — 이미지는 썸네일, 텍스트/PDF/DOCX 는 파일명 칩.
            content 만으론 무엇을 보냈는지 안 보이므로 버블 위에 노출. */}
        {hasAttachments && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              justifyContent: "flex-end",
            }}
          >
            {attachments!.map((a, i) =>
              a.kind === "image" && a.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${a.name}-${i}`}
                  src={a.dataUrl}
                  alt={a.name}
                  title={a.name}
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid var(--t-neutral-8)",
                  }}
                />
              ) : (
                <span
                  key={`${a.name}-${i}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 9px",
                    borderRadius: 8,
                    border: "1px solid var(--t-neutral-8)",
                    background: "var(--t-neutral-4)",
                    fontSize: 11.5,
                    color: "var(--text-default)",
                    maxWidth: 200,
                  }}
                >
                  <Paperclip
                    size={11}
                    style={{ color: "var(--text-subtle)", flexShrink: 0 }}
                    aria-hidden
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.name}
                  </span>
                </span>
              ),
            )}
          </div>
        )}
        {content.length > 0 && (
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
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  thinkingSteps,
  sources,
  streaming,
  outputting = false,
}: {
  content: string;
  thinkingSteps?: ChatMessage["thinkingSteps"];
  sources?: ChatMessage["sources"];
  streaming: boolean;
  /** Slice M — 답변 본문 출력 중(직전 SSE=token). ThinkingPanel 게이트. */
  outputting?: boolean;
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
        {/* 에이전트 라벨 제거 → 사고 패널. 단일 thinkingSteps[](교차
            보존). medigate StreamingView/HistoryView 패턴. 데이터 없고
            비스트리밍이면 패널 자체 미표시. */}
        {/* Slice M — 출력 중(streaming && outputting)엔 사고 패널
            컨테이너 자체를 안 그린다(여백까지 제거 — '노출 안 함'
            요구). 출력 멈추면 다시 표시(동적). */}
        {((thinkingSteps?.length ?? 0) > 0 || streaming) &&
          !(streaming && outputting) && (
            <div style={{ marginBottom: 6 }}>
              <ThinkingPanel
                steps={thinkingSteps ?? []}
                streaming={streaming}
                outputting={outputting}
              />
            </div>
          )}
        <div style={{ minHeight: 22 }}>
          <ChatMarkdown content={content} />
        </div>

        {/* 참고 출처(References) — web_search citation. 스트리밍 종료
            후 + 출처 있을 때만(디자인 chat.jsx:502 게이트). */}
        {!streaming && (sources?.length ?? 0) > 0 && (
          <SourcesPanel sources={sources ?? []} />
        )}

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
  // Slice M — 직전 SSE 이벤트가 token 이면 답변 본문 출력 중 →
  // 마지막(스트리밍) 메시지 사고 패널 숨김(동적). thinking/tool
  // 로 바뀌면 재표시. 과거 메시지엔 영향 없음(마지막만 적용).
  const lastStreamEvent = useChatStore((s) => s.lastStreamEvent);
  const outputting = lastStreamEvent === "token";
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
              <UserBubble
                key={i}
                content={m.content}
                attachments={m.attachments}
              />
            ) : (
              <AssistantBubble
                key={i}
                content={m.content}
                thinkingSteps={m.thinkingSteps}
                sources={m.sources}
                streaming={isStreaming && i === messages.length - 1}
                outputting={
                  outputting && i === messages.length - 1
                }
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

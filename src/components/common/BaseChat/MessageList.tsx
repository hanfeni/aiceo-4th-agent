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
import { splitRecQueries } from "@/lib/agent/utils/recQueries";
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
  onRecQuery,
}: {
  content: string;
  thinkingSteps?: ChatMessage["thinkingSteps"];
  sources?: ChatMessage["sources"];
  streaming: boolean;
  /** Slice M — 답변 본문 출력 중(직전 SSE=token). ThinkingPanel 게이트. */
  outputting?: boolean;
  /** 추천 질문 칩 클릭 → 즉시 전송. */
  onRecQuery: (text: string) => void;
}): ReactNode {
  // 누적 content 에서 [REC_QUERY] 마커 분리(렌더 시점 — store 무변경).
  // 스트리밍 중에도 splitRecQueries 가 여는 태그/부분 prefix 부터
  // 본문에서 즉시 절단해 사용자에게 마커가 노출되지 않는다(누출 0).
  // 닫는 태그가 와야 recQueries 가 채워진다 → 칩은 답변 완료 후 등장.
  const { body, recQueries } = splitRecQueries(content);
  // 입력창 하단 스위치 — false 면 마크다운 해석 없이 원문 텍스트 그대로 렌더.
  const markdownEnabled = useChatStore((s) => s.markdownEnabled);
  const onCopy = (): void => {
    // 복사는 trivial+useful — 실제 클립보드 복사 허용(스코프 예외 명시).
    // 마커 제외 본문만 복사(사용자가 보는 것과 일치).
    void navigator.clipboard?.writeText(body);
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
        {/* 사고 패널 — 출력 중에도 컨테이너를 제거하지 않는다(사용자
            보고: 출력 단계에 패널이 사라졌다 생겼다 반복 → 답변
            텍스트 레이아웃 시프트). 이전 '!(streaming && outputting)'
            게이트(컨테이너 통째 제거) 폐기. 출력 중 접힘 고정·토글
            비활성은 ThinkingPanel 내부가 outputting prop 으로 처리
            (return null 아님 — 헤더 자리 유지로 시프트 0). */}
        {((thinkingSteps?.length ?? 0) > 0 || streaming) && (
          <div style={{ marginBottom: 6 }}>
            <ThinkingPanel
              steps={thinkingSteps ?? []}
              streaming={streaming}
              outputting={outputting}
            />
          </div>
        )}
        <div style={{ minHeight: 22 }}>
          {markdownEnabled ? (
            <ChatMarkdown content={body} />
          ) : (
            // 스위치 OFF — 마크다운 기호 비해석, 원문 그대로(줄바꿈·공백 보존).
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "inherit",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text-default)",
              }}
            >
              {body}
            </pre>
          )}
        </div>

        {/* 참고 출처(References) — web_search citation. 스트리밍 종료
            후 + 출처 있을 때만(디자인 chat.jsx:502 게이트). */}
        {!streaming && (sources?.length ?? 0) > 0 && (
          <SourcesPanel sources={sources ?? []} />
        )}

        {/* 추천 질문 — LLM [REC_QUERY] 유래. 스트리밍 종료 후 +
            recQueries 있을 때만(닫는 태그 도착해야 채워짐 → 답변
            완료 후 등장). 디자인: 답변 본문과 명확히 구분(사용자
            요청) — 큰 상단 여백(28) + 상단 구분선 + "관련 질문"
            라벨 + agent 틴트 칩. medigate AgentSuggestedMenu 의
            pill·클릭형 본질 + 우리 디자인 토큰(보라 아이덴티티).
            클릭 = 즉시 전송(systemPrompt 인스트럭션과 일관). */}
        {!streaming && recQueries.length > 0 && (
          <div
            style={{
              marginTop: 28,
              paddingTop: 18,
              borderTop: "1px solid var(--t-neutral-12)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-subtle)",
                marginBottom: 10,
                letterSpacing: "0.01em",
              }}
            >
              관련 질문
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {recQueries.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onRecQuery(q)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    maxWidth: "100%",
                    padding: "8px 15px",
                    borderRadius: 9999,
                    // 그레이 계열 + 아웃라인 제거(사용자 요청). 테두리
                    // 없이도 칩이 면으로 보이게 배경을 한 단계 진한
                    // t-neutral-8 솔리드로(surface-subtle 은 흰 본문과
                    // 거의 안 구분 — 직전 실수 방지). 구분선·라벨·여백
                    // 유지로 답변과의 구분은 그대로.
                    border: "none",
                    background: "var(--t-neutral-8)",
                    color: "var(--text-default)",
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--t-neutral-12)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--t-neutral-8)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 메시지 액션 행 — 시각 전용 mock(미구현). copy 만 실제 동작. */}
        {!streaming && body.length > 0 && (
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
  /**
   * 답변 하단 추천 질문 칩 클릭 → 그 질문을 즉시 전송(사용자 결정).
   * EmptyState 의 onPickPrompt(입력창 주입)와 달리 바로 send 한다
   * (systemPrompt "클릭해 바로 보낼 수 있는 질문" 인스트럭션과 일관).
   */
  onRecQuery: (text: string) => void;
}

export function MessageList({
  onPickPrompt,
  onRecQuery,
}: MessageListProps): ReactNode {
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
                onRecQuery={onRecQuery}
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

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";

/**
 * ThinkingPanel — 디자인 "A · 인라인 미니멀 (본문 흐름 유지)"
 * (docs/design-ref/thinking-panel-variations.jsx ThinkingPanel_A:101-136).
 *
 * 본문 흐름을 끊지 않는 인라인 토글. 기본 접힘(defaultOpen=false).
 * 토글: "답변 과정 보기 / 답변 과정" + 스트리밍 시 dot pulse + chevron.
 * 펼치면 --t-neutral-4 배경 박스에 사고 텍스트를 italic 인용으로 렌더
 * (디자인 StepInline 의 reasoning 블록 스타일 :152-158).
 *
 * 데이터: 우리 thinking 채널은 단일 누적 문자열(FR-09 분리 수집 —
 * chunkFilter.extractThinking). 디자인의 step 배열 대신 단일 reasoning
 * 인용으로 매핑. medigate-manager/new 의 thinkingSteps[] 분리 패턴과
 * 동일한 "본문 누출 0, 사고는 별도 채널" 사상.
 *
 * 픽셀값 인용(thinking-panel-variations.jsx):
 *  - 토글 버튼: fontSize 12.5, color var(--text-subtle), gap 5 (:108-111)
 *  - 박스: marginTop 8, padding 14px 16px, border t-neutral-8,
 *    background t-neutral-4, radius 10 (:119-124)
 *  - reasoning 인용: padding 10px 12px, radius 6, italic, line 1.7,
 *    background rgba(156,163,175,0.10), color neutral-700 (:153-157)
 */

import type { ToolStep } from "@/types";

/**
 * 사고 텍스트 전처리 — medigate-new ThinkingMarkdown(:30-34) 모방.
 * reasoning summary 는 단일 개행으로 문단을 나누는 경우가 많아 마크다운
 * 에선 한 줄로 붙어버린다. 단일 개행을 hard break(`  \n`)로, ~~ 취소선
 * 노이즈 제거. **bold** 등 표준 마크다운은 ChatMarkdown(rehype-sanitize
 * — XSS 방어 FR-09 보안 유지)이 처리한다.
 */
function preprocessThinking(text: string): string {
  return text
    .replace(/~~/g, "")
    .replace(/(?<!\n)\n(?!\n)/g, "  \n");
}

export interface ThinkingPanelProps {
  /** 누적된 사고 텍스트. 비어있으면(+toolSteps 도 없으면) 패널 미표시. */
  thinking: string;
  /** 도구 호출 IN/OUT step (디자인 IOMini). */
  toolSteps?: ToolStep[];
  /** 스트리밍 중이면 토글에 진행 표시(dot pulse). */
  streaming: boolean;
}

/** 디자인 IOMini (thinking-panel-variations.jsx:168-197) — 도구 IN/OUT. */
function ToolStepRow({ step }: { step: ToolStep }): ReactNode {
  return (
    <div
      style={{
        background: "rgba(156,163,175,0.10)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr",
          gap: 10,
          alignItems: "baseline",
          padding: "7px 10px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--neutral-600)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            textAlign: "right",
          }}
        >
          IN
        </span>
        <span style={{ fontSize: 12, color: "var(--neutral-600)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text-default)" }}>{step.name}</strong>
          {step.args && step.args !== "{}" ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {" "}
              {step.args}
            </span>
          ) : null}
        </span>
      </div>
      <div style={{ borderTop: "1px solid var(--t-neutral-8)" }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr",
          gap: 10,
          alignItems: "baseline",
          padding: "7px 10px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--neutral-600)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            textAlign: "right",
          }}
        >
          OUT
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--neutral-600)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {step.result ?? (
            <span style={{ fontStyle: "italic", opacity: 0.7 }}>실행 중…</span>
          )}
        </span>
      </div>
    </div>
  );
}

function DotPulse(): ReactNode {
  return (
    <span style={{ display: "inline-flex", gap: 3, verticalAlign: "middle" }}>
      {[0, 0.15, 0.3].map((d) => (
        <span
          key={d}
          aria-hidden
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "currentColor",
            animation: `pulse 1.2s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

export function ThinkingPanel({
  thinking,
  toolSteps,
  streaming,
}: ThinkingPanelProps): ReactNode {
  const hasTools = (toolSteps?.length ?? 0) > 0;
  const hasThinking = thinking.trim().length > 0;
  const hasAny = hasThinking || hasTools;

  // 두 레퍼런스(medigate-manager/new ThinkingPanel) 상태 머신 모방:
  //  - 토글 버튼은 데이터(hasAny)가 한 번이라도 생기면 **영속**한다.
  //    streaming 종료 후에도 사라지지 않는다(medigate hasThinking =
  //    steps.length>0, !isStreaming 의존 없음).
  //  - 실시간(streaming): 자동 펼침 + "진행 중" 표시.
  //  - 히스토리(완료): 사용자 미조작 시 자동 접힘. 토글로 재열람.
  //
  // open 을 effect 로 동기화하지 않고 **렌더 중 파생**으로 계산한다
  // (react-hooks/set-state-in-effect — cascading render 회피). 추적
  // 상태는 "사용자가 명시적으로 토글했는가(userToggled)" 하나뿐:
  //  - userToggled === null  → 자동(streaming 이면 펼침, 완료면 접힘)
  //  - userToggled === bool  → 사용자 의도 우선(medigate manualExpand)
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const autoOpen = streaming && hasAny;
  const open = userToggled ?? autoOpen;

  const handleToggle = (): void => {
    setUserToggled(!open); // 현재 표시 상태 기준 반전 → 이후 사용자 의도 고정
  };

  // 토글 버튼 영속 가드: 데이터가 있거나 스트리밍 중이면 표시. 완료
  // 후 데이터가 남아 있으면(hasAny) 계속 표시 — 사라짐 버그 해결.
  if (!hasAny && !streaming) return null;

  const label = streaming
    ? open
      ? "답변 과정 (진행 중)"
      : "답변 과정 보는 중"
    : open
      ? "답변 과정"
      : "답변 과정 보기";

  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 4px 4px 0",
          border: "none",
          background: "transparent",
          fontSize: 12.5,
          color: "var(--text-subtle)",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        <span>{label}</span>
        {streaming && (
          <span style={{ color: "var(--agent-500)" }}>
            <DotPulse />
          </span>
        )}
        {open ? (
          <ChevronUp
            size={13}
            style={{ color: "var(--neutral-600)" }}
            aria-hidden
          />
        ) : (
          <ChevronDown
            size={13}
            style={{ color: "var(--neutral-600)" }}
            aria-hidden
          />
        )}
      </button>
      {open && (hasThinking || hasTools) && (
        <div
          style={{
            marginTop: 8,
            padding: "14px 16px",
            border: "1px solid var(--t-neutral-8)",
            background: "var(--t-neutral-4)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {hasThinking && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                background: "rgba(156,163,175,0.10)",
                color: "var(--neutral-600)",
              }}
            >
              {/* 사고도 마크다운 적용 — medigate-new ThinkingMarkdown 모방.
                  ChatMarkdown(rehype-sanitize, XSS/FR-09) 재사용 + 사고 톤
                  오버라이드(12.5px, italic, gray; 단 헤딩은 not-italic). */}
              <ChatMarkdown
                content={preprocessThinking(thinking)}
                className={
                  "text-[12.5px] italic leading-[1.7] !text-[color:var(--neutral-600)] " +
                  "[&_h1]:not-italic [&_h2]:not-italic [&_h3]:not-italic " +
                  "[&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[13px] " +
                  "[&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1 " +
                  "[&_strong]:not-italic [&_strong]:font-semibold " +
                  "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_code]:not-italic"
                }
              />
            </div>
          )}
          {hasTools && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {toolSteps!.map((s, i) => (
                <ToolStepRow key={s.id || i} step={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ThinkingPanel;

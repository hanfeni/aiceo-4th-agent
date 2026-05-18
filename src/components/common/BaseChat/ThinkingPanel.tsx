"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const hasTools = (toolSteps?.length ?? 0) > 0;
  const hasThinking = thinking.trim().length > 0;
  if (!hasThinking && !hasTools && !streaming) return null;

  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
        <span>{open ? "답변 과정" : "답변 과정 보기"}</span>
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
                fontSize: 12.5,
                lineHeight: 1.7,
                fontStyle: "italic",
                color: "var(--neutral-600)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {thinking}
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

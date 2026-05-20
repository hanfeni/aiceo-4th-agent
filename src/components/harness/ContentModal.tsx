"use client";

import { useEffect, type ReactNode } from "react";

interface ContentModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** 모달 최대 너비(px). 시안 ModalShell 톤은 820 권장. 기본 680. */
  width?: number;
  /** 헤더 우측(닫기 버튼 왼쪽) 보라 mono 배지 슬롯. */
  headerExtra?: ReactNode;
  /** 하단 footer 슬롯(취소/삭제/저장 등). 있으면 점선 구분선과 함께 렌더. */
  footer?: ReactNode;
}

export function ContentModal({
  title,
  subtitle,
  onClose,
  children,
  width = 680,
  headerExtra,
  footer,
}: ContentModalProps): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15,23,42,0.45)",
          backdropFilter: "blur(4px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: width,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          borderRadius: "var(--r-lg)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--t-neutral-8)",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-default)",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              marginLeft: 12,
            }}
          >
            {/* 보라 mono 배지 슬롯(시안 ModalShell headerExtra) */}
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "var(--r-md)",
                border: "1px solid var(--t-neutral-8)",
                background: "var(--surface-default)",
                color: "var(--text-subtle)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div
          className="thin-scroll"
          style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}
        >
          {children}
        </div>
        {/* 하단 footer(취소/삭제/저장 등) — 시안 ModalShell footer 톤 */}
        {footer && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 20px",
              borderTop: "1px solid var(--t-neutral-8)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default ContentModal;

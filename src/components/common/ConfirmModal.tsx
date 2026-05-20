"use client";

import type { ReactNode } from "react";

/**
 * ConfirmModal — 파괴적 작업(삭제·초기화) 공통 확인 모달.
 *
 * index-lab(인덱스 삭제)·data-load(테이블 초기화) 등에서 재사용.
 * blur overlay + 시안 ModalShell 톤(il-* 라인업 정합). 오클릭 방지.
 */
export function ConfirmModal({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  /** 확정 버튼 라벨(예: "삭제", "초기화") */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 본문 설명(대상명 강조 등) */
  children: ReactNode;
}): ReactNode {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          borderRadius: "var(--r-lg, 14px)",
          padding: 20,
          maxWidth: 380,
          boxShadow:
            "0 24px 64px rgba(15,23,42,.22), 0 4px 16px rgba(15,23,42,.08)",
        }}
      >
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 800,
            color: "var(--text-default)",
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-subtle)",
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          {children}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="cf-btn" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

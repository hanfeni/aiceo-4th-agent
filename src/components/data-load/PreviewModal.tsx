"use client";

import type { ReactNode } from "react";

/**
 * Preview — 적재 전 CSV 앞 N행 미리보기 데이터(sql-lab/preview 응답).
 * DataLoadView 의 openPreview 가 채운다.
 */
export interface Preview {
  columns: string[];
  rows: string[][];
  totalNote: string;
}

/**
 * PreviewModal — 적재 전 GitHub 원본 CSV 앞 20행 표 미리보기
 * (시안 data-load PreviewModal 톤). blur overlay + il-preview-table
 * (컬럼 넘버링·mono 셀·짝수행 줄무늬) + CSV cols 배지.
 */
export function PreviewModal({
  title,
  preview,
  loading,
  onClose,
}: {
  /** 헤더 타이틀(도메인 라벨) */
  title: string;
  preview: Preview | null;
  loading: boolean;
  onClose: () => void;
}): ReactNode {
  const cols = preview?.columns.length ?? 0;
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
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          borderRadius: "var(--r-lg, 14px)",
          width: "min(920px, 100%)",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          boxShadow:
            "0 24px 64px rgba(15,23,42,.22), 0 4px 16px rgba(15,23,42,.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "var(--text-default)",
              }}
            >
              {title} — 데이터 미리보기
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginTop: 3,
              }}
            >
              {preview?.totalNote ?? (loading ? "불러오는 중…" : "")} · 적재 전
              GitHub 원본 CSV
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {preview && <span className="il-ix-count">CSV · {cols} cols</span>}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                appearance: "none",
                border: "none",
                background: "transparent",
                fontSize: 20,
                cursor: "pointer",
                color: "var(--text-subtle)",
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div
          className="thin-scroll"
          style={{ overflow: "auto", padding: 0, minHeight: 160 }}
        >
          {loading ? (
            <div
              style={{ fontSize: 12, color: "var(--text-subtle)", padding: 16 }}
            >
              ▶ CSV 원본을 불러오는 중…
            </div>
          ) : preview ? (
            <table className="il-preview-table">
              <thead>
                <tr>
                  {preview.columns.map((c, i) => (
                    <th key={c}>
                      <span className="il-col-num">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} title={cell}>
                        {cell === "" ? "—" : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              style={{ fontSize: 12, color: "var(--text-subtle)", padding: 16 }}
            >
              표시할 데이터가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

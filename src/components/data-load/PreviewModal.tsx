"use client";

import type { ReactNode } from "react";

/**
 * Preview — 표 미리보기 데이터(columns/rows/totalNote). 출처는 호출부에
 * 따라 다르다 — DataLoadView=적재 전 CSV(sql-lab/preview),
 * SearchLabView·StoreExplorerView=적재된 SQLite 테이블(sql-lab/rows).
 */
export interface Preview {
  columns: string[];
  rows: string[][];
  totalNote: string;
}

/**
 * PreviewModal — 표 형태 행 미리보기 (시안 data-load PreviewModal 톤).
 * blur overlay + il-preview-table(컬럼 넘버링·mono 셀·짝수행 줄무늬).
 *
 * 출처는 두 가지로 재사용된다 — DataLoadView 는 적재 전 GitHub 원본 CSV,
 * SearchLabView·StoreExplorerView 는 적재된 SQLite 테이블 조회. 그래서
 * 출처 문구·단위 배지를 prop(sourceNote/unit)으로 받고, 기본값은 기존
 * 동작(CSV 원본) — DataLoadView 호출부 무변경. SQL 조회 호출부만 넘긴다.
 */
export function PreviewModal({
  title,
  preview,
  loading,
  onClose,
  sourceNote = "적재 전 GitHub 원본 CSV",
  unit = "CSV",
}: {
  /** 헤더 타이틀(도메인 라벨) */
  title: string;
  preview: Preview | null;
  loading: boolean;
  onClose: () => void;
  /** 부제 출처 문구(예: "적재된 SQLite 테이블 조회"). 기본=CSV 원본. */
  sourceNote?: string;
  /** 배지·로딩 표시 단위(예: "테이블"). 기본=CSV. */
  unit?: string;
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
          height: "min(680px, 88vh)",
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
              {preview?.totalNote ?? (loading ? "불러오는 중…" : "")} ·{" "}
              {sourceNote}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {preview && (
              <span className="il-ix-count">
                {unit} · {cols} cols
              </span>
            )}
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
              ▶ {unit} 데이터를 불러오는 중…
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

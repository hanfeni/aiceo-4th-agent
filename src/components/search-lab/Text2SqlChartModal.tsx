"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChartView } from "./ChartView";
import { SqlResultBlock, type SqlResult } from "./SearchResults";
import type { ChartSpec } from "@/lib/sqllab/text2sqlChart";

/**
 * Text2SqlChartModal — Text-to-SQL / with Chart 노드 클릭 시 큰 화면으로
 * SQL·결과 표·차트를 한눈에 보는 모달(시안 Text2SqlChartModal).
 *
 * 데이터는 SearchLabView 의 실제 상태(시스템 인스트럭션·생성 SQL·결과·
 * 차트 스펙)를 props 로 받는다 — 목업 금지. chart 가 없는 모드(text2sql)
 * 면 차트 칼럼을 숨기고 SQL+표만(시안의 차트 패널은 선택적).
 *
 * 시각: blur overlay + il-code + 입력/출력 탭(il-modal-tab). 노드 클릭
 * 진입이라 단일 화면(좌우 네비 불요 — 단계별 입출력은 RagStageModal).
 */

export interface Text2SqlChartModalProps {
  title: string;
  /** LLM 시스템 인스트럭션(입력 탭) */
  system: string;
  /** 생성 SQL */
  sql: string;
  /** 실행 결과 */
  result: SqlResult | null;
  /** 차트 스펙 (with Chart 모드만 — 없으면 차트 패널 숨김) */
  chart?: ChartSpec | null;
  /** 진행 상태 (헤더 배지) */
  running: boolean;
  onClose: () => void;
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 24,
};
const panel: CSSProperties = {
  background: "var(--surface-default, #fff)",
  border: "1px solid var(--t-neutral-8, #e4e4e7)",
  borderRadius: "var(--r-lg, 14px)",
  width: "min(960px, 100%)",
  height: "min(680px, 88vh)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
};
const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

export function Text2SqlChartModal({
  title,
  system,
  sql,
  result,
  chart,
  running,
  onClose,
}: Text2SqlChartModalProps): ReactNode {
  // 입력(시스템 인스트럭션) / 출력(SQL·표·차트) 탭.
  const [tab, setTab] = useState<"input" | "output">("output");
  const statusLabel = running
    ? "차트화 중"
    : chart
      ? "SQL OK · chart auto"
      : "완료";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 — 제목 + 상태 배지 + 닫기 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px 0",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--text-default)",
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginTop: 3,
              }}
            >
              자연어 → SQL → 표{chart ? " → 차트 자동 생성" : ""}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className={`il-status il-status--${running ? "run" : "done"}`}
            >
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                appearance: "none",
                border: "none",
                background: "transparent",
                fontSize: 20,
                lineHeight: 1,
                cursor: "pointer",
                color: "var(--text-subtle)",
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* 입력/출력 탭(il-modal-tab) */}
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 18px 0",
            borderBottom: "1px solid var(--t-neutral-8, #e4e4e7)",
          }}
        >
          <button
            type="button"
            role="tab"
            className="il-modal-tab"
            aria-selected={tab === "input"}
            onClick={() => setTab("input")}
          >
            입력 (시스템 인스트럭션)
          </button>
          <button
            type="button"
            role="tab"
            className="il-modal-tab"
            aria-selected={tab === "output"}
            onClick={() => setTab("output")}
          >
            출력 (SQL · 표{chart ? " · 차트" : ""})
          </button>
        </div>

        <div
          className="thin-scroll"
          style={{ overflowY: "auto", padding: 18, minHeight: 160 }}
        >
          {tab === "input" ? (
            <pre className="il-code">
              {system || "(이 단계 시스템 인스트럭션이 아직 없습니다)"}
            </pre>
          ) : (
            // 출력 — chart 있으면 좌(SQL·표)/우(차트) 2분할, 없으면 단일.
            <div
              style={
                chart && result
                  ? {
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                    }
                  : undefined
              }
            >
              <div style={{ minWidth: 0 }}>
                <div style={sectionLabel}>생성된 SQL · 결과 표</div>
                {sql || result ? (
                  <SqlResultBlock sql={sql} result={result} />
                ) : running ? (
                  <div
                    style={{ fontSize: 12, color: "var(--text-subtle)" }}
                  >
                    ▶ 진행 중 — 완료되면 SQL·결과가 표시됩니다.
                  </div>
                ) : (
                  <div
                    style={{ fontSize: 12, color: "var(--text-subtle)" }}
                  >
                    (아직 실행 결과가 없습니다)
                  </div>
                )}
              </div>

              {chart && result && (
                <div style={{ minWidth: 0 }}>
                  <div style={sectionLabel}>
                    LLM 이 고른 차트 ({chart.chartType})
                  </div>
                  <ChartView
                    spec={chart}
                    columns={result.columns}
                    rows={result.rows}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

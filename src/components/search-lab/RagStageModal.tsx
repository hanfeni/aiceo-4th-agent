"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { StageNodeMeta, StageIO } from "@/components/common/pipelineNodes";

/**
 * RagStageModal — RAG 노드 클릭 시 그 단계 입출력 모달.
 *
 * 사용자 결정 2026-05-19: RAG 도 메타랩처럼 노드 그래프 + 클릭 모달.
 * 메타랩 StageModal 은 JsonResultView·케이스 스와이프 의존(메타 전용)
 * 이라 RAG 는 입력/출력 텍스트만 보는 경량 자체 모달(독립).
 * 입력 탭 = 검색어·시스템 인스트럭션·프롬프트, 출력 탭 = 근거·답변.
 */

export interface RagStageModalProps {
  meta: StageNodeMeta;
  io: StageIO;
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
  width: "min(820px, 100%)",
  maxHeight: "86vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
};

export function RagStageModal({
  meta,
  io,
  onClose,
}: RagStageModalProps): ReactNode {
  const [tab, setTab] = useState<"input" | "output">("output");
  // 상태칩(idle/running/done/error). il-status CSS 매핑(running·error→run).
  const pillCls = io.status === "done" ? "done" : "run";
  const statusLabel =
    io.status === "running"
      ? "진행 중"
      : io.status === "done"
        ? "완료"
        : io.status === "error"
          ? "실패"
          : "대기";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
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
              {meta.emphasis ? "🤖 " : ""}
              {meta.stage}. {meta.label}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginTop: 3,
              }}
            >
              {meta.hint}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`il-status il-status--${pillCls}`}>
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
            입력 (검색어·프롬프트)
          </button>
          <button
            type="button"
            role="tab"
            className="il-modal-tab"
            aria-selected={tab === "output"}
            onClick={() => setTab("output")}
          >
            출력 (근거·답변)
          </button>
        </div>

        <div
          className="thin-scroll"
          style={{ overflowY: "auto", padding: 18, minHeight: 120 }}
        >
          {tab === "input" ? (
            <pre className="il-code">
              {io.input ?? "(이 단계 입력이 아직 없습니다)"}
            </pre>
          ) : io.status === "running" ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-subtle)",
                padding: "8px 0",
              }}
            >
              ▶ 진행 중 — 완료되면 결과가 표시됩니다.
            </div>
          ) : io.output ? (
            <pre className="il-code">{io.output}</pre>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-subtle)",
                padding: "8px 0",
              }}
            >
              (이 단계 출력이 아직 없습니다)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

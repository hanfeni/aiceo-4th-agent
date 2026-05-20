"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { StageNodeMeta, StageIO } from "@/components/common/pipelineNodes";
import { JsonResultView } from "./JsonResultView";

/**
 * StageModal — 올인원 노드 클릭 시 그 단계 입출력 모달.
 *
 * 사용자 결정 2026-05-19: "노드를 누르면 모달로 결과물을 보여줍니다.
 * 모달은 노드별로 인풋/아웃풋 정보도 표시(특히 인스트럭션이나 프롬프트)".
 * 입력 탭 = 시스템 인스트럭션·프롬프트·우리 산출물, 출력 탭 = LLM 결과.
 *
 * DART DartStagePanel 패턴 동형이나 메타랩 전용(독립). 출력 탭은
 * JSON 결과면 JsonResultView 로도 보강(label/discover 와 동일 렌더).
 */

export interface StageModalProps {
  meta: StageNodeMeta;
  io: StageIO;
  onClose: () => void;
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  // 시안 톤 — 짙은 네이비 반투명 + 블러(il-* 라인업과 정합).
  background: "rgba(15,23,42,.45)",
  backdropFilter: "blur(4px)",
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
  width: "min(860px, 100%)",
  maxHeight: "86vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
};
/** 케이스 스와이프 좌우 화살표 버튼 (양끝에선 비활성) */
const navBtn = (disabled: boolean): CSSProperties => ({
  appearance: "none",
  border: "1px solid var(--t-neutral-8, #e4e4e7)",
  background: "var(--surface-default, #fff)",
  borderRadius: 8,
  width: 30,
  height: 30,
  fontSize: 13,
  lineHeight: 1,
  cursor: disabled ? "default" : "pointer",
  color: disabled ? "var(--t-neutral-8, #d4d4d8)" : "var(--text-default)",
  opacity: disabled ? 0.5 : 1,
  flexShrink: 0,
});

export function StageModal({
  meta,
  io,
  onClose,
}: StageModalProps): ReactNode {
  const [tab, setTab] = useState<"input" | "output">("output");
  // 케이스 스와이프 인덱스 (발굴 ×10·실분류 5건만 cases 有).
  // key={openStage} 로 단계 전환 시 컴포넌트 리마운트 → 0 리셋.
  const [caseIdx, setCaseIdx] = useState(0);
  const cases = io.cases ?? [];
  const hasCases = cases.length > 0;
  // 스트리밍 중 길이 변동·인덱스 초과 방어 (항상 유효 범위)
  const idx = hasCases ? Math.min(caseIdx, cases.length - 1) : 0;
  const cur = hasCases ? cases[idx] : null;
  const statusLabel =
    io.status === "running"
      ? "진행 중…"
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
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--text-default)",
              }}
            >
              {meta.emphasis ? "🤖 " : ""}
              {meta.stage}. {meta.label}
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                }}
              >
                · {statusLabel}
              </span>
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
            입력 (인스트럭션·프롬프트)
          </button>
          <button
            type="button"
            role="tab"
            className="il-modal-tab"
            aria-selected={tab === "output"}
            onClick={() => setTab("output")}
          >
            출력 (LLM 결과)
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
          ) : hasCases && cur ? (
            // 발굴 ×10·실분류 5건: 케이스별 스와이프 (◀ N/M ▶)
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  aria-label="이전 케이스"
                  disabled={idx <= 0}
                  onClick={() => setCaseIdx((i) => Math.max(0, i - 1))}
                  style={navBtn(idx <= 0)}
                >
                  ◀
                </button>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-default)",
                    minWidth: 0,
                    textAlign: "center",
                  }}
                >
                  {cur.label}
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-subtle)",
                    }}
                  >
                    {idx + 1} / {cases.length}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="다음 케이스"
                  disabled={idx >= cases.length - 1}
                  onClick={() =>
                    setCaseIdx((i) =>
                      Math.min(cases.length - 1, i + 1),
                    )
                  }
                  style={navBtn(idx >= cases.length - 1)}
                >
                  ▶
                </button>
              </div>
              <pre className="il-code">{cur.text}</pre>
              <JsonResultView raw={cur.text} />
            </>
          ) : io.output ? (
            <>
              <pre className="il-code">{io.output}</pre>
              <JsonResultView raw={io.output} />
            </>
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

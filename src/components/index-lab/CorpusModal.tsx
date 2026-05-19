"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * CorpusModal — 원본 문서 열람 모달 (IndexLab 전용).
 *
 * StageModal 의 좌우 네비 시각 패턴을 동일 적용("동일 컴포넌트 =
 * 동일 디자인"). 단 StageModal 은 메타 StageIO 구조에 결합돼 그대로
 * 재사용 불가 → 같은 토큰·레이아웃으로 경량 복제. overlay 클릭 닫기,
 * ◀ N/M ▶ 양끝 비활성.
 */

export interface CorpusDocItem {
  doc_id: string;
  title: string;
  body: string;
}

interface CorpusModalProps {
  /** 도메인 라벨(헤더 표시용) */
  domainLabel: string;
  docs: CorpusDocItem[];
  loading: boolean;
  onClose: () => void;
}

// StageModal.tsx 와 동일 스타일(시각 일관) — 값 1:1 복제.
const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
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
const pre: CSSProperties = {
  whiteSpace: "pre-wrap",
  fontSize: 11.5,
  lineHeight: 1.6,
  color: "var(--text-default)",
  margin: 0,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

export function CorpusModal({
  domainLabel,
  docs,
  loading,
  onClose,
}: CorpusModalProps): ReactNode {
  const [idx, setIdx] = useState(0);
  const total = docs.length;
  const safeIdx = total > 0 ? Math.min(idx, total - 1) : 0;
  const cur = total > 0 ? docs[safeIdx] : null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--text-default)",
            }}
          >
            원본 문서 — {domainLabel}
            {total > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-subtle)",
                }}
              >
                앞 {total}건 샘플
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              color: "var(--text-subtle)",
            }}
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 18,
            minHeight: 200,
          }}
          className="thin-scroll"
        >
          {loading ? (
            <div
              style={{ fontSize: 12.5, color: "var(--text-subtle)" }}
            >
              원본 문서 불러오는 중…
            </div>
          ) : !cur ? (
            <div
              style={{ fontSize: 12.5, color: "var(--text-subtle)" }}
            >
              표시할 문서가 없습니다.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-default)",
                  marginBottom: 4,
                }}
              >
                {cur.title || "(제목 없음)"}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--text-subtle)",
                  marginBottom: 12,
                }}
              >
                doc_id: {cur.doc_id}
              </div>
              <pre style={pre}>{cur.body}</pre>
            </>
          )}
        </div>

        {/* 좌우 네비 (StageModal 과 동일 ◀ N/M ▶ 패턴) */}
        {total > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "12px 18px",
              borderTop: "1px solid var(--t-neutral-8)",
            }}
          >
            <button
              type="button"
              style={navBtn(safeIdx <= 0)}
              disabled={safeIdx <= 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              aria-label="이전 문서"
            >
              ◀
            </button>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-subtle)",
                minWidth: 60,
                textAlign: "center",
              }}
            >
              {safeIdx + 1} / {total}
            </span>
            <button
              type="button"
              style={navBtn(safeIdx >= total - 1)}
              disabled={safeIdx >= total - 1}
              onClick={() =>
                setIdx((i) => Math.min(total - 1, i + 1))
              }
              aria-label="다음 문서"
            >
              ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

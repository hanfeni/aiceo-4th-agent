"use client";

import type { ReactNode } from "react";

/**
 * 업로드 색인 결과 요약(시안 JsonlResultModal 데이터원 — 실데이터).
 * IndexLabView 의 runUpload done 이벤트에서 캡처. 시안 목업(임베딩 토큰
 * 등) 대신 SSE·인덱스에서 실제로 알 수 있는 값만 채운다.
 */
export interface UploadResult {
  fileName: string;
  label: string;
  index: string;
  indexed: number;
  embedModel: string;
  chunkSize: number;
  at: string; // 표시용 시각(KST)
}

/**
 * JsonlResultModal — 지난 업로드 색인 결과 요약(시안 JsonlResultModal).
 *
 * 시안 목업 대신 캡처한 실데이터(UploadResult)로 채운다. 임베딩 토큰 등
 * SSE 에 없는 값은 표시하지 않는다. il-* 토큰·blur overlay 로 워크벤치
 * 시각 정합(CorpusModal 과 동일 톤).
 */
export function JsonlResultModal({
  result,
  onClose,
}: {
  result: UploadResult;
  onClose: () => void;
}): ReactNode {
  const embedShort = result.embedModel.replace("text-embedding-", "");
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          borderRadius: "var(--r-lg, 14px)",
          width: "min(680px, 100%)",
          height: "min(680px, 88vh)",
          display: "flex",
          flexDirection: "column",
          boxShadow:
            "0 24px 64px rgba(15,23,42,.22), 0 4px 16px rgba(15,23,42,.08)",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 800,
                color: "var(--text-default)",
                letterSpacing: "-0.01em",
              }}
            >
              jsonl 업로드 색인 결과
            </div>
            <div
              className="il-mono"
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginTop: 3,
              }}
            >
              {result.fileName} · {result.at} 업로드
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cf-btn cf-btn--ghost"
            style={{ width: 28, padding: 0, justifyContent: "center" }}
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="thin-scroll" style={{ overflowY: "auto", padding: 20 }}>
          {/* 통계 — 실데이터(문서수·청크·임베딩 모델) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <ResultTile
              label="문서"
              value={result.indexed.toLocaleString()}
              unit="docs"
              highlight
            />
            <ResultTile
              label="청크"
              value={result.chunkSize === 0 ? "OFF" : `${result.chunkSize}t`}
            />
            <ResultTile label="임베딩" value={embedShort} />
          </div>

          {/* 색인 결과 — custom 인덱스명 */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 8,
              color: "var(--text-default)",
            }}
          >
            색인 결과
          </div>
          <div
            style={{
              background: "var(--lab-success-bg)",
              border: "1px solid var(--lab-success-border)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                color: "var(--lab-success-text)",
                fontWeight: 600,
              }}
            >
              ✓ {result.indexed.toLocaleString()}건 색인 완료
            </div>
            <div
              className="il-mono"
              style={{
                fontSize: 10.5,
                color: "var(--text-subtle)",
                marginTop: 4,
              }}
            >
              인덱스: {result.index} · 라벨: {result.label}
            </div>
          </div>

          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-subtle)",
              lineHeight: 1.6,
              background: "var(--medi-gray-50)",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            검색 실습·챗의 인덱스 선택 드롭다운에서{" "}
            <strong style={{ color: "var(--text-default)" }}>
              “{result.label}”
            </strong>{" "}
            (내 데이터)로 바로 검색할 수 있습니다.
          </div>
        </div>

        {/* 푸터 */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--t-neutral-8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            background: "var(--medi-gray-50)",
            borderBottomLeftRadius: "var(--r-lg, 14px)",
            borderBottomRightRadius: "var(--r-lg, 14px)",
          }}
        >
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={onClose}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

/** 결과 통계 타일(시안 Stat — il-metric 톤 재사용). */
function ResultTile({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}): ReactNode {
  return (
    <div className={highlight ? "il-metric il-metric--hl" : "il-metric"}>
      <div className="il-metric-label">{label}</div>
      <div className="il-metric-value">
        {value}
        {unit && <span className="il-metric-unit">{unit}</span>}
      </div>
    </div>
  );
}

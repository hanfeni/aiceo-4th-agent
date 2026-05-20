"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * IndexDocsModal — 색인된 문서 열람 모달 (검색 실습 전용).
 *
 * 사용자 결정 2026-05-19: 검색 실습 인덱스 칩 하단 "인덱스 보기"
 * → 색인된 도큐먼트를 ◀ N/M ▶ 로 하나씩. 원본 corpus 가 아니라
 * 실제 OpenSearch 색인분 — 청킹 ON 이면 chunk_id 가 보여 학생이
 * 청크 분할 결과를 확인(교육 핵심).
 *
 * 50개씩 페이지네이션(사용자 결정): 모달이 /api/search-lab/docs
 * 를 from/size=50 으로 직접 호출·누적. 마지막 5건 근접 시 다음
 * 50건 prefetch. CorpusModal 시각 토큰 1:1(동일 컴포넌트=동일
 * 디자인). 부모는 domain 만 — 페이지 상태는 모달이 캡슐화.
 */

export interface IndexDocItem {
  doc_id: string;
  chunk_id?: number;
  title: string;
  body: string;
  /** 색인된 임베딩 벡터(1536-d). 모달이 압축 표시. */
  embedding?: number[];
  embedding_dim?: number;
}

interface IndexDocsModalProps {
  domain: string;
  domainLabel: string;
  onClose: () => void;
}

const PAGE = 50;

// CorpusModal.tsx 와 동일 스타일(시각 일관) — 값 1:1 복제.
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
/** 임베딩 벡터 압축: "[1536-d] 앞 8개: 0.013, -0.21, …" */
function embedSummary(v: number[] | undefined, dim?: number): string {
  if (!v || v.length === 0) return "(임베딩 없음 — 색인 시 키 누락?)";
  const d = dim ?? v.length;
  const head = v
    .slice(0, 8)
    .map((n) => n.toFixed(4))
    .join(", ");
  return `[${d}-d 벡터] 앞 8개: ${head}, … (총 ${d}개)`;
}

/**
 * 실제 색인 도큐먼트 전체를 raw 로 직렬화(임베딩만 압축).
 * 학생이 OpenSearch 에 들어간 _source 전 필드를 그대로 확인 —
 * 임베딩 1536개 raw 는 화면 도배라 차원+프리뷰로(정보 손실 0).
 */
function renderRawDoc(d: IndexDocItem): string {
  const lines = [
    "{",
    `  "doc_id": ${JSON.stringify(d.doc_id)},`,
    typeof d.chunk_id === "number"
      ? `  "chunk_id": ${d.chunk_id},`
      : null,
    `  "title": ${JSON.stringify(d.title)},`,
    `  "embedding": ${embedSummary(d.embedding, d.embedding_dim)},`,
    `  "body":`,
    "",
    d.body,
    "}",
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

export function IndexDocsModal({
  domain,
  domainLabel,
  onClose,
}: IndexDocsModalProps): ReactNode {
  const [items, setItems] = useState<IndexDocItem[]>([]);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // 진행 중인 from 중복 fetch 방지(화살표 연타 → 같은 페이지 2번)
  const fetchingFrom = useRef<Set<number>>(new Set());

  const loadPage = useCallback(
    async (from: number): Promise<void> => {
      if (fetchingFrom.current.has(from)) return;
      fetchingFrom.current.add(from);
      try {
        const res = await fetch(
          `/api/search-lab/docs?domain=${encodeURIComponent(
            domain,
          )}&from=${from}&size=${PAGE}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setErr(data.error ?? `조회 실패 (HTTP ${res.status})`);
          return;
        }
        setTotal(data.total ?? 0);
        setItems((prev) => {
          // from 위치에 채워 넣기(순서 보장). 빈 구간은 안 생김
          // (항상 prev.length 부터 다음 페이지를 당기므로).
          const next = prev.slice();
          (data.items as IndexDocItem[]).forEach((it, i) => {
            next[from + i] = it;
          });
          return next;
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        fetchingFrom.current.delete(from);
        setLoading(false);
      }
    },
    [domain],
  );

  // 첫 페이지 1회 (key={domain} 리마운트 → 도메인별 항상 0부터).
  // ref 가드로 StrictMode 2회 호출에도 1번만(setState 연쇄 차단 —
  // effect 본문은 트리거만, fetch·setState 는 loadPage 내부 async).
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void loadPage(0);
  }, [loadPage]);

  // prefetch 는 effect 가 아니라 이동 핸들러에서 직접(렌더→effect
  // →setState 캐스케이드 회피). 마지막 5건 근접 시 다음 50건.
  const maybePrefetch = useCallback(
    (nextIdx: number): void => {
      const loaded = items.length;
      if (loaded > 0 && loaded < total && nextIdx >= loaded - 5) {
        void loadPage(loaded);
      }
    },
    [items.length, total, loadPage],
  );

  const cur = items[idx] ?? null;
  const canPrev = idx > 0;
  const canNext = idx < total - 1;

  const goNext = (): void => {
    setIdx((i) => {
      const n = Math.min(total - 1, i + 1);
      maybePrefetch(n);
      return n;
    });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--text-default)",
              }}
            >
              색인된 문서 — {domainLabel}
              {total > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-subtle)",
                  }}
                >
                  총 {total.toLocaleString()}건 (50개씩 로드)
                </span>
              )}
            </div>
            <span
              className="il-mono"
              style={{
                fontSize: 10.5,
                color: "var(--blue-700)",
                fontWeight: 700,
                background: "var(--lab-blue-bg)",
                padding: "4px 8px",
                borderRadius: 4,
              }}
            >
              OpenSearch · searchlab-{domain}
            </span>
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

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 18,
            minHeight: 200,
          }}
          className="thin-scroll"
        >
          {err ? (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--t-danger-11, #e5484d)",
              }}
            >
              ⚠️ {err}
            </div>
          ) : loading && items.length === 0 ? (
            <div
              style={{ fontSize: 12.5, color: "var(--text-subtle)" }}
            >
              색인된 문서 불러오는 중…
            </div>
          ) : !cur ? (
            <div
              style={{ fontSize: 12.5, color: "var(--text-subtle)" }}
            >
              색인된 문서가 없습니다. 도메인 색인 메뉴에서 먼저
              색인하세요.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-default)",
                  marginBottom: 10,
                }}
              >
                {cur.title || "(제목 없음)"}
                {typeof cur.chunk_id === "number" && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--text-subtle)",
                    }}
                  >
                    청크 #{cur.chunk_id} (청크 단위 색인)
                  </span>
                )}
              </div>
              {/* 실제 OpenSearch 색인 도큐먼트 전체(raw). 임베딩
                  벡터는 1536-d 라 차원+앞 8개로 압축(정보 손실 0
                  — 존재·차원·형태 확인). 사용자 결정 2026-05-19. */}
              <pre className="il-code">{renderRawDoc(cur)}</pre>
            </>
          )}
        </div>

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
              style={navBtn(!canPrev)}
              disabled={!canPrev}
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
                minWidth: 80,
                textAlign: "center",
              }}
            >
              {idx + 1} / {total.toLocaleString()}
              {!items[idx] && loading ? " …" : ""}
            </span>
            <button
              type="button"
              style={navBtn(!canNext)}
              disabled={!canNext}
              onClick={goNext}
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

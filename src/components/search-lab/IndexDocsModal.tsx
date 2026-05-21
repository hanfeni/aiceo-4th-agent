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
  /** 색인된 임베딩 벡터(1536-d). 모달이 압축·더보기 표시. */
  embedding?: number[];
  embedding_dim?: number;
  /** doc_id/chunk_id/title/body/embedding 외 모든 _source 필드.
      올인원 색인의 메타 라벨(main_category/keywords 등). */
  fields?: Record<string, unknown>;
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
  height: "min(680px, 88vh)",
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

/** 임베딩 전체 벡터를 줄바꿈 정렬로 직렬화(더보기 시). */
function embedFull(v: number[]): string {
  return (
    "[\n  " +
    v.map((n) => n.toFixed(6)).join(", ") +
    "\n]"
  );
}

/**
 * 색인 도큐먼트의 raw JSON 직렬화 — embedding 제외 전 필드.
 * 표준 필드(doc_id/chunk_id/title) + 동적 메타 라벨(main_category/
 * mid_category/sub_category/keywords/meta_description 등 fields)을
 * 있는 그대로 노출하고, body 는 가독성 위해 마지막에 펼침.
 * embedding 은 화면 도배라 별도 블록(압축+더보기)에서 처리.
 */
function renderRawDoc(d: IndexDocItem): string {
  const lines: (string | null)[] = [
    "{",
    `  "doc_id": ${JSON.stringify(d.doc_id)},`,
    typeof d.chunk_id === "number" ? `  "chunk_id": ${d.chunk_id},` : null,
    `  "title": ${JSON.stringify(d.title)},`,
  ];
  // 동적 메타 필드(키 순서 그대로). body 는 따로 처리하므로 제외.
  const meta = d.fields ?? {};
  for (const [k, val] of Object.entries(meta)) {
    if (k === "body" || k === "doc_id" || k === "chunk_id" || k === "title") {
      continue;
    }
    lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(val)},`);
  }
  lines.push(`  "body":`, "", d.body, "}");
  return lines.filter((l): l is string => l !== null).join("\n");
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
  // 임베딩 전체 벡터 펼침 여부. 문서 이동 시 false 로 리셋.
  const [embedExpanded, setEmbedExpanded] = useState(false);
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
    setEmbedExpanded(false); // 문서 바뀌면 임베딩 펼침 초기화
    setIdx((i) => {
      const n = Math.min(total - 1, i + 1);
      maybePrefetch(n);
      return n;
    });
  };
  const goPrev = (): void => {
    setEmbedExpanded(false);
    setIdx((i) => Math.max(0, i - 1));
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
              {/* 색인 도큐먼트 raw — embedding 제외 전 필드(메타
                  라벨 포함). 올인원 색인이면 main_category/keywords
                  등이 동적으로 노출(사용자 결정 2026-05-21). */}
              <pre className="il-code">{renderRawDoc(cur)}</pre>

              {/* 임베딩 — 압축 요약 + 더보기 토글. 1536-d raw 는
                  화면 도배라 기본은 차원+앞 8개, "더보기" 누르면
                  전체 벡터 펼침(사용자 결정 2026-05-21). */}
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    embedding
                  </span>
                  {cur.embedding && cur.embedding.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEmbedExpanded((v) => !v)}
                      style={{
                        appearance: "none",
                        border: "1px solid var(--t-neutral-8)",
                        background: "var(--surface-default)",
                        borderRadius: 6,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--blue-700)",
                        cursor: "pointer",
                      }}
                    >
                      {embedExpanded
                        ? "접기"
                        : `더보기 (전체 ${(
                            cur.embedding_dim ?? cur.embedding.length
                          ).toLocaleString()}개)`}
                    </button>
                  )}
                </div>
                <pre className="il-code" style={{ marginTop: 0 }}>
                  {embedExpanded && cur.embedding
                    ? embedFull(cur.embedding)
                    : embedSummary(cur.embedding, cur.embedding_dim)}
                </pre>
              </div>
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
              onClick={goPrev}
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

"use client";

import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * DataLoadView — CSV → SQLite 데이터 적재 (Text-to-SQL 실습 준비).
 *
 * IndexLabView(검색 색인)의 SQL 버전 — 동일 UX 패턴:
 *  - 도메인 택1 → GitHub raw CSV fetch → SQLite 테이블 적재
 *  - 적재 진행 SSE 실시간 로그
 *  - 적재된 테이블 현황·초기화(도메인별, 확인 모달)
 * 검색 색인과 다른 점: 파라미터가 "적재 행수 상한" 하나뿐
 * (토크나이저·임베딩은 SQL 적재에 무의미). 색인은 OpenSearch,
 * 여기는 SQLite — 적재 후 검색 실습의 Text-to-SQL 이 질의한다.
 * 디자인: cf-* 클래스(검색·라벨링 그룹 = blue). 버튼 우측 정렬.
 */

const DOMAINS = [
  {
    id: "sangkwon",
    label: "상권 / 소상공인",
    audience: "유통·소상공인",
    sample: "강남구에서 카페가 가장 많은 행정동 상위 5곳은?",
  },
  {
    id: "medical",
    label: "의료 / 제약",
    audience: "의료·제약",
    sample: "전문의약품을 가장 많이 보유한 업체 상위 10곳은?",
  },
  {
    id: "finance",
    label: "금융 / 연금 / 고용",
    audience: "금융·투자",
    sample: "가입자 수가 가장 많은 사업장 업종 상위 10개는?",
  },
  {
    id: "legal",
    label: "법률 / 법령",
    audience: "법률·규제",
    sample: "소관부처별 법령 개수를 많은 순으로 보여줘",
  },
  {
    id: "policy",
    label: "정책 / 거버넌스",
    audience: "공공·정책",
    sample: "기관별 예산 총액을 큰 순으로 보여줘",
  },
] as const;

const ROW_LIMITS = [1000, 5000, 10000, 20000] as const;

interface TableInfo {
  domain: string;
  label: string;
  table: string;
  loaded: boolean;
  rowCount: number;
}

interface Preview {
  columns: string[];
  rows: string[][];
  totalNote: string;
}

const card: CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  marginBottom: 16,
};
const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-default)",
  marginBottom: 10,
};
const chipRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const btnRow: CSSProperties = {
  marginTop: 16,
  display: "flex",
  justifyContent: "flex-end",
};
const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-subtle)",
  marginBottom: 6,
};

export function DataLoadView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [limit, setLimit] = useState<number>(10000);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // 데이터 보기 모달(적재 전 CSV 앞 N행 미리보기 — index-lab 패턴)
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const r = await fetch("/api/sql-lab/tables");
      const d = await r.json();
      setTables(Array.isArray(d.tables) ? d.tables : []);
    } catch {
      setTables([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetch("/api/sql-lab/tables").catch(() => null);
      if (!alive || !r) return;
      const d = await r.json().catch(() => ({}));
      if (alive) setTables(Array.isArray(d.tables) ? d.tables : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function runLoad(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setErr(null);
    setLog([`▶ ${domain} 적재 시작… (상한 ${limit.toLocaleString()}행)`]);
    try {
      const res = await fetch("/api/sql-lab/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, limit }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `적재 실패 (HTTP ${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "start")
            setLog((l) => [...l, `· CSV fetch: ${ev.url}`]);
          else if (ev.type === "fetched")
            setLog((l) => [...l, `· ${ev.total.toLocaleString()}행 수신 — 테이블 생성`]);
          else if (ev.type === "progress")
            setLog((l) => [
              ...l.slice(0, -1).filter((x) => !x.startsWith("  ")),
              `  ${ev.loaded.toLocaleString()}/${ev.total.toLocaleString()} 적재 중…`,
            ]);
          else if (ev.type === "done")
            setLog((l) => [
              ...l,
              `✓ 완료: ${ev.loaded.toLocaleString()}행 → 테이블 ${ev.table}`,
            ]);
          else if (ev.type === "error") setErr(ev.message);
        }
      }
      await loadTables();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  async function dropDomain(d: string): Promise<void> {
    setConfirmDel(null);
    try {
      const r = await fetch("/api/sql-lab/tables", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? `초기화 실패 (HTTP ${r.status})`);
        return;
      }
      await loadTables();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  async function openPreview(): Promise<void> {
    setShowPreview(true);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const r = await fetch(
        `/api/sql-lab/preview?domain=${domain}&rows=20`,
      );
      const d = await r.json();
      if (r.ok && Array.isArray(d.columns)) {
        setPreview({
          columns: d.columns,
          rows: d.rows ?? [],
          totalNote: d.totalNote ?? "",
        });
      } else {
        setErr(d.error ?? `미리보기 실패 (HTTP ${r.status})`);
        setShowPreview(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
      setShowPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  const cur = DOMAINS.find((d) => d.id === domain);

  return (
    <div
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text-default)",
            marginBottom: 4,
          }}
        >
          데이터 적재 — Text-to-SQL 준비
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-subtle)",
            marginBottom: 20,
          }}
        >
          GitHub public CSV 를 받아 SQLite 테이블로 적재합니다(검색
          실습의 Text-to-SQL 이 이 테이블을 질의). 도메인을 골라
          적재한 뒤, 검색 실습에서 자연어로 물어보세요.
        </p>

        <div style={card}>
          <div style={sectionTitle}>① 적재할 도메인 선택</div>
          <div style={chipRow}>
            {DOMAINS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="cf-pill"
                aria-pressed={domain === d.id}
                onClick={() => setDomain(d.id)}
                title={d.audience}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="cf-btn"
              style={{ height: 26, padding: "0 12px", fontSize: 11.5 }}
              onClick={openPreview}
            >
              데이터 보기
            </button>
            {cur && (
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--text-subtle)",
                  lineHeight: 1.6,
                }}
              >
                질의 예시:{" "}
                <span style={{ color: "var(--cf-soft-text)" }}>
                  “{cur.sample}”
                </span>
              </span>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={sectionTitle}>② 적재 행수 상한</div>
          <div style={fieldLabel}>
            큰 도메인(상권 1만 · 의료/금융 2만)은 메모리·시간 절약을
            위해 상한을 둡니다.
          </div>
          <div style={chipRow}>
            {ROW_LIMITS.map((c) => (
              <button
                key={c}
                type="button"
                className="cf-pill"
                aria-pressed={limit === c}
                onClick={() => setLimit(c)}
                disabled={loading}
              >
                {c.toLocaleString()}행
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...btnRow, marginBottom: 16 }}>
          <button
            type="button"
            onClick={runLoad}
            disabled={loading}
            className="cf-btn cf-btn--primary"
          >
            {loading ? "적재 중…" : "이 도메인 적재 시작"}
          </button>
        </div>

        {err && (
          <div
            style={{
              ...card,
              borderColor: "var(--t-danger-8, #e5484d)",
              color: "var(--t-danger-11, #e5484d)",
              fontSize: 12.5,
            }}
          >
            ⚠️ {err}
          </div>
        )}

        {log.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>진행 상황</div>
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                fontSize: 11,
                lineHeight: 1.55,
                color: "var(--text-subtle)",
                background: "var(--cf-soft-bg)",
                borderRadius: "var(--r-md, 8px)",
                whiteSpace: "pre-wrap",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {log.join("\n")}
            </pre>
          </div>
        )}

        <div style={card}>
          <div style={sectionTitle}>적재된 테이블</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tables.map((t) => (
              <div
                key={t.domain}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  border: "1px solid var(--t-neutral-8)",
                  borderRadius: "var(--r-md, 8px)",
                  fontSize: 12.5,
                  opacity: t.loaded ? 1 : 0.5,
                }}
              >
                <span style={{ color: "var(--text-default)" }}>
                  <strong>{t.label}</strong>
                  <span
                    style={{ marginLeft: 8, color: "var(--text-subtle)" }}
                  >
                    {t.loaded
                      ? `${t.table} · ${t.rowCount.toLocaleString()}행`
                      : "미적재"}
                  </span>
                </span>
                {t.loaded && (
                  <button
                    type="button"
                    className="cf-btn"
                    style={{ height: 28, padding: "0 12px", fontSize: 12 }}
                    onClick={() => setConfirmDel(t.domain)}
                  >
                    초기화
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmDel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setConfirmDel(null)}
        >
          <div
            style={{ ...card, maxWidth: 380, margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={sectionTitle}>테이블 초기화 확인</div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-subtle)",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              <strong style={{ color: "var(--text-default)" }}>
                {DOMAINS.find((d) => d.id === confirmDel)?.label ??
                  confirmDel}
              </strong>{" "}
              테이블을 삭제합니다. Text-to-SQL 로 질의하려면 다시
              적재해야 합니다. 계속할까요?
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="cf-btn"
                onClick={() => setConfirmDel(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                onClick={() => void dropDomain(confirmDel)}
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 데이터 보기 — 적재 전 CSV 앞 20행 표 미리보기.
          index-lab "문서 원본 보기" 의 표(CSV) 버전. */}
      {showPreview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setShowPreview(false)}
        >
          <div
            style={{
              background: "var(--surface-default)",
              border: "1px solid var(--t-neutral-8)",
              borderRadius: "var(--r-lg, 14px)",
              width: "min(960px, 100%)",
              maxHeight: "86vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
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
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "var(--text-default)",
                  }}
                >
                  {cur?.label ?? domain} — 데이터 미리보기
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-subtle)",
                    marginTop: 3,
                  }}
                >
                  {preview?.totalNote ??
                    (previewLoading ? "불러오는 중…" : "")}{" "}
                  · 적재 전 GitHub 원본 CSV
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
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
                ×
              </button>
            </div>
            <div
              className="thin-scroll"
              style={{ overflow: "auto", padding: 16, minHeight: 160 }}
            >
              {previewLoading ? (
                <div
                  style={{ fontSize: 12, color: "var(--text-subtle)" }}
                >
                  ▶ CSV 원본을 불러오는 중…
                </div>
              ) : preview ? (
                <table
                  style={{
                    borderCollapse: "collapse",
                    fontSize: 11,
                    width: "100%",
                  }}
                >
                  <thead>
                    <tr>
                      {preview.columns.map((c) => (
                        <th
                          key={c}
                          style={{
                            textAlign: "left",
                            padding: "6px 10px",
                            borderBottom:
                              "2px solid var(--t-neutral-8)",
                            color: "var(--text-default)",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            position: "sticky",
                            top: 0,
                            background: "var(--surface-default)",
                          }}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: "5px 10px",
                              borderBottom:
                                "1px solid var(--t-neutral-8)",
                              color: "var(--text-subtle)",
                              whiteSpace: "nowrap",
                              maxWidth: 260,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={cell}
                          >
                            {cell === "" ? "—" : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div
                  style={{ fontSize: 12, color: "var(--text-subtle)" }}
                >
                  표시할 데이터가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

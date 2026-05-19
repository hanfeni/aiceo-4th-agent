"use client";

import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CorpusModal, type CorpusDocItem } from "./CorpusModal";

/**
 * IndexLabView — 도메인 색인 실습 (검색 실습과 별도 메뉴).
 *
 * 기능(2026-05-19 사용자 추가):
 *  - 색인 파라미터 노출: Nori decompound_mode / 임베딩 모델 / 문서 수.
 *    문서 수는 원본 총 N개를 먼저 알려주고(corpus-count) 그 안에서 선택.
 *  - 색인된 인덱스 확인·삭제(실습용 searchlab-* 만, 삭제 전 확인 모달).
 * 흐름: 버튼 → ①GitHub raw 원격확인 → ②Docker·OS 확인 → ③없으면
 *   자동 실행 → ④토크나이징·임베딩·색인. 진행 SSE 실시간.
 * 디자인: cf-* 클래스(검색·라벨링 그룹 = blue). 버튼 우측 정렬.
 */

const DOMAINS = [
  { id: "sangkwon", label: "상권 / 소상공인", audience: "유통·소상공인" },
  { id: "medical", label: "의료 / 제약", audience: "의료·제약" },
  { id: "finance", label: "금융 / 연금 / 고용", audience: "금융·투자" },
  { id: "legal", label: "법률 / 법령", audience: "법률·규제" },
  { id: "policy", label: "정책 / 거버넌스", audience: "공공·정책" },
] as const;

const DECOMPOUND = [
  { id: "mixed", label: "mixed (복합어+원형 둘 다)" },
  { id: "discrete", label: "discrete (구성어만)" },
  { id: "none", label: "none (분해 안 함)" },
] as const;

const EMBED = [
  { id: "text-embedding-3-small", label: "3-small (1536d · 저렴)" },
  { id: "text-embedding-3-large", label: "3-large (3072d · 고품질)" },
] as const;

const DOC_COUNTS = [100, 300, 500, 1000] as const;

// 청크 옵션(토큰, cl100k). 0 = 청킹 안 함(디폴트 — 사용자 결정
// 2026-05-19: 청크 자체를 안 하는 게 기본). >0 면 토큰 단위 분할.
const CHUNK_SIZES = [
  { v: 0, label: "안 함 (문서=1벡터)" },
  { v: 256, label: "256토큰" },
  { v: 512, label: "512토큰" },
  { v: 1000, label: "1000토큰" },
] as const;
const CHUNK_OVERLAPS = [0, 100, 200] as const;

interface IndexInfo {
  index: string;
  domain?: string;
  docCount: number;
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
  justifyContent: "flex-end", // 버튼 우측 정렬(사용자 요청)
};
const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-subtle)",
  marginBottom: 6,
};

export function IndexLabView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [decompound, setDecompound] = useState<string>("mixed");
  const [embedModel, setEmbedModel] = useState<string>(
    "text-embedding-3-small",
  );
  const [limit, setLimit] = useState<number>(300);
  const [total, setTotal] = useState<number | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexLog, setIndexLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [indices, setIndices] = useState<IndexInfo[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // 원본 문서 보기 모달(앞 50건 좌우 네비)
  const [showCorpus, setShowCorpus] = useState(false);
  const [corpusDocs, setCorpusDocs] = useState<CorpusDocItem[]>([]);
  const [corpusLoading, setCorpusLoading] = useState(false);

  // 도메인 선택 시 원본 총 개수 조회. setState 는 async 경계(await)
  // 뒤에서만 — effect 본문 동기 setState 금지(cascading render) 준수.
  // domain 바뀌면 이전 total 은 새 응답이 덮으므로 별도 초기화 불요.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/search-lab/corpus-count?domain=${domain}`,
        );
        const d = await r.json();
        if (alive && typeof d.total === "number") setTotal(d.total);
      } catch {
        /* 무시 — total null 유지(조회 중 표시) */
      }
    })();
    return () => {
      alive = false;
    };
  }, [domain]);

  const loadIndices = useCallback(async () => {
    try {
      const r = await fetch("/api/search-lab/indices");
      const d = await r.json();
      setIndices(Array.isArray(d.indices) ? d.indices : []);
    } catch {
      setIndices([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetch("/api/search-lab/indices").catch(() => null);
      if (!alive || !r) return;
      const d = await r.json().catch(() => ({}));
      if (alive) setIndices(Array.isArray(d.indices) ? d.indices : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function openCorpus(): Promise<void> {
    setShowCorpus(true);
    setCorpusLoading(true);
    setCorpusDocs([]);
    try {
      const r = await fetch(
        `/api/search-lab/corpus?domain=${domain}&limit=50`,
      );
      const d = await r.json();
      if (r.ok && Array.isArray(d.items)) setCorpusDocs(d.items);
      else setErr(d.error ?? `원본 조회 실패 (HTTP ${r.status})`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setCorpusLoading(false);
    }
  }

  async function runIndex(): Promise<void> {
    if (indexing) return;
    setIndexing(true);
    setErr(null);
    setIndexLog([`▶ ${domain} 색인 시작… (limit ${limit})`]);
    try {
      const res = await fetch("/api/search-lab/index", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          limit,
          decompoundMode: decompound,
          embedModel,
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `색인 실패 (HTTP ${res.status})`);
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
            setIndexLog((l) => [...l, `· GitHub fetch: ${ev.url}`]);
          else if (ev.type === "fetched")
            setIndexLog((l) => [...l, `· ${ev.total}건 수신`]);
          else if (ev.type === "infra")
            setIndexLog((l) => [...l, `· ${ev.text}`]);
          else if (ev.type === "infra_log")
            setIndexLog((l) => [...l, `    ${ev.text}`]);
          else if (ev.type === "infra_error")
            setIndexLog((l) => [...l, `  ⚠ ${ev.text}`]);
          else if (ev.type === "progress")
            setIndexLog((l) => [
              ...l.slice(0, -1).filter((x) => !x.startsWith("  ")),
              `  ${ev.indexed}/${ev.total} 색인 중…`,
            ]);
          else if (ev.type === "done")
            setIndexLog((l) => [
              ...l,
              `✓ 완료: ${ev.indexed}건 → 인덱스 ${ev.index}`,
            ]);
          else if (ev.type === "error") setErr(ev.message);
        }
      }
      await loadIndices(); // 색인 후 목록 갱신
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setIndexing(false);
    }
  }

  async function deleteIndex(name: string): Promise<void> {
    setConfirmDel(null);
    try {
      const r = await fetch("/api/search-lab/indices", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: name }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? `삭제 실패 (HTTP ${r.status})`);
        return;
      }
      await loadIndices();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

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
          도메인 색인 — 검색 데이터 준비
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-subtle)",
            marginBottom: 20,
          }}
        >
          GitHub public 문서를 받아 OpenSearch 에 색인합니다(검색 전 1회).
          토크나이저·임베딩·문서 수를 골라 색인 방식을 비교해 보세요.
        </p>

        <div style={card}>
          <div style={sectionTitle}>① 색인할 도메인 선택</div>
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
              marginTop: 10,
              fontSize: 11.5,
              color: "var(--text-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>
              원본 문서 총{" "}
              <strong style={{ color: "var(--cf-soft-text)" }}>
                {total === null
                  ? "조회 중…"
                  : `${total.toLocaleString()}개`}
              </strong>
              {total !== null &&
                total < limit &&
                " (선택 수보다 적어 전체 색인)"}
            </span>
            <button
              type="button"
              className="cf-btn"
              style={{ height: 26, padding: "0 12px", fontSize: 11.5 }}
              onClick={openCorpus}
              disabled={total === null}
            >
              문서 원본 보기
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={sectionTitle}>② 색인 파라미터</div>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 240px" }}>
              <div style={fieldLabel}>Nori 복합어 분해 (토크나이저)</div>
              <select
                className="cf-field cf-select"
                style={{ width: "100%" }}
                value={decompound}
                onChange={(e) => setDecompound(e.target.value)}
                disabled={indexing}
              >
                {DECOMPOUND.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <div style={fieldLabel}>임베딩 모델</div>
              <select
                className="cf-field cf-select"
                style={{ width: "100%" }}
                value={embedModel}
                onChange={(e) => setEmbedModel(e.target.value)}
                disabled={indexing}
              >
                {EMBED.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={fieldLabel}>색인할 문서 수 (상한)</div>
            <div style={chipRow}>
              {DOC_COUNTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="cf-pill"
                  aria-pressed={limit === c}
                  onClick={() => setLimit(c)}
                  disabled={indexing}
                >
                  {c.toLocaleString()}건
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 실행 버튼 — 설정 카드 밖 독립 줄(설정 ≠ 액션 시각 분리,
            사용자 요청). 우측 정렬 유지. */}
        <div style={{ ...btnRow, marginBottom: 16 }}>
          <button
            type="button"
            onClick={runIndex}
            disabled={indexing}
            className="cf-btn cf-btn--primary"
          >
            {indexing ? "색인 중…" : "이 도메인 색인 시작"}
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

        {indexLog.length > 0 && (
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
              {indexLog.join("\n")}
            </pre>
          </div>
        )}

        <div style={card}>
          <div style={sectionTitle}>색인된 인덱스 (실습용)</div>
          {indices.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "var(--text-subtle)" }}
            >
              아직 색인된 실습 인덱스가 없습니다. 위에서 색인하세요.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {indices.map((ix) => (
                <div
                  key={ix.index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    border: "1px solid var(--t-neutral-8)",
                    borderRadius: "var(--r-md, 8px)",
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: "var(--text-default)" }}>
                    <strong>{ix.index}</strong>
                    <span
                      style={{
                        marginLeft: 8,
                        color: "var(--text-subtle)",
                      }}
                    >
                      {ix.docCount.toLocaleString()}건
                    </span>
                  </span>
                  <button
                    type="button"
                    className="cf-btn"
                    style={{ height: 28, padding: "0 12px", fontSize: 12 }}
                    onClick={() => setConfirmDel(ix.index)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 삭제 확인 모달 (오클릭 방지) */}
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
            style={{
              ...card,
              maxWidth: 380,
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={sectionTitle}>인덱스 삭제 확인</div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-subtle)",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              <strong style={{ color: "var(--text-default)" }}>
                {confirmDel}
              </strong>{" "}
              인덱스를 삭제합니다. 검색하려면 다시 색인해야 합니다.
              계속할까요?
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
                onClick={() => void deleteIndex(confirmDel)}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {showCorpus && (
        <CorpusModal
          domainLabel={
            DOMAINS.find((d) => d.id === domain)?.label ?? domain
          }
          docs={corpusDocs}
          loading={corpusLoading}
          onClose={() => setShowCorpus(false)}
        />
      )}
    </div>
  );
}

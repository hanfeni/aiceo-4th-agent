"use client";

import {
  useState,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PipelineGraph } from "@/components/common/PipelineGraph";
import type { StageStatus, StageIO } from "@/components/common/pipelineNodes";
import {
  RAG_STAGE_NODES,
  RAG_STEP_TO_STAGE,
} from "./ragStageNodes";
import { RagStageModal } from "./RagStageModal";

/**
 * SearchLabView — 검색 실습 화면 (client).
 *
 * 학생이 ①5개 인덱스 택1 ②방식 ③검색어 + 검색/RAG 를 골라 실행.
 *  - 검색 : 즉시 top-N 결과 (단발 fetch, 무변경)
 *  - RAG  : 검색 → LLM 해석. 노드 그래프(검색→해석→완료) + 클릭
 *    모달 + 근거 리스트 + 답변 토큰 스트리밍 (사용자 결정 2026-05-19)
 *
 * 디자인: HarnessView·메타랩 동일 토큰. 검색은 단발 JSON, RAG 는
 * 메타랩 SSE 패턴 동형(/api/search-lab/rag).
 */

const DOMAINS = [
  { id: "sangkwon", label: "상권 / 소상공인", audience: "유통·소상공인" },
  { id: "medical", label: "의료 / 제약", audience: "의료·제약" },
  { id: "finance", label: "금융 / 연금 / 고용", audience: "금융·투자" },
  { id: "legal", label: "법률 / 법령", audience: "법률·규제" },
  { id: "policy", label: "정책 / 거버넌스", audience: "공공·정책" },
] as const;

const MODES = [
  { id: "lexical", label: "렉시컬 (BM25·Nori)", hint: "키워드 정확 매칭" },
  { id: "vector", label: "벡터 (임베딩)", hint: "의미 유사도" },
  { id: "hybrid", label: "하이브리드", hint: "둘 결합" },
] as const;

const HYBRID_METHODS = [
  { id: "default", label: "디폴트 (점수 가중 결합)" },
  { id: "rrf", label: "RRF (순위 결합)" },
] as const;

// 검색어 옆 동작 선택 (다른 섹션과 동일 chip 패턴)
const TASK_MODES = [
  { id: "search", label: "검색", hint: "top-N 결과만 (즉시)" },
  { id: "rag", label: "RAG", hint: "검색 근거로 LLM 답변 생성" },
] as const;

// 결과 개수(top-N). RAG 는 컨텍스트 비용상 서버가 ragTopK 상한
// (10)으로 clamp — 50 선택해도 RAG 컨텍스트엔 10건만.
const TOP_RANKS = [5, 10, 20, 50] as const;

interface Hit {
  doc_id: string;
  title: string;
  snippet: string;
  score: number;
  via?: string[];
}

/** 빈 stageIO 레코드 (RAG 3단계 모두 idle) — 실행마다 리셋 */
function emptyRagIO(): Record<number, StageIO> {
  const r: Record<number, StageIO> = {};
  for (const n of RAG_STAGE_NODES) r[n.stage] = { status: "idle" };
  return r;
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

// chip/input/버튼은 globals.css 의 .cf-pill / .cf-field / .cf-btn
// 클래스로 통일(인라인 한계인 hover/focus-within ring 을 클래스로
// 재현 — medigate Control Atoms 정합, 4메뉴 동일).

export function SearchLabView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<string>("hybrid");
  const [hybridMethod, setHybridMethod] = useState<string>("default");
  const [topK, setTopK] = useState<number>(10);
  const [taskMode, setTaskMode] = useState<string>("search");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // RAG 전용 상태
  const [ragSystem, setRagSystem] = useState<string>("");
  const [ragAnswer, setRagAnswer] = useState<string>("");
  const [ragIO, setRagIO] = useState<Record<number, StageIO>>(emptyRagIO);
  const [openStage, setOpenStage] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 도메인별 색인 상태(문서 수). null=미색인, 숫자=색인됨 N건.
  // 색인 자체는 별도 /index-lab 메뉴 — 여기선 chip 에 상태만 표기.
  // (2026-05-19 사용자 결정). 미색인 검색 시 API 가 503 안내.
  const [status, setStatus] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/search-lab/status")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.status) setStatus(d.status);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function runSearch(): Promise<void> {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/search-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          query: q,
          mode,
          topK,
          ...(mode === "hybrid" ? { hybridMethod } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? `검색 실패 (HTTP ${res.status})`);
        setHits([]);
        return;
      }
      setHits(data.hits ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  /** RAG: 메타랩 SSE 패턴 — 검색→해석→완료 그래프 + 답변 스트리밍 */
  async function runRagFlow(): Promise<void> {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setErr(null);
    setHits([]);
    setRagSystem("");
    setRagAnswer("");
    setRagIO(emptyRagIO());
    setOpenStage(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/search-lab/rag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          query: q,
          mode,
          topK,
          // RAG 컨텍스트는 비용상 최대 10건 (topK 50 골라도 clamp).
          // 검색 자체는 topK 만큼 — 근거 리스트엔 topK 건 표시.
          ragTopK: Math.min(topK, 10),
          ...(mode === "hybrid" ? { hybridMethod } : {}),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `RAG 실패 (HTTP ${res.status})`);
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
          if (ev.type === "system") {
            setRagSystem(ev.text);
          } else if (ev.type === "stage_start") {
            const st = RAG_STEP_TO_STAGE[ev.step];
            if (st)
              setRagIO((s) => ({
                ...s,
                [st]: { ...s[st], status: "running" },
              }));
          } else if (ev.type === "stage_io") {
            const st = RAG_STEP_TO_STAGE[ev.step];
            if (st)
              setRagIO((s) => ({
                ...s,
                [st]: {
                  status: "done",
                  input: ev.input,
                  output: ev.output,
                },
              }));
          } else if (ev.type === "hits") {
            setHits(ev.hits ?? []);
          } else if (ev.type === "token") {
            setRagAnswer((a) => a + ev.text);
          } else if (ev.type === "error") {
            setErr(ev.message);
            // 진행 중이던 단계 error 로 (마지막 running)
            setRagIO((s) => {
              const next = { ...s };
              for (const n of RAG_STAGE_NODES) {
                if (next[n.stage]?.status === "running") {
                  next[n.stage] = { ...next[n.stage], status: "error" };
                }
              }
              return next;
            });
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setErr(e instanceof Error ? e.message : "네트워크 오류");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  /** 검색/RAG 디스패치 (칩 선택에 따라) */
  function execute(): void {
    if (taskMode === "rag") void runRagFlow();
    else void runSearch();
  }

  function stop(): void {
    abortRef.current?.abort();
    setLoading(false);
  }

  const isRag = taskMode === "rag";
  // RAG 그래프 노드 상태(stage→status). ragIO 에서 파생.
  const ragStates: Record<number, StageStatus> = {};
  for (const n of RAG_STAGE_NODES) {
    ragStates[n.stage] = ragIO[n.stage]?.status ?? "idle";
  }

  return (
    // layout.tsx 가 overflow:hidden + 100dvh → 페이지가 자체 스크롤
    // 컨테이너여야 콘텐츠가 길어도 잘리지 않음(ChatPanel 선례와 동일
    // 패턴). 얇은 스크롤바는 기존 .thin-scroll 재사용(medigate-manager
    // 와 동일한 thin scrollbar 의도).
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
        검색 실습 — 렉시컬 · 벡터 · 하이브리드
      </h1>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--text-subtle)",
          marginBottom: 20,
        }}
      >
        5개 도메인 인덱스에서 세 가지 검색 방식의 결과 차이를 직접
        비교합니다. (OpenSearch + Nori + OpenAI 임베딩)
      </p>

      <div style={card}>
        <div style={sectionTitle}>① 인덱스 (도메인) 선택</div>
        <div style={chipRow}>
          {DOMAINS.map((d) => {
            // status[d.id]: 숫자=색인됨 N건 / null·undefined=미색인
            const cnt = status[d.id];
            const indexed = typeof cnt === "number";
            return (
              <button
                key={d.id}
                type="button"
                className="cf-pill"
                aria-pressed={domain === d.id}
                onClick={() => setDomain(d.id)}
                title={
                  indexed
                    ? `${d.audience} · 색인됨 ${cnt}건`
                    : `${d.audience} · 미색인 (도메인 색인 메뉴에서 먼저)`
                }
              >
                {d.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    color: indexed
                      ? "var(--cf-soft-text)"
                      : "var(--text-subtle)",
                    opacity: 0.85,
                  }}
                >
                  {indexed ? `${cnt}건` : "미색인"}
                </span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 11.5,
            color: "var(--text-subtle)",
            lineHeight: 1.6,
          }}
        >
          검색하려면 이 도메인이 먼저 색인돼 있어야 합니다. 아직
          색인 전이면{" "}
          <a
            href="/index-lab"
            style={{
              color: "var(--blue-700)",
              fontWeight: 700,
              textDecoration: "underline",
            }}
          >
            도메인 색인 메뉴
          </a>
          에서 색인을 진행하세요(검색 전 1회).
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>② 검색 방식</div>
        <div style={chipRow}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cf-pill"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "hybrid" && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginBottom: 8,
              }}
            >
              하이브리드 결합 방식
            </div>
            <div style={chipRow}>
              {HYBRID_METHODS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="cf-pill"
                  aria-pressed={hybridMethod === h.id}
                  onClick={() => setHybridMethod(h.id)}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-subtle)",
              marginBottom: 8,
            }}
          >
            TOP RANK (결과 개수)
            {isRag ? " — RAG 컨텍스트는 최대 10건" : ""}
          </div>
          <div style={chipRow}>
            {TOP_RANKS.map((k) => (
              <button
                key={k}
                type="button"
                className="cf-pill"
                aria-pressed={topK === k}
                onClick={() => setTopK(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>③ 검색어</div>
        <div style={{ ...chipRow, marginBottom: 12 }}>
          {TASK_MODES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="cf-pill"
              aria-pressed={taskMode === t.id}
              onClick={() => setTaskMode(t.id)}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) execute();
            }}
            placeholder={
              isRag
                ? "질문을 입력하고 Enter (검색 근거로 LLM 답변)"
                : "검색어를 입력하고 Enter"
            }
            className="cf-field"
            style={{ flex: 1 }}
          />
          {loading ? (
            <button
              type="button"
              onClick={isRag ? stop : undefined}
              disabled={!isRag}
              className="cf-btn"
              title={isRag ? "중지" : "검색 중"}
            >
              {isRag ? "중지" : "검색 중…"}
            </button>
          ) : (
            <button
              type="button"
              onClick={execute}
              disabled={!query.trim()}
              className="cf-btn cf-btn--primary"
            >
              {isRag ? "RAG 실행" : "검색"}
            </button>
          )}
        </div>
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

      {/* RAG: 노드 그래프(검색→해석→완료) + 클릭 모달.
          메타랩·DART 와 동일 공용 PipelineGraph 재활용. */}
      {isRag && (ragSystem || ragAnswer || hits.length > 0) && (
        <div style={card}>
          <div style={sectionTitle}>
            RAG 파이프라인 (노드를 클릭하면 입력·출력 확인)
          </div>
          <PipelineGraph
            stageNodes={RAG_STAGE_NODES}
            stageStates={ragStates}
            onStageClick={(st) => setOpenStage(st)}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--text-subtle)",
              lineHeight: 1.6,
            }}
          >
            {RAG_STAGE_NODES.map((n) => (
              <div key={n.stage}>
                <strong>
                  {n.stage}. {n.label}
                </strong>{" "}
                — {n.hint}
              </div>
            ))}
          </div>
        </div>
      )}

      {isRag && ragSystem && (
        <div style={{ ...card, background: "var(--t-blue-6)" }}>
          <div style={sectionTitle}>
            🛈 RAG 시스템 인스트럭션 (LLM 에게 주는 지시 — 실습 핵심)
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 11.5,
              lineHeight: 1.55,
              color: "var(--text-subtle)",
              margin: 0,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {ragSystem}
          </pre>
        </div>
      )}

      {/* RAG 순서: 그래프 → 시스템 → 검색 근거(접힘) → LLM 답변.
          근거 먼저 → 그 근거로 답변(retrieval→generation 인과
          그대로). 근거는 기본 폴딩, 접힘 시 메타(제목·score·via)
          만 — 펴면 스니펫. (사용자 결정 2026-05-19) */}
      {isRag && hits.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>
            검색 근거 ({hits.length}건) — {mode}
            {mode === "hybrid" ? ` · ${hybridMethod}` : ""}
          </div>
          {hits.map((h, i) => (
            <details
              key={h.doc_id}
              style={{
                borderTop: "1px solid var(--t-neutral-8)",
                padding: "8px 0",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--text-default)",
                  listStyle: "none",
                }}
              >
                [{i + 1}] {h.title}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: "var(--text-subtle)",
                  }}
                >
                  score {h.score.toFixed(4)}
                  {h.via ? ` · ${h.via.join("+")}` : ""}
                </span>
              </summary>
              <div
                style={{
                  marginTop: 6,
                  color: "var(--text-subtle)",
                  lineHeight: 1.5,
                  fontSize: 12,
                }}
              >
                {h.snippet}…
              </div>
            </details>
          ))}
        </div>
      )}

      {isRag && ragAnswer && (
        <div style={card}>
          <div style={sectionTitle}>LLM 답변 (검색 근거 기반)</div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--text-default)",
              margin: 0,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {ragAnswer}
            {loading ? " ▌" : ""}
          </pre>
        </div>
      )}

      {/* 일반 검색: 기존 펼친 리스트 그대로 (무변경) */}
      {!isRag && hits.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>
            결과 ({hits.length}건) — {mode}
            {mode === "hybrid" ? ` · ${hybridMethod}` : ""}
          </div>
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {hits.map((h) => (
              <li
                key={h.doc_id}
                style={{
                  marginBottom: 14,
                  fontSize: 12.5,
                  color: "var(--text-default)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 3 }}>
                  {h.title}
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10.5,
                      fontWeight: 500,
                      color: "var(--text-subtle)",
                    }}
                  >
                    score {h.score.toFixed(4)}
                    {h.via ? ` · ${h.via.join("+")}` : ""}
                  </span>
                </div>
                <div
                  style={{ color: "var(--text-subtle)", lineHeight: 1.5 }}
                >
                  {h.snippet}…
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      </div>

      {/* RAG 노드 클릭 모달 (fixed overlay) */}
      {isRag && openStage != null && (() => {
        const meta = RAG_STAGE_NODES.find((n) => n.stage === openStage);
        if (!meta) return null;
        return (
          <RagStageModal
            key={openStage}
            meta={meta}
            io={ragIO[openStage] ?? { status: "idle" }}
            onClose={() => setOpenStage(null)}
          />
        );
      })()}
    </div>
  );
}

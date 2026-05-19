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
import { IndexDocsModal } from "./IndexDocsModal";
import {
  RAG_STAGE_NODES,
  RAG_STEP_TO_STAGE,
} from "./ragStageNodes";
import {
  T2S_STAGE_NODES,
  T2S_STEP_TO_STAGE,
} from "./text2sqlStageNodes";
import {
  T2SC_STAGE_NODES,
  T2SC_STEP_TO_STAGE,
} from "./text2sqlChartStageNodes";
import { ChartView } from "./ChartView";
import type { ChartSpec } from "@/lib/sqllab/text2sqlChart";
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
  {
    id: "text2sql",
    label: "Text-to-SQL",
    hint: "자연어 질문 → SQL 생성 → 적재 테이블 조회 (읽기 전용)",
  },
  {
    id: "text2sql-chart",
    label: "Text-to-SQL with Chart",
    hint: "자연어 → SQL → 실행 → LLM 이 결과를 차트로 시각화",
  },
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

/** 빈 stageIO 레코드 (Text-to-SQL 4단계 모두 idle) — 실행마다 리셋 */
function emptyT2sIO(): Record<number, StageIO> {
  const r: Record<number, StageIO> = {};
  for (const n of T2S_STAGE_NODES) r[n.stage] = { status: "idle" };
  return r;
}

/** 빈 stageIO 레코드 (with Chart 5단계 모두 idle) — 실행마다 리셋 */
function emptyT2scIO(): Record<number, StageIO> {
  const r: Record<number, StageIO> = {};
  for (const n of T2SC_STAGE_NODES) r[n.stage] = { status: "idle" };
  return r;
}

interface SqlResult {
  columns: string[];
  rows: unknown[][];
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
  // 인덱스 보기 모달 (색인된 문서 ◀ N/M ▶ 열람)
  const [showDocs, setShowDocs] = useState(false);
  const [taskMode, setTaskMode] = useState<string>("search");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // RAG 전용 상태
  const [ragSystem, setRagSystem] = useState<string>("");
  const [ragAnswer, setRagAnswer] = useState<string>("");
  const [ragIO, setRagIO] = useState<Record<number, StageIO>>(emptyRagIO);
  // Text-to-SQL 전용 상태 (RAG 와 동형)
  const [t2sSystem, setT2sSystem] = useState<string>("");
  const [t2sSql, setT2sSql] = useState<string>("");
  const [t2sResult, setT2sResult] = useState<SqlResult | null>(null);
  const [t2sIO, setT2sIO] = useState<Record<number, StageIO>>(emptyT2sIO);
  // Text-to-SQL with Chart 전용 상태 (Text-to-SQL + chartSpec)
  const [t2scSystem, setT2scSystem] = useState<string>("");
  const [t2scSql, setT2scSql] = useState<string>("");
  const [t2scResult, setT2scResult] = useState<SqlResult | null>(null);
  const [t2scChart, setT2scChart] = useState<ChartSpec | null>(null);
  const [t2scIO, setT2scIO] = useState<Record<number, StageIO>>(
    emptyT2scIO,
  );
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

  /**
   * Text-to-SQL: RAG SSE 패턴 동형 — 스키마→SQL생성→실행→완료
   * 그래프 + 생성 SQL + 결과 표. /api/search-lab/text2sql.
   */
  async function runText2SqlFlow(): Promise<void> {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setErr(null);
    setT2sSystem("");
    setT2sSql("");
    setT2sResult(null);
    setT2sIO(emptyT2sIO());
    setOpenStage(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/search-lab/text2sql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, question: q, maxRows: topK }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `Text-to-SQL 실패 (HTTP ${res.status})`);
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
            setT2sSystem(ev.text);
          } else if (ev.type === "stage_start") {
            const st = T2S_STEP_TO_STAGE[ev.step];
            if (st)
              setT2sIO((s) => ({
                ...s,
                [st]: { ...s[st], status: "running" },
              }));
          } else if (ev.type === "stage_io") {
            const st = T2S_STEP_TO_STAGE[ev.step];
            if (st)
              setT2sIO((s) => ({
                ...s,
                [st]: {
                  status: "done",
                  input: ev.input,
                  output: ev.output,
                },
              }));
          } else if (ev.type === "sql") {
            setT2sSql(ev.sql);
          } else if (ev.type === "rows") {
            setT2sResult({ columns: ev.columns, rows: ev.rows });
          } else if (ev.type === "error") {
            setErr(ev.message);
            setT2sIO((s) => {
              const next = { ...s };
              for (const n of T2S_STAGE_NODES) {
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

  /**
   * Text-to-SQL with Chart: runText2SqlFlow 동형 + chart 이벤트.
   * 스키마→SQL→실행→차트화(LLM) 5단계. /api/search-lab/text2sql-chart.
   * 기존 Text-to-SQL(runText2SqlFlow)은 무변경 — 별도 상태·엔드포인트.
   */
  async function runText2SqlChartFlow(): Promise<void> {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setErr(null);
    setT2scSystem("");
    setT2scSql("");
    setT2scResult(null);
    setT2scChart(null);
    setT2scIO(emptyT2scIO());
    setOpenStage(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/search-lab/text2sql-chart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, question: q, maxRows: topK }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `Text-to-SQL Chart 실패 (HTTP ${res.status})`);
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
            setT2scSystem(ev.text);
          } else if (ev.type === "stage_start") {
            const st = T2SC_STEP_TO_STAGE[ev.step];
            if (st)
              setT2scIO((s) => ({
                ...s,
                [st]: { ...s[st], status: "running" },
              }));
          } else if (ev.type === "stage_io") {
            const st = T2SC_STEP_TO_STAGE[ev.step];
            if (st)
              setT2scIO((s) => ({
                ...s,
                [st]: {
                  status: "done",
                  input: ev.input,
                  output: ev.output,
                },
              }));
          } else if (ev.type === "sql") {
            setT2scSql(ev.sql);
          } else if (ev.type === "rows") {
            setT2scResult({ columns: ev.columns, rows: ev.rows });
          } else if (ev.type === "chart") {
            setT2scChart(ev.spec);
          } else if (ev.type === "error") {
            setErr(ev.message);
            setT2scIO((s) => {
              const next = { ...s };
              for (const n of T2SC_STAGE_NODES) {
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

  /** 검색/RAG/Text-to-SQL/with Chart 디스패치 (칩 선택에 따라) */
  function execute(): void {
    if (taskMode === "rag") void runRagFlow();
    else if (taskMode === "text2sql") void runText2SqlFlow();
    else if (taskMode === "text2sql-chart") void runText2SqlChartFlow();
    else void runSearch();
  }

  function stop(): void {
    abortRef.current?.abort();
    setLoading(false);
  }

  const isRag = taskMode === "rag";
  const isT2s = taskMode === "text2sql";
  const isT2sc = taskMode === "text2sql-chart";
  // RAG 그래프 노드 상태(stage→status). ragIO 에서 파생.
  const ragStates: Record<number, StageStatus> = {};
  for (const n of RAG_STAGE_NODES) {
    ragStates[n.stage] = ragIO[n.stage]?.status ?? "idle";
  }
  // Text-to-SQL 그래프 노드 상태. t2sIO 에서 파생(RAG 와 동형).
  const t2sStates: Record<number, StageStatus> = {};
  for (const n of T2S_STAGE_NODES) {
    t2sStates[n.stage] = t2sIO[n.stage]?.status ?? "idle";
  }
  // with Chart 그래프 노드 상태(5단계). t2scIO 에서 파생.
  const t2scStates: Record<number, StageStatus> = {};
  for (const n of T2SC_STAGE_NODES) {
    t2scStates[n.stage] = t2scIO[n.stage]?.status ?? "idle";
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
            marginTop: 12,
            fontSize: 11.5,
            color: "var(--text-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>
            {typeof status[domain] === "number"
              ? `색인됨 ${status[domain]?.toLocaleString()}건`
              : "이 도메인은 아직 색인 전입니다"}
          </span>
          <button
            type="button"
            className="cf-btn"
            style={{ height: 26, padding: "0 12px", fontSize: 11.5 }}
            disabled={typeof status[domain] !== "number"}
            onClick={() => setShowDocs(true)}
            title={
              typeof status[domain] === "number"
                ? "색인된 문서를 하나씩 열람"
                : "미색인 — 도메인 색인 메뉴에서 먼저 색인하세요"
            }
          >
            인덱스 보기
          </button>
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
                : isT2s
                  ? "질문을 입력하고 Enter (자연어 → SQL → 적재 테이블 조회)"
                  : isT2sc
                    ? "질문을 입력하고 Enter (자연어 → SQL → 실행 → 차트 시각화)"
                    : "검색어를 입력하고 Enter"
            }
            className="cf-field"
            style={{ flex: 1 }}
          />
          {loading ? (
            <button
              type="button"
              onClick={isRag || isT2s || isT2sc ? stop : undefined}
              disabled={!(isRag || isT2s || isT2sc)}
              className="cf-btn"
              title={isRag || isT2s || isT2sc ? "중지" : "검색 중"}
            >
              {isRag || isT2s || isT2sc ? "중지" : "검색 중…"}
            </button>
          ) : (
            <button
              type="button"
              onClick={execute}
              disabled={!query.trim()}
              className="cf-btn cf-btn--primary"
            >
              {isRag
                ? "RAG 실행"
                : isT2s
                  ? "Text-to-SQL 실행"
                  : isT2sc
                    ? "차트 생성 실행"
                    : "검색"}
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

      {/* Text-to-SQL: 노드 그래프(스키마→SQL생성→실행→완료) +
          생성 SQL + 결과 표. RAG 와 동일 공용 PipelineGraph. */}
      {isT2s && (t2sSystem || t2sSql || t2sResult) && (
        <div style={card}>
          <div style={sectionTitle}>
            Text-to-SQL 파이프라인 (노드를 클릭하면 입력·출력 확인)
          </div>
          <PipelineGraph
            stageNodes={T2S_STAGE_NODES}
            stageStates={t2sStates}
            onStageClick={(st) => setOpenStage(st)}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--text-subtle)",
              lineHeight: 1.6,
            }}
          >
            {T2S_STAGE_NODES.map((n) => (
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

      {isT2s && t2sSystem && (
        <div style={{ ...card, background: "var(--t-blue-6)" }}>
          <div style={sectionTitle}>
            🛈 Text-to-SQL 시스템 인스트럭션 (LLM 에게 주는 지시 —
            읽기 전용 규칙 포함, 실습 핵심)
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
            {t2sSystem}
          </pre>
        </div>
      )}

      {isT2s && t2sSql && (
        <div style={card}>
          <div style={sectionTitle}>
            에이전트가 생성한 SQL (실행 전 — 읽기 전용 검증 통과분)
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--text-default)",
              margin: 0,
              padding: "12px 14px",
              background: "var(--cf-soft-bg)",
              borderRadius: "var(--r-md, 8px)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {t2sSql}
          </pre>
        </div>
      )}

      {isT2s && t2sResult && (
        <div style={card}>
          <div style={sectionTitle}>
            실행 결과 ({t2sResult.rows.length}행)
          </div>
          {t2sResult.rows.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              조건에 맞는 행이 없습니다. 질문을 바꿔 보세요.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  fontSize: 11.5,
                  width: "100%",
                }}
              >
                <thead>
                  <tr>
                    {t2sResult.columns.map((c) => (
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
                        }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t2sResult.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: "6px 10px",
                            borderBottom:
                              "1px solid var(--t-neutral-8)",
                            color: "var(--text-subtle)",
                            whiteSpace: "nowrap",
                            maxWidth: 280,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={cell == null ? "" : String(cell)}
                        >
                          {cell == null ? "—" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Text-to-SQL with Chart: 그래프(5단계) + 시스템 + SQL +
          결과 표 + LLM 이 고른 차트(Recharts). 기존 Text-to-SQL
          블록과 동형 + 차트 1블록. 표도 함께(차트↔원본 대조). */}
      {isT2sc && (t2scSystem || t2scSql || t2scResult) && (
        <div style={card}>
          <div style={sectionTitle}>
            Text-to-SQL with Chart 파이프라인 (노드 클릭 시 입출력)
          </div>
          <PipelineGraph
            stageNodes={T2SC_STAGE_NODES}
            stageStates={t2scStates}
            onStageClick={(st) => setOpenStage(st)}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--text-subtle)",
              lineHeight: 1.6,
            }}
          >
            {T2SC_STAGE_NODES.map((n) => (
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

      {isT2sc && t2scSystem && (
        <div style={{ ...card, background: "var(--t-blue-6)" }}>
          <div style={sectionTitle}>
            🛈 차트화 시스템 인스트럭션 (LLM 에게 ‘데이터→차트
            스펙’ 을 시키는 지시 — Text-to-SQL 과 다른 프롬프트)
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
            {t2scSystem}
          </pre>
        </div>
      )}

      {isT2sc && t2scSql && (
        <div style={card}>
          <div style={sectionTitle}>
            에이전트가 생성한 SQL (실행 전 — 읽기 전용 검증 통과분)
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--text-default)",
              margin: 0,
              padding: "12px 14px",
              background: "var(--cf-soft-bg)",
              borderRadius: "var(--r-md, 8px)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {t2scSql}
          </pre>
        </div>
      )}

      {isT2sc && t2scResult && (
        <div style={card}>
          <div style={sectionTitle}>
            실행 결과 ({t2scResult.rows.length}행) — 차트 원본 데이터
          </div>
          {t2scResult.rows.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              조건에 맞는 행이 없습니다. 질문을 바꿔 보세요.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  fontSize: 11.5,
                  width: "100%",
                }}
              >
                <thead>
                  <tr>
                    {t2scResult.columns.map((c) => (
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
                        }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t2scResult.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: "6px 10px",
                            borderBottom:
                              "1px solid var(--t-neutral-8)",
                            color: "var(--text-subtle)",
                            whiteSpace: "nowrap",
                            maxWidth: 280,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={cell == null ? "" : String(cell)}
                        >
                          {cell == null ? "—" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 차트는 마지막 — 원본 데이터(표)를 먼저 보고 그 데이터가
          차트로 시각화되는 인과 순서(사용자 결정). */}
      {isT2sc && t2scChart && t2scResult && (
        <div style={card}>
          <div style={sectionTitle}>
            LLM 이 고른 차트 ({t2scChart.chartType})
          </div>
          <ChartView
            spec={t2scChart}
            columns={t2scResult.columns}
            rows={t2scResult.rows}
          />
        </div>
      )}

      {/* 일반 검색: 기존 펼친 리스트 그대로 (무변경) */}
      {!isRag && !isT2s && !isT2sc && hits.length > 0 && (
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

      {/* Text-to-SQL 노드 클릭 모달 — RagStageModal 범용 재사용
          (StageNodeMeta+StageIO 만 받음, 도메인 중립). */}
      {isT2s && openStage != null && (() => {
        const meta = T2S_STAGE_NODES.find((n) => n.stage === openStage);
        if (!meta) return null;
        return (
          <RagStageModal
            key={openStage}
            meta={meta}
            io={t2sIO[openStage] ?? { status: "idle" }}
            onClose={() => setOpenStage(null)}
          />
        );
      })()}

      {/* with Chart 노드 클릭 모달 — 동일 RagStageModal 재사용. */}
      {isT2sc && openStage != null && (() => {
        const meta = T2SC_STAGE_NODES.find((n) => n.stage === openStage);
        if (!meta) return null;
        return (
          <RagStageModal
            key={openStage}
            meta={meta}
            io={t2scIO[openStage] ?? { status: "idle" }}
            onClose={() => setOpenStage(null)}
          />
        );
      })()}

      {/* 인덱스 보기 — 색인된 문서 ◀ N/M ▶ (50개씩 로드).
          key={domain} → 도메인 바뀌면 리마운트=페이지 0 리셋. */}
      {showDocs && (
        <IndexDocsModal
          key={domain}
          domain={domain}
          domainLabel={
            DOMAINS.find((d) => d.id === domain)?.label ?? domain
          }
          onClose={() => setShowDocs(false)}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import type {
  StageStatus,
  StageIO,
  StageNodeMeta,
} from "@/components/common/pipelineNodes";
import { RAG_STAGE_NODES, RAG_STEP_TO_STAGE } from "./ragStageNodes";
import { T2S_STAGE_NODES, T2S_STEP_TO_STAGE } from "./text2sqlStageNodes";
import {
  T2SC_STAGE_NODES,
  T2SC_STEP_TO_STAGE,
} from "./text2sqlChartStageNodes";
import type { ChartSpec } from "@/lib/sqllab/text2sqlChart";
import type { Hit, SqlResult } from "./SearchResults";
import type { Preview } from "@/components/data-load/PreviewModal";
import {
  recommendationsFor,
  sourceKindOf,
} from "@/lib/searchlab/recommendations";
import type { SearchDomain } from "@/lib/searchlab/domains";

/**
 * useSearchLab — 검색 실습의 상태·핸들러·SSE 파싱·파생값 캡슐화 훅.
 *
 * SearchLabView 가 1000줄을 넘지 않도록 데이터 흐름(state·fetch·SSE
 * 파싱·검색/RAG/SQL/차트 실행 로직)을 그대로 이 훅으로 이관했다.
 * 로직은 100% 보존 — 뷰는 이 훅이 돌려주는 값으로 렌더만 한다.
 * 실행 모드별 진행 단계는 실제 *StageNodes.ts(SSOT)에서 파생.
 */

export const DOMAINS = [
  { id: "sangkwon", label: "상권 / 소상공인", audience: "유통·소상공인" },
  { id: "medical", label: "의료 / 제약", audience: "의료·제약" },
  { id: "finance", label: "금융 / 연금 / 고용", audience: "금융·투자" },
  { id: "legal", label: "법률 / 법령", audience: "법률·규제" },
  { id: "policy", label: "정책 / 거버넌스", audience: "공공·정책" },
] as const;

export const MODES = [
  { id: "lexical", label: "렉시컬 (BM25·Nori)", hint: "키워드 정확 매칭" },
  { id: "vector", label: "벡터 (임베딩)", hint: "의미 유사도" },
  { id: "hybrid", label: "하이브리드", hint: "둘 결합" },
] as const;

export const HYBRID_METHODS = [
  { id: "default", label: "디폴트 (점수 가중 결합)" },
  { id: "rrf", label: "RRF (순위 결합)" },
] as const;

// 렉시컬 BM25 필드 가중치 프리셋 (search.ts LEXICAL_PRESETS 와 1:1).
// 같은 질의라도 타이틀/본문 가중을 바꾸면 검색 순위가 뒤집힌다.
export const LEXICAL_PRESETS = [
  { id: "balanced", label: "균형 (타이틀 ×3)", hint: "타이틀 ×3 · 본문 ×1 — 기본값" },
  { id: "title", label: "타이틀 중심 (×6)", hint: "타이틀 ×6 · 본문 ×1 — 제목 키워드 강조" },
  { id: "body", label: "본문 중심 (×3)", hint: "타이틀 ×1 · 본문 ×3 — 본문 다빈도 강조" },
] as const;

// 검색어 옆 동작 선택 (다른 섹션과 동일 chip 패턴)
export const TASK_MODES = [
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
export const TOP_RANKS = [5, 10, 20, 50] as const;

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

export function useSearchLab() {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<string>("hybrid");
  const [hybridMethod, setHybridMethod] = useState<string>("default");
  // 렉시컬 BM25 필드 가중치 프리셋(교육용 — 칩으로 바꿔 순위 변화 체감).
  const [lexicalPreset, setLexicalPreset] = useState<string>("balanced");
  const [topK, setTopK] = useState<number>(10);
  // 인덱스 보기 모달 (색인된 문서 ◀ N/M ▶ 열람)
  const [showDocs, setShowDocs] = useState(false);
  // 데이터 보기 모달 (Text-to-SQL/Chart 모드 — 적재된 SQLite 테이블 앞 N행).
  // 인덱스(showDocs)와 별개 — 소스종류가 다름(인덱스 vs SQLite 테이블).
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [dataPreview, setDataPreview] = useState<Preview | null>(null);
  const [dataPreviewLoading, setDataPreviewLoading] = useState(false);
  const [taskMode, setTaskMode] = useState<string>("search");
  const [hits, setHits] = useState<Hit[]>([]);
  // 검색 모드 3방식 비교 — 렉시컬·벡터·하이브리드를 각각 별도 호출해
  // 서로 다른 결과를 3-pane 에 표시(시안 "3방식 동시 비교" 의도).
  // null = 미검색(3-pane 빈 상태 안내).
  const [cmpLexical, setCmpLexical] = useState<Hit[] | null>(null);
  const [cmpVector, setCmpVector] = useState<Hit[] | null>(null);
  const [cmpHybrid, setCmpHybrid] = useState<Hit[] | null>(null);
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
  // 검색 결과 아이템 클릭 → 글 전체보기 모달. null=닫힘.
  const [openDoc, setOpenDoc] = useState<Hit | null>(null);
  // Text-to-SQL/with Chart 큰 모달(시안 Text2SqlChartModal) 토글.
  // SQL·차트 모드는 단계별 모달 대신 SQL+표+차트 통합 모달을 띄운다
  // (노드 클릭 진입). RAG 모드는 기존 단계별 RagStageModal 유지.
  const [showSqlModal, setShowSqlModal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 결과 자동스크롤(메타라벨 동형): 페이지 스크롤 컨테이너 ref + "바닥
  // 근처" 추적. 위로 올려 과거 결과를 읽는 중이면 따라가지 않음(채팅 표준).
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  // 도메인별 색인 상태(문서 수). null=미색인, 숫자=색인됨 N건.
  // 색인 자체는 별도 /index-lab 메뉴 — 여기선 chip 에 상태만 표기.
  // (2026-05-19 사용자 결정). 미색인 검색 시 API 가 503 안내.
  const [status, setStatus] = useState<Record<string, number | null>>({});
  // DB(Text-to-SQL) 적재 상태 — 도메인별 행수(0=미적재).
  // 인덱스(status)와 별개 소스(사용자 지적: 모드가 소스를 결정).
  // /api/sql-lab/tables 가 [{domain,loaded,rowCount}] 반환.
  const [dbStatus, setDbStatus] = useState<Record<string, number>>({});
  // 업로드 색인된 custom 도메인의 동적 라벨(indices API). null=미색인.
  // 색인 메뉴(IndexLabView)와 동일 패턴 — 검색 메뉴에도 "내 데이터"
  // 도메인이 칩으로 등장하게 한다(고정 5개 + custom).
  const [customLabel, setCustomLabel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 인덱스·DB 상태를 마운트 시 1회씩 캐싱. 모드 전환 재판정은
    // domainAvailable 이 taskMode 변화에 반응(렌더 재계산)하므로
    // 추가 fetch 불요 — 두 상태가 이미 메모리에 있음.
    fetch("/api/search-lab/status")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.status) setStatus(d.status);
      })
      .catch(() => {});
    fetch("/api/sql-lab/tables")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d.tables)) return;
        const m: Record<string, number> = {};
        for (const t of d.tables as {
          domain: string;
          loaded: boolean;
          rowCount: number;
        }[]) {
          m[t.domain] = t.loaded ? t.rowCount : 0;
        }
        setDbStatus(m);
      })
      .catch(() => {});
    // 업로드 색인된 custom 도메인 라벨 로드(검색 칩에 "내 데이터" 등장).
    fetch("/api/search-lab/indices")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d.indices)) return;
        const row = d.indices.find(
          (ix: { index: string; label?: string }) =>
            ix.index === "searchlab-custom",
        );
        setCustomLabel(row?.label ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 모드 전환 시 현재 도메인이 새 소스에서 불가용이면 가용한
  // 첫 도메인으로 자동 보정(사용자 "즉시 재판정" 요구 완결 —
  // disable UI 만으론 선택된 domain state 가 비가용으로 남아
  // 실행 시 에러. 가용 도메인 없으면 그대로 둠: chip 전부
  // disabled + 실행 버튼이 막음). status/dbStatus/taskMode 가
  // deps — 상태 로드 완료·모드 전환 양쪽에서 재평가.
  useEffect(() => {
    const k = sourceKindOf(taskMode);
    const ok = (id: string): boolean =>
      k === "db"
        ? (dbStatus[id] ?? 0) > 0
        : typeof status[id] === "number";
    if (ok(domain)) return;
    // custom 포함 동적 목록에서 가용 도메인 탐색(customLabel 의존 —
    // 아래 deps 에 추가). custom 색인 후에도 자동 보정이 작동.
    const pool = customLabel
      ? [
          ...DOMAINS,
          { id: "custom", label: customLabel, audience: "사용자 업로드" },
        ]
      : DOMAINS;
    const firstOk = pool.find((d) => ok(d.id));
    if (!firstOk) return;
    // effect 본문 동기 setState 금지(코드베이스 컨벤션 —
    // cascading render). 마이크로태스크 경계 뒤로 미룬다.
    let alive = true;
    queueMicrotask(() => {
      if (alive) setDomain(firstOk.id);
    });
    return () => {
      alive = false;
    };
  }, [taskMode, status, dbStatus, domain, customLabel]);

  // 고정 5개 + (색인됐으면) custom — 색인 메뉴(IndexLabView allDomains)와
  // 동일 사상. custom 라벨은 업로드 시 결정되므로 indices API 에서 로드.
  const allDomains: { id: string; label: string; audience: string }[] =
    customLabel
      ? [
          ...DOMAINS,
          { id: "custom", label: customLabel, audience: "사용자 업로드" },
        ]
      : [...DOMAINS];

  // 단일 방식 검색 — 3방식 비교(runSearch)에서 병렬로 3번 호출.
  // 실패 시 에러 메시지를 throw(상위에서 표면화).
  async function searchOne(
    q: string,
    m: "lexical" | "vector" | "hybrid",
  ): Promise<Hit[]> {
    const res = await fetch("/api/search-lab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain,
        query: q,
        mode: m,
        topK,
        ...(m === "hybrid" ? { hybridMethod } : {}),
        ...(m === "lexical" ? { lexicalPreset } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? `검색 실패 (HTTP ${res.status})`);
    }
    return (data.hits ?? []) as Hit[];
  }

  // 검색 모드: 렉시컬·벡터·하이브리드를 동시(병렬) 검색해 3-pane 에
  // 각각 다른 결과를 표시(시안 "3방식 동시 비교"). hits(단일)도 현
  // 선택 방식 결과로 채워 펼친 리스트와 호환 유지.
  async function runSearch(): Promise<void> {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setErr(null);
    setCmpLexical(null);
    setCmpVector(null);
    setCmpHybrid(null);
    try {
      const [lex, vec, hyb] = await Promise.all([
        searchOne(q, "lexical"),
        searchOne(q, "vector"),
        searchOne(q, "hybrid"),
      ]);
      setCmpLexical(lex);
      setCmpVector(vec);
      setCmpHybrid(hyb);
      // 펼친 리스트(일반 검색)는 현재 선택 방식 결과를 사용.
      setHits(mode === "lexical" ? lex : mode === "vector" ? vec : hyb);
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
    setCmpLexical(null);
    setCmpVector(null);
    setCmpHybrid(null);
    setRagSystem("");
    setRagAnswer("");
    setRagIO(emptyRagIO());
    setOpenStage(null);
    // 3-pane 비교는 검색 모드와 동일하게 3방식 병렬 검색으로 각각 채운다
    // (RAG 답변 SSE 와 독립 — 실패해도 답변 흐름엔 영향 없음). search 와
    // 같은 "방식별로 다른 결과" 비교를 RAG 에서도 제공.
    void Promise.all([
      searchOne(q, "lexical"),
      searchOne(q, "vector"),
      searchOne(q, "hybrid"),
    ])
      .then(([lex, vec, hyb]) => {
        setCmpLexical(lex);
        setCmpVector(vec);
        setCmpHybrid(hyb);
      })
      .catch(() => {
        // 비교 검색 실패는 RAG 답변과 무관 — 조용히 무시(빈 칼럼 유지).
      });
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
          ...(mode === "lexical" ? { lexicalPreset } : {}),
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
    setShowSqlModal(false);
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
    setShowSqlModal(false);
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

  // 사용자 지적의 핵심: 도메인 가용성은 ①도메인이 아니라
  // 검색어 모드(taskMode)가 결정하는 데이터 소스에 종속.
  // index 계열(검색·RAG)=인덱스 색인 여부, db 계열(Text-to-SQL
  // ·Chart)=테이블 적재 여부. taskMode 가 바뀌면 이 파생값들이
  // 렌더 시 재계산 → "모드 선택 시 즉시 재판정"(추가 fetch 0).
  const kind = sourceKindOf(taskMode);
  const domainAvailable = (id: string): boolean =>
    kind === "db"
      ? (dbStatus[id] ?? 0) > 0
      : typeof status[id] === "number";
  // 현재 도메인·모드에 실제 가능한 추천 질의(소스종류×도메인).
  const recs = recommendationsFor(taskMode, domain as SearchDomain);
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

  // ── 현재 작업 모드의 hero 작업 그래프 노드·상태 파생(시안 B) ──
  // search 모드는 hero 그래프 없음(3-pane 비교만). 나머지는 모드별
  // 실제 *StageNodes.ts(SSOT) + 파생 상태를 PipelineRow 에 주입.
  const heroNodes: readonly StageNodeMeta[] | null = isRag
    ? RAG_STAGE_NODES
    : isT2s
      ? T2S_STAGE_NODES
      : isT2sc
        ? T2SC_STAGE_NODES
        : null;
  const heroStates: Record<number, StageStatus> = isRag
    ? ragStates
    : isT2s
      ? t2sStates
      : isT2sc
        ? t2scStates
        : {};
  // hero 헤더 제목·전체 상태(가장 진척된 단계 기준).
  const heroTitle = isRag
    ? "RAG · 검색 → LLM 해석"
    : isT2s
      ? "Text-to-SQL · 스키마 → SQL → 실행"
      : "Text-to-SQL with Chart · + 차트화";
  const heroOverall: StageStatus = (() => {
    if (!heroNodes) return "idle";
    const vals = heroNodes.map((n) => heroStates[n.stage] ?? "idle");
    if (vals.some((v) => v === "error")) return "error";
    if (vals.some((v) => v === "running")) return "running";
    if (vals.length > 0 && vals.every((v) => v === "done")) return "done";
    return "idle";
  })();
  // 현재 도메인 가용성·뱃지(좌측 도메인 리스트·인덱스 보기 버튼용).
  const domainIndexed = typeof status[domain] === "number";
  // Text-to-SQL/Chart 의 데이터원 = SQLite 적재 테이블(인덱스 아님).
  // dbStatus[domain] > 0 이면 적재됨 → "데이터 보기" 활성.
  const domainTableLoaded = (dbStatus[domain] ?? 0) > 0;

  // 데이터 보기 모달 열기 — 적재 SQLite 테이블 앞 N행 fetch 후 표시.
  const openDataPreview = async (): Promise<void> => {
    setShowDataPreview(true);
    setDataPreview(null);
    setDataPreviewLoading(true);
    try {
      const r = await fetch(
        `/api/sql-lab/rows?domain=${encodeURIComponent(domain)}&rows=${topK}`,
      );
      const d = await r.json();
      if (r.ok && d.loaded) {
        setDataPreview({ columns: d.columns, rows: d.rows, totalNote: d.totalNote });
      } else {
        setDataPreview(null);
      }
    } catch {
      setDataPreview(null);
    } finally {
      setDataPreviewLoading(false);
    }
  };
  // SQL/with Chart 모달에 넘길 현 모드의 실제 상태(목업 금지).
  const sqlModalSystem = isT2sc ? t2scSystem : t2sSystem;
  const sqlModalSql = isT2sc ? t2scSql : t2sSql;
  const sqlModalResult = isT2sc ? t2scResult : t2sResult;

  // ── 결과 자동스크롤 (메타라벨 동형) ──────────────────────────
  // ① 스크롤 시 "바닥 근처" 여부 갱신. 위로 올려 읽는 중이면 비활성.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      nearBottomRef.current = gap < 80; // 80px 이내면 바닥으로 간주
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ② 새 실행 시작 시 "따라가기" 리셋(이전에 위로 올려뒀어도 새 결과는 추적).
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (loading && !prevLoadingRef.current) nearBottomRef.current = true;
    prevLoadingRef.current = loading;
  }, [loading]);

  // ③ 결과의 "구조적 완료" 신호가 바뀌면 바닥 근처일 때 말단 정렬.
  // 4모드 공통 1 effect(고정 길이 deps — hooks 규칙). RAG 답변은 토큰
  // 스트리밍(ragAnswer)이라 deps 제외 — 대신 ragIO(단계 완료)로 트리거해
  // "분석 완료 시 말단" 동작. 검색 hits·SQL 표·차트는 도착 시 1회 변경.
  const cmpLen =
    (cmpLexical?.length ?? 0) +
    (cmpVector?.length ?? 0) +
    (cmpHybrid?.length ?? 0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [
    hits.length,
    cmpLen,
    ragIO,
    t2sResult,
    t2sIO,
    t2scResult,
    t2scChart,
    t2scIO,
    loading,
  ]);

  return {
    // 설정 상태
    domain,
    setDomain,
    query,
    setQuery,
    mode,
    setMode,
    hybridMethod,
    setHybridMethod,
    lexicalPreset,
    setLexicalPreset,
    topK,
    setTopK,
    taskMode,
    setTaskMode,
    // 결과·진행 상태
    hits,
    // 검색 모드 3방식 비교 결과(각 방식 별도 검색).
    cmpLexical,
    cmpVector,
    cmpHybrid,
    loading,
    err,
    ragSystem,
    ragAnswer,
    ragIO,
    t2sChart: t2scChart,
    // 모달·열람 상태
    showDocs,
    setShowDocs,
    // 데이터 보기(Text-to-SQL/Chart — SQLite 테이블 미리보기)
    domainTableLoaded,
    showDataPreview,
    setShowDataPreview,
    dataPreview,
    dataPreviewLoading,
    openDataPreview,
    openStage,
    setOpenStage,
    openDoc,
    setOpenDoc,
    showSqlModal,
    setShowSqlModal,
    // 결과 자동스크롤 컨테이너 ref (SearchLabView 최상위 div 에 부착)
    scrollRef,
    // 핸들러
    execute,
    stop,
    // 파생값
    isRag,
    isT2s,
    isT2sc,
    kind,
    allDomains,
    domainAvailable,
    domainIndexed,
    status,
    dbStatus,
    recs,
    heroNodes,
    heroStates,
    heroTitle,
    heroOverall,
    ragIORecord: ragIO,
    sqlModalSystem,
    sqlModalSql,
    sqlModalResult,
  };
}

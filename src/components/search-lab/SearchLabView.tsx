"use client";

import { type ReactNode } from "react";
import { StatusPill, PipelineRow } from "@/components/common/LabWorkbench";
import { IndexDocsModal } from "./IndexDocsModal";
import { PreviewModal } from "@/components/data-load/PreviewModal";
import { RAG_STAGE_NODES } from "./ragStageNodes";
import { RagStageModal } from "./RagStageModal";
import { Text2SqlChartModal } from "./Text2SqlChartModal";
import { ChartView } from "./ChartView";
import {
  CompareCol,
  HitsList,
  RagAnswer,
  SqlResultBlock,
  DocViewModal,
} from "./SearchResults";
import {
  useSearchLab,
  MODES,
  HYBRID_METHODS,
  LEXICAL_PRESETS,
  TASK_MODES,
  TOP_RANKS,
} from "./useSearchLab";

/**
 * SearchLabView — 검색 실습 화면 (client, 실험 B 시안).
 *
 * 좌(설정) · 우(워크벤치) 2단 il-bench. 검색·RAG 모드는 3-pane 비교
 * (렉시컬/벡터/하이브리드), RAG 는 ANSWER 카드, Text-to-SQL/차트는 작업
 * 그래프 hero + SQL 결과 카드 + 차트 모달. 모든 상태·핸들러·SSE 파싱은
 * useSearchLab 훅으로 분리(데이터 흐름 100% 보존) — 여기선 렌더만.
 *
 * 모달 진입점:
 *  - RAG 노드 클릭 → RagStageModal(단계별 입·출력)
 *  - SQL/차트 노드 클릭 또는 "차트 보기" → Text2SqlChartModal(SQL·표·차트)
 *  - "인덱스 보기" 버튼 → IndexDocsModal(색인 문서 ◀ N/M ▶)
 */
export function SearchLabView(): ReactNode {
  const s = useSearchLab();
  // 훅이 캡슐화한 상태·핸들러·파생값을 뷰 지역명으로 분해(JSX 그대로).
  const {
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
    hits,
    cmpLexical,
    cmpVector,
    cmpHybrid,
    loading,
    err,
    ragSystem,
    ragAnswer,
    ragIORecord: ragIO,
    t2sChart: t2scChart,
    showDocs,
    setShowDocs,
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
    scrollRef,
    execute,
    stop,
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
    sqlModalSystem,
    sqlModalSql,
    sqlModalResult,
  } = s;

  return (
    // layout.tsx 가 overflow:hidden + 100dvh → 페이지가 자체 스크롤
    // 컨테이너여야 콘텐츠가 길어도 잘리지 않음(ChatPanel 선례). 얇은
    // 스크롤바는 기존 .thin-scroll 재사용.
    <div
      ref={scrollRef}
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div
        style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 24px 64px" }}
      >
        {/* 헤더(시안 LabPage) — accent 칩 + 타이틀 + 서브타이틀 */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--blue-600)",
              textTransform: "uppercase",
              background: "var(--lab-blue-bg-2)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            ④ 검색 · 라벨링 실습
          </span>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-default)",
              margin: "8px 0 0",
              letterSpacing: "-0.015em",
            }}
          >
            검색 실습 — 3방식 동시 비교
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-subtle)",
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            렉시컬·벡터·하이브리드를 한 화면에서 나란히 — 같은 검색어, 다른
            방식의 결과 차이를 즉시 확인합니다. (OpenSearch + Nori + OpenAI
            임베딩)
          </p>
        </div>

        {/* il-bench — 좌(도메인 240px) · 우(질의 카드 + 워크벤치 1fr).
            질의·옵션·추천을 우측 와이드 카드로 옮겨 좁은 사이드 답답함 해소
            (시안 B 최종 — chat5). 좌측엔 도메인 선택만 남김. */}
        <div className="il-bench" style={{ gridTemplateColumns: "240px 1fr" }}>
          {/* ─── 좌측: 도메인 선택만 (sticky) ─── */}
          <div className="il-bench-aside">
            {/* 도메인 카드 — 세로 리스트 + 소스 보기 버튼. */}
            <div className="il-card il-config">
              <div className="il-config-title">도메인</div>

              {/* 도메인 — 세로 리스트(il-domain-btn). 미색인/미적재는
                  disabled + 상태 표기, 가용이면 ● docs/행. 가용성은
                  taskMode 가 결정한 소스종류 기준(사용자 지적). */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginBottom: 14,
                }}
              >
                {allDomains.map((d) => {
                  const avail = domainAvailable(d.id);
                  const amount =
                    kind === "db" ? dbStatus[d.id] ?? 0 : status[d.id];
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="il-domain-btn"
                      aria-pressed={domain === d.id}
                      disabled={!avail}
                      onClick={() => avail && setDomain(d.id)}
                      title={
                        avail
                          ? `${d.audience} · ${
                              kind === "db" ? "DB 적재됨" : "색인됨"
                            }`
                          : `${d.audience} · ${
                              kind === "db"
                                ? "DB 미적재 — SQL 적재 메뉴에서 먼저"
                                : "미색인 — 도메인 색인 메뉴에서 먼저"
                            }`
                      }
                      style={{
                        opacity: avail ? 1 : 0.5,
                        cursor: avail ? "pointer" : "not-allowed",
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.label}
                      </span>
                      {avail ? (
                        <span
                          className="il-mono"
                          style={{
                            fontSize: 10,
                            color: "var(--lab-success-text)",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          ● {(amount as number).toLocaleString()}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-subtle)",
                            flexShrink: 0,
                          }}
                        >
                          {kind === "db" ? "DB 미적재" : "미색인"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 소스 보기 — 모드별로 다른 데이터원.
                  검색·RAG = OpenSearch 인덱스(인덱스 보기),
                  Text-to-SQL/Chart = SQLite 적재 테이블(데이터 조회). */}
              {isT2s || isT2sc ? (
                <button
                  type="button"
                  className="cf-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={!domainTableLoaded}
                  onClick={() => void openDataPreview()}
                  title={
                    domainTableLoaded
                      ? "적재된 SQLite 테이블의 데이터를 표로 조회"
                      : "미적재 — 데이터 적재 메뉴에서 먼저 적재하세요"
                  }
                >
                  데이터 조회
                  {domainTableLoaded
                    ? ` (${dbStatus[domain]?.toLocaleString()}건)`
                    : ""}
                </button>
              ) : (
                <button
                  type="button"
                  className="cf-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={!domainIndexed}
                  onClick={() => setShowDocs(true)}
                  title={
                    domainIndexed
                      ? "색인된 문서를 하나씩 열람"
                      : "미색인 — 도메인 색인 메뉴에서 먼저 색인하세요"
                  }
                >
                  인덱스 보기
                  {domainIndexed ? ` (${status[domain]?.toLocaleString()}건)` : ""}
                </button>
              )}
            </div>
          </div>

          {/* ─── 우측: 질의 카드(와이드) + 워크벤치 ─── */}
          <div style={{ minWidth: 0 }}>
            {/* 질의 카드(시안 B 최종 — chat5) — 좁은 사이드에서 우측 와이드로
                이동. 옵션(실행 모드·검색 방식·TOP K) + 추천 질의 + 질의 입력 +
                실행을 한 카드에 가로로 길게 노출. */}
            <div className="il-card" style={{ marginBottom: 16 }}>
              {/* 옵션 행 — 실행 모드 / 검색 방식·하이브리드·BM25 / TOP K */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 200px",
                  gap: 18,
                  marginBottom: 14,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div className="il-flabel">실행 모드</div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                  >
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
                </div>
                <div>
                  <div className="il-flabel">
                    TOP K{isRag ? " — 최대 10건" : ""}
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                  >
                    {TOP_RANKS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="cf-pill"
                        aria-pressed={topK === k}
                        onClick={() => setTopK(k)}
                      >
                        <span className="il-mono">{k}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 검색 방식 — 검색·RAG 모드만(SQL 계열은 검색 방식 무관).
                  하이브리드 결합 방식·BM25 가중치는 검색 방식과 같은 줄에
                  가로로 나란히(각자 라벨 유지). */}
              {!isT2s && !isT2sc && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px 24px",
                    alignItems: "flex-start",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div className="il-flabel">검색 방식</div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                    >
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
                  </div>

                  {mode === "hybrid" && (
                    <div>
                      <div className="il-flabel">하이브리드 결합 방식</div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                      >
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

                  {mode === "lexical" && (
                    <div>
                      <div className="il-flabel">BM25 필드 가중치</div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                      >
                        {LEXICAL_PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="cf-pill"
                            aria-pressed={lexicalPreset === p.id}
                            onClick={() => setLexicalPreset(p.id)}
                            title={p.hint}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 추천 질의 — 모드(소스종류)×도메인 에 실제 가능한 것만.
                  도메인 가용 + 플레이스홀더 아닌 경우에만 노출. */}
              {domainAvailable(domain) &&
                recs.length > 0 &&
                !recs[0].startsWith("(") && (
                  <div style={{ marginBottom: 14 }}>
                    <div className="il-flabel">
                      추천 질의 ({kind === "db" ? "테이블 집계" : "문서 검색"})
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                    >
                      {recs.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="cf-pill"
                          onClick={() => setQuery(q)}
                          title="클릭해 검색어로 사용"
                          style={{ fontSize: 11 }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* 질의 입력 — 가로로 길게(input + 실행 버튼). */}
              <div className="il-flabel">질의</div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      e.preventDefault();
                      execute();
                    }
                  }}
                  placeholder={
                    isRag
                      ? "질문을 입력하고 Enter (검색 근거로 LLM 답변)"
                      : isT2s
                        ? "질문을 입력하고 Enter (자연어 → SQL → 적재 테이블 조회)"
                        : isT2sc
                          ? "질문을 입력하고 Enter (자연어 → SQL → 실행 → 차트)"
                          : "검색어를 입력하고 Enter (예: 강남구 카페 상권)"
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
                    style={{ whiteSpace: "nowrap" }}
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
                    style={{ whiteSpace: "nowrap" }}
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
              <div className="il-error" style={{ marginBottom: 16 }}>
                ⚠️ {err}
              </div>
            )}

            {/* 작업 그래프 hero — search 외 모드(RAG/SQL/차트)만.
                실제 *StageNodes.ts(SSOT) + 파생 상태를 PipelineRow 에
                주입. RAG 노드 클릭 → RagStageModal(단계별),
                SQL/차트 노드 클릭 → Text2SqlChartModal(통합). */}
            {heroNodes && (
              <div className="il-hero">
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 16,
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="il-hero-eyebrow">
                      작업 그래프 · {heroNodes.length}단계
                    </div>
                    <div className="il-hero-title">{heroTitle}</div>
                    <div className="il-hero-sub">
                      각 단계의 시스템 인스트럭션·프롬프트·LLM 출력을 노드
                      클릭으로 확인합니다.
                    </div>
                  </div>
                  <StatusPill status={heroOverall} />
                </div>
                <PipelineRow
                  nodes={heroNodes}
                  statusOf={(stage) => heroStates[stage] ?? "idle"}
                  onNodeClick={
                    isRag
                      ? (stage) => setOpenStage(stage)
                      : () => setShowSqlModal(true)
                  }
                />
              </div>
            )}

            {/* 검색·RAG 모드: 3-pane 비교(렉시컬/벡터/하이브리드).
                두 모드 모두 3방식 병렬 검색 결과(cmp*)를 칼럼별로 표시 —
                현 선택 방식(mode) 칼럼만 highlight. RAG 도 search 처럼
                방식별로 다른 결과를 보여준다(중복 제거). */}
            {(taskMode === "search" || isRag) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <CompareCol
                  label="렉시컬 · BM25"
                  hits={cmpLexical ?? []}
                  hint="Nori 토크나이즈 기반 키워드 정합"
                  highlight={mode === "lexical"}
                  onOpenDoc={setOpenDoc}
                />
                <CompareCol
                  label="벡터 · 3-small"
                  hits={cmpVector ?? []}
                  hint="1536d 코사인 유사도"
                  highlight={mode === "vector"}
                  onOpenDoc={setOpenDoc}
                />
                <CompareCol
                  label="하이브리드 · 가중 결합"
                  hits={cmpHybrid ?? []}
                  hint="α=0.6 (BM25:벡터)"
                  highlight={mode === "hybrid"}
                  onOpenDoc={setOpenDoc}
                />
              </div>
            )}

            {/* 일반 검색: 펼친 리스트(시안 HitsList). 비교 위에 더해
                전체 스니펫을 보고 싶을 때 — 결과 있으면 표시. */}
            {taskMode === "search" && hits.length > 0 && (
              <div className="il-card" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="il-bench-label">RESULT</span>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-default)",
                      }}
                    >
                      결과 {hits.length}건 · {mode}
                      {mode === "hybrid" ? ` · ${hybridMethod}` : ""}
                      {mode === "lexical" ? ` · ${lexicalPreset}` : ""}
                    </span>
                  </div>
                  <StatusPill status={loading ? "running" : "done"} />
                </div>
                <HitsList hits={hits} onOpenDoc={setOpenDoc} />
              </div>
            )}

            {/* RAG: 시스템 인스트럭션(접힘) + ANSWER 카드(답변 + 출처). */}
            {isRag && ragSystem && (
              <details className="il-card" style={{ marginBottom: 16 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--blue-700)",
                    listStyle: "none",
                  }}
                >
                  🛈 RAG 시스템 인스트럭션 (LLM 에게 주는 지시 — 실습 핵심)
                </summary>
                <pre className="il-code" style={{ marginTop: 10 }}>
                  {ragSystem}
                </pre>
              </details>
            )}

            {isRag && (ragAnswer || hits.length > 0) && (
              <div className="il-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="il-bench-label">ANSWER</span>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-default)",
                      }}
                    >
                      LLM 답변 (검색 근거 기반)
                    </span>
                  </div>
                  <StatusPill status={heroOverall} />
                </div>
                <RagAnswer
                  answer={ragAnswer}
                  hits={hits}
                  streaming={loading}
                  onOpenDoc={setOpenDoc}
                />
              </div>
            )}

            {/* Text-to-SQL / with Chart: SQL 결과 카드(시안 SQL 카드).
                생성 SQL + 결과 표. with Chart 면 차트가 표 아래 인라인으로
                바로 보이고, "차트 크게 보기" 로 Text2SqlChartModal 진입. */}
            {(isT2s || isT2sc) && (sqlModalSql || sqlModalResult) && (
              <div className="il-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="il-bench-label">SQL</span>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-default)",
                      }}
                    >
                      Text-to-SQL 결과
                      {sqlModalResult
                        ? ` · ${sqlModalResult.rows.length}행`
                        : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isT2sc && t2scChart && sqlModalResult && (
                      <button
                        type="button"
                        className="cf-btn"
                        style={{ height: 28, padding: "0 12px", fontSize: 12 }}
                        onClick={() => setShowSqlModal(true)}
                      >
                        차트 크게 보기
                      </button>
                    )}
                    <StatusPill status={heroOverall} />
                  </div>
                </div>
                <SqlResultBlock sql={sqlModalSql} result={sqlModalResult} />

                {/* with Chart 모드 인라인 차트 — LLM 이 고른 차트 스펙을
                    표 아래에 바로 렌더(모달과 동일 ChartView·동일 데이터).
                    표와 시각 분리를 위해 점선 구분 + 카드 톤 배경. */}
                {isT2sc && t2scChart && sqlModalResult && (
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: "1px dashed var(--t-neutral-16)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span className="il-bench-label">CHART</span>
                      <span
                        className="il-mono"
                        style={{
                          fontSize: 10.5,
                          color: "var(--text-subtle)",
                        }}
                      >
                        자동 추천: {t2scChart.chartType.toUpperCase()} · x:{" "}
                        {t2scChart.x} · y: {t2scChart.y.join(", ")}
                      </span>
                    </div>
                    <div
                      style={{
                        background: "var(--surface-default)",
                        border: "1px solid var(--t-neutral-8)",
                        borderRadius: "var(--r-lg)",
                        padding: 16,
                      }}
                    >
                      <ChartView
                        spec={t2scChart}
                        columns={sqlModalResult.columns}
                        rows={sqlModalResult.rows}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 시안 SearchLab_B: 검색·RAG 모드는 3-pane 가 빈 상태
                안내를 자체 표시하므로 별도 하단 안내 박스 없음. */}
          </div>
        </div>
      </div>

      {/* RAG 노드 클릭 모달 — 단계별 입출력(RagStageModal). */}
      {isRag &&
        openStage != null &&
        (() => {
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

      {/* Text-to-SQL / with Chart 통합 모달 — SQL·표·(차트). 노드 클릭
          또는 "차트 보기" 버튼으로 진입. 현 모드의 실제 상태 주입. */}
      {(isT2s || isT2sc) && showSqlModal && (
        <Text2SqlChartModal
          title={isT2sc ? "Text-to-SQL with Chart" : "Text-to-SQL"}
          system={sqlModalSystem}
          sql={sqlModalSql}
          result={sqlModalResult}
          chart={isT2sc ? t2scChart : null}
          running={loading}
          onClose={() => setShowSqlModal(false)}
        />
      )}

      {/* 인덱스 보기 — 색인된 문서 ◀ N/M ▶ (50개씩 로드).
          key={domain} → 도메인 바뀌면 리마운트=페이지 0 리셋. */}
      {showDocs && (
        <IndexDocsModal
          key={domain}
          domain={domain}
          domainLabel={
            allDomains.find((d) => d.id === domain)?.label ?? domain
          }
          onClose={() => setShowDocs(false)}
        />
      )}

      {/* 데이터 조회 — Text-to-SQL/Chart 의 적재 SQLite 테이블 앞 N행
          (CSV 미리보기와 동일 PreviewModal UI 재사용). */}
      {showDataPreview && (
        <PreviewModal
          title={`${
            allDomains.find((d) => d.id === domain)?.label ?? domain
          } — 적재 데이터`}
          preview={dataPreview}
          loading={dataPreviewLoading}
          sourceNote="적재된 SQLite 테이블 조회"
          unit="테이블"
          onClose={() => setShowDataPreview(false)}
        />
      )}

      {/* 검색 결과 글 전체보기 모달 — 아이템(3-pane·리스트·RAG 근거) 클릭. */}
      {openDoc && (
        <DocViewModal hit={openDoc} onClose={() => setOpenDoc(null)} />
      )}
    </div>
  );
}

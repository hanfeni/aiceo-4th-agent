"use client";

import { type ReactNode } from "react";
import { StatusPill, PipelineRow } from "@/components/common/LabWorkbench";
import { IndexDocsModal } from "./IndexDocsModal";
import { RAG_STAGE_NODES } from "./ragStageNodes";
import { RagStageModal } from "./RagStageModal";
import { Text2SqlChartModal } from "./Text2SqlChartModal";
import { CompareCol, HitsList, RagAnswer, SqlResultBlock } from "./SearchResults";
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
    loading,
    err,
    ragSystem,
    ragAnswer,
    ragIORecord: ragIO,
    t2sChart: t2scChart,
    showDocs,
    setShowDocs,
    openStage,
    setOpenStage,
    showSqlModal,
    setShowSqlModal,
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
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div
        style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 64px" }}
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

        {/* il-bench — 좌(설정 300px) · 우(워크벤치 1fr). 도메인 리스트가
            길어 300px 로 override(시안 B). */}
        <div className="il-bench" style={{ gridTemplateColumns: "300px 1fr" }}>
          {/* ─── 좌측: 설정 패널 (sticky) ─── */}
          <div className="il-bench-aside">
            {/* 설정 카드 — 도메인 세로 리스트 · 실행 모드 · 방식 · TOP K */}
            <div className="il-card il-config">
              <div className="il-config-title">실행 설정</div>

              {/* 도메인 — 세로 리스트(il-domain-btn). 미색인/미적재는
                  disabled + 상태 표기, 가용이면 ● docs/행. 가용성은
                  taskMode 가 결정한 소스종류 기준(사용자 지적). */}
              <div className="il-flabel">도메인</div>
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

              {/* 실행 모드(검색/RAG/Text-to-SQL/차트) — 소스종류 결정 */}
              <div className="il-flabel">실행 모드</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 14,
                }}
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

              {/* 검색 방식 — 검색·RAG 모드만(SQL 계열은 검색 방식 무관) */}
              {!isT2s && !isT2sc && (
                <>
                  <div className="il-flabel">검색 방식</div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 14,
                    }}
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

                  {mode === "hybrid" && (
                    <>
                      <div className="il-flabel">하이브리드 결합 방식</div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom: 14,
                        }}
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
                    </>
                  )}

                  {mode === "lexical" && (
                    <>
                      <div className="il-flabel">
                        BM25 필드 가중치
                        <div className="il-flabel-hint">
                          같은 질의라도 타이틀/본문 가중을 바꾸면 순위가
                          달라집니다
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom: 14,
                        }}
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
                    </>
                  )}
                </>
              )}

              {/* TOP K(결과 개수) */}
              <div className="il-flabel">
                TOP K{isRag ? " — RAG 컨텍스트는 최대 10건" : ""}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 14,
                }}
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

              {/* 인덱스 보기 — 현 도메인이 색인됐을 때만(검색·RAG 소스). */}
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
            </div>

            {/* 질의 카드(시안 B 좌측 하단) — textarea + 실행 버튼 */}
            <div className="il-card il-config" style={{ marginTop: 12 }}>
              <div className="il-flabel">
                질의
                <div className="il-flabel-hint">
                  검색어 — Enter 또는 아래 실행 버튼
                </div>
              </div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // textarea 라 Enter 줄바꿈 충돌 방지 — Shift 없으면 실행.
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
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
                        : "검색어를 입력하고 Enter"
                }
                className="cf-field"
                rows={3}
                style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
              />

              {/* 추천 질의 — 모드(소스종류)×도메인 에 실제 가능한 것만.
                  도메인 가용 + 플레이스홀더 아닌 경우에만 노출. */}
              {domainAvailable(domain) &&
                recs.length > 0 &&
                !recs[0].startsWith("(") && (
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-subtle)",
                        marginBottom: 6,
                      }}
                    >
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

              {loading ? (
                <button
                  type="button"
                  onClick={isRag || isT2s || isT2sc ? stop : undefined}
                  disabled={!(isRag || isT2s || isT2sc)}
                  className="cf-btn"
                  style={{ width: "100%", justifyContent: "center" }}
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
                  style={{ width: "100%", justifyContent: "center" }}
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

          {/* ─── 우측: 워크벤치 ─── */}
          <div style={{ minWidth: 0 }}>
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
                현재 데이터 흐름상 단일 fetch 결과(hits)를 세 방식 칼럼에
                동일 표시 — 현 적용 방식(mode) 칼럼만 highlight. */}
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
                  hits={hits}
                  hint="Nori 토크나이즈 기반 키워드 정합"
                />
                <CompareCol
                  label="벡터 · 3-small"
                  hits={hits}
                  hint="1536d 코사인 유사도"
                />
                <CompareCol
                  label="하이브리드 · 가중 결합"
                  hits={hits}
                  hint="α=0.6 (BM25:벡터)"
                  highlight
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
                <HitsList hits={hits} />
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
                />
              </div>
            )}

            {/* Text-to-SQL / with Chart: SQL 결과 카드(시안 SQL 카드).
                생성 SQL + 결과 표. with Chart 면 "차트 보기" 버튼으로
                Text2SqlChartModal(차트 포함) 진입. */}
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
                    {isT2sc && (
                      <button
                        type="button"
                        className="cf-btn"
                        style={{ height: 28, padding: "0 12px", fontSize: 12 }}
                        onClick={() => setShowSqlModal(true)}
                      >
                        차트 보기
                      </button>
                    )}
                    <StatusPill status={heroOverall} />
                  </div>
                </div>
                <SqlResultBlock sql={sqlModalSql} result={sqlModalResult} />
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
    </div>
  );
}

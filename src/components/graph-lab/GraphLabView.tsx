"use client";

import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { ComparePanels, type PanelState, emptyPanels } from "./ComparePanels";
import { GraphExploreModal } from "./GraphExploreModal";
import { StatusPill, Metric, Terminal } from "@/components/common/LabWorkbench";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { GRAPH_DATASETS } from "@/lib/graphlab/config";
import type { LoadedDataset } from "@/lib/graphlab/load";

/**
 * GraphLabView — 온톨로지 / GraphRAG 실습 (client).
 *
 * 흐름(search-lab/index-lab 패턴 복제):
 *  ① "그래프 구축" 버튼 → SEC EDGAR 서브셋을 Neo4j 에 적재
 *     (인프라 자동 보장 → 적재, 진행 SSE 실시간)
 *  ② 질문 입력 → RAG / Text-to-SQL / GraphRAG 3패널 동시 비교
 *
 * 강의 메시지(사용자 결정): "GraphRAG 이 RAG·Text-to-SQL 보다
 * 우월함을 설명하기 좋은 케이스" — 같은 질문, 3방식, 결과가 갈림.
 * 디자인: 실험(B) 워크벤치 — 헤더 eyebrow + il-bench(좌 320px 설정 ·
 * 우 1fr 비교판). index-lab/meta-lab 과 동일 톤. CSS 는 globals.css
 * 의 il-/cf- 클래스 재사용(이 파일은 CSS 정의 없음).
 */

interface GraphStats {
  managers: number;
  companies: number;
  owns: number;
  positions: number;
}

// 추천 질의는 데이터셋별 config.demoQueries SSOT 에서 가져온다
// (activeDataset.demoQueries). 라벨 끝 표식(🟦=GraphRAG 압승 ·
// 🟨=SQL도 가능 · ⚪=RAG 한계)으로 학생이 3패널 결과 전 가설을
// 세우게 한다(교육 설계).

export function GraphLabView(): ReactNode {
  const [stats, setStats] = useState<GraphStats | null>(null);
  // 현재 Neo4j 에 공존 적재된 데이터셋 목록(라벨 분리 — 여러 개 동시
  // 적재). {id, subjects, objects}. 리스트·개별 삭제·적재 판정에 사용.
  const [loaded, setLoaded] = useState<LoadedDataset[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [comparing, setComparing] = useState(false);
  const [panels, setPanels] = useState<Record<string, PanelState>>(
    emptyPanels(),
  );
  // 선택된 그래프 데이터셋(기본=첫 번째 SEC EDGAR). build/compare
  // 요청에 실어 보내고 데모 질의·라벨도 이 데이터셋 기준으로 표시.
  const [datasetId, setDatasetId] = useState<string>(GRAPH_DATASETS[0].id);
  const activeDataset =
    GRAPH_DATASETS.find((d) => d.id === datasetId) ?? GRAPH_DATASETS[0];
  // 그래프 삭제 확인 모달 — 삭제할 데이터셋 id(null=닫힘). 공존이라
  // 데이터셋별 개별 삭제(index-lab 인덱스별 삭제 동형 패턴).
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // DB 구조 보기 모달(인터랙티브 그래프 탐색 — 사용자 결정)
  const [showExplore, setShowExplore] = useState(false);

  // 선택 데이터셋 현황 조회(datasetId 별 stats + 공존 적재 목록).
  // 버튼 콜백(runBuild 후)·데이터셋 전환에서 재사용 → useCallback.
  const loadStatus = useCallback(async (dsId: string) => {
    try {
      const r = await fetch(
        `/api/graph-lab/status?datasetId=${encodeURIComponent(dsId)}`,
      );
      const d = await r.json();
      setStats(d.stats ?? null);
      setLoaded(Array.isArray(d.loaded) ? d.loaded : []);
    } catch {
      setStats(null);
      setLoaded([]);
    }
  }, []);

  // 마운트 + 데이터셋 전환 시 현황 조회(선택 데이터셋 기준). setState
  // 는 await 경계(IIFE) 뒤에서만. alive 가드로 언마운트 후 방지.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/graph-lab/status?datasetId=${encodeURIComponent(datasetId)}`,
        );
        const d = await r.json();
        if (!alive) return;
        setStats(d.stats ?? null);
        setLoaded(Array.isArray(d.loaded) ? d.loaded : []);
      } catch {
        if (alive) {
          setStats(null);
          setLoaded([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [datasetId]);

  async function consumeSse(
    res: Response,
    onEvent: (ev: Record<string, unknown>) => void,
  ): Promise<void> {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const f of frames) {
        const line = f.trim();
        if (!line.startsWith("data:")) continue;
        onEvent(JSON.parse(line.slice(5).trim()));
      }
    }
  }

  async function runBuild(): Promise<void> {
    if (building) return;
    setBuilding(true);
    setErr(null);
    setBuildLog([`▶ 그래프 구축 시작 (Neo4j 보장 → ${activeDataset.label} 서브셋 적재)…`]);
    try {
      const res = await fetch("/api/graph-lab/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ datasetId }),
      });
      if (!res.ok || !res.body) {
        setErr(`구축 실패 (HTTP ${res.status})`);
        return;
      }
      await consumeSse(res, (ev) => {
        const t = ev.type as string;
        if (t === "infra" || t === "load")
          setBuildLog((l) => [...l, `· ${ev.text as string}`]);
        else if (t === "infra_log")
          setBuildLog((l) => [...l, `    ${ev.text as string}`]);
        else if (t === "infra_error" || t === "load_error") {
          setBuildLog((l) => [...l, `  ⚠ ${(ev.text ?? ev.message) as string}`]);
          if (t === "load_error") setErr(ev.message as string);
        } else if (t === "load_progress")
          setBuildLog((l) => [
            ...l.slice(0, -1).filter((x) => !x.startsWith("  적재")),
            `  적재 ${(ev.done as number).toLocaleString()}/${(
              ev.total as number
            ).toLocaleString()}`,
          ]);
        else if (t === "load_done") {
          const enr = ev.enriched as number | undefined;
          const pos = ev.positions as number | undefined;
          setBuildLog((l) => [
            ...l,
            `✓ 완료: 기관 ${ev.managers} · 종목 ${ev.companies} · 보유엣지 ${(
              ev.owns as number
            ).toLocaleString()}` +
              (enr !== undefined
                ? ` · crowding ${enr.toLocaleString()}종목`
                : "") +
              (pos !== undefined
                ? ` · Position ${pos.toLocaleString()}`
                : ""),
          ]);
        }
      });
      await loadStatus(datasetId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBuilding(false);
    }
  }

  async function runCompare(q: string): Promise<void> {
    if (comparing || !q.trim()) return;
    // 이 데이터셋이 아직 적재 안 됐으면 비교 차단(공존 — 다른
    // 데이터셋이 적재돼 있어도 이건 별도). "그래프 구축" 안내.
    if (!isLoaded) {
      setErr(
        `${activeDataset.label} 데이터가 아직 적재되지 않았습니다. ` +
          `"① 그래프 구축"을 먼저 실행한 뒤 비교하세요.`,
      );
      return;
    }
    setComparing(true);
    setErr(null);
    setPanels(emptyPanels());
    try {
      const res = await fetch("/api/graph-lab/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, datasetId }),
      });
      if (!res.ok || !res.body) {
        setErr(`비교 실패 (HTTP ${res.status})`);
        return;
      }
      await consumeSse(res, (ev) => {
        const t = ev.type as string;
        if (t === "all_done") return;
        const m = ev.method as string;
        setPanels((p) => {
          const cur = { ...p[m] };
          if (t === "method_start") cur.status = "running";
          else if (t === "generated") {
            cur.lang = ev.lang as string;
            cur.code = ev.code as string;
          } else if (t === "result") {
            cur.resultRows = ev.rows as number;
            cur.resultPreview = ev.preview as string;
          } else if (t === "token") cur.answer += ev.text as string;
          else if (t === "method_done") cur.status = "done";
          else if (t === "method_error") {
            cur.status = "error";
            cur.error = ev.message as string;
          }
          return { ...p, [m]: cur };
        });
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setComparing(false);
    }
  }

  // 특정 데이터셋 삭제(confirmDel 에 담긴 id). 공존이라 그 데이터셋
  // 라벨 노드만 삭제(다른 데이터셋 보존 — reset 라우트가 처리).
  async function runDelete(delId: string): Promise<void> {
    setConfirmDel(null);
    setDeleting(true);
    setErr(null);
    try {
      const r = await fetch("/api/graph-lab/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ datasetId: delId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? `삭제 실패 (HTTP ${r.status})`);
        return;
      }
      // 현재 선택 데이터셋을 삭제했으면 비교 패널·로그도 초기화.
      if (delId === datasetId) {
        setBuildLog([]);
        setPanels(emptyPanels());
      }
      await loadStatus(datasetId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setDeleting(false);
    }
  }

  // 이 데이터셋이 적재됐는지(공존 — loaded 목록 기반). 비교·탐색은
  // 적재된 경우에만. built = 선택 데이터셋 stats 존재(= 적재됨).
  const isLoaded = loaded.some((l) => l.id === datasetId);
  const built = stats !== null && isLoaded;
  // 삭제 확인 모달에 표시할 데이터셋 라벨.
  const confirmLabel =
    GRAPH_DATASETS.find((d) => d.id === confirmDel)?.label ?? confirmDel;
  // 워크벤치 상태칩(좌측 구축 카드 + 우측 비교 카드). build/compare 진행
  // → run, 둘 다 idle 이며 적재됨 → done, 아니면 idle.
  const benchStatus = building || comparing
    ? "running"
    : built
      ? "done"
      : "idle";

  return (
    <div
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
            ⑤ 검색 · 라벨링 실습
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
            온톨로지 워크벤치 — GraphRAG vs RAG vs Text-to-SQL
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-subtle)",
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            좌측에서 데이터셋·질의를 고르고 워크벤치에서{" "}
            <strong>같은 질문</strong>을 세 방식으로 동시에 돌립니다.{" "}
            {activeDataset.slots.subject}-{activeDataset.slots.object}{" "}
            {activeDataset.slots.relation} 관계는 멀티홉 추론이라 GraphRAG
            우월성이 선명히 드러납니다.
          </p>
        </div>

        <div className="il-bench" style={{ gridTemplateColumns: "320px 1fr" }}>
          {/* ─── 좌측: 설정 패널 (sticky) ─── */}
          <div className="il-bench-aside">
            {/* 데이터셋 + 그래프 액션 카드 */}
            <div className="il-card il-config">
              <div className="il-config-title">데이터셋</div>
              <div
                className="il-flabel-hint"
                style={{ marginBottom: 10 }}
              >
                {activeDataset.blurb}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {GRAPH_DATASETS.map((d) => {
                  const on = d.id === datasetId;
                  // 이 데이터셋이 적재돼 있는지(공존 — 초록 dot 표식).
                  const dsLoaded = loaded.some((l) => l.id === d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="il-domain-btn"
                      aria-pressed={on}
                      onClick={() => {
                        if (building || comparing) return;
                        setDatasetId(d.id);
                        // 데이터셋 바꾸면 기존 비교 패널·로그 초기화
                        // (다른 데이터 적재 전까지 stale 결과 방지).
                        setPanels(emptyPanels());
                        setQuery("");
                      }}
                      disabled={building || comparing}
                      title={d.blurb}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.label.split(" (")[0]}
                      </span>
                      {dsLoaded && (
                        <span
                          title="적재됨"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 99,
                            background: "var(--green-400, #22c55e)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* DB 구조 보기 · 그래프 탐색 — 둘 다 GraphExploreModal 진입
                  (상단 스키마 도해 + 하단 인터랙티브 탐색이 한 모달에). */}
              <button
                type="button"
                className="cf-btn"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => setShowExplore(true)}
                disabled={!built || building || deleting}
                title={
                  built
                    ? "Neo4j 스키마 + 그래프 구조를 인터랙티브로 탐색"
                    : "그래프를 먼저 구축하세요"
                }
              >
                DB 구조 보기
              </button>
              <button
                type="button"
                className="cf-btn"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 6,
                }}
                onClick={() => setShowExplore(true)}
                disabled={!built || building || deleting}
                title={
                  built ? "노드를 클릭해 멀티홉 경로를 펼침" : "그래프를 먼저 구축하세요"
                }
              >
                그래프 탐색
              </button>
            </div>

            {/* ① 그래프 구축 카드 */}
            <div className="il-card il-config" style={{ marginTop: 12 }}>
              <div className="il-config-title">
                ① 그래프 구축 → Neo4j
              </div>
              {/* 그래프 통계(Metric 타일) — 적재됐을 때만 수치, 아니면 안내. */}
              {built ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Metric
                    label={activeDataset.slots.subject}
                    value={stats.managers.toLocaleString()}
                  />
                  <Metric
                    label={activeDataset.slots.object}
                    value={stats.companies.toLocaleString()}
                  />
                  <Metric
                    label={`${activeDataset.slots.relation}엣지`}
                    value={stats.owns.toLocaleString()}
                    highlight
                  />
                  <Metric
                    label="포지션노드"
                    value={
                      stats.positions > 0
                        ? stats.positions.toLocaleString()
                        : "—"
                    }
                  />
                </div>
              ) : (
                <div
                  className="il-flabel-hint"
                  style={{ marginBottom: 12 }}
                >
                  아직 그래프가 없습니다. 아래 버튼으로 {activeDataset.label}{" "}
                  서브셋을 Neo4j 에 적재하세요. (다른 데이터셋과 공존 적재)
                </div>
              )}
              <button
                type="button"
                onClick={runBuild}
                disabled={building || deleting}
                className="cf-btn cf-btn--primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {building
                  ? "구축 중…"
                  : built
                    ? "그래프 재구축"
                    : "그래프 구축"}
              </button>
              {built && (
                <button
                  type="button"
                  onClick={() => setConfirmDel(datasetId)}
                  disabled={building || deleting}
                  className="cf-btn"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginTop: 6,
                  }}
                >
                  {deleting ? "삭제 중…" : "그래프 삭제"}
                </button>
              )}
            </div>

            {/* ② 질의 — 프리셋 + textarea + 실행 */}
            <div className="il-card il-config" style={{ marginTop: 12 }}>
              <div className="il-config-title">② 질의 (3방식 비교)</div>
              <div className="il-flabel">질의 프리셋</div>
              <div
                className="thin-scroll"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 12,
                  maxHeight: 168,
                  overflowY: "auto",
                }}
              >
                {activeDataset.demoQueries.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    className="cf-pill"
                    onClick={() => setQuery(d.query)}
                    disabled={comparing}
                    title={d.query}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="il-flabel">질의문</div>
              <textarea
                className="cf-field"
                style={{
                  width: "100%",
                  minHeight: 80,
                  resize: "vertical",
                  marginBottom: 10,
                }}
                placeholder="질문을 입력하거나 위 프리셋을 누르세요 (예: MS와 엔비디아를 둘 다 보유한 기관은?)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={comparing}
              />
              {!built && (
                <div
                  className="il-flabel-hint"
                  style={{
                    color: "var(--t-danger-11, #e5484d)",
                    marginBottom: 8,
                  }}
                >
                  먼저 그래프를 구축하세요
                </div>
              )}
              <button
                type="button"
                onClick={() => runCompare(query)}
                disabled={comparing || !built || !query.trim()}
                className="cf-btn cf-btn--primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {comparing ? "비교 중…" : "3방식 동시 실행"}
              </button>
            </div>
          </div>

          {/* ─── 우측: 워크벤치 ─── */}
          <div style={{ minWidth: 0 }}>
            {err && (
              <div className="il-error" style={{ marginBottom: 16 }}>
                ⚠️ {err}
              </div>
            )}

            {/* 01 · 3방식 비교 결과 */}
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
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span className="il-bench-label">01</span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--text-default)",
                    }}
                  >
                    같은 질문, 3방식 비교
                  </span>
                </div>
                <StatusPill status={benchStatus} />
              </div>

              {/* 진행 로그(다크 터미널) — 구축 SSE. */}
              {buildLog.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <Terminal title="neo4j-build · stream" lines={buildLog} />
                </div>
              )}

              {/* 3패널 비교(데이터·실행 로직 보존 — ComparePanels).
                  시안 B: 실행 전에도 3-pane 틀을 항상 노출(빈 상태 안내). */}
              <ComparePanels panels={panels} />
            </div>

            {/* 02 · 적재된 데이터셋 인벤토리 (공존 목록 + 개별 삭제). */}
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
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span className="il-bench-label">02</span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--text-default)",
                    }}
                  >
                    적재된 데이터셋
                  </span>
                </div>
                <span
                  className="il-mono"
                  style={{ fontSize: 11, color: "var(--text-subtle)" }}
                >
                  {loaded.length} datasets
                </span>
              </div>

              {loaded.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                  아직 적재된 데이터셋이 없습니다. 좌측에서 데이터셋을 골라
                  ① 그래프 구축을 실행하세요.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {loaded.map((l) => {
                    const ds = GRAPH_DATASETS.find((d) => d.id === l.id);
                    const label = ds?.label ?? l.id;
                    return (
                      <div key={l.id} className="il-ix-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="il-ix-name">{label}</div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--text-subtle)",
                              marginTop: 2,
                            }}
                          >
                            {ds?.slots.subject ?? "주체"}{" "}
                            {l.subjects.toLocaleString()} ·{" "}
                            {ds?.slots.object ?? "대상"}{" "}
                            {l.objects.toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="cf-btn"
                          style={{
                            height: 28,
                            padding: "0 12px",
                            fontSize: 12,
                          }}
                          disabled={deleting}
                          onClick={() => setConfirmDel(l.id)}
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 그래프 삭제 확인 모달 (공통 ConfirmModal — 오클릭 방지) */}
      {confirmDel && (
        <ConfirmModal
          title="그래프 삭제 확인"
          confirmLabel="삭제"
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => confirmDel && void runDelete(confirmDel)}
        >
          <strong style={{ color: "var(--text-default)" }}>
            {confirmLabel}
          </strong>{" "}
          데이터셋의 노드·관계를 삭제합니다(다른 데이터셋은 보존). 이
          데이터셋으로 다시 비교·탐색하려면 재구축해야 합니다. 계속할까요?
        </ConfirmModal>
      )}

      {showExplore && (
        <GraphExploreModal
          onClose={() => setShowExplore(false)}
          datasetId={datasetId}
          datasetLabel={activeDataset.label}
          slots={activeDataset.slots}
        />
      )}
    </div>
  );
}

export default GraphLabView;

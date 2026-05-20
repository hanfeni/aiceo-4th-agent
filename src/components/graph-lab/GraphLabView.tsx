"use client";

import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { ComparePanels, type PanelState, emptyPanels } from "./ComparePanels";
import { GraphExploreModal } from "./GraphExploreModal";
import { Terminal } from "@/components/common/LabWorkbench";
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

// 시안 graph-lab 질의 프리셋: 라벨 옆 컬러 정사각형(태그). config 의
// 라벨 끝 이모지(🟦/🟨/⚪)를 파싱해 시안 TAG_META 색으로 렌더하고,
// 라벨 텍스트에선 이모지를 떼어 깔끔하게 보인다.
function parseQueryTag(label: string): { text: string; color: string } {
  if (label.includes("🟦"))
    return { text: label.replace("🟦", "").trim(), color: "var(--blue-600)" };
  if (label.includes("🟨"))
    return {
      text: label.replace("🟨", "").trim(),
      color: "var(--lab-warn-text, #b45309)",
    };
  if (label.includes("⚪"))
    return {
      text: label.replace("⚪", "").trim(),
      color: "var(--neutral-600)",
    };
  return { text: label.trim(), color: "var(--t-neutral-16)" };
}

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
          {/* ─── 좌측: 설정(시안 B — 데이터셋 / 질의 프리셋 / 질의) ─── */}
          <div className="il-bench-aside">
            {/* 데이터셋 카드 — 리스트(라벨+부제+적재 dot) + 구축/삭제 +
                DB구조·탐색. 시안엔 구축/삭제 없으나 실동작 기능이라 보존
                (사용자 결정 2026-05-21: 시안 충실 + 기능 압축 배치). */}
            <div className="il-card il-config">
              <div className="il-config-title">데이터셋</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {GRAPH_DATASETS.map((d) => {
                  const on = d.id === datasetId;
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
                        setPanels(emptyPanels());
                        setQuery("");
                      }}
                      disabled={building || comparing}
                      title={d.blurb}
                      style={{ alignItems: "flex-start" }}
                    >
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.label.split(" (")[0]}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 10.5,
                            fontWeight: 400,
                            color: "var(--text-subtle)",
                            marginTop: 2,
                            whiteSpace: "normal",
                            lineHeight: 1.4,
                          }}
                        >
                          {d.blurb}
                        </span>
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
                            marginTop: 5,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 구축/재구축 + 삭제(적재 시) — 시안 외 실동작 기능 압축. */}
              <button
                type="button"
                onClick={runBuild}
                disabled={building || deleting}
                className="cf-btn cf-btn--primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {building ? "구축 중…" : built ? "그래프 재구축" : "그래프 구축"}
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

              {/* DB 구조 보기 · 그래프 탐색 (둘 다 GraphExploreModal). */}
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

              {/* 적재 그래프 통계 — 작게(시안엔 없으나 실습 유용, 압축). */}
              {built && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px dashed var(--t-neutral-12)",
                    fontSize: 10.5,
                    color: "var(--text-subtle)",
                    lineHeight: 1.7,
                  }}
                  className="il-mono"
                >
                  {activeDataset.slots.subject}{" "}
                  <strong style={{ color: "var(--blue-700)" }}>
                    {stats.managers.toLocaleString()}
                  </strong>{" "}
                  · {activeDataset.slots.object}{" "}
                  <strong style={{ color: "var(--blue-700)" }}>
                    {stats.companies.toLocaleString()}
                  </strong>{" "}
                  · {activeDataset.slots.relation}엣지{" "}
                  <strong style={{ color: "var(--blue-700)" }}>
                    {stats.owns.toLocaleString()}
                  </strong>
                  {stats.positions > 0 && (
                    <>
                      {" "}
                      · 포지션{" "}
                      <strong style={{ color: "var(--blue-700)" }}>
                        {stats.positions.toLocaleString()}
                      </strong>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 질의 프리셋 카드(시안 B) — 세로 리스트 + 좌측 태그 색 정사각형. */}
            <div className="il-card il-config" style={{ marginTop: 12 }}>
              <div className="il-config-title">질의 프리셋</div>
              <div
                className="thin-scroll"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {activeDataset.demoQueries.map((d) => {
                  const tag = parseQueryTag(d.label);
                  return (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setQuery(d.query)}
                      disabled={comparing}
                      title={d.query}
                      style={{
                        appearance: "none",
                        cursor: comparing ? "default" : "pointer",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        padding: "7px 9px",
                        fontSize: 11.5,
                        color: "var(--text-default)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        opacity: comparing ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--medi-gray-50)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: tag.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tag.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 질의 카드(시안 B) — textarea + 3방식 실행. */}
            <div className="il-card il-config" style={{ marginTop: 12 }}>
              <div className="il-config-title">질의</div>
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

          {/* ─── 우측: 3-pane 비교만(시안 B) ─── */}
          <div style={{ minWidth: 0 }}>
            {err && (
              <div className="il-error" style={{ marginBottom: 16 }}>
                ⚠️ {err}
              </div>
            )}

            {/* 구축 진행 로그(다크 터미널) — 구축 중/직후에만. */}
            {buildLog.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Terminal title="neo4j-build · stream" lines={buildLog} />
              </div>
            )}

            {/* 3-pane 비교(시안 B 우측 전부). 실행 전에도 틀 노출. */}
            <ComparePanels panels={panels} />
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

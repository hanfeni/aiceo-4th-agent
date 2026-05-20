"use client";

import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ComparePanels, type PanelState, emptyPanels } from "./ComparePanels";
import { GraphExploreModal } from "./GraphExploreModal";
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
 * 디자인: cf-* 클래스(검색·라벨링 그룹 = blue). index-lab 정합.
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
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text-default)",
            marginBottom: 4,
          }}
        >
          온톨로지 — GraphRAG vs RAG vs Text-to-SQL
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-subtle)",
            marginBottom: 20,
          }}
        >
          유명 온톨로지 케이스 데이터셋을 Neo4j 그래프로 적재하고,{" "}
          <strong>같은 질문</strong>을 세 방식으로 돌려 결과·한계를
          나란히 비교합니다. {activeDataset.slots.subject}-
          {activeDataset.slots.object} {activeDataset.slots.relation}{" "}
          관계는 멀티홉 추론이라 GraphRAG 우월성이 선명히 드러납니다.
        </p>

        {/* 데이터셋 선택 — 같은 비교 흐름에 데이터 소스만 교체 */}
        <div style={card}>
          <div style={sectionTitle}>데이터셋 선택</div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-subtle)",
              marginBottom: 10,
            }}
          >
            {activeDataset.blurb}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {GRAPH_DATASETS.map((d) => {
              const on = d.id === datasetId;
              return (
                <button
                  key={d.id}
                  type="button"
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
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: on
                      ? "1.5px solid var(--blue-500)"
                      : "1px solid var(--t-neutral-8)",
                    background: on
                      ? "color-mix(in srgb, var(--blue-500) 10%, transparent)"
                      : "var(--surface-default)",
                    color: on ? "var(--blue-500)" : "var(--text-default)",
                    fontSize: 12.5,
                    fontWeight: on ? 700 : 500,
                    cursor: building || comparing ? "not-allowed" : "pointer",
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {/* 적재 상태 안내(공존) — 여러 데이터셋이 라벨 분리로 동시
              적재 가능. 선택 데이터셋이 적재됐는지/안 됐는지만 표시. */}
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: isLoaded
                ? "color-mix(in srgb, var(--t-success-9, #22c55e) 10%, transparent)"
                : "color-mix(in srgb, var(--t-warning-9, #f59e0b) 12%, transparent)",
              border: isLoaded
                ? "1px solid var(--t-success-9, #22c55e)"
                : "1px solid var(--t-warning-9, #f59e0b)",
              fontSize: 12,
              color: "var(--text-default)",
              lineHeight: 1.5,
            }}
          >
            {isLoaded ? (
              <>
                ✓ <strong>{activeDataset.label}</strong> 데이터가 적재돼
                있습니다. 바로 ② 비교·탐색이 가능합니다.
                {loaded.length > 1 && (
                  <>
                    {" "}
                    (현재 {loaded.length}개 데이터셋이 함께 적재됨 — 데이터셋을
                    바꿔도 재구축 없이 전환됩니다.)
                  </>
                )}
              </>
            ) : (
              <>
                ⚠ <strong>{activeDataset.label}</strong> 데이터가 아직
                적재되지 않았습니다. 아래 <strong>① 그래프 구축</strong>을
                실행하세요. (다른 데이터셋과 별도로 공존 적재됩니다.)
              </>
            )}
          </div>
        </div>

        {/* ① 그래프 구축 */}
        <div style={card}>
          <div style={sectionTitle}>
            ① 그래프 구축 ({activeDataset.label} → Neo4j)
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-subtle)",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {built ? (
              <span style={{ color: "var(--cf-soft-text)" }}>
                ✓ 구축됨 — 기관{" "}
                <strong>{stats.managers}</strong> · 종목{" "}
                <strong>{stats.companies.toLocaleString()}</strong> ·
                보유엣지{" "}
                <strong>{stats.owns.toLocaleString()}</strong>
                {stats.positions > 0 && (
                  <>
                    {" "}
                    · 포지션노드{" "}
                    <strong>{stats.positions.toLocaleString()}</strong>
                  </>
                )}
              </span>
            ) : (
              <span>아직 그래프가 없습니다. 버튼을 눌러 구축하세요.</span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {built && (
              <button
                type="button"
                onClick={() => setShowExplore(true)}
                disabled={building || deleting}
                className="cf-btn"
                title="Neo4j 그래프 구조를 인터랙티브로 탐색"
              >
                DB 구조 보기
              </button>
            )}
            {built && (
              <button
                type="button"
                onClick={() => setConfirmDel(datasetId)}
                disabled={building || deleting}
                className="cf-btn"
              >
                {deleting ? "삭제 중…" : "그래프 삭제"}
              </button>
            )}
            <button
              type="button"
              onClick={runBuild}
              disabled={building || deleting}
              className="cf-btn cf-btn--primary"
            >
              {building
                ? "구축 중…"
                : built
                  ? "그래프 재구축"
                  : "그래프 구축"}
            </button>
          </div>
          {buildLog.length > 0 && (
            <pre
              style={{
                marginTop: 14,
                marginBottom: 0,
                padding: "10px 12px",
                fontSize: 11,
                lineHeight: 1.55,
                color: "var(--text-subtle)",
                background: "var(--cf-soft-bg)",
                borderRadius: "var(--r-md, 8px)",
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {buildLog.join("\n")}
            </pre>
          )}
        </div>

        {/* ② 3방식 비교 */}
        <div style={card}>
          <div style={sectionTitle}>② 같은 질문, 3방식 비교</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
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
          <textarea
            className="cf-field"
            style={{ width: "100%", minHeight: 64, resize: "vertical" }}
            placeholder="질문을 입력하거나 위 프리셋을 누르세요 (예: MS와 엔비디아를 둘 다 보유한 기관은?)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={comparing}
          />
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              alignItems: "center",
            }}
          >
            {!built && (
              <span style={{ fontSize: 11.5, color: "var(--t-danger-11, #e5484d)" }}>
                먼저 그래프를 구축하세요
              </span>
            )}
            <button
              type="button"
              onClick={() => runCompare(query)}
              disabled={comparing || !built || !query.trim()}
              className="cf-btn cf-btn--primary"
            >
              {comparing ? "비교 중…" : "3방식 비교 실행"}
            </button>
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

        <ComparePanels panels={panels} />

        {/* 적재된 데이터셋 (실습용) — 공존 목록 + 개별 삭제.
            다른 메뉴(색인된 인덱스·적재된 테이블)와 동형 패턴. */}
        <div style={card}>
          <div style={sectionTitle}>적재된 데이터셋 (실습용)</div>
          {loaded.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              아직 적재된 데이터셋이 없습니다. 위에서 데이터셋을 골라
              ① 그래프 구축을 실행하세요.
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {loaded.map((l) => {
                const ds = GRAPH_DATASETS.find((d) => d.id === l.id);
                const label = ds?.label ?? l.id;
                return (
                  <div
                    key={l.id}
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
                      <strong>{label}</strong>
                      <span
                        style={{
                          marginLeft: 8,
                          color: "var(--text-subtle)",
                        }}
                      >
                        {ds?.slots.subject ?? "주체"}{" "}
                        {l.subjects.toLocaleString()} ·{" "}
                        {ds?.slots.object ?? "대상"}{" "}
                        {l.objects.toLocaleString()}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="cf-btn"
                      style={{ height: 28, padding: "0 12px", fontSize: 12 }}
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

      {/* 그래프 삭제 확인 모달 (오클릭 방지 — index-lab 동형) */}
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
            style={{ ...card, maxWidth: 400, margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={sectionTitle}>그래프 삭제 확인</div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-subtle)",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              <strong>{confirmLabel}</strong> 데이터셋의 노드·관계를
              삭제합니다(다른 데이터셋은 보존). 이 데이터셋으로 다시
              비교·탐색하려면 재구축해야 합니다. 계속할까요?
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
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
                onClick={() => confirmDel && void runDelete(confirmDel)}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
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

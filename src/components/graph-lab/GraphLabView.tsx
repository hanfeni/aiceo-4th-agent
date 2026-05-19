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
}

// 추천 질의 — 라벨 끝 표식으로 "어느 방식이 유리한가"를 암시해
// 학생이 3패널 결과를 보기 전에 가설을 세우게 한다(교육 설계).
//   🟦=GraphRAG 압승(멀티홉) · 🟨=SQL도 가능(대조) · ⚪=RAG 한계 노출
const DEMO_QUERIES = [
  {
    label: "공동보유 2홉 🟦",
    query:
      "마이크로소프트와 엔비디아를 둘 다 보유한 유명 기관은 어디인가? 그 기관들이 함께 보유한 다른 종목은?",
  },
  {
    label: "포트폴리오 유사도 🟦",
    query:
      "버크셔 해서웨이와 보유 종목이 가장 많이 겹치는 다른 유명 기관 상위 3곳은?",
  },
  {
    label: "3홉 연쇄 🟦",
    query:
      "버크셔가 보유한 종목을 함께 보유한 다른 기관들이, 버크셔는 안 가졌지만 공통으로 많이 보유한 종목 상위 5개는?",
  },
  {
    label: "교집합 경로 🟦",
    query:
      "애플·마이크로소프트·아마존 세 종목을 모두 보유한 기관은 어디이며, 그 기관들의 다른 공통 보유 종목은?",
  },
  {
    label: "유사 기관 군집 🟦",
    query:
      "블랙록과 뱅가드 중 어느 쪽이 버크셔와 포트폴리오가 더 비슷한가? 겹치는 종목 수로 비교해 줘.",
  },
  {
    label: "허브 종목 🟨",
    query: "가장 많은 유명 기관이 공통으로 보유한 종목 상위 10개는?",
  },
  {
    label: "최대 보유가치 🟨",
    query: "보유 가치(value) 합계가 가장 큰 종목 상위 10개는?",
  },
  {
    label: "기관 설명 질의 ⚪",
    query:
      "버크셔 해서웨이는 어떤 투자 철학을 가진 기관인가? 보유 내역으로 설명해 줘.",
  },
] as const;

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
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [comparing, setComparing] = useState(false);
  const [panels, setPanels] = useState<Record<string, PanelState>>(
    emptyPanels(),
  );
  // 그래프 삭제 확인 모달(오클릭 방지 — index-lab 동형 패턴)
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // DB 구조 보기 모달(인터랙티브 그래프 탐색 — 사용자 결정)
  const [showExplore, setShowExplore] = useState(false);

  // 버튼 콜백(runBuild 후 재조회)에서도 재사용 → useCallback 유지.
  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/graph-lab/status");
      const d = await r.json();
      setStats(d.stats ?? null);
    } catch {
      setStats(null);
    }
  }, []);

  // 마운트 시 1회 현황 조회. setState 는 await 경계(IIFE) 뒤에서만
  // — effect 본문 동기 setState 금지(cascading render) 준수.
  // alive 가드로 언마운트 후 setState 방지(IndexLabView 동형 패턴).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/graph-lab/status");
        const d = await r.json();
        if (alive) setStats(d.stats ?? null);
      } catch {
        if (alive) setStats(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    setBuildLog(["▶ 그래프 구축 시작 (Neo4j 보장 → SEC 서브셋 적재)…"]);
    try {
      const res = await fetch("/api/graph-lab/build", { method: "POST" });
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
          setBuildLog((l) => [
            ...l,
            `✓ 완료: 기관 ${ev.managers} · 종목 ${ev.companies} · 보유엣지 ${(
              ev.owns as number
            ).toLocaleString()}`,
          ]);
        }
      });
      await loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBuilding(false);
    }
  }

  async function runCompare(q: string): Promise<void> {
    if (comparing || !q.trim()) return;
    setComparing(true);
    setErr(null);
    setPanels(emptyPanels());
    try {
      const res = await fetch("/api/graph-lab/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
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

  async function runDelete(): Promise<void> {
    setConfirmDel(false);
    setDeleting(true);
    setErr(null);
    try {
      const r = await fetch("/api/graph-lab/reset", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? `삭제 실패 (HTTP ${r.status})`);
        return;
      }
      setBuildLog([]);
      setPanels(emptyPanels());
      await loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setDeleting(false);
    }
  }

  const built = stats !== null;

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
          SEC EDGAR 13F(미국 기관투자자 보유내역) 유명기관 서브셋을
          Neo4j 그래프로 적재하고, <strong>같은 질문</strong>을 세
          방식으로 돌려 결과·한계를 나란히 비교합니다. 기관-종목 보유는
          멀티홉 추론이라 GraphRAG 우월성이 선명히 드러납니다.
        </p>

        {/* ① 그래프 구축 */}
        <div style={card}>
          <div style={sectionTitle}>① 그래프 구축 (SEC EDGAR → Neo4j)</div>
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
                onClick={() => setConfirmDel(true)}
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
            {DEMO_QUERIES.map((d) => (
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
          onClick={() => setConfirmDel(false)}
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
              Neo4j 의 모든 노드·관계를 삭제합니다(기관·종목·보유엣지
              전체). 3방식 비교를 다시 하려면 그래프를 재구축해야
              합니다. 계속할까요?
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                className="cf-btn"
                onClick={() => setConfirmDel(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                onClick={() => void runDelete()}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {showExplore && (
        <GraphExploreModal onClose={() => setShowExplore(false)} />
      )}
    </div>
  );
}

export default GraphLabView;

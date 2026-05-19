"use client";

import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

/**
 * GraphExploreModal — Neo4j 그래프 구조를 인터랙티브로 탐색
 * (사용자 결정 2026-05-19: "DB 구조 보기" 모달, 인터랙티브 탐색).
 *
 * 전체 46만 엣지는 렌더 불가 → /api/graph-lab/sample 이 서브그래프
 * 만. 상단=스키마 도해(고정), 하단=실데이터 탐색(@xyflow/react,
 * 노드 클릭 → 그 노드 이웃 확장). PipelineGraph 와 같은 @xyflow
 * 스택(라이브러리 0 추가). 학생이 "그래프가 이렇게 생겼다"를
 * 손으로 만지며 이해 → 3방식 비교 전 구조 파악.
 */

interface ApiNode {
  id: string;
  label: string;
  kind: "manager" | "company";
}
interface ApiEdge {
  source: string;
  target: string;
}

const MGR_COLOR = "var(--blue-500, #2563eb)";
const CO_COLOR = "var(--t-warning-9, #d4a017)";

/** 노드 배열을 방사형으로 배치 (기관=왼쪽 열, 종목=오른쪽 열,
 *  단순 2열 — 보유 관계 방향을 한눈에. force 레이아웃 불필요). */
function layout(apiNodes: ApiNode[], apiEdges: ApiEdge[]): {
  nodes: Node[];
  edges: Edge[];
} {
  const managers = apiNodes.filter((n) => n.kind === "manager");
  const companies = apiNodes.filter((n) => n.kind === "company");
  const place = (
    arr: ApiNode[],
    x: number,
    color: string,
  ): Node[] =>
    arr.map((n, i) => ({
      id: n.id,
      position: { x, y: i * 64 },
      data: { label: n.label },
      style: {
        background: color,
        color: "white",
        border: "none",
        borderRadius: 8,
        fontSize: 10,
        width: 150,
        padding: 6,
        cursor: "pointer",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));
  const nodes = [
    ...place(managers, 0, MGR_COLOR),
    ...place(companies, 360, CO_COLOR),
  ];
  const edges: Edge[] = apiEdges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    style: { stroke: "var(--t-neutral-8, #ccc)" },
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return { nodes, edges };
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export function GraphExploreModal({
  onClose,
}: {
  onClose: () => void;
}): ReactNode {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState("초기 구조 — 노드를 클릭해 이웃 확장");

  const fetchGraph = useCallback(async (seed?: string) => {
    setLoading(true);
    setErr(null);
    try {
      const url = seed
        ? `/api/graph-lab/sample?seed=${encodeURIComponent(seed)}`
        : "/api/graph-lab/sample";
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? `조회 실패 (HTTP ${r.status})`);
        return;
      }
      const laid = layout(
        d.nodes as ApiNode[],
        d.edges as ApiEdge[],
      );
      setNodes(laid.nodes);
      setEdges(laid.edges);
      setHint(
        seed
          ? "확장됨 — 다른 노드를 클릭하면 그 이웃으로 이동"
          : "초기 구조 — 노드를 클릭해 이웃 확장",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트 시 1회 초기 그래프 로드. setState 는 await 경계(IIFE)
  // 뒤에서만 — effect 본문 동기 setState 금지(GraphLabView 동형).
  // alive 가드로 언마운트 후 setState 방지. fetchGraph(노드 클릭
  // 재사용)와 별개로 초기 로드는 effect 안에 인라인(deps []).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/graph-lab/sample");
        const d = await r.json();
        if (!alive) return;
        if (!r.ok) {
          setErr(d.error ?? `조회 실패 (HTTP ${r.status})`);
          return;
        }
        const laid = layout(d.nodes as ApiNode[], d.edges as ApiEdge[]);
        setNodes(laid.nodes);
        setEdges(laid.edges);
      } catch (e) {
        if (alive)
          setErr(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={overlay} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-default)",
          borderRadius: 12,
          width: "min(960px, 92vw)",
          height: "min(680px, 88vh)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 헤더 + 스키마 도해 */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong style={{ fontSize: 15, color: "var(--text-default)" }}>
              그래프 DB 구조 — SEC EDGAR 지식그래프
            </strong>
            <button
              type="button"
              className="cf-btn"
              onClick={onClose}
            >
              닫기
            </button>
          </div>
          {/* 스키마 한 줄 도해 */}
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: MGR_COLOR,
                color: "white",
                padding: "5px 12px",
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              (:Manager) 기관
            </span>
            <span style={{ color: "var(--text-subtle)" }}>
              ──[:OWNS value·shares]──▶
            </span>
            <span
              style={{
                background: CO_COLOR,
                color: "white",
                padding: "5px 12px",
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              (:Company) 종목
            </span>
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: "var(--text-subtle)",
              }}
            >
              ← 이 단순 구조의 <strong>경로 탐색</strong>이 GraphRAG
              우월성의 핵심
            </span>
          </div>
        </div>

        {/* 인터랙티브 그래프 */}
        <div style={{ flex: 1, position: "relative" }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "var(--text-subtle)",
                zIndex: 5,
              }}
            >
              그래프 불러오는 중…
            </div>
          )}
          {err && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12.5,
                color: "var(--t-danger-11, #e5484d)",
                padding: 24,
                textAlign: "center",
              }}
            >
              ⚠️ {err}
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={(_, n) => void fetchGraph(n.id)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--t-neutral-8)",
            fontSize: 11.5,
            color: "var(--text-subtle)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{hint}</span>
          <button
            type="button"
            className="cf-btn"
            style={{ height: 26, fontSize: 11 }}
            onClick={() => void fetchGraph()}
          >
            초기 구조로
          </button>
        </div>
      </div>
    </div>
  );
}

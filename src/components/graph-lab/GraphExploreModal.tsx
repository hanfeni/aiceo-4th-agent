"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
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
 * (사용자 결정 2026-05-19: "DB 구조 보기" 모달, 인터랙티브 탐색.
 *  2026-05-20: 누적 확장 + 브레드크럼 경로 — "더 명확하게").
 *
 * 전체 46만 엣지는 렌더 불가 → /api/graph-lab/sample 이 서브그래프
 * 만. 상단=스키마 도해(고정), 하단=실데이터 탐색(@xyflow/react).
 *
 * 탐색 모델(개선):
 *  - 노드 클릭 → 그 노드의 이웃을 기존 그래프에 **누적 병합**
 *    (이전처럼 통째로 교체하지 않음 — 멀티홉 경로가 점점 펼쳐짐).
 *  - 클릭 경로를 **브레드크럼**으로 표시 → 학생이 "어디서 어디로
 *    몇 홉 들어왔는지"를 눈으로 추적(GraphRAG 멀티홉의 직관화).
 *  - 브레드크럼 항목 클릭 → 그 지점으로 되돌아가기(이후 경로 컷).
 *
 * seed 는 서버 계약과 동일한 접두사 ID(m:<accession> / c:<cusip>).
 * raw ApiNode/ApiEdge 를 Map 으로 누적 보관하고 layout 은 렌더
 * 직전 1회 — 기존 노드 위치 점프 방지. PipelineGraph 와 같은
 * @xyflow 스택(라이브러리 0 추가).
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
/** 브레드크럼 1칸 (클릭 경로) */
interface Crumb {
  id: string;
  label: string;
}

const MGR_COLOR = "var(--blue-500, #2563eb)";
const CO_COLOR = "var(--t-warning-9, #d4a017)";
const SELECTED_RING = "0 0 0 3px var(--blue-300, #93c5fd)";

/** 노드 배열을 2열 배치 (기관=왼쪽, 종목=오른쪽 — 보유 방향 직관).
 *  selectedId 는 링 강조(현재 펼친 중심 노드 표시). */
function layout(
  apiNodes: ApiNode[],
  apiEdges: ApiEdge[],
  selectedId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const managers = apiNodes.filter((n) => n.kind === "manager");
  const companies = apiNodes.filter((n) => n.kind === "company");
  const place = (arr: ApiNode[], x: number, color: string): Node[] =>
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
        boxShadow: n.id === selectedId ? SELECTED_RING : undefined,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));
  const nodes = [
    ...place(managers, 0, MGR_COLOR),
    ...place(companies, 360, CO_COLOR),
  ];
  const edges: Edge[] = apiEdges.map((e) => ({
    id: `${e.source}->${e.target}`,
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
  // raw 누적 저장소 (layout 은 렌더 직전 파생 — 기존 노드 위치 보존).
  const [nodeMap, setNodeMap] = useState<Map<string, ApiNode>>(new Map());
  const [edgeSet, setEdgeSet] = useState<Map<string, ApiEdge>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [path, setPath] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 누적 그래프 → reactflow 노드/엣지 (selectedId 변할 때만 재배치).
  const { nodes, edges } = useMemo(
    () =>
      layout(
        [...nodeMap.values()],
        [...edgeSet.values()],
        selectedId,
      ),
    [nodeMap, edgeSet, selectedId],
  );

  /**
   * 응답을 누적 보관소에 병합. reset=true 면(초기 구조로) 비우고
   * 새로 채운다. 노드는 id 키, 엣지는 "source->target" 키로 dedupe
   * (같은 보유 관계 중복 렌더 방지).
   *
   * ── 학습 포인트 ────────────────────────────────────────
   * "누적 vs 교체"는 탐색 UX 의 핵심 결정입니다. 아래 mergeInto
   * 는 reset 분기 + 두 Map 병합을 처리해야 합니다. setState 콜백
   * 형(prev => next)으로 불변 갱신하세요(직접 mutate 금지 —
   * reactflow 가 동일 참조면 리렌더 안 함).
   * ───────────────────────────────────────────────────────
   */
  const mergeInto = useCallback(
    (incNodes: ApiNode[], incEdges: ApiEdge[], reset: boolean) => {
      // TODO(학습): 아래 두 setState 를 채우세요.
      //  - reset 이면 base 는 빈 Map, 아니면 prev 복사본에서 시작
      //  - incNodes 를 n.id 키로 set
      //  - incEdges 를 `${e.source}->${e.target}` 키로 set
      //  - 새 Map 인스턴스를 반환(참조 변경 → 리렌더 트리거)
      setNodeMap((prev) => {
        const base = reset ? new Map<string, ApiNode>() : new Map(prev);
        for (const n of incNodes) base.set(n.id, n);
        return base;
      });
      setEdgeSet((prev) => {
        const base = reset ? new Map<string, ApiEdge>() : new Map(prev);
        for (const e of incEdges) base.set(`${e.source}->${e.target}`, e);
        return base;
      });
    },
    [],
  );

  const fetchGraph = useCallback(
    async (seed?: string) => {
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
        mergeInto(
          d.nodes as ApiNode[],
          d.edges as ApiEdge[],
          !seed, // seed 없으면(초기 구조로) 리셋
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    },
    [mergeInto],
  );

  /**
   * 노드 클릭 → 이웃 누적 확장 + 브레드크럼 경로 갱신.
   *
   * ── 학습 포인트 ────────────────────────────────────────
   * 브레드크럼 동작 규칙은 도메인 결정입니다. 아래 advancePath
   * 를 채우세요. 권장 규칙:
   *  - 클릭한 노드가 경로에 이미 있으면 → 그 지점까지 잘라
   *    "되돌아가기"(이후 경로 폐기)
   *  - 없으면 → 경로 끝에 push (한 홉 더 깊이)
   * 반환값이 새 배열이어야 리렌더됩니다. (id, label) 은 클릭
   * 노드에서 옵니다.
   * ───────────────────────────────────────────────────────
   */
  const advancePath = useCallback(
    (id: string, label: string): Crumb[] => {
      // TODO(학습): path 를 보고 새 경로 배열을 만들어 반환.
      //  - idx = path.findIndex(c => c.id === id)
      //  - idx >= 0 이면 path.slice(0, idx + 1) (되돌아가기)
      //  - 아니면 [...path, { id, label }] (전진)
      const idx = path.findIndex((c) => c.id === id);
      if (idx >= 0) return path.slice(0, idx + 1);
      return [...path, { id, label }];
    },
    [path],
  );

  const onNodeClick = useCallback(
    (id: string, label: string) => {
      setSelectedId(id);
      setPath(advancePath(id, label));
      void fetchGraph(id);
    },
    [advancePath, fetchGraph],
  );

  /** 브레드크럼 칸 클릭 → 그 노드 중심으로 되돌아가 다시 펼침. */
  const onCrumbClick = useCallback(
    (c: Crumb) => {
      setSelectedId(c.id);
      setPath((p) => {
        const idx = p.findIndex((x) => x.id === c.id);
        return idx >= 0 ? p.slice(0, idx + 1) : p;
      });
      void fetchGraph(c.id);
    },
    [fetchGraph],
  );

  const resetToInitial = useCallback(() => {
    setSelectedId(null);
    setPath([]);
    void fetchGraph();
  }, [fetchGraph]);

  // 마운트 시 1회 초기 그래프 로드. setState 는 await 경계(IIFE)
  // 뒤에서만 — effect 본문 동기 setState 금지(GraphLabView 동형).
  // alive 가드로 언마운트 후 setState 방지.
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
        const nm = new Map<string, ApiNode>();
        const em = new Map<string, ApiEdge>();
        for (const n of d.nodes as ApiNode[]) nm.set(n.id, n);
        for (const e of d.edges as ApiEdge[])
          em.set(`${e.source}->${e.target}`, e);
        setNodeMap(nm);
        setEdgeSet(em);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hint =
    path.length === 0
      ? "초기 구조 — 노드를 클릭하면 그 이웃이 그래프에 추가됩니다"
      : `${path.length}홉 탐색 중 — 계속 클릭해 경로를 넓히거나, 위 경로 칸을 눌러 되돌아가기`;

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
            <button type="button" className="cf-btn" onClick={onClose}>
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
              ← 기관 클릭=보유 종목 펼침 · 종목 클릭=보유 기관 펼침.
              이 경로 탐색이 <strong>GraphRAG 멀티홉</strong>의 실체
            </span>
          </div>

          {/* 브레드크럼 경로 (멀티홉 탐색 가시화) */}
          {path.length > 0 && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={resetToInitial}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-subtle)",
                  cursor: "pointer",
                  padding: "2px 4px",
                  textDecoration: "underline",
                }}
              >
                초기 구조
              </button>
              {path.map((c, i) => (
                <span
                  key={c.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <span style={{ color: "var(--text-subtle)" }}>▸</span>
                  <button
                    type="button"
                    onClick={() => onCrumbClick(c)}
                    title={c.id}
                    style={{
                      background:
                        i === path.length - 1
                          ? "var(--blue-100, #dbeafe)"
                          : "transparent",
                      border: "1px solid var(--t-neutral-8, #ccc)",
                      borderRadius: 6,
                      color: "var(--text-default)",
                      cursor: "pointer",
                      padding: "2px 8px",
                      fontWeight: i === path.length - 1 ? 700 : 400,
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
            </div>
          )}
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
                zIndex: 6,
              }}
            >
              ⚠️ {err}
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={(_, n) =>
              onNodeClick(n.id, (n.data?.label as string) ?? n.id)
            }
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
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{hint}</span>
          <button
            type="button"
            className="cf-btn"
            style={{ height: 26, fontSize: 11, flexShrink: 0 }}
            onClick={resetToInitial}
          >
            초기 구조로
          </button>
        </div>
      </div>
    </div>
  );
}

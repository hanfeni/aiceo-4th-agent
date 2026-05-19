"use client";

import { useMemo, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  Position,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  DART_STAGE_NODES,
  stageColor,
  type StageStatus,
} from "./dartStageNodes";

/**
 * DART 고정 파이프라인 노드-엣지 시각화 (교육용 — D14b).
 *
 * React Flow(@xyflow/react@^12, client-only) 캔버스. 5단계
 * (dartStageNodes 순수 상수)를 수평 노드 + 4엣지로 그린다. 런타임
 * stage 상태(SseEvent stage 이벤트 — DartAnalyzeView 가 누적)를
 * prop 으로 받아 노드 색 구동(대기/진행/완료/실패). stage 4(OpenAI)
 * 는 emphasis — 교육생이 "AI 작동 단계" 인지(사용자 HITL).
 *
 * 노드 클릭 → onStageClick(stage) 콜백(D14c 입출력 패널 연동).
 * 커스텀 nodeTypes 미사용(over-engineering 회피 — 기본 노드 +
 * style 로 교육 시각화 충분). zustand 는 xyflow 내부 4.x 격리
 * (앱 5.x 와 공존 — docs/notes/dart-d14-reactflow-probe.md).
 */

export interface DartPipelineGraphProps {
  /** stage 번호(1..5) → 현재 상태. 미수신 stage 는 idle. */
  stageStates: Record<number, StageStatus>;
  /** 노드 클릭 시 해당 stage 번호 전달(입출력 패널 열기). */
  onStageClick?: (stage: number) => void;
}

const NODE_W = 168;
const NODE_GAP = 56;

export function DartPipelineGraph({
  stageStates,
  onStageClick,
}: DartPipelineGraphProps): ReactNode {
  const nodes: Node[] = useMemo(
    () =>
      DART_STAGE_NODES.map((meta, i) => {
        const status: StageStatus = stageStates[meta.stage] ?? "idle";
        const c = stageColor(status, meta.emphasis);
        return {
          id: String(meta.stage),
          position: { x: i * (NODE_W + NODE_GAP), y: 0 },
          // 좌→우 수평 흐름: 핸들을 좌(target)/우(source)로 고정.
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div style={{ textAlign: "center", lineHeight: 1.35 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                  {meta.emphasis ? "🤖 " : ""}
                  {meta.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: c.text,
                    opacity: 0.85,
                    marginTop: 3,
                  }}
                >
                  {status === "running"
                    ? "진행 중…"
                    : status === "done"
                      ? "완료"
                      : status === "error"
                        ? "실패"
                        : "대기"}
                </div>
              </div>
            ),
          },
          style: {
            width: NODE_W,
            padding: "10px 8px",
            borderRadius: 10,
            border: `2px solid ${c.border}`,
            background: c.bg,
            color: c.text,
            boxShadow:
              meta.emphasis && status === "running"
                ? "0 0 0 4px rgba(124,58,237,0.18)"
                : "none",
            cursor: "pointer",
          },
        };
      }),
    [stageStates],
  );

  const edges: Edge[] = useMemo(
    () =>
      DART_STAGE_NODES.slice(0, -1).map((meta, i) => {
        const nextStage = DART_STAGE_NODES[i + 1].stage;
        // 엣지 활성: 다음 단계가 진행/완료면 흐름 강조(애니메이션).
        const nextStatus: StageStatus = stageStates[nextStage] ?? "idle";
        const active = nextStatus === "running";
        const passed =
          (stageStates[meta.stage] ?? "idle") === "done" &&
          nextStatus !== "idle";
        return {
          id: `e${meta.stage}-${nextStage}`,
          source: String(meta.stage),
          target: String(nextStage),
          animated: active,
          style: {
            stroke: passed || active ? "#6366f1" : "#d4d4d8",
            strokeWidth: passed || active ? 2 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: passed || active ? "#6366f1" : "#d4d4d8",
          },
        };
      }),
    [stageStates],
  );

  return (
    <div
      style={{
        height: 180,
        border: "1px solid var(--border, #e4e4e7)",
        borderRadius: 10,
        background: "#fff",
        marginBottom: 16,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_e, n) => onStageClick?.(Number(n.id))}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} color="#f1f1f4" />
      </ReactFlow>
    </div>
  );
}

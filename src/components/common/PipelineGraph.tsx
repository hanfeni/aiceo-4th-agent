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
  stageColor,
  type StageStatus,
  type StageNodeMeta,
} from "./pipelineNodes";

/**
 * 범용 파이프라인 노드-엣지 시각화 (DartPipelineGraph 추출).
 *
 * 사용자 결정 2026-05-19: DART 전용 그래프를 공용으로 추출해
 * DART·메타랩(올인원) 공유. 노드 배열을 prop 으로 받는 것만 다르고
 * 렌더 로직(수평 노드 + 엣지 + 상태색 + 클릭)은 DART 원본 그대로.
 *
 * @xyflow/react@^12 (이미 설치). 노드 클릭 → onStageClick(stage).
 */

export interface PipelineGraphProps {
  /** 단계 노드 메타 배열 (도메인별 정의 — DART 5 / 메타랩 4) */
  stageNodes: readonly StageNodeMeta[];
  /** stage 번호 → 현재 상태. 미수신 stage 는 idle. */
  stageStates: Record<number, StageStatus>;
  /** 노드 클릭 시 해당 stage 번호 전달(모달/패널 열기). */
  onStageClick?: (stage: number) => void;
}

const NODE_W = 168;
const NODE_GAP = 56;

export function PipelineGraph({
  stageNodes,
  stageStates,
  onStageClick,
}: PipelineGraphProps): ReactNode {
  const nodes: Node[] = useMemo(
    () =>
      stageNodes.map((meta, i) => {
        const status: StageStatus = stageStates[meta.stage] ?? "idle";
        const c = stageColor(status, meta.emphasis);
        return {
          id: String(meta.stage),
          position: { x: i * (NODE_W + NODE_GAP), y: 0 },
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
    [stageNodes, stageStates],
  );

  const edges: Edge[] = useMemo(
    () =>
      stageNodes.slice(0, -1).map((meta, i) => {
        const nextStage = stageNodes[i + 1].stage;
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
    [stageNodes, stageStates],
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

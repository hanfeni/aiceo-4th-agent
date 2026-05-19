"use client";

import { memo, useMemo, type ReactNode } from "react";
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
 * DART 고정 파이프라인 노드-엣지 시각화 (교육용 — D14b + 웹검색).
 *
 * React Flow(@xyflow/react@^12, client-only) 캔버스. DART_STAGE_NODES
 * 는 6단계 SSOT(라우트 emit·SseEvent·테스트와 1:1) 불변이나, 그래프
 * 는 가독성을 위해 **컨텍스트 압축(stage 3)을 시각적으로 숨겨** 5개
 * 노드만 그린다(사용자 요청 — 라우트는 6단계 emit·압축 로직 유지,
 * OPEN-5). 가시 stage = [1,2,4,5,6](비연속 — onStageClick·stageStates
 * 는 SSOT stage 번호 그대로). 런타임 stage 상태로 노드 색 구동.
 * emphasis(stage 4 웹검색·5 OpenAI) = "AI 작동 단계" 강조(사용자 HITL).
 *
 * 가운데 정렬: fitView 가 가시 노드 bounding box 를 뷰포트 중앙에
 * 자동 배치(노드 필터만으로 5노드 기준 재중앙화 — 추가 정렬 코드 0).
 * 노드 클릭 → onStageClick(stage) 콜백(D14c 입출력 패널 연동).
 * 커스텀 nodeTypes 미사용(over-engineering 회피). zustand 는 xyflow
 * 내부 4.x 격리(앱 5.x 공존 — docs/notes/dart-d14-reactflow-probe.md).
 */

/** 그래프 시각 숨김 stage (라우트 emit·SSOT 는 불변 — 표시만 제외). */
const HIDDEN_STAGE = 3; // 컨텍스트 압축 — 가독성(사용자 요청)
/** 그래프에 그릴 노드 = 6단계 SSOT 중 압축 제외(파생 — SSOT 변형 0). */
const VISIBLE_NODES = DART_STAGE_NODES.filter(
  (n) => n.stage !== HIDDEN_STAGE,
);

export interface DartPipelineGraphProps {
  /** stage 번호(1..5) → 현재 상태. 미수신 stage 는 idle. */
  stageStates: Record<number, StageStatus>;
  /** 노드 클릭 시 해당 stage 번호 전달(입출력 패널 열기). */
  onStageClick?: (stage: number) => void;
}

// 가독성 향상(사용자 요청 — 노드·폰트 추가 확대). fitView 가 폰트
// 확대를 상쇄하지 않도록 노드 폭·컨테이너 height 를 비례 확대.
const NODE_W = 260;
const NODE_GAP = 64;

// React.memo: 부모(DartAnalyzeView)가 token 마다 setResult 로
// 리렌더돼도, stageStates(부모 useMemo 로 안정)·onStageClick
// (useState setter — 안정 참조)이 불변이면 리렌더 완전 스킵
// → 노드 깜빡임 구조적 0. 심볼명 보존(import 무영향).
function DartPipelineGraphImpl({
  stageStates,
  onStageClick,
}: DartPipelineGraphProps): ReactNode {
  const nodes: Node[] = useMemo(
    () =>
      VISIBLE_NODES.map((meta, i) => {
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
              <div style={{ textAlign: "center", lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700, fontSize: 20 }}>
                  {meta.emphasis ? "🤖 " : ""}
                  {meta.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: c.text,
                    opacity: 0.85,
                    marginTop: 6,
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
            padding: "16px 12px",
            borderRadius: 12,
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
      // 가시 노드 연속 쌍을 잇는다(압축 제외로 stage 2→4 직결 —
      // 끊긴 엣지 0. SSOT slice 가 아닌 VISIBLE_NODES 기준이 핵심).
      VISIBLE_NODES.slice(0, -1).map((meta, i) => {
        const nextStage = VISIBLE_NODES[i + 1].stage;
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
        // 노드 1줄에 타이트한 높이 — 수직 여유를 없애 fitView 가
        // 수평 기준으로 fit(노드가 폭을 채워 폰트 체감 확대 + 위아래
        // 빈 공간 제거). padding 과 함께 노드 묶음을 정중앙 배치.
        height: 150,
        border: "1px solid var(--border, #e4e4e7)",
        borderRadius: 12,
        background: "#fff",
        marginBottom: 16,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_e, n) => onStageClick?.(Number(n.id))}
        fitView
        // 노드는 상수 5개·위치 고정 → 초기 1회 fit 으로 충분(재마운트
        // key 불필요 — 부모 stageStates 가 메모이즈돼 nodes useMemo
        // 안정, token 리렌더가 그래프에 전파 0 → 깜빡임 0). padding
        // 으로 5노드 bounding box 를 뷰포트 정중앙 배치(잘림 0).
        fitViewOptions={{ padding: 0.14 }}
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

/** 메모이즈 래핑(깜빡임 0) — 심볼명 DartPipelineGraph 보존. */
export const DartPipelineGraph = memo(DartPipelineGraphImpl);

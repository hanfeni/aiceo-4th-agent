import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// DartPipelineGraph 단위 테스트 (D14b — React Flow 노드-엣지 시각화).
//
// @xyflow/react@12 는 jsdom 에서 canvas/SVG 내부(엣지·핸들·뷰포트)가
// 비신뢰 → 렌더된 엣지/핸들을 단언하지 않는다. 대신 @xyflow/react 를
// 최소 모킹(ReactFlow → nodes 개수 div + onNodeClick 트리거 버튼,
// Background → null, Position/MarkerType → 객체 stub)하여 컴포넌트
// 계약만 검증한다:
//   (a) DART_STAGE_NODES(6단계 SSOT) 중 압축(stage 3) 제외 5개 렌더
//       (사용자 요청 — 가독성. 라우트는 6단계 emit 불변, 그래프만 필터)
//   (b) 노드 클릭 → onStageClick(SSOT stage id, 비연속 [1,2,4,5,6])
//
// 매핑:
//   - 노드-엣지 시각화 (6단계 SSOT, 압축 시각 숨김 → 가시 5노드)
//   - 노드 클릭 → onStageClick(stage) (D14c 입출력 패널 연동)
// SSE 통합(DartAnalyzeView)은 D14d 범위 — 여기서 미검증.

// ---------------------------------------------------------------------------
// @xyflow/react 최소 모킹 (jsdom canvas/SVG 비신뢰 회피)
//   - ReactFlow: nodes 개수를 data-attr 로 노출 + 노드별 클릭 버튼 렌더.
//     onNodeClick(event, node) 계약을 그대로 호출(컴포넌트가 Number(n.id)
//     → onStageClick 으로 변환하는지 검증).
//   - Background: null (캔버스 배경 — 단위 테스트 무관)
//   - Position / MarkerType: 컴포넌트가 참조하는 객체 stub
//   - "@xyflow/react/dist/style.css": CSS import 무력화
// ---------------------------------------------------------------------------
interface MockNode {
  id: string;
}
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    onNodeClick,
  }: {
    nodes: MockNode[];
    onNodeClick?: (e: unknown, n: MockNode) => void;
  }): ReactNode => (
    <div data-testid="rf" data-node-count={nodes.length}>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          data-testid={`rf-node-${n.id}`}
          onClick={() => onNodeClick?.({}, n)}
        >
          node-{n.id}
        </button>
      ))}
    </div>
  ),
  Background: (): ReactNode => null,
  Position: { Left: "left", Right: "right" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

// 모킹 등록 후 import (vi.mock 은 hoist 되지만 명시적으로 아래 배치).
import { DartPipelineGraph } from "@/components/dart/DartPipelineGraph";
import { DART_STAGE_NODES } from "@/components/dart/dartStageNodes";
import type { StageStatus } from "@/components/dart/dartStageNodes";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. 가시 노드 = 6단계 중 압축(stage 3) 제외한 5개 (사용자 요청 —
//    가독성. DART_STAGE_NODES SSOT 는 6단계 불변, 그래프만 필터).
//    가시 stage = [1,2,4,5,6] (stage 번호 비연속 — SSOT 정합 유지).
// ---------------------------------------------------------------------------
const HIDDEN_STAGE = 3; // 컨텍스트 압축 — 시각적 숨김(라우트는 emit 유지)
const VISIBLE_STAGES = DART_STAGE_NODES.map((n) => n.stage).filter(
  (s) => s !== HIDDEN_STAGE,
);

describe("DartPipelineGraph — 압축 제외 5개 노드 렌더", () => {
  it("stageStates={} (전부 idle) 일 때 ReactFlow 에 노드 5개 전달", () => {
    render(<DartPipelineGraph stageStates={{}} />);
    const rf = screen.getByTestId("rf");
    expect(rf.getAttribute("data-node-count")).toBe("5");
    expect(rf.getAttribute("data-node-count")).toBe(
      String(VISIBLE_STAGES.length),
    );
  });

  it("일부 stage 상태가 주어져도 노드는 항상 5개 (상태는 색만 구동)", () => {
    const states: Record<number, StageStatus> = {
      1: "done",
      2: "running",
      4: "error",
    };
    render(<DartPipelineGraph stageStates={states} />);
    expect(screen.getByTestId("rf").getAttribute("data-node-count")).toBe("5");
  });

  it("전 단계 done 이어도 노드는 5개 유지(압축 stage3 제외)", () => {
    const allDone: Record<number, StageStatus> = {
      1: "done",
      2: "done",
      3: "done",
      4: "done",
      5: "done",
      6: "done",
    };
    render(<DartPipelineGraph stageStates={allDone} />);
    expect(screen.getByTestId("rf").getAttribute("data-node-count")).toBe("5");
  });

  it("가시 노드 id = [1,2,4,5,6] (압축 stage3 노드 미렌더)", () => {
    render(<DartPipelineGraph stageStates={{}} />);
    for (const stage of VISIBLE_STAGES) {
      expect(screen.getByTestId(`rf-node-${stage}`)).toBeTruthy();
    }
    // 압축(stage 3) 노드는 그래프에 존재하지 않는다.
    expect(screen.queryByTestId(`rf-node-${HIDDEN_STAGE}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. 노드 클릭 → onStageClick(숫자 stage id)
// ---------------------------------------------------------------------------
describe("DartPipelineGraph — 노드 클릭 → onStageClick(stage:number)", () => {
  it("stage 4 노드 클릭 → onStageClick(4) (문자열 id → Number 변환)", () => {
    const onStageClick = vi.fn();
    render(
      <DartPipelineGraph stageStates={{}} onStageClick={onStageClick} />,
    );
    fireEvent.click(screen.getByTestId("rf-node-4"));

    expect(onStageClick).toHaveBeenCalledTimes(1);
    // 숫자 4 (문자열 "4" 아님 — 컴포넌트가 Number(n.id) 변환)
    expect(onStageClick).toHaveBeenCalledWith(4);
    expect(typeof onStageClick.mock.calls[0][0]).toBe("number");
  });

  it("각 가시 노드 클릭이 해당 숫자 stage 로 콜백한다 ([1,2,4,5,6])", () => {
    const onStageClick = vi.fn();
    render(
      <DartPipelineGraph stageStates={{}} onStageClick={onStageClick} />,
    );
    for (const stage of VISIBLE_STAGES) {
      fireEvent.click(screen.getByTestId(`rf-node-${stage}`));
    }
    // 압축(3) 제외 — onStageClick 은 SSOT stage 번호 그대로(비연속).
    expect(onStageClick.mock.calls.map((c) => c[0])).toEqual([
      1, 2, 4, 5, 6,
    ]);
  });

  it("onStageClick 미제공 시 노드 클릭이 throw 하지 않는다 (옵셔널 콜백)", () => {
    render(<DartPipelineGraph stageStates={{}} />);
    expect(() =>
      fireEvent.click(screen.getByTestId("rf-node-1")),
    ).not.toThrow();
  });
});

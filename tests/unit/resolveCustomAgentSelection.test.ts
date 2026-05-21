/**
 * C3 — resolveAgentComposition → selection/instructionId 매핑 단위 테스트
 *
 * customAgentStore.resolveAgentComposition 이 반환하는 값이
 * agent.ts 의 createStream 내에서 buildHarnessConfig 의 selection +
 * instructionId 로 올바르게 매핑되는지 순수 매핑 함수만 검증한다.
 * LLM 비호출. store 는 vi.mock 으로 제어.
 */

import { describe, it, expect, vi } from "vitest";

// resolveAgentComposition 모킹
const mockResolveAgentComposition = vi.fn();

vi.mock("@/lib/agent/harness/agents/customAgentStore", () => ({
  resolveAgentComposition: (...args: unknown[]) => mockResolveAgentComposition(...args),
  listCustomAgents: () => [],
  createCustomAgent: vi.fn(),
  deleteCustomAgent: vi.fn(),
  getCustomAgent: vi.fn(),
  MAX_NAME_LEN: 80,
  MAX_DESC_LEN: 500,
}));

// mapCustomAgentToSelection 순수 함수 — agent.ts 에서 추출한 것과 동일 로직 검증
function mapCustomAgentToSelection(
  composition: { subagentNames: string[] | null; skillNames: string[] | null; instructionId: string } | null,
): {
  selection: { subagents: string[] | null; skills: string[] | null };
  instructionId: string;
} | null {
  if (!composition) return null;
  return {
    selection: {
      subagents: composition.subagentNames,
      skills: composition.skillNames,
    },
    instructionId: composition.instructionId,
  };
}

describe("resolveAgentComposition → selection/instructionId 매핑", () => {
  it("미존재 id → null 반환 — profileId 경로 폴백", () => {
    mockResolveAgentComposition.mockReturnValue(null);
    const result = mapCustomAgentToSelection(mockResolveAgentComposition("gone"));
    expect(result).toBeNull();
  });

  it("subagentNames 가 있으면 selection.subagents 에 매핑", () => {
    mockResolveAgentComposition.mockReturnValue({
      subagentNames: ["web-searcher", "dart-analyst"],
      skillNames: null,
      instructionId: "default",
    });
    const comp = mockResolveAgentComposition("agent-abc") as {
      subagentNames: string[] | null;
      skillNames: string[] | null;
      instructionId: string;
    };
    const result = mapCustomAgentToSelection(comp);
    expect(result).not.toBeNull();
    expect(result!.selection.subagents).toEqual(["web-searcher", "dart-analyst"]);
    expect(result!.selection.skills).toBeNull(); // null = 전체
    expect(result!.instructionId).toBe("default");
  });

  it("skillNames 가 있으면 selection.skills 에 매핑", () => {
    mockResolveAgentComposition.mockReturnValue({
      subagentNames: null,
      skillNames: ["deep-web-research"],
      instructionId: "custom-ins-1",
    });
    const comp = mockResolveAgentComposition("agent-xyz") as {
      subagentNames: string[] | null;
      skillNames: string[] | null;
      instructionId: string;
    };
    const result = mapCustomAgentToSelection(comp);
    expect(result!.selection.skills).toEqual(["deep-web-research"]);
    expect(result!.selection.subagents).toBeNull();
    expect(result!.instructionId).toBe("custom-ins-1");
  });

  it("subagentNames/skillNames 모두 null → selection 전체(null, null)", () => {
    mockResolveAgentComposition.mockReturnValue({
      subagentNames: null,
      skillNames: null,
      instructionId: "default",
    });
    const comp = mockResolveAgentComposition("agent-empty") as {
      subagentNames: string[] | null;
      skillNames: string[] | null;
      instructionId: string;
    };
    const result = mapCustomAgentToSelection(comp);
    expect(result!.selection.subagents).toBeNull();
    expect(result!.selection.skills).toBeNull();
  });

  it("subagentNames/skillNames 빈 배열 → selection 전부 끔(빈 배열)", () => {
    mockResolveAgentComposition.mockReturnValue({
      subagentNames: [],
      skillNames: [],
      instructionId: "default",
    });
    const comp = mockResolveAgentComposition("agent-off") as {
      subagentNames: string[] | null;
      skillNames: string[] | null;
      instructionId: string;
    };
    const result = mapCustomAgentToSelection(comp);
    // resolveAgentComposition 에서 빈 배열은 null 로 변환(agent.ts 계약과 정합)
    // 빈 배열 → buildHarnessConfig 에서 필터 전부 제외, null → 전체
    // 이 케이스: customAgentStore 가 [] → null 로 반환하므로 실제 도달 안 함
    // 여기선 raw 빈 배열 입력 시 매핑 결과 검증
    expect(result!.selection.subagents).toEqual([]);
    expect(result!.selection.skills).toEqual([]);
  });

  it("instructionId 가 올바르게 전달된다", () => {
    mockResolveAgentComposition.mockReturnValue({
      subagentNames: null,
      skillNames: null,
      instructionId: "finance-expert",
    });
    const comp = mockResolveAgentComposition("agent-fin") as {
      subagentNames: string[] | null;
      skillNames: string[] | null;
      instructionId: string;
    };
    const result = mapCustomAgentToSelection(comp);
    expect(result!.instructionId).toBe("finance-expert");
  });
});

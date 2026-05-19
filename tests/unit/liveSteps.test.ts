import { describe, it, expect } from "vitest";
import { selectLiveSteps } from "@/lib/agent/utils/liveSteps";
import type { ThinkingStep } from "@/types";

// 라이브 모드 표시 step 선택 순수함수 정답지 (TDD — NFR-11).
// 사용자 확정 규칙:
//  1. 마지막 step=reasoning → 그 reasoning 1개만(도구영역 즉시 리플레이스)
//  2. 마지막 step=tool → 진행 중(result undefined) tool + OUT 됐지만
//     now-outSeenAt<grace 인 tool, start 최근 3개(슬라이딩)
//  3. OUT 도착 후 grace(0.6s) 지나면 탈락(히스토리엔 보존 — steps 불변)
// outSeenAt: 컴포넌트가 추적하는 "tool step result 최초 감지 시각" 주입
// (함수는 순수 — 타이머/상태 없음).

const reasoning = (i: number): ThinkingStep => ({
  kind: "reasoning",
  title: i === 0 ? "질문 분석 중" : "결과 분석 중",
  content: `r${i}`,
  order: i,
});

const tool = (
  id: string,
  startedAt: number,
  result?: string,
): ThinkingStep => ({
  kind: "tool",
  title: result ? "웹 검색 도구 완료" : "웹 검색 도구 실행 중",
  id,
  name: "web_search",
  args: `{"query":"${id}"}`,
  result,
  startedAt,
  order: 0,
});

const GRACE = 600;

describe("selectLiveSteps — 마지막 step 종류별 분기", () => {
  it("빈 배열 → 빈 배열", () => {
    expect(selectLiveSteps([], new Map(), 1000, GRACE)).toEqual([]);
  });

  it("마지막 step=reasoning → 그 reasoning 1개만(도구 전부 리플레이스)", () => {
    const steps = [tool("a", 10), tool("b", 20), reasoning(1)];
    const r = selectLiveSteps(steps, new Map(), 1000, GRACE);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("reasoning");
    expect(r[0]).toBe(steps[2]);
  });

  it("마지막 step=reasoning 이면 OUT grace 중 tool 도 모두 사라짐(즉시 리플레이스)", () => {
    const steps = [tool("a", 10, "결과"), reasoning(0)];
    const seen = new Map([[0, 990]]); // a OUT 방금(grace 내)
    const r = selectLiveSteps(steps, seen, 1000, GRACE);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("reasoning");
  });
});

describe("selectLiveSteps — tool 진행 중 + 최근 3개", () => {
  it("진행 중(result undefined) tool 1개 → 그 1개", () => {
    const steps = [tool("a", 10)];
    const r = selectLiveSteps(steps, new Map(), 1000, GRACE);
    expect(r.map((s) => s.kind === "tool" && s.id)).toEqual(["a"]);
  });

  it("진행 중 3개 동시 → 3개 전부(병렬 노출)", () => {
    const steps = [tool("a", 10), tool("b", 11), tool("c", 11)];
    const r = selectLiveSteps(steps, new Map(), 1000, GRACE);
    expect(r).toHaveLength(3);
  });

  it("진행 중 5개 → start 최근 3개만(슬라이딩)", () => {
    const steps = [
      tool("a", 10),
      tool("b", 20),
      tool("c", 30),
      tool("d", 40),
      tool("e", 50),
    ];
    const r = selectLiveSteps(steps, new Map(), 1000, GRACE);
    expect(r).toHaveLength(3);
    // start 최근 3개 = c,d,e (a,b 탈락)
    expect(r.map((s) => (s.kind === "tool" ? s.id : ""))).toEqual([
      "c",
      "d",
      "e",
    ]);
  });
});

describe("selectLiveSteps — OUT grace(0.6s) 동안 잠시 노출 후 탈락", () => {
  it("OUT 도착 후 grace 내 → 아직 보임(잠시 노출)", () => {
    const steps = [tool("a", 10, "삼성전자 결과")];
    const seen = new Map([[0, 1000]]); // a OUT 을 t=1000 에 감지
    const r = selectLiveSteps(steps, seen, 1300, GRACE); // 300ms 경과 < 600
    expect(r).toHaveLength(1);
    expect(r[0].kind === "tool" && r[0].result).toBe("삼성전자 결과");
  });

  it("OUT 후 grace 경과 → 탈락(visible 제외, steps 자체는 불변)", () => {
    const steps = [tool("a", 10, "결과"), tool("b", 20)];
    const seen = new Map([[0, 1000]]); // a OUT t=1000
    const r = selectLiveSteps(steps, seen, 1700, GRACE); // 700ms > 600 → a 탈락
    expect(r.map((s) => (s.kind === "tool" ? s.id : ""))).toEqual(["b"]);
    expect(steps).toHaveLength(2); // 원본 불변(히스토리 보존)
  });

  it("진행중 + grace내 OUT 혼재 → 둘 다 표시(최근 3개 한도)", () => {
    const steps = [
      tool("a", 10, "결과A"), // OUT, grace 내
      tool("b", 20), // 진행중
      tool("c", 30), // 진행중
    ];
    const seen = new Map([[0, 1200]]);
    const r = selectLiveSteps(steps, seen, 1400, GRACE); // a: 200ms<600
    expect(r).toHaveLength(3);
  });

  it("grace 경과 OUT + 진행중 합쳐 4개 → 최근 3개(완료 grace지남 탈락 우선)", () => {
    const steps = [
      tool("a", 10, "결과"), // OUT grace 지남 → 무조건 탈락
      tool("b", 20),
      tool("c", 30),
      tool("d", 40),
    ];
    const seen = new Map([[0, 1000]]);
    const r = selectLiveSteps(steps, seen, 2000, GRACE); // a 1000ms 경과
    // a 탈락 → b,c,d 진행중 3개
    expect(r.map((s) => (s.kind === "tool" ? s.id : ""))).toEqual([
      "b",
      "c",
      "d",
    ]);
  });

  it("outSeenAt 미기록(아직 result 없던 직전) tool 은 진행중 취급", () => {
    const steps = [tool("a", 10)]; // result undefined, seen 없음
    const r = selectLiveSteps(steps, new Map(), 9999, GRACE);
    expect(r).toHaveLength(1);
  });
});

describe("selectLiveSteps — reasoning↔tool 교차", () => {
  it("reasoning → tool 들 → 마지막 tool: tool 들만(앞 reasoning 제외)", () => {
    const steps = [reasoning(0), tool("a", 10), tool("b", 20)];
    const r = selectLiveSteps(steps, new Map(), 1000, GRACE);
    expect(r.every((s) => s.kind === "tool")).toBe(true);
    expect(r).toHaveLength(2);
  });

  it("tool 들 → reasoning: reasoning 1개만(tool 영역 리플레이스)", () => {
    const steps = [tool("a", 10), tool("b", 20), reasoning(1)];
    const r = selectLiveSteps(steps, new Map(), 1000, GRACE);
    expect(r).toEqual([steps[2]]);
  });
});

import { describe, it, expect } from "vitest";
import {
  reduceReasoning,
  reduceToolCall,
  reduceToolResult,
} from "@/lib/agent/utils/thinkingSteps";
import type { ThinkingStep } from "@/types";

// thinkingSteps 리듀서 단위 테스트 (LLM/React 비의존, 순수 함수 — NFR-11).
// medigate-new agentSession.ts thinkingSteps[] 빌드 규칙 모방:
//   reasoning/tool 을 단일 배열에 발생 순서대로 누적 → 교차 보존이 핵심.
// 동작은 src/lib/agent/utils/thinkingSteps.ts 의 실제 코드 기준으로 검증.

// 좁힌 타입 단언 헬퍼 (discriminated union 가독성).
function asReasoning(s: ThinkingStep) {
  if (s.kind !== "reasoning") throw new Error(`expected reasoning, got ${s.kind}`);
  return s;
}
function asTool(s: ThinkingStep) {
  if (s.kind !== "tool") throw new Error(`expected tool, got ${s.kind}`);
  return s;
}

describe("reduceReasoning — 제목 경계 파싱 & 누적", () => {
  it("빈 steps + `**Title**\\n\\nbody` → reasoning 1개 {title,content}", () => {
    const r = reduceReasoning([], "**Title**\n\nbody", 0);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      kind: "reasoning",
      title: "Title",
      content: "body",
      order: 0,
    });
  });

  it("빈 steps + 볼드 없는 plain 델타 → reasoning 1개 {title:'', content:delta}", () => {
    const r = reduceReasoning([], "그냥 사고 텍스트", 0);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      title: "",
      content: "그냥 사고 텍스트",
      order: 0,
    });
  });

  it("스트리밍 제목 분할: `**Chec` → `king Samsung**\\n\\nI need` 가 step 1개로 합쳐진다(제목 버퍼)", () => {
    const a = reduceReasoning([], "**Chec", 0);
    // 제목 미완성 — title 빈 버퍼 step.
    expect(a).toHaveLength(1);
    expect(asReasoning(a[0])).toMatchObject({ title: "", content: "**Chec" });

    const b = reduceReasoning(a, "king Samsung**\n\nI need", 1);
    expect(b).toHaveLength(1); // 새 step 생기지 않음 — 같은 step 에 제목 확정
    const step = asReasoning(b[0]);
    expect(step.title).toBe("Checking Samsung");
    expect(step.content.startsWith("I need")).toBe(true);
    expect(step.content).toBe("I need");
  });

  it("연속 plain reasoning 델타는 같은 step 의 content 에 누적(새 step 없음)", () => {
    let r = reduceReasoning([], "**제목**\n\n첫", 0);
    r = reduceReasoning(r, " 둘째", 1);
    r = reduceReasoning(r, " 셋째", 1);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      title: "제목",
      content: "첫 둘째 셋째",
      order: 0,
    });
  });

  it("후속 델타에 새 `**Title2**` 등장 → 새 reasoning step 분기(이전 content trim, order 증가)", () => {
    let r = reduceReasoning([], "**Step1**\n\n본문1 ", 0);
    r = reduceReasoning(r, "**Step2**\n\n본문2", 1);
    expect(r).toHaveLength(2);
    const s0 = asReasoning(r[0]);
    const s1 = asReasoning(r[1]);
    expect(s0).toMatchObject({ title: "Step1", order: 0 });
    expect(s0.content).toBe("본문1"); // 꼬리 공백 trim 됨 (replace(/\s+$/,""))
    expect(s1).toMatchObject({ title: "Step2", content: "본문2", order: 1 });
  });

  it("tool step 뒤 reasoning 델타 → 새 reasoning step 생성(교차: tool→reasoning 머지 안 됨)", () => {
    const withTool = reduceToolCall([], { id: "t1", name: "web_search", args: "{}" }, 0);
    const r = reduceReasoning(withTool, "**다음생각**\n\n분석", 1);
    expect(r).toHaveLength(2);
    expect(asTool(r[0])).toMatchObject({ kind: "tool", id: "t1" });
    expect(asReasoning(r[1])).toMatchObject({
      kind: "reasoning",
      title: "다음생각",
      content: "분석",
      order: 1,
    });
  });

  it("불변성(실제 동작): 빈 steps + '' 델타도 새 배열 + reasoning step 1개 생성한다(same-ref 아님)", () => {
    // 소스 reduceReasoning 은 마지막 분기에서 항상 steps.concat(...) 하므로
    // 빈 델타라도 새 배열 + {title:'',content:''} step 을 만든다(same-ref 미반환).
    const input: ThinkingStep[] = [];
    const r = reduceReasoning(input, "", 0);
    expect(r).not.toBe(input);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({ title: "", content: "", order: 0 });
  });

  it("불변성: 입력 배열 자체는 변형되지 않는다(새 배열 반환)", () => {
    const input: ThinkingStep[] = [];
    const r = reduceReasoning(input, "**T**\n\nx", 0);
    expect(input).toHaveLength(0); // 원본 불변
    expect(r).not.toBe(input);
  });
});

describe("reduceToolCall — id 매칭 머지 / 조각 누적 / 교차", () => {
  it("id 있는 델타 → 새 tool step {kind:'tool', id, name, title:name, args}", () => {
    const r = reduceToolCall([], { id: "t1", name: "web_search", args: '{"q":' }, 0);
    expect(r).toHaveLength(1);
    expect(asTool(r[0])).toMatchObject({
      kind: "tool",
      id: "t1",
      name: "web_search",
      title: "web_search",
      args: '{"q":',
      order: 0,
    });
  });

  it("같은 id 후속 델타 → 그 step 의 args 에 이어붙임(새 step 없음)", () => {
    let r = reduceToolCall([], { id: "t1", name: "web_search", args: '{"q":' }, 0);
    r = reduceToolCall(r, { id: "t1", name: "", args: '"삼성"}' }, 1);
    expect(r).toHaveLength(1);
    expect(asTool(r[0])).toMatchObject({
      id: "t1",
      name: "web_search", // 빈 name 이면 기존 유지
      args: '{"q":"삼성"}',
    });
  });

  it("id 빈 args 조각 → 마지막 tool step 에 args 이어붙임", () => {
    let r = reduceToolCall([], { id: "t1", name: "web_search", args: "{" }, 0);
    r = reduceToolCall(r, { id: "", name: "", args: '"q":1}' }, 1);
    expect(r).toHaveLength(1);
    expect(asTool(r[0]).args).toBe('{"q":1}');
  });

  it("reasoning step 뒤 tool_call → 새 tool step append(교차 보존, reasoning 불변)", () => {
    const withR = reduceReasoning([], "**생각**\n\n본문", 0);
    const r = reduceToolCall(withR, { id: "t1", name: "current_time", args: "{}" }, 1);
    expect(r).toHaveLength(2);
    expect(asReasoning(r[0])).toMatchObject({ title: "생각", content: "본문" });
    expect(asTool(r[1])).toMatchObject({
      kind: "tool",
      id: "t1",
      name: "current_time",
      order: 1,
    });
  });

  it("id 없는 조각 + 매칭 tool step 없음 → 입력 그대로(same-ref 반환)", () => {
    const input: ThinkingStep[] = [
      { kind: "reasoning", title: "t", content: "c", order: 0 },
    ];
    const r = reduceToolCall(input, { id: "", name: "", args: "fragment" }, 1);
    expect(r).toBe(input); // same ref — store setState 스킵 가능
  });

  it("id 없는 조각 + 완전 빈 steps → 입력 그대로(same-ref 반환)", () => {
    const input: ThinkingStep[] = [];
    const r = reduceToolCall(input, { id: "", name: "", args: "x" }, 0);
    expect(r).toBe(input);
  });
});

describe("reduceToolResult — id/name 매칭 result 채움", () => {
  it("id 매칭 → 해당 tool step 에 result 채움", () => {
    const steps = reduceToolCall([], { id: "t1", name: "web_search", args: "{}" }, 0);
    const r = reduceToolResult(steps, "web_search", "결과데이터", "t1");
    expect(r).toHaveLength(1);
    expect(asTool(r[0]).result).toBe("결과데이터");
  });

  it("name 매칭(id 없음) + 첫 동일 name tool step result===undefined → 채움", () => {
    const steps = reduceToolCall([], { id: "t1", name: "web_search", args: "{}" }, 0);
    const r = reduceToolResult(steps, "web_search", "OUT");
    expect(asTool(r[0]).result).toBe("OUT");
  });

  it("매칭 없음 → 입력 그대로(same-ref 반환)", () => {
    const input: ThinkingStep[] = [
      { kind: "tool", title: "a", id: "t1", name: "web_search", args: "{}", order: 0 },
    ];
    const r = reduceToolResult(input, "없는도구", "x", "없는id");
    expect(r).toBe(input);
  });

  it("reasoning 만 있는 배열 → 매칭 없어 same-ref 반환", () => {
    const input: ThinkingStep[] = [
      { kind: "reasoning", title: "t", content: "c", order: 0 },
    ];
    const r = reduceToolResult(input, "web_search", "x");
    expect(r).toBe(input);
  });

  it("id 매칭이 name 매칭보다 우선한다", () => {
    // 같은 name 인 tool step 2개. id 는 두 번째(t2) 를 지정 →
    // name 으로는 첫 번째(result undefined)가 잡히지만 id 우선이라 t2 가 채워져야.
    let steps = reduceToolCall([], { id: "t1", name: "web_search", args: "{}" }, 0);
    steps = reduceToolCall(steps, { id: "t2", name: "web_search", args: "{}" }, 1);
    const r = reduceToolResult(steps, "web_search", "t2-결과", "t2");
    const t1 = asTool(r[0]);
    const t2 = asTool(r[1]);
    expect(t1.id).toBe("t1");
    expect(t1.result).toBeUndefined(); // name 으로 잡히지 않음 (id 우선)
    expect(t2.id).toBe("t2");
    expect(t2.result).toBe("t2-결과");
  });
});

describe("교차 통합 — 회귀 가드 (사고→도구→사고→도구 순서 보존)", () => {
  it("reasoning Step1 → tool t1 → result t1 → reasoning Step2 → tool t2 → result t2 순서 그대로", () => {
    let steps: ThinkingStep[] = [];
    steps = reduceReasoning(steps, "**Step1**\n\na", 0);
    steps = reduceToolCall(steps, { id: "t1", name: "web_search", args: "{}" }, 1);
    steps = reduceToolResult(steps, "web_search", "r1", "t1");
    steps = reduceReasoning(steps, "**Step2**\n\nb", 2);
    steps = reduceToolCall(steps, { id: "t2", name: "current_time", args: "{}" }, 3);
    steps = reduceToolResult(steps, "current_time", "r2", "t2");

    expect(steps).toHaveLength(4);

    const s0 = asReasoning(steps[0]);
    expect(s0).toMatchObject({ kind: "reasoning", title: "Step1", content: "a", order: 0 });

    const s1 = asTool(steps[1]);
    expect(s1).toMatchObject({ kind: "tool", id: "t1", name: "web_search", result: "r1" });

    const s2 = asReasoning(steps[2]);
    expect(s2).toMatchObject({ kind: "reasoning", title: "Step2", content: "b" });

    const s3 = asTool(steps[3]);
    expect(s3).toMatchObject({ kind: "tool", id: "t2", name: "current_time", result: "r2" });

    // 핵심 회귀 가드: kind 시퀀스가 grouping 되지 않고 교차 보존.
    expect(steps.map((s) => s.kind)).toEqual([
      "reasoning",
      "tool",
      "reasoning",
      "tool",
    ]);
  });
});

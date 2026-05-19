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

// Slice H — `**bold**` 를 step **경계 신호**로 사용(제목으로는 안 씀).
// OpenAI reasoning summary 는 각 사고 단계를 `**제목**\n\n본문` 으로
// 준다(경계 메타 이벤트 없음). 새 bold 단락이 등장하면 새 reasoning
// step 분기 → liveMode 가 단계마다 리플레이스(누적 버그 해소). 단
// step 제목은 여전히 order 기반 한글('질문 분석 중'/'결과 분석 중'),
// 영문 bold 텍스트는 제목이 아니라 content(본문)에 그대로 포함.
describe("reduceReasoning — bold 경계 step 분기 + order 한글 제목", () => {
  it("빈 steps + 첫 델타(bold 포함) → '질문 분석 중', content=원문(가공 0)", () => {
    const r = reduceReasoning([], "**Clarifying user intent**\n\nbody", 0);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      kind: "reasoning",
      title: "질문 분석 중",
      content: "**Clarifying user intent**\n\nbody",
      order: 0,
    });
  });

  it("plain 영문 델타도 그대로 content(번역/파싱 없음), 제목 '질문 분석 중'", () => {
    const r = reduceReasoning([], "Deciding on the search approach", 0);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      title: "질문 분석 중",
      content: "Deciding on the search approach",
      order: 0,
    });
  });

  it("같은 단계 내 연속 plain 델타는 같은 step 에 누적(bold 경계 없음)", () => {
    let r = reduceReasoning([], "첫 ", 0);
    r = reduceReasoning(r, "둘째 ", 1);
    r = reduceReasoning(r, "셋째", 2);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      title: "질문 분석 중",
      content: "첫 둘째 셋째",
      order: 0,
    });
  });

  it("첫 step 본문 누적 후 새 **bold** 단락 → 새 step 분기(핵심 버그 수정)", () => {
    let r = reduceReasoning([], "**Searching articles**\n\n본문1 진행", 0);
    r = reduceReasoning(r, " 더 진행", 1); // 같은 단계 누적
    r = reduceReasoning(r, "\n\n**Structuring risks**\n\n본문2", 2);
    expect(r).toHaveLength(2); // 새 bold 경계 → 분기
    const s0 = asReasoning(r[0]);
    const s1 = asReasoning(r[1]);
    expect(s0.title).toBe("질문 분석 중");
    expect(s0.content).toBe("**Searching articles**\n\n본문1 진행 더 진행");
    // 2번째 reasoning step → '결과 분석 중'(order 기반)
    expect(s1.title).toBe("결과 분석 중");
    expect(s1.content).toBe("**Structuring risks**\n\n본문2");
  });

  it("스트리밍으로 bold 가 쪼개져 와도(`**Struc`/`turing**`) 1회만 분기", () => {
    let r = reduceReasoning([], "**A**\n\n초기 본문", 0);
    r = reduceReasoning(r, "\n\n**Struc", 1); // bold 미완성 — 아직 분기 X
    expect(r).toHaveLength(1);
    r = reduceReasoning(r, "turing risks**\n\n본문2", 2); // bold 완성 → 분기
    expect(r).toHaveLength(2);
    expect(asReasoning(r[0]).title).toBe("질문 분석 중");
    expect(asReasoning(r[1]).title).toBe("결과 분석 중");
    expect(asReasoning(r[1]).content).toContain("Structuring risks");
  });

  it("step 본문이 아직 비어있으면 선두 bold 는 분기 아님(첫 단계 시작)", () => {
    let r = reduceReasoning([], "", 0); // 빈 step 먼저
    r = reduceReasoning(r, "**First step**\n\nbody", 1);
    expect(r).toHaveLength(1); // 본문 없던 step 의 선두 bold → 같은 step
    expect(asReasoning(r[0]).content).toBe("**First step**\n\nbody");
  });

  it("tool step 뒤 reasoning → 새 step, 2번째 reasoning '결과 분석 중'", () => {
    let r = reduceReasoning([], "초기 사고", 0);
    r = reduceToolCall(r, { id: "t1", name: "web_search", args: "{}" }, 1);
    r = reduceReasoning(r, "검색 결과 해석", 2);
    expect(r).toHaveLength(3);
    expect(asReasoning(r[0])).toMatchObject({ title: "질문 분석 중" });
    expect(asTool(r[1])).toMatchObject({ kind: "tool", id: "t1" });
    expect(asReasoning(r[2])).toMatchObject({
      kind: "reasoning",
      title: "결과 분석 중",
      content: "검색 결과 해석",
    });
  });

  it("reasoning→tool→reasoning→tool→reasoning: 2·3번째 모두 '결과 분석 중'", () => {
    let r = reduceReasoning([], "a", 0);
    r = reduceToolCall(r, { id: "t1", name: "ws", args: "{}" }, 1);
    r = reduceReasoning(r, "b", 2);
    r = reduceToolCall(r, { id: "t2", name: "ws", args: "{}" }, 3);
    r = reduceReasoning(r, "c", 4);
    const reasonings = r.filter((s) => s.kind === "reasoning");
    expect(reasonings).toHaveLength(3);
    expect(asReasoning(reasonings[0]).title).toBe("질문 분석 중");
    expect(asReasoning(reasonings[1]).title).toBe("결과 분석 중");
    expect(asReasoning(reasonings[2]).title).toBe("결과 분석 중");
  });

  it("bold 경계 분기로 생긴 step 도 reasoning 순번에 포함(order 일관)", () => {
    let r = reduceReasoning([], "**S1**\n\n본문", 0);
    r = reduceReasoning(r, "\n\n**S2**\n\n본문", 1); // 분기 → 2번째
    r = reduceReasoning(r, "\n\n**S3**\n\n본문", 2); // 분기 → 3번째
    const reasonings = r.filter((s) => s.kind === "reasoning");
    expect(reasonings).toHaveLength(3);
    expect(asReasoning(reasonings[0]).title).toBe("질문 분석 중");
    expect(asReasoning(reasonings[1]).title).toBe("결과 분석 중");
    expect(asReasoning(reasonings[2]).title).toBe("결과 분석 중");
  });

  it("불변성: 입력 배열 자체는 변형되지 않는다(새 배열 반환)", () => {
    const input: ThinkingStep[] = [];
    const r = reduceReasoning(input, "x", 0);
    expect(input).toHaveLength(0);
    expect(r).not.toBe(input);
  });

  it("빈 델타도 첫 step 생성('질문 분석 중', content='')", () => {
    const r = reduceReasoning([], "", 0);
    expect(r).toHaveLength(1);
    expect(asReasoning(r[0])).toMatchObject({
      title: "질문 분석 중",
      content: "",
      order: 0,
    });
  });
});

describe("reduceToolCall — id 매칭 머지 / 조각 누적 / 교차", () => {
  it("id 있는 델타 → 새 tool step, title 은 한글 안내문구('웹 검색 도구 실행 중')", () => {
    const r = reduceToolCall([], { id: "t1", name: "web_search", args: '{"q":' }, 0);
    expect(r).toHaveLength(1);
    expect(asTool(r[0])).toMatchObject({
      kind: "tool",
      id: "t1",
      name: "web_search",
      title: "웹 검색 도구 실행 중",
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
    const withR = reduceReasoning([], "초기 생각 본문", 0);
    const r = reduceToolCall(withR, { id: "t1", name: "current_time", args: "{}" }, 1);
    expect(r).toHaveLength(2);
    expect(asReasoning(r[0])).toMatchObject({
      title: "질문 분석 중",
      content: "초기 생각 본문",
    });
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

// Slice K — web_search citations 덮어쓰기.
// 원인: web_search N개면 IN step N개, 출처(citations)는 OpenAI 가
// 답변에 종합해 1번만 옴(id 없음, "참고 출처..."). status='completed'
// 로 모든 step 이 '검색 완료'된 뒤 citations 가 와도 name 폴백
// (result===undefined)은 채울 step 이 없어 출처가 사라짐. 해법:
// id 없는 web_search citations 는 **마지막 web_search step** result 를
// '검색 완료 + 출처'로 덮어쓴다(result 유무 무관).
describe("reduceToolResult — web_search citations 마지막 step 덮어쓰기", () => {
  const CITE = "참고 출처 1건:\n• 삼성 (https://s.example)";

  it("status 로 모두 '검색 완료'된 후 citations → 마지막 step 에 출처 덮어씀", () => {
    let s = reduceToolCall([], { id: "w1", name: "web_search", args: "{}" }, 0);
    s = reduceToolCall(s, { id: "w2", name: "web_search", args: "{}" }, 1);
    s = reduceToolResult(s, "web_search", "검색 완료", "w1");
    s = reduceToolResult(s, "web_search", "검색 완료", "w2");
    // citations: id 없음 + "참고 출처" 패턴 → 마지막(w2) 덮어쓰기.
    s = reduceToolResult(s, "web_search", CITE, "");
    expect(asTool(s[0]).result).toBe("검색 완료"); // w1 불변
    expect(asTool(s[1]).result).toBe(CITE); // w2 출처로 덮임
  });

  it("web_search step 1개일 때도 citations 가 그 step 에 덮임", () => {
    let s = reduceToolCall([], { id: "w1", name: "web_search", args: "{}" }, 0);
    s = reduceToolResult(s, "web_search", "검색 완료", "w1");
    s = reduceToolResult(s, "web_search", CITE, "");
    expect(asTool(s[0]).result).toBe(CITE);
  });

  it("id 없는 일반 result(출처 패턴 아님)는 기존 name 폴백 유지(미완료 step)", () => {
    let s = reduceToolCall([], { id: "w1", name: "web_search", args: "{}" }, 0);
    s = reduceToolCall(s, { id: "w2", name: "web_search", args: "{}" }, 1);
    // "검색 완료"(출처 패턴 아님) + id 없음 → 첫 미완료(w1).
    s = reduceToolResult(s, "web_search", "검색 완료", "");
    expect(asTool(s[0]).result).toBe("검색 완료");
    expect(asTool(s[1]).result).toBeUndefined();
  });

  it("citations 인데 web_search step 이 하나도 없으면 same-ref(무시)", () => {
    const input: ThinkingStep[] = [
      { kind: "reasoning", title: "질문 분석 중", content: "x", order: 0 },
    ];
    const r = reduceToolResult(input, "web_search", CITE, "");
    expect(r).toBe(input);
  });

  it("id 있는 citations(드묾)는 id 매칭 우선(덮어쓰기 분기 안 탐)", () => {
    let s = reduceToolCall([], { id: "w1", name: "web_search", args: "{}" }, 0);
    s = reduceToolCall(s, { id: "w2", name: "web_search", args: "{}" }, 1);
    s = reduceToolResult(s, "web_search", CITE, "w1"); // id 명시 → w1
    expect(asTool(s[0]).result).toBe(CITE);
    expect(asTool(s[1]).result).toBeUndefined();
  });
});

describe("교차 통합 — 회귀 가드 (사고→도구→사고→도구 순서 보존)", () => {
  it("reasoning → tool t1 → result t1 → reasoning → tool t2 → result t2 순서 그대로", () => {
    let steps: ThinkingStep[] = [];
    steps = reduceReasoning(steps, "a", 0);
    steps = reduceToolCall(steps, { id: "t1", name: "web_search", args: "{}" }, 1);
    steps = reduceToolResult(steps, "web_search", "r1", "t1");
    steps = reduceReasoning(steps, "b", 2);
    steps = reduceToolCall(steps, { id: "t2", name: "current_time", args: "{}" }, 3);
    steps = reduceToolResult(steps, "current_time", "r2", "t2");

    expect(steps).toHaveLength(4);

    const s0 = asReasoning(steps[0]);
    expect(s0).toMatchObject({
      kind: "reasoning",
      title: "질문 분석 중",
      content: "a",
      order: 0,
    });

    const s1 = asTool(steps[1]);
    expect(s1).toMatchObject({ kind: "tool", id: "t1", name: "web_search", result: "r1" });

    const s2 = asReasoning(steps[2]);
    expect(s2).toMatchObject({
      kind: "reasoning",
      title: "결과 분석 중",
      content: "b",
    });

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

// ── Slice A: elapsed 측정 (clock 주입) ──────────────────────────────
// deepagents/LangGraph 는 서버 elapsed 를 안 줌 → reducer 가 주입된
// now(ms)로 startedAt 기록 / tool_result 매칭 시 elapsedMs 계산.
// now 인자 미전달 시 Date.now() 기본값(기존 호출부 호환).
describe("reduceToolCall — startedAt 기록(clock 주입)", () => {
  it("새 tool step 생성 시 주입된 now 가 startedAt 에 기록된다", () => {
    const steps = reduceToolCall(
      [],
      { id: "t1", name: "web_search", args: "{}" },
      0,
      1_000,
    );
    expect(asTool(steps[0])).toMatchObject({ id: "t1", startedAt: 1_000 });
  });

  it("같은 id 후속 args 조각은 startedAt 을 덮어쓰지 않는다(최초 시각 보존)", () => {
    let steps = reduceToolCall(
      [],
      { id: "t1", name: "ws", args: '{"q":' },
      0,
      1_000,
    );
    steps = reduceToolCall(
      steps,
      { id: "t1", name: "ws", args: '"x"}' },
      0,
      9_999,
    );
    expect(asTool(steps[0])).toMatchObject({ startedAt: 1_000 });
  });

  it("now 미전달 시에도 startedAt 은 number 로 채워진다(Date.now 기본값)", () => {
    const steps = reduceToolCall([], { id: "t1", name: "ws", args: "{}" }, 0);
    expect(typeof asTool(steps[0]).startedAt).toBe("number");
  });
});

describe("reduceToolResult — elapsedMs 계산(now - startedAt)", () => {
  it("startedAt=1000 인 tool step + result(now=2500) → elapsedMs=1500", () => {
    let steps = reduceToolCall(
      [],
      { id: "t1", name: "web_search", args: "{}" },
      0,
      1_000,
    );
    steps = reduceToolResult(steps, "web_search", "r1", "t1", 2_500);
    expect(asTool(steps[0])).toMatchObject({
      result: "r1",
      elapsedMs: 1_500,
    });
  });

  it("startedAt 이 없는 tool step → elapsedMs 미설정(undefined)", () => {
    // startedAt 없이 강제 구성된 레거시 step.
    const legacy: ThinkingStep[] = [
      { kind: "tool", title: "ws", id: "t1", name: "ws", args: "{}", order: 0 },
    ];
    const steps = reduceToolResult(legacy, "ws", "r1", "t1", 5_000);
    expect(asTool(steps[0]).elapsedMs).toBeUndefined();
  });

  it("now 미전달 시 elapsedMs 는 음수가 아니다(Date.now 기본값, startedAt 과거)", () => {
    let steps = reduceToolCall(
      [],
      { id: "t1", name: "ws", args: "{}" },
      0,
      Date.now() - 50,
    );
    steps = reduceToolResult(steps, "ws", "r1", "t1");
    const e = asTool(steps[0]).elapsedMs;
    expect(e).toBeGreaterThanOrEqual(0);
  });
});

// ── Slice E: 동일 도구도 항상 개별 step (count 메커니즘 제거) ──────
// 사용자 요구: "웹검색이 반복되면 곱하기로 표현되는데 개별 검색을
// 나눠서 보여줘야 한다". medigate 의 toolKey 그룹화(×count)를 폐기.
// 1-tier flat 구조엔 검색마다 별도 step 이 자연스럽다. 각 호출은
// 자기 IN/OUT/elapsed 를 독립적으로 가진다.
describe("reduceToolCall — 동일 도구도 항상 개별 step (count 제거)", () => {
  it("같은 name 도구가 연속(직전 step 완료) → 새 step 분리, count 미설정", () => {
    let steps = reduceToolCall(
      [],
      { id: "a1", name: "web_search", args: '{"q":"삼성"}' },
      0,
      1_000,
    );
    steps = reduceToolResult(steps, "web_search", "r1", "a1", 1_500);
    steps = reduceToolCall(
      steps,
      { id: "a2", name: "web_search", args: '{"q":"LG"}' },
      1,
      2_000,
    );
    expect(steps).toHaveLength(2);
    expect(asTool(steps[0])).toMatchObject({
      id: "a1",
      result: "r1",
      args: '{"q":"삼성"}',
    });
    expect(asTool(steps[1])).toMatchObject({
      id: "a2",
      args: '{"q":"LG"}',
      startedAt: 2_000,
    });
    // 새 step 은 result 키 자체가 없다(실행 전 — undefined).
    expect(asTool(steps[1]).result).toBeUndefined();
    // 두 검색이 독립 step — 검색어가 각자 보존된다(묶임 0).
    expect(asTool(steps[0]).args).not.toBe(asTool(steps[1]).args);
  });

  it("같은 검색어로 재시도해도 별도 step (완전 동일 호출도 분리)", () => {
    let steps = reduceToolCall(
      [],
      { id: "a1", name: "web_search", args: '{"q":"삼성"}' },
      0,
      1_000,
    );
    steps = reduceToolResult(steps, "web_search", "r1", "a1", 1_200);
    steps = reduceToolCall(
      steps,
      { id: "a2", name: "web_search", args: '{"q":"삼성"}' },
      1,
      1_300,
    );
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.kind === "tool")).toBe(true);
  });

  it("reasoning 이 끼어도 교차 보존(tool→reasoning→tool)", () => {
    let steps = reduceToolCall(
      [],
      { id: "a1", name: "ws", args: "{}" },
      0,
      1_000,
    );
    steps = reduceToolResult(steps, "ws", "r1", "a1", 1_200);
    steps = reduceReasoning(steps, "중간 사고 본문", 1);
    steps = reduceToolCall(
      steps,
      { id: "a2", name: "ws", args: "{}" },
      2,
      2_000,
    );
    expect(steps.map((s) => s.kind)).toEqual(["tool", "reasoning", "tool"]);
  });

  it("다른 name 도구가 연속 → 새 step", () => {
    let steps = reduceToolCall(
      [],
      { id: "a1", name: "web_search", args: "{}" },
      0,
      1_000,
    );
    steps = reduceToolResult(steps, "web_search", "r1", "a1", 1_100);
    steps = reduceToolCall(
      steps,
      { id: "b1", name: "current_time", args: "{}" },
      1,
      1_200,
    );
    expect(steps).toHaveLength(2);
    expect(asTool(steps[1])).toMatchObject({ name: "current_time" });
  });

  it("직전 도구 실행 중(result 미수신)에 같은 도구 호출 → 별도 step(병렬 분리)", () => {
    let steps = reduceToolCall(
      [],
      { id: "a1", name: "ws", args: "{}" },
      0,
      1_000,
    );
    steps = reduceToolCall(
      steps,
      { id: "a2", name: "ws", args: "{}" },
      1,
      1_050,
    );
    expect(steps).toHaveLength(2);
    expect(asTool(steps[0]).id).toBe("a1");
    expect(asTool(steps[1]).id).toBe("a2");
  });

  it("같은 id 후속 args 조각은 여전히 그 step 에 누적(스트리밍 델타 보존)", () => {
    let steps = reduceToolCall(
      [],
      { id: "a1", name: "ws", args: '{"q":' },
      0,
      1_000,
    );
    steps = reduceToolCall(
      steps,
      { id: "a1", name: "ws", args: '"삼성"}' },
      0,
      1_001,
    );
    expect(steps).toHaveLength(1);
    expect(asTool(steps[0]).args).toBe('{"q":"삼성"}');
  });
});

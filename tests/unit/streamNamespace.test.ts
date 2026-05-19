import { describe, it, expect } from "vitest";
import {
  normalizePart,
  isSubagentNamespace,
  initTaskTrack,
  trackTaskCompletion,
  drainPendingTasks,
  extractToolEventResult,
} from "@/lib/agent/utils/streamNamespace";

/**
 * streamNamespace 순수 함수 단위 테스트 (LLM 호출 0 — NFR-11).
 *
 * 정답지는 scripts/subagent-probe.mts 의 실측 namespace 값:
 *  - 메인:        ["model_request:UUID"]  또는 루트(2-튜플)
 *  - 서브에이전트: ["tools:UUID"]  /  ["tools:UUID","model_request:UUID"]
 *
 * 핵심 불변식: subgraphs:true 로 part 형태가 2/3-튜플 양형이 돼도
 * chunkFilter 5종은 normalizePart 결과만 받아 무수정 재사용된다(R5).
 */

describe("normalizePart — 2/3-튜플 정규화", () => {
  it("2-튜플 [msg,meta] (루트 청크) → namespace 빈 배열", () => {
    const r = normalizePart([{ content: "hi" }, { langgraph_node: "model_request" }]);
    expect(r.msg).toEqual({ content: "hi" });
    expect(r.meta).toEqual({ langgraph_node: "model_request" });
    expect(r.namespace).toEqual([]);
  });

  it("3-튜플 [ns[],[msg,meta]] (서브그래프 청크) → namespace 추출", () => {
    const r = normalizePart([
      ["tools:abc", "model_request:def"],
      [{ content: "sub" }, { langgraph_node: "model_request" }],
    ]);
    expect(r.msg).toEqual({ content: "sub" });
    expect(r.meta).toEqual({ langgraph_node: "model_request" });
    expect(r.namespace).toEqual(["tools:abc", "model_request:def"]);
  });

  it("namespace 의 비-문자열은 걸러낸다(견고성)", () => {
    const r = normalizePart([["tools:x", 42, null], [{}, {}]]);
    expect(r.namespace).toEqual(["tools:x"]);
  });

  it("배열 아님 → 안전 기본값(throw 0, chunkFilter 가 스킵)", () => {
    const r = normalizePart(undefined);
    // mode 필드 추가(다중 streamMode 지원) — 기본 "messages"(하위호환).
    expect(r).toEqual({
      msg: undefined,
      meta: undefined,
      namespace: [],
      mode: "messages",
    });
  });

  it("빈 배열 → msg/meta undefined, namespace []", () => {
    const r = normalizePart([]);
    expect(r.msg).toBeUndefined();
    expect(r.namespace).toEqual([]);
  });
});

describe("isSubagentNamespace — 서브에이전트 컨텍스트 판정", () => {
  it("루트(빈 namespace) → false (메인)", () => {
    expect(isSubagentNamespace([])).toBe(false);
  });

  it("model_request 단독 → false (메인 LLM)", () => {
    expect(isSubagentNamespace(["model_request:abc"])).toBe(false);
  });

  it("tools: 세그먼트 존재 → true (task 위임 — 실측값)", () => {
    expect(isSubagentNamespace(["tools:e7121dc9-7694-5f78"])).toBe(true);
  });

  it("중첩 tools > model_request → true (서브에이전트 내부 LLM — 실측값)", () => {
    expect(
      isSubagentNamespace([
        "tools:1c2d8e64-cc7c-5da7",
        "model_request:93ca7dbc-1f96-5325",
      ]),
    ).toBe(true);
  });
});

describe("trackTaskCompletion — 다중 task 완료(FIFO 탈출)", () => {
  const taskCall = (id: string, label = "web-searcher") => ({
    id,
    name: "task",
    args: `{"subagent_type":"${label}"}`,
  });

  it("task tool_call → 큐 push, 완료 없음", () => {
    const { next, completed } = trackTaskCompletion(
      initTaskTrack(),
      false,
      taskCall("call_1"),
    );
    expect(next.pending).toEqual([
      { id: "call_1", args: '{"subagent_type":"web-searcher"}' },
    ]);
    expect(completed).toBeNull();
  });

  it("같은 id 재push 무시(tool_call 델타 분할 방어)", () => {
    let s = trackTaskCompletion(initTaskTrack(), false, taskCall("c1")).next;
    s = trackTaskCompletion(s, false, taskCall("c1")).next;
    expect(s.pending).toHaveLength(1);
  });

  it("3개 동시 위임 → 3회 탈출 → FIFO 순서대로 3개 완료", () => {
    let s = initTaskTrack();
    s = trackTaskCompletion(s, false, taskCall("c1", "a")).next;
    s = trackTaskCompletion(s, false, taskCall("c2", "b")).next;
    s = trackTaskCompletion(s, false, taskCall("c3", "c")).next;
    expect(s.pending).toHaveLength(3);

    // 탈출 1: 서브 진입 → 루트 복귀 = c1 완료(가장 오래된).
    s = trackTaskCompletion(s, true, null).next;
    const r1 = trackTaskCompletion(s, false, null);
    expect(r1.completed?.id).toBe("c1");
    s = r1.next;

    // 탈출 2: c2 완료.
    s = trackTaskCompletion(s, true, null).next;
    const r2 = trackTaskCompletion(s, false, null);
    expect(r2.completed?.id).toBe("c2");
    s = r2.next;

    // 탈출 3: c3 완료.
    s = trackTaskCompletion(s, true, null).next;
    const r3 = trackTaskCompletion(s, false, null);
    expect(r3.completed?.id).toBe("c3");
    expect(r3.next.pending).toEqual([]);
  });

  it("서브에이전트 진입 전 루트 청크 → 완료 안 함(조기완료 방지)", () => {
    const s = trackTaskCompletion(initTaskTrack(), false, taskCall("c1")).next;
    expect(trackTaskCompletion(s, false, null).completed).toBeNull();
  });

  it("진행 task 없을 때 → no-op(참조 동일)", () => {
    const s0 = initTaskTrack();
    const r = trackTaskCompletion(s0, false, null);
    expect(r.next).toBe(s0);
    expect(r.completed).toBeNull();
  });

  it("drainPendingTasks — 종료 시 잔여 task 전부 FIFO 반환", () => {
    let s = initTaskTrack();
    s = trackTaskCompletion(s, false, taskCall("c1")).next;
    s = trackTaskCompletion(s, false, taskCall("c2")).next;
    expect(drainPendingTasks(s).map((t) => t.id)).toEqual(["c1", "c2"]);
  });
});

// 다중 streamMode(["messages","tools"]) part 정규화 — R8 실측 형태:
//   [["model_request:UUID"], "messages", [AIMessageChunk, meta]]
//   [["tools:UUID"], "tools", {event:"on_tool_end", name, output:ToolMessage}]
describe("normalizePart — 다중 streamMode 3-튜플 [ns, mode, data]", () => {
  it('mode="messages": data=[msg,meta] 정규화', () => {
    const r = normalizePart([
      ["model_request:abc"],
      "messages",
      [{ content: "tok" }, { langgraph_node: "model_request" }],
    ]);
    expect(r.msg).toEqual({ content: "tok" });
    expect(r.meta).toEqual({ langgraph_node: "model_request" });
    expect(r.namespace).toEqual(["model_request:abc"]);
    expect(r.mode).toBe("messages");
  });

  it('mode="tools": data 객체를 msg 로, meta=undefined(chunkFilter 스킵)', () => {
    const evt = { event: "on_tool_end", name: "web_search", output: {} };
    const r = normalizePart([["tools:xyz"], "tools", evt]);
    expect(r.msg).toEqual(evt);
    expect(r.meta).toBeUndefined();
    expect(r.mode).toBe("tools");
  });

  it("기존 단일 messages 2-튜플 [msg,meta] 하위호환 유지", () => {
    const r = normalizePart([{ c: 1 }, { langgraph_node: "x" }]);
    expect(r.msg).toEqual({ c: 1 });
    expect(r.mode).toBe("messages");
  });
});

describe("extractToolEventResult — tools part 도구 완료 추출", () => {
  it("on_tool_end + ToolMessage(kwargs.content) → 정제 string 추출", () => {
    const r = extractToolEventResult({
      event: "on_tool_end",
      toolCallId: "call_1",
      name: "web_search",
      output: {
        lc: 1,
        id: ["langchain_core", "messages", "ToolMessage"],
        kwargs: { status: "success", content: "[웹 검색 요약]\n\n■ 수행한 검색 (2회)" },
      },
    });
    expect(r).toEqual({
      id: "call_1",
      name: "web_search",
      result: "[웹 검색 요약]\n\n■ 수행한 검색 (2회)",
    });
  });

  it("output 이 런타임 형(.content 최상위)도 방어", () => {
    const r = extractToolEventResult({
      event: "on_tool_end",
      name: "web_search",
      output: { content: "결과 텍스트" },
    });
    expect(r?.result).toBe("결과 텍스트");
  });

  it("output 이 그냥 string 이어도 처리", () => {
    const r = extractToolEventResult({
      event: "on_tool_end",
      name: "current_time",
      output: "2026-05-19 (Asia/Seoul)",
    });
    expect(r?.result).toBe("2026-05-19 (Asia/Seoul)");
    expect(r?.name).toBe("current_time");
  });

  it("on_tool_start 는 결과 아님 → null (IN 은 tool_call_chunks 담당)", () => {
    expect(
      extractToolEventResult({
        event: "on_tool_start",
        name: "web_search",
        input: '{"query":"x"}',
      }),
    ).toBeNull();
  });

  it("task(서브에이전트)는 skip — trackTaskCompletion 중복 방지", () => {
    expect(
      extractToolEventResult({
        event: "on_tool_end",
        name: "task",
        output: { kwargs: { content: "서브 결과" } },
      }),
    ).toBeNull();
  });

  it("content 비거나 형태 불명 → null (graceful, 크래시 0)", () => {
    expect(
      extractToolEventResult({ event: "on_tool_end", name: "web_search", output: {} }),
    ).toBeNull();
    expect(extractToolEventResult(null)).toBeNull();
    expect(extractToolEventResult({ event: "on_tool_error", name: "x", error: "e" })).toBeNull();
  });
});

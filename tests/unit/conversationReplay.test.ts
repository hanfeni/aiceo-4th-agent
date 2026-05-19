import { describe, it, expect } from "vitest";

// Slice 2 — 대화 복원 순수 코어 (Plan Critic C8: better-sqlite3 import 0,
// 결정적 단위 테스트). 입력은 checkpoint BLOB 의 channel_values.messages
// (이미 JSON.parse 된 LangChain serialized 배열). 출력은 ChatMessage[].
//
// 픽스처는 docs/notes/conversation-history-probe.md 의 실측 구조(R8):
//   HumanMessage  : { id:[...,"HumanMessage"],  kwargs:{ content: string } }
//   AIMessageChunk : { id:[...,"AIMessageChunk"], kwargs:{
//       content: [ {type:"reasoning",...}, {type:"text",text,...} ],
//       additional_kwargs: { reasoning:{summary:[{text}]}, tool_outputs:[...] } } }
//
// 복원 = checkpoint 메시지를 스트리밍 청크와 동일 추출기/리듀서에 재생
// (filterChunk / extractThinking / extractToolOutputs / reduce*). 신규
// 파싱 0 — 기존 검증 자산 재사용.

import {
  replayMessages,
  extractTitle,
} from "@/lib/conversations/replay";

const human = (content: string) => ({
  lc: 1,
  type: "constructor",
  id: ["langchain_core", "messages", "HumanMessage"],
  kwargs: { content, additional_kwargs: {}, response_metadata: {} },
});

const aiText = (text: string) => ({
  lc: 1,
  type: "constructor",
  id: ["langchain_core", "messages", "AIMessageChunk"],
  kwargs: {
    content: [{ type: "text", text, index: 0, annotations: [] }],
    additional_kwargs: {},
    response_metadata: {},
    tool_call_chunks: [],
    tool_calls: [],
  },
});

const aiReasoningTextWeb = () => ({
  lc: 1,
  type: "constructor",
  id: ["langchain_core", "messages", "AIMessageChunk"],
  kwargs: {
    content: [
      { type: "reasoning", reasoning: "", index: 0 },
      {
        type: "text",
        text: "**삼성전자** 확인 결과입니다.",
        index: 1,
        annotations: [],
      },
    ],
    additional_kwargs: {
      reasoning: {
        id: "rs_x",
        type: "reasoning",
        summary: [{ text: "**Searching Samsung**\n\nLooking up the ticker." }],
      },
      tool_outputs: [
        {
          id: "ws_1",
          type: "web_search_call",
          status: "completed",
          action: { type: "search", queries: ["삼성전자 주가"], query: "삼성전자 주가" },
        },
      ],
    },
    response_metadata: {},
    tool_call_chunks: [],
    tool_calls: [],
  },
});

describe("replayMessages — checkpoint messages → ChatMessage[] (C8 순수)", () => {
  it("HumanMessage 는 role=user, content=string 그대로", () => {
    const out = replayMessages([human("웹검색 통해 삼성전자 확인")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      role: "user",
      content: "웹검색 통해 삼성전자 확인",
    });
  });

  it("AIMessageChunk(text 블록) 는 role=assistant, 본문 추출", () => {
    const out = replayMessages([aiText("안녕하세요!")]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("assistant");
    expect(out[0].content).toBe("안녕하세요!");
  });

  it("user→assistant 순서/페어 보존", () => {
    const out = replayMessages([
      human("질문1"),
      aiText("답변1"),
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(out.map((m) => m.content)).toEqual(["질문1", "답변1"]);
  });

  it("reasoning + tool_outputs 보존: assistant 에 thinkingSteps 재구성(전체 복원 정책)", () => {
    const out = replayMessages([human("웹검색 통해 삼성전자 확인"), aiReasoningTextWeb()]);
    const ai = out[1];
    expect(ai.role).toBe("assistant");
    // 본문(text 블록)은 reasoning 블록을 제외하고 추출
    expect(ai.content).toContain("삼성전자");
    expect(ai.content).not.toContain("Searching Samsung"); // reasoning 누출 0(R5)
    // 사고 패널 복원 — reasoning step + web_search tool step 존재
    expect(Array.isArray(ai.thinkingSteps)).toBe(true);
    const kinds = (ai.thinkingSteps ?? []).map((s) => s.kind);
    expect(kinds).toContain("reasoning");
    expect(kinds).toContain("tool");
    const toolStep = (ai.thinkingSteps ?? []).find((s) => s.kind === "tool");
    expect(toolStep && toolStep.kind === "tool" && toolStep.name).toBe(
      "web_search",
    );
  });

  it("빈 messages → 빈 배열 (대화 0건 graceful)", () => {
    expect(replayMessages([])).toEqual([]);
  });

  it("알 수 없는/깨진 메시지는 graceful skip (스키마 변경 방어 C10)", () => {
    const out = replayMessages([
      human("정상"),
      { garbage: true } as unknown,
      null as unknown,
      { id: ["x", "SystemMessage"], kwargs: { content: "sys" } },
    ]);
    // 정상 1건만, 크래시 0
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("정상");
  });

  // S2 그룹화 + S4 replay 정합 (Plan Critic 2차 항목4). checkpoint 에
  // web_search_call 이 N개여도 replay 가 같은 reduceToolCall 을 재생하므로
  // **1 그룹 tool step 으로 복원**(라이브=히스토리 일치). 항목4-c: 매
  // action 마다 reduceToolResult 반복 호출돼도 그룹 step 이 부풀거나
  // 깨지지 않는지(멱등) 검증.
  it("checkpoint web_search 다중 action → replay 1 그룹 tool step (라이브=히스토리)", () => {
    const aiMultiWs = () => ({
      lc: 1,
      type: "constructor",
      id: ["langchain_core", "messages", "AIMessageChunk"],
      kwargs: {
        content: [{ type: "text", text: "삼성전자 결과", index: 0, annotations: [] }],
        additional_kwargs: {
          // 모델이 한 답변서 search→open_page→find_in_page 3번 자율 호출
          tool_outputs: [
            {
              id: "ws_a",
              type: "web_search_call",
              status: "completed",
              action: { type: "search", queries: ["삼성전자 005930"] },
            },
            {
              id: "ws_b",
              type: "web_search_call",
              status: "completed",
              action: { type: "open_page", url: "https://x.com/p" },
            },
            {
              id: "ws_c",
              type: "web_search_call",
              status: "completed",
              action: {
                type: "find_in_page",
                pattern: "Revenue",
                url: "https://x.com/p",
              },
            },
          ],
        },
        response_metadata: {},
        tool_call_chunks: [],
        tool_calls: [],
      },
    });
    const out = replayMessages([human("삼성전자 확인"), aiMultiWs()]);
    const ai = out[1];
    const toolSteps = (ai.thinkingSteps ?? []).filter(
      (s) => s.kind === "tool",
    );
    // 3 action → 1 그룹 step (N개로 흩어지지 않음)
    expect(toolSteps).toHaveLength(1);
    const ws = toolSteps[0];
    expect(ws.kind === "tool" && ws.name).toBe("web_search");
    if (ws.kind === "tool") {
      // 3 action 전부 args.actions 에 누적(라이브 그룹화와 동일 결과)
      const parsed = JSON.parse(ws.args) as { actions?: unknown[] };
      expect(parsed.actions).toHaveLength(3);
      expect(
        (parsed.actions ?? []).map((a) => (a as { type: string }).type),
      ).toEqual(["search", "open_page", "find_in_page"]);
    }
  });
});

describe("extractTitle — 첫 HumanMessage 50자 (C4: messages[0] 단정 폐기)", () => {
  it("첫 HumanMessage content 의 앞 50자", () => {
    expect(extractTitle([human("삼성전자 확인 부탁")])).toBe("삼성전자 확인 부탁");
  });

  it("50자 초과 시 잘라서 … 부착", () => {
    const long = "가".repeat(80);
    const t = extractTitle([human(long)]);
    expect(t.length).toBeLessThanOrEqual(51); // 50 + ellipsis
    expect(t.endsWith("…")).toBe(true);
  });

  it("messages[0] 이 HumanMessage 가 아니어도 첫 HumanMessage 를 찾는다", () => {
    const out = extractTitle([
      { id: ["x", "SystemMessage"], kwargs: { content: "system prompt" } },
      human("진짜 사용자 질문"),
    ]);
    expect(out).toBe("진짜 사용자 질문");
  });

  it("HumanMessage 가 없으면 fallback '(제목 없음)'", () => {
    expect(extractTitle([aiText("ai만 있음")])).toBe("(제목 없음)");
  });

  it("빈 배열 → fallback", () => {
    expect(extractTitle([])).toBe("(제목 없음)");
  });
});

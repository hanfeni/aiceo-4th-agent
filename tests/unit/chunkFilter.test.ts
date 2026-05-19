import { describe, it, expect } from "vitest";
import {
  filterChunk,
  extractThinking,
  extractToolCalls,
  extractToolResult,
  extractToolOutputs,
  extractWebSearchCitations,
  parseCitationText,
} from "@/lib/agent/utils/chunkFilter";

// chunkFilter 단위 테스트 (LLM 비의존, 순수 함수 — R5/FR-09).
// 매핑: TC-18.3~18.5/18.7~18.13, TC-19.4/19.5 / FR-09 / AC-3, AC-10
// U3/U4 실측 상수 인용: meta.langgraph_node === "model_request" (메인 답변 노드),
// content 가 string 이면 그대로(빈 문자열 스킵), 배열이면 type==="text" 블록만,
// tool_call_chunks 비어있지 않으면 본문 미혼입.

const MODEL_NODE = "model_request"; // U4 실측: 메인 어시스턴트 노드
const meta = (node: string = MODEL_NODE) => ({ langgraph_node: node });

describe("filterChunk — UI 본문 텍스트 추출 (R5/FR-09)", () => {
  // TC-18.3 / TC-18.9 — string content 그대로 통과
  it("TC-18.9: string content 는 그대로 통과한다", () => {
    const msg = { kwargs: { content: "안녕" } };
    expect(filterChunk(msg, meta())).toBe("안녕");
  });

  it("TC-18.3: 여러 string 토큰 청크가 각각 통과한다", () => {
    expect(filterChunk({ kwargs: { content: "녕하세요" } }, meta())).toBe("녕하세요");
    expect(filterChunk({ kwargs: { content: "497" } }, meta())).toBe("497");
  });

  // TC-18.12 — 빈 문자열 content 는 스킵(스트림 시작/종료/툴 경계 마커)
  it("TC-18.12: 빈 문자열 content('') 는 null (스트림 마커 스킵)", () => {
    expect(filterChunk({ kwargs: { content: "" } }, meta())).toBeNull();
  });

  // TC-18.7 / TC-18.5 — 배열 content 의 text 블록은 반드시 통과
  it("TC-18.7: 배열 content 의 text 블록은 통과한다 (과필터 회귀 차단)", () => {
    const msg = { kwargs: { content: [{ type: "text", text: "안녕" }] } };
    expect(filterChunk(msg, meta())).toBe("안녕");
  });

  // TC-18.8 — thinking 블록 제거
  it("TC-18.8: thinking 블록만 있으면 null (사고 폐기)", () => {
    const msg = { kwargs: { content: [{ type: "thinking", thinking: "17*24..." }] } };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  // TC-18.13 — redacted_thinking 블록 제거
  it("TC-18.13: redacted_thinking 블록도 본문 미노출 (null)", () => {
    const msg = { kwargs: { content: [{ type: "redacted_thinking", data: "enc" }] } };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  // reasoning 블록 제거 (GPT-5 reasoning 방어)
  it("reasoning 블록도 제거한다 (null)", () => {
    const msg = { kwargs: { content: [{ type: "reasoning", reasoning: "..." }] } };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  // TC-18.10 — 배열 content 혼합: thinking 제거 + text 통과
  it("TC-18.10: [thinking, text] 혼합 → text 만 yield", () => {
    const msg = {
      kwargs: {
        content: [
          { type: "thinking", thinking: "내부 사고" },
          { type: "text", text: "A" },
        ],
      },
    };
    expect(filterChunk(msg, meta())).toBe("A");
  });

  it("배열 content 의 다중 text 블록은 이어 붙여 yield", () => {
    const msg = {
      kwargs: {
        content: [
          { type: "text", text: "안" },
          { type: "reasoning", reasoning: "버릴것" },
          { type: "text", text: "녕" },
        ],
      },
    };
    expect(filterChunk(msg, meta())).toBe("안녕");
  });

  // TC-18.4 / TC-19.4 — tool_call_chunks 비어있지 않으면 본문 미혼입
  it("TC-19.4: tool_call_chunks 비어있지 않으면 null (도구 출력 본문 미혼입)", () => {
    const msg = {
      kwargs: {
        content: "",
        tool_call_chunks: [{ name: "search", args: "{}", index: 0 }],
      },
    };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  it("TC-18.4: tool_call_chunks 가 있으면 content 가 있어도 null", () => {
    const msg = {
      kwargs: {
        content: "도구중간텍스트",
        tool_call_chunks: [{ name: "tool", args: "", index: 0 }],
      },
    };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  // TC-18.11 / TC-19.5 — 서브에이전트 노드 메타 제거 (U4 langgraph_node 화이트리스트)
  it("TC-18.11: model_request 외 노드 출처 청크는 null (subagent 누출 차단)", () => {
    const msg = { kwargs: { content: "서브에이전트 내부 메시지" } };
    expect(filterChunk(msg, meta("subagent_task"))).toBeNull();
  });

  it("TC-19.5: subagent 노드 메타 → yield 0 (메인 노드만 통과)", () => {
    const msg = { kwargs: { content: [{ type: "text", text: "내부" }] } };
    expect(filterChunk(msg, meta("tools"))).toBeNull();
  });

  it("meta 가 없거나 langgraph_node 미존재면 null (출처 불명 차단)", () => {
    const msg = { kwargs: { content: "x" } };
    expect(filterChunk(msg, undefined)).toBeNull();
    expect(filterChunk(msg, {})).toBeNull();
  });

  // TC-18.12 — 빈/undefined 청크 크래시 없이 null
  it("TC-18.12: content=[] / undefined / msg undefined 는 크래시 없이 null", () => {
    expect(filterChunk({ kwargs: { content: [] } }, meta())).toBeNull();
    expect(filterChunk({ kwargs: { content: undefined } }, meta())).toBeNull();
    expect(filterChunk({ kwargs: {} }, meta())).toBeNull();
    expect(filterChunk({}, meta())).toBeNull();
    expect(filterChunk(undefined, meta())).toBeNull();
    expect(filterChunk(null, meta())).toBeNull();
  });

  it("배열에 text 블록이 없으면(전부 thinking) null", () => {
    const msg = {
      kwargs: {
        content: [
          { type: "thinking", thinking: "a" },
          { type: "redacted_thinking", data: "b" },
        ],
      },
    };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  it("text 블록의 text 가 빈 문자열이면 null (실질 본문 없음)", () => {
    const msg = { kwargs: { content: [{ type: "text", text: "" }] } };
    expect(filterChunk(msg, meta())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FR-09 거울상(extract-side) — 본문 추출의 짝. filterChunk 는 본문만,
// 아래 extractor 들은 thinking/tool 채널만. 리뷰 지적: extract 측 미검증.
// ---------------------------------------------------------------------------

describe("extractThinking — 사고/추론 텍스트 추출 (FR-09 거울상)", () => {
  it("model_request + Anthropic {type:'thinking',thinking} 블록 → thinking 텍스트", () => {
    const msg = { kwargs: { content: [{ type: "thinking", thinking: "abc" }] } };
    expect(extractThinking(msg, meta())).toBe("abc");
  });

  it("model_request + OpenAI {type:'reasoning',reasoning} 블록 → reasoning 텍스트", () => {
    const msg = { kwargs: { content: [{ type: "reasoning", reasoning: "xyz" }] } };
    expect(extractThinking(msg, meta())).toBe("xyz");
  });

  it("model_request + additional_kwargs.reasoning_content(string, content 배열 없음) → 그 문자열", () => {
    const msg = { kwargs: { additional_kwargs: { reasoning_content: "r" } } };
    expect(extractThinking(msg, meta())).toBe("r");
  });

  it("런타임 인스턴스형 additional_kwargs.reasoning_content 도 추출 (최상위)", () => {
    const msg = { additional_kwargs: { reasoning_content: "live" } };
    expect(extractThinking(msg, meta())).toBe("live");
  });

  it("non-model_request 노드(tools)면 null (다른 노드 사고 누출 차단)", () => {
    const msg = { kwargs: { content: [{ type: "thinking", thinking: "leak" }] } };
    expect(extractThinking(msg, meta("tools"))).toBeNull();
  });

  it("model_request + text 블록만(thinking 없음) → null", () => {
    const msg = { kwargs: { content: [{ type: "text", text: "본문" }] } };
    expect(extractThinking(msg, meta())).toBeNull();
  });

  it("reasoning_content 가 빈 문자열이면 null (실질 사고 없음)", () => {
    const msg = { kwargs: { additional_kwargs: { reasoning_content: "" } } };
    expect(extractThinking(msg, meta())).toBeNull();
  });

  it("redacted_thinking 블록은 텍스트 필드가 없으면 null", () => {
    const msg = { kwargs: { content: [{ type: "redacted_thinking", data: "enc" }] } };
    expect(extractThinking(msg, meta())).toBeNull();
  });

  it("meta/msg 비정상은 크래시 없이 null", () => {
    expect(extractThinking({ kwargs: { content: [] } }, undefined)).toBeNull();
    expect(extractThinking(undefined, meta())).toBeNull();
    expect(extractThinking(null, meta())).toBeNull();
    expect(extractThinking({}, meta())).toBeNull();
  });

  // ── FR-09 거울상 회귀 가드 (리뷰어 요구) ──────────────────────────────
  // 단 하나의 청크에 reasoning + text 가 함께 흐를 때:
  //   filterChunk → BODY 만 (R 누출 0), extractThinking → R 만 (BODY 누출 0).
  it("FR-09 거울 회귀: [reasoning, text] 한 청크 → filterChunk=BODY, extractThinking=R (교차 누출 0)", () => {
    const msg = {
      kwargs: {
        content: [
          { type: "reasoning", reasoning: "R" },
          { type: "text", text: "BODY" },
        ],
      },
    };
    const body = filterChunk(msg, meta());
    const thinking = extractThinking(msg, meta());
    expect(body).toBe("BODY");
    expect(body).not.toContain("R");
    expect(thinking).toBe("R");
    expect(thinking).not.toContain("BODY");
  });
});

describe("extractToolCalls — 도구 호출 델타 추출 (FR-09 거울상)", () => {
  it("tool_call_chunks 점진 델타: 첫 청크 id+name, 후속 청크 args 조각", () => {
    const first = {
      kwargs: {
        tool_call_chunks: [{ id: "c1", name: "current_time", args: "" }],
      },
    };
    const next = {
      kwargs: {
        tool_call_chunks: [{ args: '{"tz":"KST"}' }],
      },
    };
    expect(extractToolCalls(first, meta())).toEqual([
      { id: "c1", name: "current_time", args: "" },
    ]);
    // 후속 청크: id/name 미존재(string 아님) → undefined, args 만 진행.
    expect(extractToolCalls(next, meta())).toEqual([
      { id: undefined, name: undefined, args: '{"tz":"KST"}' },
    ]);
  });

  it("런타임 인스턴스형(tool_call_chunks 최상위) 도 추출한다", () => {
    const msg = { tool_call_chunks: [{ id: "x", name: "n", args: "a" }] };
    expect(extractToolCalls(msg, meta())).toEqual([
      { id: "x", name: "n", args: "a" },
    ]);
  });

  it("non-model_request 노드면 null", () => {
    const msg = { kwargs: { tool_call_chunks: [{ id: "c1", name: "t", args: "" }] } };
    expect(extractToolCalls(msg, meta("tools"))).toBeNull();
  });

  it("tool_call_chunks 도 tool_outputs 도 없으면 null", () => {
    expect(extractToolCalls({ kwargs: { content: "본문" } }, meta())).toBeNull();
    expect(extractToolCalls({ kwargs: {} }, meta())).toBeNull();
    expect(extractToolCalls(undefined, meta())).toBeNull();
  });

  it("ServerTool 경로(additional_kwargs.tool_outputs)는 extractToolCalls 가 잡지 않는다 (채널 분리 — extractToolOutputs 전담)", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [
            { id: "ws_1", type: "web_search_call", status: "completed" },
          ],
        },
      },
    };
    // 이중 emit 일원화: ClientTool 채널(extractToolCalls)은 ServerTool 무시.
    expect(extractToolCalls(msg, meta())).toBeNull();
  });

  it("런타임 인스턴스형 additional_kwargs.tool_outputs 도 extractToolCalls 가 잡지 않는다 (최상위 경로도 채널 분리)", () => {
    const msg = {
      additional_kwargs: {
        tool_outputs: [
          { id: "ws_top", type: "web_search_call", status: "in_progress" },
        ],
      },
    };
    expect(extractToolCalls(msg, meta())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 이중 emit 일원화 회귀 가드 (이번 수정의 핵심):
//   ServerTool(web_search) tool_outputs 청크 1개를 흘렸을 때
//   - extractToolCalls  → null      (ClientTool 채널은 ServerTool 미포착)
//   - extractToolOutputs → 길이 1 배열 (ServerTool 채널 단독 전담)
//   이전엔 extractToolCalls 의 path② 가 같은 청크를 같이 잡아 tool_call 이
//   이중 emit 되던 버그 → 두 추출기가 상호 배타(비중복) 임을 단언으로 고정.
// ---------------------------------------------------------------------------

describe("이중 emit 일원화 — web_search tool_outputs 는 단일 채널만 잡는다", () => {
  it("ServerTool 청크 1개: extractToolCalls=null AND extractToolOutputs=길이1 (비중복·채널 분리)", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [
            {
              id: "ws_dedup",
              type: "web_search_call",
              status: "completed",
              action: { type: "search", queries: ["q1", "q2"] },
            },
          ],
        },
      },
    };

    const clientCalls = extractToolCalls(msg, meta());
    const serverOutputs = extractToolOutputs(msg, meta());

    // ClientTool 채널은 ServerTool 을 절대 잡지 않는다(이중 emit 제거).
    expect(clientCalls).toBeNull();
    // ServerTool 채널만 정확히 1건 — 이전엔 양쪽이 잡아 2건이 됐다.
    // web_search_call result 는 미정(undefined) — 출처는 annotations 청크에서.
    expect(serverOutputs).toEqual([
      {
        id: "ws_dedup",
        name: "web_search",
        args: JSON.stringify({ queries: ["q1", "q2"] }),
        result: undefined,
      },
    ]);
    expect(serverOutputs).toHaveLength(1);
  });

  it("ClientTool tool_call_chunks 청크는 반대로 extractToolCalls 만 잡고 extractToolOutputs=null (역방향 채널 분리)", () => {
    const msg = {
      kwargs: {
        tool_call_chunks: [{ id: "c1", name: "current_time", args: "" }],
      },
    };
    // 거울상: ClientTool 청크는 ServerTool 채널이 잡지 않는다.
    expect(extractToolCalls(msg, meta())).toEqual([
      { id: "c1", name: "current_time", args: "" },
    ]);
    expect(extractToolOutputs(msg, meta())).toBeNull();
  });

  it("두 채널 합산이 항상 청크당 1건 — 이중 카운트 0 (ServerTool & ClientTool 각각)", () => {
    const serverChunk = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [{ id: "ws", type: "web_search_call", status: "completed" }],
        },
      },
    };
    const clientChunk = {
      kwargs: { tool_call_chunks: [{ id: "c", name: "n", args: "{}" }] },
    };
    const count = (msg: unknown) =>
      (extractToolCalls(msg, meta())?.length ?? 0) +
      (extractToolOutputs(msg, meta())?.length ?? 0);
    expect(count(serverChunk)).toBe(1); // 이전 버그: 2 (양쪽 포착)
    expect(count(clientChunk)).toBe(1);
  });
});

describe("extractToolOutputs — ServerTool 호출 추출 (FR-09 거울상, 채널 단독 전담)", () => {
  // web_search_call: 결과는 미정(undefined) — 출처는 별도 annotations 청크에서
  // 와서 reduceToolResult name 폴백으로 채워진다. status 는 표시 안 함.
  it("web_search_call: name='web_search', args=JSON({queries}), result=undefined", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [
            {
              id: "ws_1",
              type: "web_search_call",
              status: "completed",
              action: { type: "search", queries: ["a 검색", "b query"] },
            },
          ],
        },
      },
    };
    expect(extractToolOutputs(msg, meta())).toEqual([
      {
        id: "ws_1",
        name: "web_search",
        args: JSON.stringify({ queries: ["a 검색", "b query"] }),
        result: undefined,
      },
    ]);
  });

  it("런타임 인스턴스형(additional_kwargs 최상위) web_search 도 result 미정", () => {
    const msg = {
      additional_kwargs: {
        tool_outputs: [
          { id: "ws_2", type: "web_search_call", status: "in_progress" },
        ],
      },
    };
    expect(extractToolOutputs(msg, meta())).toEqual([
      { id: "ws_2", name: "web_search", args: "", result: undefined },
    ]);
  });

  // web_search 외 ServerTool(code_interpreter 등)은 기존대로 status 유지
  // (annotations 보강 대상이 아님 — 계약 변경 범위는 web_search 한정).
  it("비-web_search ServerTool 은 기존대로 result=status('completed' 기본)", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [{ id: "x", type: "code_interpreter_call" }],
        },
      },
    };
    expect(extractToolOutputs(msg, meta())).toEqual([
      { id: "x", name: "code_interpreter", args: "", result: "completed" },
    ]);
  });

  it("id 가 string 이 아니면 빈 문자열, 비-레코드 항목은 스킵 (web_search result 미정)", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [null, "noise", { id: 123, type: "web_search_call" }],
        },
      },
    };
    expect(extractToolOutputs(msg, meta())).toEqual([
      { id: "", name: "web_search", args: "", result: undefined },
    ]);
  });

  it("non-model_request 노드면 null (다른 노드 ServerTool 누출 차단)", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [{ id: "ws", type: "web_search_call" }],
        },
      },
    };
    expect(extractToolOutputs(msg, meta("tools"))).toBeNull();
  });

  it("tool_outputs 없으면 null (크래시 없이)", () => {
    expect(extractToolOutputs({ kwargs: { content: "본문" } }, meta())).toBeNull();
    expect(extractToolOutputs({ kwargs: {} }, meta())).toBeNull();
    expect(extractToolOutputs(undefined, meta())).toBeNull();
  });
});

describe("extractToolResult — 도구 실행 결과 추출 (FR-09 거울상)", () => {
  it("런타임 ToolMessage {type:'tool', name, content:string} → {name, result}", () => {
    const msg = { type: "tool", name: "current_time", content: "3시" };
    expect(extractToolResult(msg)).toEqual({ name: "current_time", result: "3시" });
  });

  it("직렬화형: id 배열에 'ToolMessage' 포함 + kwargs.content → result 추출", () => {
    const msg = {
      id: ["langchain_core", "messages", "ToolMessage"],
      kwargs: { name: "search", content: "검색결과" },
    };
    expect(extractToolResult(msg)).toEqual({ name: "search", result: "검색결과" });
  });

  it("ToolMessage 인데 name 미존재면 기본명 'tool'", () => {
    const msg = { type: "tool", content: "결과만" };
    expect(extractToolResult(msg)).toEqual({ name: "tool", result: "결과만" });
  });

  it("content 가 text 블록 배열이면 이어 붙여 result", () => {
    const msg = {
      type: "tool",
      name: "calc",
      content: [
        { type: "text", text: "4" },
        { type: "thinking", thinking: "버릴것" },
        { type: "text", text: "2" },
      ],
    };
    expect(extractToolResult(msg)).toEqual({ name: "calc", result: "42" });
  });

  it("ToolMessage 인데 content 가 빈 문자열이면 null (실질 결과 없음)", () => {
    expect(extractToolResult({ type: "tool", name: "t", content: "" })).toBeNull();
  });

  it("도구 메시지가 아니면(plain AIMessageChunk) null", () => {
    expect(extractToolResult({ kwargs: { content: "본문 토큰" } })).toBeNull();
    expect(extractToolResult({ type: "ai", content: "답변" })).toBeNull();
  });

  it("비정상 입력은 크래시 없이 null", () => {
    expect(extractToolResult(undefined)).toBeNull();
    expect(extractToolResult(null)).toBeNull();
    expect(extractToolResult({})).toBeNull();
  });
});

describe("extractToolOutputs — ServerTool(web_search) 호출 추출 (FR-09 거울상)", () => {
  // 계약 변경(사용자 보고 버그 수정): web_search_call 단계는 검색어(IN)만
  // 확정이고 결과는 미정 → result=undefined. ToolBlock 이 "실행 중…" 표시.
  // 실제 OUT(출처)은 별도 청크의 annotations 에서 와서 reduceToolResult 의
  // name 폴백(result===undefined 인 step)으로 채워진다(extractWebSearchCitations).
  it("model_request + web_search_call → result 미정(undefined), IN(검색어)만 확정", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [
            {
              id: "ws_1",
              type: "web_search_call",
              status: "completed",
              action: { type: "search", queries: ["q1", "q2"] },
            },
          ],
        },
      },
    };
    const out = extractToolOutputs(msg, meta());
    expect(out).toEqual([
      {
        id: "ws_1",
        name: "web_search",
        args: JSON.stringify({ queries: ["q1", "q2"] }),
        result: undefined,
      },
    ]);
  });

  it("런타임 인스턴스형(additional_kwargs 최상위) 도 추출 (result 미정)", () => {
    const msg = {
      additional_kwargs: {
        tool_outputs: [{ id: "ws_2", type: "web_search_call", status: "running" }],
      },
    };
    expect(extractToolOutputs(msg, meta())).toEqual([
      { id: "ws_2", name: "web_search", args: "", result: undefined },
    ]);
  });

  it("queries 없으면 args 는 빈 문자열, result 는 항상 미정(undefined)", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [{ id: "ws_3", type: "web_search_call" }],
        },
      },
    };
    expect(extractToolOutputs(msg, meta())).toEqual([
      { id: "ws_3", name: "web_search", args: "", result: undefined },
    ]);
  });

  it("non-model_request 노드면 null", () => {
    const msg = {
      kwargs: {
        additional_kwargs: {
          tool_outputs: [{ id: "ws", type: "web_search_call", status: "completed" }],
        },
      },
    };
    expect(extractToolOutputs(msg, meta("tools"))).toBeNull();
  });

  it("tool_outputs 부재면 null", () => {
    expect(extractToolOutputs({ kwargs: { content: "본문" } }, meta())).toBeNull();
    expect(extractToolOutputs({ kwargs: { additional_kwargs: {} } }, meta())).toBeNull();
    expect(extractToolOutputs(undefined, meta())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractWebSearchCitations — web_search OUT(출처) 추출.
// 실측(scripts/ws-log-probe deep): OpenAI built-in web_search 는 결과 본문을
// 스트림에 안 싣고, content 블록의 annotations[] 로 출처만 준다:
//   content:[{ type:"text", text:"...", annotations:[
//     { type:"citation", source:"url_citation",
//       url:"https://...", title:"...", startIndex, endIndex } ] }]
// 이 함수가 그 출처를 사람이 읽을 result 문자열로 만든다. tool_outputs
// 와 다른 청크라서 reduceToolResult name 폴백(result===undefined)으로 채움.
// FR-09 유지: text 본문은 건드리지 않음(filterChunk 가 계속 전담).
// ---------------------------------------------------------------------------

describe("extractWebSearchCitations — web_search 출처(annotations) 추출", () => {
  const citationMsg = (annotations: unknown[]) => ({
    kwargs: {
      content: [{ type: "text", text: "", annotations, index: 0 }],
    },
  });

  it("url_citation → '제목 (url)' + 인용위치 줄(startIndex/endIndex RAW)", () => {
    const msg = citationMsg([
      {
        type: "citation",
        source: "url_citation",
        url: "https://www.korea.net/Government/Current-Affairs",
        title: "National Affairs: Korea.net",
        startIndex: 90,
        endIndex: 202,
      },
      {
        type: "citation",
        source: "url_citation",
        url: "https://example.com/news",
        title: "Example News",
      },
    ]);
    const out = extractWebSearchCitations(msg, meta());
    // RAW 체계화: 출처 줄(• 제목 (url))은 거울함수 호환 유지,
    // 인용위치(startIndex–endIndex)는 ↳ 들여쓰기 별줄(• 아님 →
    // parseCitationText 무시). 위치 없는 출처는 위치줄 생략.
    expect(out).toBe(
      "참고 출처 2건:\n" +
        "• National Affairs: Korea.net (https://www.korea.net/Government/Current-Affairs)\n" +
        "  ↳ 인용 위치: 90–202자\n" +
        "• Example News (https://example.com/news)",
    );
  });

  it("title 없으면 url 만 표시(인용위치 없으면 위치줄 생략)", () => {
    const msg = citationMsg([
      { type: "citation", source: "url_citation", url: "https://no-title.example" },
    ]);
    expect(extractWebSearchCitations(msg, meta())).toBe(
      "참고 출처 1건:\n• https://no-title.example",
    );
  });

  it("거울함수 회귀 가드: 새 포맷 출력 → parseCitationText 가 동일 {title,url} 복원", () => {
    const msg = citationMsg([
      {
        type: "citation",
        source: "url_citation",
        url: "https://a.example/x",
        title: "A 제목",
        startIndex: 10,
        endIndex: 50,
      },
      {
        type: "citation",
        source: "url_citation",
        url: "https://b.example/y",
        title: "B 제목",
      },
    ]);
    const text = extractWebSearchCitations(msg, meta());
    expect(text).not.toBeNull();
    // 인용위치 줄(↳)이 있어도 SourcesPanel 데이터원은 영향 0.
    expect(parseCitationText(text as string)).toEqual([
      { title: "A 제목", url: "https://a.example/x" },
      { title: "B 제목", url: "https://b.example/y" },
    ]);
  });

  it("런타임 인스턴스형(content 최상위) 도 추출", () => {
    const msg = {
      content: [
        {
          type: "text",
          text: "본문 일부",
          annotations: [
            {
              type: "citation",
              source: "url_citation",
              url: "https://top.example",
              title: "Top",
            },
          ],
        },
      ],
    };
    expect(extractWebSearchCitations(msg, meta())).toBe(
      "참고 출처 1건:\n• Top (https://top.example)",
    );
  });

  it("중복 url 은 1건으로 합친다(여러 청크에 같은 출처 반복)", () => {
    const msg = citationMsg([
      { type: "citation", source: "url_citation", url: "https://dup.example", title: "Dup" },
      { type: "citation", source: "url_citation", url: "https://dup.example", title: "Dup" },
    ]);
    expect(extractWebSearchCitations(msg, meta())).toBe(
      "참고 출처 1건:\n• Dup (https://dup.example)",
    );
  });

  it("url_citation 이 아닌 annotation 은 무시", () => {
    const msg = citationMsg([
      { type: "citation", source: "file_citation", file_id: "f1" },
      { type: "other" },
    ]);
    expect(extractWebSearchCitations(msg, meta())).toBeNull();
  });

  it("annotations 없는 일반 text 블록 → null (FR-09: 본문 미접촉)", () => {
    const msg = { kwargs: { content: [{ type: "text", text: "그냥 답변 본문" }] } };
    expect(extractWebSearchCitations(msg, meta())).toBeNull();
  });

  it("string content / 빈 content / 비-레코드 → null (크래시 없이)", () => {
    expect(extractWebSearchCitations({ kwargs: { content: "본문" } }, meta())).toBeNull();
    expect(extractWebSearchCitations({ kwargs: { content: [] } }, meta())).toBeNull();
    expect(extractWebSearchCitations(undefined, meta())).toBeNull();
    expect(extractWebSearchCitations({}, meta())).toBeNull();
  });

  it("non-model_request 노드면 null (다른 노드 누출 차단)", () => {
    const msg = citationMsg([
      { type: "citation", source: "url_citation", url: "https://x.example", title: "X" },
    ]);
    expect(extractWebSearchCitations(msg, meta("tools"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FR-09 음성 가드 — filterChunk 가 도구/사고 텍스트를 본문으로 절대 흘리지 않음.
// ---------------------------------------------------------------------------

describe("FR-09 음성 가드 — filterChunk 가 tool/thinking 을 본문으로 누출하지 않음", () => {
  it("tool_call_chunks 가 있는 청크 → filterChunk null (도구 채널만)", () => {
    const msg = {
      kwargs: {
        content: "도구 진행 텍스트",
        tool_call_chunks: [{ id: "c1", name: "search", args: '{"q":"x"}' }],
      },
    };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  it("thinking-only 블록 배열 → filterChunk null (사고 채널만)", () => {
    const msg = {
      kwargs: {
        content: [
          { type: "thinking", thinking: "내부추론" },
          { type: "reasoning", reasoning: "더추론" },
        ],
      },
    };
    expect(filterChunk(msg, meta())).toBeNull();
  });

  it("tools 노드 청크 → filterChunk null (다른 노드 본문 미혼입)", () => {
    const msg = { kwargs: { content: "도구 노드 텍스트" } };
    expect(filterChunk(msg, meta("tools"))).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { filterChunk } from "@/lib/agent/utils/chunkFilter";

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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createChatStore } from "@/store";
import type { StoreApi } from "zustand";
import type { ChatStore } from "@/store";

// D14a — 챗 store 가 DART 전용 `stage` SSE 이벤트를 무시함을 증명한다.
// architect 불변식: 챗 store asSseEvent 는 switch default:return null 구조라
// case "stage" 가 없어도(추가 금지) stage raw 가 messages/state 에 영향 0.
// /api/dart/analyze 가 emit 하는 stage 이벤트가 챗 라우트 소비 경로로
// 흘러들어도 챗 회귀 0(코드 구조 증명 — 챗 라우트는 stage 를 안 보내지만
// 방어적 회귀 가드). 대조군: 정상 token/thread 는 그대로 처리된다.
//
// TC 매핑: D14a(stage 안전 폐기) / R5(본문 누출 0 — stage 가 메시지에 0)
// / store.test.ts asSseEvent·startStream 패턴 동형(SSE 소비 경유 검증).

describe("D14a: 챗 store 의 stage 이벤트 무시 (회귀 0 코드 증명)", () => {
  let store: StoreApi<ChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  const enc = new TextEncoder();

  function sseBody(events: object[]): ReadableStream<Uint8Array> {
    const frames = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < frames.length) controller.enqueue(enc.encode(frames[i++]));
        else controller.close();
      },
    });
  }

  function mockFetch(events: object[]): ReturnType<typeof vi.fn> {
    const spy = vi.fn().mockResolvedValue(
      new Response(sseBody(events), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // --- stage raw 주입 → messages/state 무영향 (asSseEvent 경유 store) ---
  it("stage 이벤트가 SSE 로 흘러도 messages/thinkingSteps/error 무영향(stage 폐기)", async () => {
    // /api/dart/analyze 가 보내는 형태의 stage 이벤트들을 챗 SSE 스트림에
    // 섞어 주입. 챗 store 는 asSseEvent default:null 로 전부 폐기해야 한다.
    mockFetch([
      { type: "thread", conversationId: "c-stage" },
      { type: "stage", stage: 1, status: "start", label: "기업 식별", input: "기업명: 삼성전자" },
      { type: "stage", stage: 1, status: "done", label: "기업 식별", output: "corp_code=00126380, 상장사" },
      { type: "token", text: "본문" },
      { type: "stage", stage: 4, status: "start", label: "OpenAI 8관점 분석", input: "[SYSTEM]\nSYS" },
      { type: "token", text: "이어붙임" },
      { type: "stage", stage: 5, status: "done", label: "완료" },
      { type: "done" },
    ]);

    await store.getState().startStream({ query: "삼성전자 분석" });

    const s = store.getState();
    // user + assistant 2개만(stage 가 메시지를 만들지 않음).
    expect(s.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    // assistant 본문 = token 합본만. stage label/input/output 0건 혼입.
    const assistant = s.messages[1];
    expect(assistant.content).toBe("본문이어붙임");
    expect(assistant.content).not.toContain("기업 식별");
    expect(assistant.content).not.toContain("corp_code");
    expect(assistant.content).not.toContain("OpenAI 8관점");
    // 사고 패널/출처/에러 모두 무영향(stage → thinkingSteps/sources 0).
    expect(assistant.thinkingSteps).toBeUndefined();
    expect(assistant.sources).toBeUndefined();
    expect(s.error).toBeNull();
    // thread 는 정상 처리(대조 — stage 만 폐기, 정상 이벤트는 작동).
    expect(s.conversationId).toBe("c-stage");
    expect(s.isStreaming).toBe(false);
  });

  // --- 대조군: stage 만 있고 다른 이벤트 없을 때 메시지 0 변화 ---
  it("stage 이벤트만 연속 도착 → assistant 본문 빈 문자열 유지(아무 변화 0)", async () => {
    mockFetch([
      { type: "thread", conversationId: "c-only-stage" },
      { type: "stage", stage: 1, status: "start", label: "기업 식별" },
      { type: "stage", stage: 2, status: "done", label: "DART 공시 수집" },
      { type: "stage", stage: 3, status: "done", label: "컨텍스트 압축" },
      { type: "done" },
    ]);

    await store.getState().startStream({ query: "Q" });

    const s = store.getState();
    expect(s.messages).toHaveLength(2);
    // assistant 본문은 빈 문자열 그대로(stage 가 append 0).
    expect(s.messages[1].content).toBe("");
    expect(s.messages[1].thinkingSteps).toBeUndefined();
    expect(s.error).toBeNull();
    expect(s.conversationId).toBe("c-only-stage");
  });

  // --- 대조군: 정상 token/thread 는 정상 처리(stage 폐기와 독립) ---
  it("대조: stage 없는 정상 흐름은 그대로 동작(폐기 로직이 정상 경로 무해)", async () => {
    mockFetch([
      { type: "thread", conversationId: "c-normal" },
      { type: "token", text: "안녕" },
      { type: "token", text: "하세요" },
      { type: "done" },
    ]);

    await store.getState().startStream({ query: "인사" });

    const s = store.getState();
    expect(s.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(s.messages[1].content).toBe("안녕하세요");
    expect(s.conversationId).toBe("c-normal");
    expect(s.isStreaming).toBe(false);
    expect(s.error).toBeNull();
  });
});

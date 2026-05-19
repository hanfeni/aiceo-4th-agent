import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Slice 2 — OpenAI Responses API 직호출 클라이언트 정답지 (TDD).
// vi.mock("openai") 로 실호출 차단(CLAUDE.md: 과금/비결정 단위테스트
// mock 필수 — Mock 금지절은 route.ts 본문 한정). SDK 응답을 우리
// 경계 타입 WebSearchRawResult 로 좁히는지, graceful reason 분리,
// AbortSignal/timeout 전달을 검증.
//
// SDK 실측(R8): client.responses.create({model,input,tools,stream:false})
//   → response.output[]: web_search_call{action:search|open_page|find}
//      + message{content:[{type:"output_text",text,annotations:[url_citation]}]}
//   open_page.url / find.url 은 string|null|undefined (nullable 함정).

const createMock = vi.fn();

vi.mock("openai", () => ({
  // class 로 mock — client.ts 가 `new OpenAI({apiKey})` 로 생성하므로
  // 생성자 호환 필요(vi.fn().mockImplementation 은 ESM new 에서 깨짐).
  OpenAI: class {
    responses = { create: createMock };
  },
}));

import { runWebSearch } from "@/lib/web-search/client";

beforeEach(() => {
  createMock.mockReset();
  process.env.OPENAI_API_KEY = "sk-test-key";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("runWebSearch — graceful 실패 (reason 분리, Plan Critic 항목5)", () => {
  it("OPENAI_API_KEY 미설정 → ok:false no_api_key, OpenAI 호출 0", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await runWebSearch("삼성전자");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_api_key");
    expect(createMock).not.toHaveBeenCalled(); // 호출 전 차단(과금 0)
  });

  it("create 가 throw → ok:false network (detail 보존, LLM 미노출은 formatter 책임)", async () => {
    createMock.mockRejectedValue(new Error("ECONNRESET"));
    const r = await runWebSearch("q");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("network");
      expect(r.detail).toContain("ECONNRESET");
    }
  });

  it("모델 미지원 (400 model 거부) → ok:false model_unsupported", async () => {
    const err = Object.assign(new Error("model does not support web_search"), {
      status: 400,
    });
    createMock.mockRejectedValue(err);
    const r = await runWebSearch("q");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("model_unsupported");
  });

  it("output 빈 응답 → ok:false empty", async () => {
    createMock.mockResolvedValue({ output: [] });
    const r = await runWebSearch("q");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });
});

describe("runWebSearch — 성공: SDK 응답 → WebSearchRawResult 정규화", () => {
  it("web_search_call(search) → steps[search] + queries 정규화", async () => {
    createMock.mockResolvedValue({
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: {
            type: "search",
            query: "deprecated single", // [DEPRECATED] — queries 우선
            queries: ["삼성전자 주가", "005930"],
          },
        },
        {
          type: "message",
          content: [
            { type: "output_text", text: "삼성전자 주가는 ...", annotations: [] },
          ],
        },
      ],
    });
    const r = await runWebSearch("삼성전자");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0]).toEqual({
        kind: "search",
        queries: ["삼성전자 주가", "005930"],
      });
      expect(r.answer).toBe("삼성전자 주가는 ...");
    }
  });

  it("open_page.url 이 null/undefined 여도 크래시 0 (SDK nullable 함정 흡수)", async () => {
    createMock.mockResolvedValue({
      output: [
        { type: "web_search_call", action: { type: "open_page", url: null } },
        { type: "web_search_call", action: { type: "open_page" } }, // url 부재
        { type: "message", content: [{ type: "output_text", text: "본문", annotations: [] }] },
      ],
    });
    const r = await runWebSearch("q");
    expect(r.ok).toBe(true);
    if (r.ok) {
      // null/undefined url 은 빈 문자열로 정규화 (downstream 안전)
      expect(r.steps.every((s) => s.kind === "open_page")).toBe(true);
      expect(r.answer).toBe("본문");
    }
  });

  it("find_in_page → pattern/url 정규화, 미지 action.type → other(R8 passthrough)", async () => {
    createMock.mockResolvedValue({
      output: [
        {
          type: "web_search_call",
          action: { type: "find_in_page", pattern: "매출", url: "https://x.com" },
        },
        {
          type: "web_search_call",
          action: { type: "future_xyz", foo: 1 }, // 미지 — 버리지 말고 보존
        },
        { type: "message", content: [{ type: "output_text", text: "b", annotations: [] }] },
      ],
    });
    const r = await runWebSearch("q");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.steps[0]).toEqual({
        kind: "find_in_page",
        pattern: "매출",
        url: "https://x.com",
      });
      expect(r.steps[1]).toEqual({ kind: "other", type: "future_xyz" });
    }
  });

  it("url_citation annotations → citations 추출", async () => {
    createMock.mockResolvedValue({
      output: [
        { type: "web_search_call", action: { type: "search", queries: ["q"] } },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "본문[1]",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://src.com/a",
                  title: "출처 A",
                },
              ],
            },
          ],
        },
      ],
    });
    const r = await runWebSearch("q");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.citations).toEqual([
        { url: "https://src.com/a", title: "출처 A" },
      ]);
    }
  });
});

describe("runWebSearch — 호출 파라미터 (모델 상수/AbortSignal/timeout)", () => {
  it("gpt-5.4-mini 모델 + web_search tool + stream:false 로 호출", async () => {
    createMock.mockResolvedValue({
      output: [{ type: "message", content: [{ type: "output_text", text: "x", annotations: [] }] }],
    });
    await runWebSearch("쿼리");
    expect(createMock).toHaveBeenCalledTimes(1);
    const [body] = createMock.mock.calls[0];
    expect(body.model).toBe("gpt-5.4-mini"); // 사용자 지정 상수 고정
    expect(body.stream).toBe(false);
    expect(body.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "web_search" })]),
    );
    // 사용자 쿼리가 input 으로 전달
    expect(JSON.stringify(body.input)).toContain("쿼리");
  });

  it("AbortSignal 을 SDK options 로 전달 (취소 전파 — Plan Critic 항목3)", async () => {
    createMock.mockResolvedValue({
      output: [{ type: "message", content: [{ type: "output_text", text: "x", annotations: [] }] }],
    });
    const ac = new AbortController();
    await runWebSearch("q", { signal: ac.signal });
    const opts = createMock.mock.calls[0][1] ?? {};
    expect(opts.signal).toBe(ac.signal);
  });

  it("timeout 옵션이 SDK options 로 전달 (동기 호출 지연 방어)", async () => {
    createMock.mockResolvedValue({
      output: [{ type: "message", content: [{ type: "output_text", text: "x", annotations: [] }] }],
    });
    await runWebSearch("q");
    const opts = createMock.mock.calls[0][1] ?? {};
    expect(typeof opts.timeout).toBe("number");
    expect(opts.timeout).toBeGreaterThan(0);
  });
});

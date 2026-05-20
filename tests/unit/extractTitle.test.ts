import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeTitle,
  extractTitle,
  TITLE_EXTRACT_MODEL,
} from "@/lib/searchlab/extractTitle";

// extractTitle 단위 테스트 — 제목 추출 (LLM 호출은 fetch 모킹, 무과금).
// sanitizeTitle 은 순수 함수라 직접 검증. extractTitle 의 폴백 철학
// (키 없음·HTTP 오류·빈 응답 → null)을 모킹으로 검증.

describe("sanitizeTitle — 모델 응답 정제 (순수)", () => {
  it("앞뒤 공백·줄바꿈 제거 후 첫 줄만", () => {
    expect(sanitizeTitle("  제목입니다  \n둘째 줄")).toBe("제목입니다");
  });

  it("감싼 따옴표 제거(\", ', 「」, 『』)", () => {
    expect(sanitizeTitle('"보고서 제목"')).toBe("보고서 제목");
    expect(sanitizeTitle("「공고문」")).toBe("공고문");
    expect(sanitizeTitle("'계획서'")).toBe("계획서");
  });

  it("빈 응답·공백만 → null (폴백 신호)", () => {
    expect(sanitizeTitle("")).toBeNull();
    expect(sanitizeTitle("   \n  ")).toBeNull();
  });

  it("길이 상한(120자) 적용", () => {
    const long = "가".repeat(200);
    expect(sanitizeTitle(long)?.length).toBe(120);
  });
});

describe("extractTitle — 폴백 철학 (fetch 모킹)", () => {
  const ORIG_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("빈 본문은 fetch 없이 null", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await extractTitle("   ")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("키 미설정이면 fetch 없이 null", async () => {
    delete process.env.OPENAI_API_KEY;
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await extractTitle("본문 있음")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("정상 응답 → 추출 제목 반환 + 올바른 모델·헤더 전송", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "재난안전 종합상황 분석" } }],
        }),
        { status: 200 },
      ),
    );
    const out = await extractTitle("2015년 12월 재난발생 현황분석…");
    expect(out).toBe("재난안전 종합상황 분석");
    // 모델 ID 와 Authorization 헤더 검증.
    const [, init] = spy.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(TITLE_EXTRACT_MODEL);
    expect(
      (init?.headers as Record<string, string>).authorization,
    ).toContain("sk-test-key");
  });

  it("HTTP 오류(429/500) → null 폴백", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
    );
    expect(await extractTitle("본문")).toBeNull();
  });

  it("네트워크 throw → null 폴백(예외 전파 안 함)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    expect(await extractTitle("본문")).toBeNull();
  });

  it("빈 content 응답 → null 폴백", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
      }),
    );
    expect(await extractTitle("본문")).toBeNull();
  });
});

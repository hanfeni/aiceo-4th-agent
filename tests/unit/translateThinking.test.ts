import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTranslations,
  translateThinking,
  TRANSLATE_MODEL,
} from "@/lib/agent/translateThinking";

// translateThinking 단위 테스트 — 사고 일괄 번역 (LLM 호출은 fetch 모킹).
// parseTranslations 는 순수 함수라 직접 검증. translateThinking 의 폴백
// 철학(키 없음·오류·형식불일치 → null)을 모킹으로 검증.

describe("parseTranslations — JSON 배열 파싱 (순수)", () => {
  it("정상 JSON 배열 파싱", () => {
    expect(parseTranslations('["가", "나"]', 2)).toEqual(["가", "나"]);
  });

  it("앞뒤 잡음·코드펜스 제거 후 [ ~ ] 구간 파싱", () => {
    const raw = '```json\n["번역1", "번역2"]\n```';
    expect(parseTranslations(raw, 2)).toEqual(["번역1", "번역2"]);
  });

  it("개수 불일치 → null (매핑 안전 — 폴백)", () => {
    expect(parseTranslations('["하나"]', 2)).toBeNull();
  });

  it("배열 아님 → null", () => {
    expect(parseTranslations('{"a":1}', 1)).toBeNull();
  });

  it("[ 없음 → null", () => {
    expect(parseTranslations("그냥 텍스트", 1)).toBeNull();
  });

  it("비문자열 원소는 문자열로 강제", () => {
    expect(parseTranslations("[1, null]", 2)).toEqual(["1", ""]);
  });
});

describe("translateThinking — 폴백 철학 (fetch 모킹)", () => {
  const ORIG_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIG_KEY;
    vi.restoreAllMocks();
  });

  it("빈 배열은 fetch 없이 [] 반환", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await translateThinking([])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("키 미설정이면 fetch 없이 null", async () => {
    delete process.env.OPENAI_API_KEY;
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await translateThinking(["hello"])).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("정상 응답 → 번역 배열 + 올바른 모델·헤더 전송", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '["안녕", "세계"]' } }],
        }),
        { status: 200 },
      ),
    );
    const out = await translateThinking(["hello", "world"]);
    expect(out).toEqual(["안녕", "세계"]);
    const [, init] = spy.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(TRANSLATE_MODEL);
    expect(
      (init?.headers as Record<string, string>).authorization,
    ).toContain("sk-test-key");
  });

  it("HTTP 오류 → null 폴백", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    expect(await translateThinking(["x"])).toBeNull();
  });

  it("형식 불일치(개수 안 맞음) → null 폴백", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '["하나"]' } }] }),
        { status: 200 },
      ),
    );
    expect(await translateThinking(["a", "b"])).toBeNull();
  });

  it("네트워크 throw → null 폴백", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    expect(await translateThinking(["x"])).toBeNull();
  });

  it("MAX_ITEMS(50) 초과 → fetch 없이 null", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const many = Array.from({ length: 51 }, (_, i) => `t${i}`);
    expect(await translateThinking(many)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

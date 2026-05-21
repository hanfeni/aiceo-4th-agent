import { describe, it, expect, vi } from "vitest";

// embed 서브배치 분할 단위 테스트 — OpenAI 임베딩 요청 합산 300K 토큰
// 한계 방어(splitByTokenBudget 순수 함수). LLM/네트워크 비의존.
//
// 핵심: 호출처(index-run EMBED_BATCH=64)가 건수로만 끊어 보내도, 합산
// 토큰이 큰 입력은 여기서 토큰 예산 기준으로 재분할돼야 HTTP 400 을 막는다.
//
// countTokens(tiktoken)는 무거우므로 모킹한다 — 분할 로직(누적 합산·경계
// 끊기)만 검증하면 되고, 실제 토큰화 정확도는 chunk.ts 자체 테스트의 몫.
// 여기선 "1글자=1토큰" 으로 단순화해 입력 길이로 토큰 수를 결정론적 제어.
vi.mock("@/lib/searchlab/chunk", () => ({
  countTokens: (s: string) => s.length,
}));

import { splitByTokenBudget } from "@/lib/searchlab/embed";

// 한 요청 토큰 예산(embed.ts MAX_REQUEST_TOKENS 와 동일 — 검증 기준).
const MAX_REQUEST_TOKENS = 250_000;

/** 각 서브배치의 합산 토큰(모킹된 countTokens = length 와 동일 규칙). */
function batchTokens(batch: string[]): number {
  return batch.reduce((s, t) => s + t.length, 0);
}

describe("splitByTokenBudget — 요청 합산 토큰 한계 분할", () => {
  it("빈 입력 → 빈 배열", () => {
    expect(splitByTokenBudget([])).toEqual([]);
  });

  it("합산이 한계 미만이면 단일 배치(불필요 분할 0)", () => {
    const texts = ["짧은 텍스트 A", "짧은 텍스트 B", "짧은 텍스트 C"];
    const out = splitByTokenBudget(texts);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(texts);
  });

  it("입력 순서·전체 항목 보존(누락·중복 0)", () => {
    const texts = Array.from({ length: 100 }, (_, i) => `item-${i}`);
    const out = splitByTokenBudget(texts);
    expect(out.flat()).toEqual(texts); // 순서 그대로 평탄화
  });

  it("각 서브배치 합산이 한계를 넘지 않는다(다항목)", () => {
    // 항목당 5000토큰(=5000글자, 모킹) × 100개 = 500K → 분할 필수.
    // 1글자=1토큰 모킹이라 tiktoken 부하 없이 결정론적.
    const big = "x".repeat(5000);
    const texts = Array.from({ length: 100 }, () => big);
    const out = splitByTokenBudget(texts);
    expect(out.length).toBeGreaterThan(1);
    for (const batch of out) {
      // 단일 항목(5000)이 한계 미만이라 각 배치는 한계 이하로 유지.
      expect(batchTokens(batch)).toBeLessThanOrEqual(MAX_REQUEST_TOKENS);
    }
    // 전체 항목 수 보존.
    expect(out.flat()).toHaveLength(100);
  });

  it("단일 항목이 비어있지 않은 배치만 push(빈 배치 0)", () => {
    const out = splitByTokenBudget(["a", "b", "c"]);
    for (const batch of out) expect(batch.length).toBeGreaterThan(0);
  });
});

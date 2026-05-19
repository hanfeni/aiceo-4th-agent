import { describe, it, expect } from "vitest";
import { ioSummary, needsFold } from "@/lib/agent/utils/ioSummary";

// I/O 요약 추출 — 순수 함수(LLM/React 무관, NFR-11).
// medigate-new IOPairPrimitives stripSeparators + FoldableValue 의
// "요약 한 줄 / 상세 전체" 분리 규칙 모방. 우리 ThinkingStep 은 args/
// result 가 단일 문자열이라 클라이언트가 요약을 추출한다:
//   - 첫 줄(개행 전)만 취하고 구분선(===)·연속 공백 정리
//   - maxLen(기본 120) 초과 시 말줄임(…)
// needsFold: 원문이 요약과 다르면(여러 줄 or 절단됨) 펼침 필요.

describe("ioSummary — 한 줄 요약 추출", () => {
  it("짧은 한 줄은 그대로", () => {
    expect(ioSummary('{"q":"삼성"}')).toBe('{"q":"삼성"}');
  });

  it("여러 줄 → 첫 줄만", () => {
    expect(ioSummary("첫 줄 내용\n둘째 줄\n셋째")).toBe("첫 줄 내용");
  });

  it("=== 구분선 → 공백으로 치환 후 trim", () => {
    expect(ioSummary("결과 ===== 다음")).toBe("결과 다음");
  });

  it("연속 공백 → 단일 공백", () => {
    expect(ioSummary("a    b\t\tc")).toBe("a b c");
  });

  it("maxLen 초과 → 말줄임(…) 부착", () => {
    const long = "가".repeat(200);
    const s = ioSummary(long, 120);
    expect(s.length).toBeLessThanOrEqual(121); // 120 + '…'
    expect(s.endsWith("…")).toBe(true);
  });

  it("앞뒤 공백 trim", () => {
    expect(ioSummary("  内容  ")).toBe("内容");
  });

  it("빈 문자열 → 빈 문자열", () => {
    expect(ioSummary("")).toBe("");
  });

  it("undefined → 빈 문자열(방어)", () => {
    expect(ioSummary(undefined)).toBe("");
  });
});

describe("needsFold — 펼침(접기 토글) 필요 판정", () => {
  it("짧은 한 줄(요약==원문) → false (접기 불필요)", () => {
    expect(needsFold('{"q":"x"}')).toBe(false);
  });

  it("여러 줄 → true", () => {
    expect(needsFold("첫 줄\n둘째 줄")).toBe(true);
  });

  it("maxLen 초과 단일 줄 → true (절단되므로 펼침 필요)", () => {
    expect(needsFold("나".repeat(200), 120)).toBe(true);
  });

  it("빈 문자열 → false", () => {
    expect(needsFold("")).toBe(false);
  });

  it("undefined → false", () => {
    expect(needsFold(undefined)).toBe(false);
  });

  it("구분선만 다르고 내용 같으면(요약화로 동일) → false", () => {
    // 'a === b' → 요약 'a b'. 원문에 개행/절단 없음 → 접기 불필요
    // (요약이 약간 정리돼도 정보 손실 아님 — medigate stripSeparators).
    expect(needsFold("a === b")).toBe(false);
  });
});

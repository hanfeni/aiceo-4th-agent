import { describe, it, expect } from "vitest";
import { formatDuration } from "@/lib/agent/utils/formatDuration";

// 도구 IN→OUT 소요시간(elapsedMs) → 사람이 읽는 문자열.
// medigate-manager textFormatting.formatDuration 모방(한글 "초" 표기):
//   < 10초 → "X.X초"(소수 1자리), >= 10초 → "X초"(반올림 정수).
// 1초 미만 표기 정책은 UX 결정(아래 describe 의 "1초 미만" 케이스).

describe("formatDuration — 10초 경계", () => {
  it("2300ms → '2.3초' (10초 미만 소수 1자리)", () => {
    expect(formatDuration(2300)).toBe("2.3초");
  });

  it("9900ms → '9.9초' (경계 직전)", () => {
    expect(formatDuration(9900)).toBe("9.9초");
  });

  it("10000ms → '10초' (경계, 정수 반올림)", () => {
    expect(formatDuration(10000)).toBe("10초");
  });

  it("15000ms → '15초'", () => {
    expect(formatDuration(15000)).toBe("15초");
  });

  it("65400ms → '65초' (반올림)", () => {
    expect(formatDuration(65400)).toBe("65초");
  });
});

describe("formatDuration — 1초 미만 정책(UX 결정)", () => {
  // 정책 A(medigate 동일): 800 → "0.8초"
  // 정책 B(ms 정직 표기): 800 → "800ms", 50 → "50ms"
  // 아래 케이스는 채택 정책에 맞춰 구현(TODO(USER) 참조).
  it("820ms → 1초 미만은 ms 단위로 정직하게 표기 ('820ms')", () => {
    expect(formatDuration(820)).toBe("820ms");
  });

  it("50ms → '50ms' (매우 빠른 도구는 ms 가 더 정확)", () => {
    expect(formatDuration(50)).toBe("50ms");
  });

  it("999ms → '999ms' (1초 직전 경계)", () => {
    expect(formatDuration(999)).toBe("999ms");
  });

  it("1000ms → '1.0초' (1초부터 초 단위 진입)", () => {
    expect(formatDuration(1000)).toBe("1.0초");
  });
});

describe("formatDuration — 방어(음수/0/NaN)", () => {
  it("0 → '0ms'", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("음수 → '0ms' (clock skew 가드)", () => {
    expect(formatDuration(-500)).toBe("0ms");
  });

  it("NaN → '0ms' (방어)", () => {
    expect(formatDuration(Number.NaN)).toBe("0ms");
  });
});

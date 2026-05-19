/**
 * 도구 IN→OUT 소요시간(ms) → 사람이 읽는 문자열(순수 함수, NFR-11).
 *
 * 표기 정책(formatDuration.test.ts 계약):
 *  - 음수/NaN/0       → "0ms"          (clock skew·방어)
 *  - 1초 미만(<1000)  → "{정수}ms"      (예: 820 → "820ms", 50 → "50ms")
 *  - 1초~10초 미만    → "{소수1}초"     (예: 2300 → "2.3초", 1000 → "1.0초")
 *  - 10초 이상        → "{반올림정수}초" (예: 15000 → "15초", 65400 → "65초")
 *
 * medigate-manager textFormatting.formatDuration 모방하되, 1초 미만은
 * "0.8초" 대신 "820ms"로 표기해 빠른 도구 호출을 더 정직하게 보인다.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 10) return `${sec.toFixed(1)}초`;
  return `${Math.round(sec)}초`;
}

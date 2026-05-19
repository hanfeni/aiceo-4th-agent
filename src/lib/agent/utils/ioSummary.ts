/**
 * I/O 요약 추출 — 순수 함수(LLM/React 무관, NFR-11).
 *
 * 사고 패널 ToolBlock 의 IN(args)/OUT(result)은 단일 문자열이다(우리
 * ThinkingStep 모델). medigate-new FoldableValue 는 백엔드가 summary/
 * detail 을 나눠 주지만 우리는 안 주므로, 클라이언트가 "요약 한 줄"을
 * 추출하고 원문 전체는 펼침(접기 토글)에서 보여준다.
 *
 * 요약 규칙(medigate IOPairPrimitives stripSeparators 모방):
 *   1. 첫 줄(개행 전)만 취함
 *   2. `===` 류 구분선 → 공백, 연속 공백 → 단일 공백
 *   3. 앞뒤 trim
 *   4. maxLen(기본 120) 초과 시 말줄임(…)
 */

const DEFAULT_MAX_LEN = 120;

/** 단일 문자열 → 한 줄 요약(구분선/공백 정리 + 말줄임). */
export function ioSummary(
  raw: string | undefined,
  maxLen: number = DEFAULT_MAX_LEN,
): string {
  if (!raw) return "";
  const firstLine = raw.split("\n")[0] ?? "";
  const cleaned = firstLine
    .replace(/={3,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.length > maxLen) return `${cleaned.slice(0, maxLen)}…`;
  return cleaned;
}

/**
 * 펼침(접기 토글) 필요 판정 — 정보가 실제로 잘렸을 때만 true.
 * 개행이 있거나(여러 줄) 첫 줄이 maxLen 으로 절단되면 true.
 * 구분선/공백 정리만 다른 건 정보 손실 아님 → false(접기 불필요).
 */
export function needsFold(
  raw: string | undefined,
  maxLen: number = DEFAULT_MAX_LEN,
): boolean {
  if (!raw) return false;
  if (raw.includes("\n")) return true;
  const firstLine = raw.split("\n")[0] ?? "";
  const cleaned = firstLine
    .replace(/={3,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length > maxLen;
}

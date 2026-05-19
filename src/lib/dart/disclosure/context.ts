/**
 * DART 비상장사 공시 맥락 조립 (전문 모드 전용 — gemini 절단).
 *
 * 이식 출처: medigate `disclosure-parser.service.ts`(10fb7f4) 737~877행.
 * STRUCTURAL #4(원본 복사 금지): 요약 모드(`else` 분기 +
 * summarizeDisclosureForAI) **제거**. 자동선택 기본값도 'full'(전문)
 * 강제 — gemini 의존 0. 전문 텍스트의 토큰 폭발은 D5 context-formatter
 * 가 흡수(OPEN-5). 비상장사는 재무제표가 없어 공시 원문이 분석의
 * 주 입력(UC-41 비상장 분기).
 */

import type {
  SelectedDisclosureOption,
  UnlistedDisclosureContext,
} from "./types";
import { extractDisclosureFullText } from "./parser";
import { getRecentDisclosures } from "../api";

/** 중요 공시 우선순위 키워드 (감사·사업·반기·분기·재무제표 우선) */
const PRIORITY_KEYWORDS = [
  "감사보고서",
  "사업보고서",
  "반기보고서",
  "분기보고서",
  "재무제표",
];

/**
 * 비상장사 공시 맥락 생성 (전문 모드만).
 * @param selectedDisclosures 사용자 선택분(있으면 우선), 없으면 자동선택
 * 실패 시 throw 아닌 결과 객체(graceful — NFR-18).
 */
export async function getUnlistedCompanyDisclosureContext(
  corpCode: string,
  corpName: string,
  maxDisclosures: number = 3,
  selectedDisclosures?: SelectedDisclosureOption[],
): Promise<UnlistedDisclosureContext> {
  const empty = (error: string): UnlistedDisclosureContext => ({
    success: false,
    context: "",
    disclosureCount: 0,
    totalOriginalChars: 0,
    totalSummaryChars: 0,
    error,
  });

  try {
    let toProcess: SelectedDisclosureOption[];

    if (selectedDisclosures && selectedDisclosures.length > 0) {
      toProcess = selectedDisclosures;
    } else {
      const disclosures = await getRecentDisclosures(corpCode, 10);
      if (!disclosures || disclosures.length === 0) {
        return empty("최근 공시가 없습니다.");
      }
      const sorted = [...disclosures].sort((a, b) => {
        const aP = PRIORITY_KEYWORDS.some((kw) => a.reportNm?.includes(kw));
        const bP = PRIORITY_KEYWORDS.some((kw) => b.reportNm?.includes(kw));
        if (aP && !bP) return -1;
        if (!aP && bP) return 1;
        return 0;
      });
      // STRUCTURAL #4: 자동선택 기본 mode='full'(요약 모드 제거)
      toProcess = sorted.slice(0, maxDisclosures).map((d) => ({
        rceptNo: d.rceptNo || "",
        reportNm: d.reportNm || "",
        rceptDt: d.rceptDt || "",
        mode: "full" as const,
      }));
    }

    let totalOriginalChars = 0;
    const results = await Promise.all(
      toProcess.map(async (disclosure) => {
        if (!disclosure.rceptNo) return null;
        // 전문 모드만 (요약 모드 STRUCTURAL #4 절단)
        const fullText = await extractDisclosureFullText(disclosure.rceptNo);
        if (fullText.success && fullText.text) {
          return {
            content: `### ${disclosure.reportNm || "공시"} (${
              disclosure.rceptDt || "날짜 미상"
            }) [전문]\n\n${fullText.text}`,
            originalChars: fullText.charCount,
          };
        }
        return null;
      }),
    );

    const contents: string[] = [];
    for (const result of results) {
      if (result) {
        contents.push(result.content);
        totalOriginalChars += result.originalChars;
      }
    }

    if (contents.length === 0) {
      return empty("공시 내용을 처리할 수 없습니다.");
    }

    const context = `## 비상장 회사 "${corpName}" 공시 정보 (전문)

아래는 DART에서 조회한 공시 ${contents.length}건입니다.
비상장 회사이므로 시세 정보는 제공되지 않습니다.

${contents.join("\n\n---\n\n")}`;

    return {
      success: true,
      context,
      disclosureCount: contents.length,
      totalOriginalChars,
      totalSummaryChars: totalOriginalChars, // 전문이므로 동일
    };
  } catch (error) {
    console.error(`[getUnlistedCompanyDisclosureContext] Error:`, error);
    return empty(error instanceof Error ? error.message : String(error));
  }
}

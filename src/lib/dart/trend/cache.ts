/**
 * DART 트렌드 요청 레벨 캐시 + 재무제표 사전 로딩.
 *
 * 이식 출처: medigate `trend.service.ts`(10fb7f4) 42~129행. 기능축
 * 5분리(STRUCTURAL #2 — 원본 1114줄 단일 복사 금지). 이 파일 =
 * "같은 분석 요청 내 재무제표 중복 호출 방지 캐시 + preload" 축.
 * gemini 의존 0(원본도 0). import 경로만 D2/D3 로 재배선.
 */

import type { DartFinancialItem, ReportCode } from "@/types/dart";
import { getFinancialStatements } from "../api";

/** 요청별 재무제표 캐시 (corpCode_year_reportCode → items) */
const requestFinancialCache = new Map<string, DartFinancialItem[]>();

/** 트렌드 누적금액 추출용 계정과목 매핑 (financial.ts cumulative 가 사용) */
export const TREND_ACCOUNT_NAMES: Record<string, string[]> = {
  revenue: ["수익(매출액)", "매출액", "영업수익", "매출"],
  operatingIncome: ["영업이익", "영업이익(손실)"],
  netIncome: [
    "당기순이익", "당기순이익(손실)",
    "분기순이익", "분기순이익(손실)",
    "반기순이익", "반기순이익(손실)",
  ],
};

/** 요청 캐시 초기화 (새 분석 시작 시 호출) */
export function clearRequestCache(): void {
  requestFinancialCache.clear();
}

/** 캐시된 재무제표 조회 (요청 레벨 + dart-api 캐시 2중) */
export async function getCachedFinancialStatements(
  corpCode: string,
  year: string,
  reportCode: ReportCode,
): Promise<DartFinancialItem[]> {
  const cacheKey = `${corpCode}_${year}_${reportCode}`;
  const cached = requestFinancialCache.get(cacheKey);
  if (cached) return cached;

  const data = await getFinancialStatements(corpCode, year, reportCode);
  requestFinancialCache.set(cacheKey, data);
  return data;
}

/**
 * 재무제표 사전 로딩 (병렬 조회 → 캐시 적재).
 * 분석 시작 전 호출 시 이후 지표 계산이 캐시 히트.
 */
export async function preloadFinancialStatements(
  corpCode: string,
  annualYears: number,
  quarterlyCount: number,
): Promise<{ annual: number; quarterly: number }> {
  const currentYear = new Date().getFullYear();
  const promises: Promise<DartFinancialItem[]>[] = [];
  const reportCodes: ReportCode[] = ["11013", "11012", "11014", "11011"];

  for (let y = currentYear - annualYears; y < currentYear; y++) {
    promises.push(getCachedFinancialStatements(corpCode, String(y), "11011"));
  }

  if (quarterlyCount > 0) {
    let count = 0;
    for (
      let y = currentYear;
      y >= currentYear - 5 && count < quarterlyCount;
      y--
    ) {
      for (let q = 3; q >= 0 && count < quarterlyCount; q--) {
        promises.push(
          getCachedFinancialStatements(corpCode, String(y), reportCodes[q]),
        );
        count++;
      }
    }
  }

  await Promise.allSettled(promises);
  return { annual: annualYears, quarterly: quarterlyCount };
}

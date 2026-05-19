/**
 * DART 지표 분류 판정 + 계정과목명 조회 (순수 술어 함수).
 *
 * 이식 출처: medigate `indicator-calculator.ts`(10fb7f4) 795~869행.
 * 기능축 6분리(STRUCTURAL #2). 이 파일 = "지표 종류 판정 + 금액/
 * 성장률 지표의 원천 계정과목명 조회" 축. 분기 연환산·종합 계산이 소비.
 */

import { ACCOUNT_NAMES, RATIO_INDICATORS, GROWTH_INDICATORS, EFFICIENCY_INDICATORS, AMOUNT_INDICATORS } from "./definitions";

/** 비율 기반 지표인지 */
export function isRatioBasedIndicator(indicator: string): boolean {
  return RATIO_INDICATORS.has(indicator);
}

/** 성장률 지표인지 */
export function isGrowthIndicator(indicator: string): boolean {
  return GROWTH_INDICATORS.has(indicator);
}

/** 효율성(회전율) 지표인지 */
export function isEfficiencyIndicator(indicator: string): boolean {
  return EFFICIENCY_INDICATORS.has(indicator);
}

/** 금액 기반 지표인지 */
export function isAmountIndicator(indicator: string): boolean {
  return AMOUNT_INDICATORS.has(indicator);
}

/** 금액 지표의 계정과목명 반환 (4Q 단위금액 계산용) */
export function getAmountIndicatorAccountNames(indicator: string): string[] {
  switch (indicator) {
    case "revenue":
      return ACCOUNT_NAMES.revenue;
    case "operatingIncome":
      return ACCOUNT_NAMES.operatingIncome;
    case "netIncome":
      return ACCOUNT_NAMES.netIncome;
    case "operatingCF":
      return ACCOUNT_NAMES.operatingCF;
    case "investingCF":
      return ACCOUNT_NAMES.investingCF;
    case "financingCF":
      return ACCOUNT_NAMES.financingCF;
    case "fcf":
      return ACCOUNT_NAMES.operatingCF; // FCF는 별도 계산 필요
    case "totalAssets":
      return ACCOUNT_NAMES.totalAssets;
    default:
      return [];
  }
}

/** 성장률 지표의 원천 계정과목명 반환 */
export function getGrowthSourceAccountNames(indicator: string): string[] {
  switch (indicator) {
    case "revenueGrowth":
      return ACCOUNT_NAMES.revenue;
    case "operatingIncomeGrowth":
      return ACCOUNT_NAMES.operatingIncome;
    case "netIncomeGrowth":
      return ACCOUNT_NAMES.netIncome;
    case "assetGrowth":
      return ACCOUNT_NAMES.totalAssets;
    case "equityGrowth":
      return ACCOUNT_NAMES.totalEquity;
    default:
      return [];
  }
}

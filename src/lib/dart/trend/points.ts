/**
 * DART 재무 트렌드 데이터포인트 생성 (순수 + IO 혼합).
 *
 * 이식 출처: medigate `trend.service.ts`(10fb7f4) 348~602행. D4 분리
 * 시 financial.ts 가 architect 예산(≤420) 초과 → 데이터포인트 생성
 * 함수군을 points.ts 로 추가 분리(STRUCTURAL #2 정합 — indicators/
 * 6분리와 동일 판단, 하드 제약 ≤1000·응집도 우선). gemini 0.
 */

import type {
  DartFinancialItem,
  TrendDataPoint,
  ReportCode,
} from "@/types/dart";
import {
  isRatioBasedIndicator,
  calculateRatioIndicator,
  calculateEfficiencyIndicatorForQuarter,
  extractIndicatorAmount,
  calculateQ4UnitAmount,
  extractAddAmount,
  getGrowthSourceAccountNames,
  extractAmount,
} from "../indicators";
import { getCachedFinancialStatements, TREND_ACCOUNT_NAMES } from "./cache";

// ==================== 데이터 포인트 생성 ====================

export function createFinancialDataPoint(
  financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
): TrendDataPoint {
  const point: TrendDataPoint = {
    year: parseInt(period.substring(0, 4)),
    period,
    periodLabel: label,
    value: null,
  };
  if (isRatioBasedIndicator(indicator)) {
    const ratio = calculateRatioIndicator(financials, indicator);
    if (ratio !== null) {
      point.ratio = Math.round(ratio * 100) / 100;
      point.value = point.ratio;
    }
  } else {
    const amount = extractIndicatorAmount(financials, indicator);
    if (amount !== null) {
      point.amount = amount;
      point.value = amount;
    }
  }
  return point;
}

export function createEfficiencyDataPoint(
  financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
  quarterIndex: number,
): TrendDataPoint {
  const point: TrendDataPoint = {
    year: parseInt(period.substring(0, 4)),
    quarter: quarterIndex + 1,
    period,
    periodLabel: label,
    value: null,
  };
  const ratio = calculateEfficiencyIndicatorForQuarter(
    financials,
    indicator,
    quarterIndex,
  );
  if (ratio !== null) {
    point.ratio = Math.round(ratio * 100) / 100;
    point.value = point.ratio;
  }
  return point;
}

export async function createGrowthDataPoint(
  corpCode: string,
  indicator: string,
  period: string,
  label: string,
  year: number,
  quarterIndex: number,
  reportCodes: ReportCode[],
): Promise<TrendDataPoint> {
  const point: TrendDataPoint = {
    year,
    quarter: quarterIndex + 1,
    period,
    periodLabel: label,
    value: null,
  };
  try {
    const accountNames = getGrowthSourceAccountNames(indicator);
    if (accountNames.length === 0) return point;
    const currentYear = String(year);

    let currentAmount: number | null = null;
    if (quarterIndex === 3) {
      currentAmount = await q4UnitForGrowth(corpCode, currentYear, accountNames);
    } else {
      const cur = await getCachedFinancialStatements(
        corpCode,
        currentYear,
        reportCodes[quarterIndex],
      );
      if (cur && cur.length > 0) currentAmount = extractAmount(cur, ...accountNames);
    }
    if (currentAmount === null) return point;

    let prevAmount: number | null = null;
    if (quarterIndex === 0) {
      prevAmount = await q4UnitForGrowth(corpCode, String(year - 1), accountNames);
    } else {
      const prevCode = reportCodes[quarterIndex - 1];
      const prev = await getCachedFinancialStatements(corpCode, currentYear, prevCode);
      if (prev && prev.length > 0) prevAmount = extractAmount(prev, ...accountNames);
    }

    if (prevAmount !== null && prevAmount !== 0) {
      point.ratio =
        Math.round(((currentAmount - prevAmount) / Math.abs(prevAmount)) * 100 * 10) / 10;
      point.value = point.ratio;
    }
  } catch {
    /* skip on error */
  }
  return point;
}

async function q4UnitForGrowth(
  corpCode: string,
  year: string,
  accountNames: string[],
): Promise<number | null> {
  try {
    const annual = await getCachedFinancialStatements(corpCode, year, "11011");
    const q3 = await getCachedFinancialStatements(corpCode, year, "11014");
    if (!annual || annual.length === 0) return null;
    const annualAmount = extractAmount(annual, ...accountNames);
    const q3Amount = q3 ? extractAmount(q3, ...accountNames) : null;
    if (annualAmount === null) return null;
    if (q3Amount === null) return annualAmount;
    return annualAmount - q3Amount;
  } catch {
    return null;
  }
}

export async function createQ4AmountDataPoint(
  corpCode: string,
  annualFinancials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
  year: number,
): Promise<TrendDataPoint> {
  const point: TrendDataPoint = {
    year,
    quarter: 4,
    period,
    periodLabel: label,
    value: null,
  };
  try {
    const q3 = await getCachedFinancialStatements(corpCode, String(year), "11014");
    const q4Amount = calculateQ4UnitAmount(annualFinancials, q3 || [], indicator);
    if (q4Amount !== null) {
      point.amount = q4Amount;
      point.value = q4Amount;
    } else {
      const annualAmount = extractIndicatorAmount(annualFinancials, indicator);
      if (annualAmount !== null) {
        point.amount = annualAmount;
        point.value = annualAmount;
      }
    }
  } catch {
    const annualAmount = extractIndicatorAmount(annualFinancials, indicator);
    if (annualAmount !== null) {
      point.amount = annualAmount;
      point.value = annualAmount;
    }
  }
  return point;
}

export function createCumulativeDataPoint(
  financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
): TrendDataPoint {
  const point: TrendDataPoint = {
    year: parseInt(period.substring(0, 4)),
    period,
    periodLabel: label,
    value: null,
  };
  if (isRatioBasedIndicator(indicator)) {
    const ratio = calculateRatioIndicator(financials, indicator);
    if (ratio !== null) {
      point.ratio = Math.round(ratio * 100) / 100;
      point.value = point.ratio;
    }
  } else {
    const accountNames = TREND_ACCOUNT_NAMES[indicator] || [];
    let amount = extractAddAmount(financials, ...accountNames);
    if (amount === null) amount = extractIndicatorAmount(financials, indicator);
    if (amount !== null) {
      point.amount = amount;
      point.value = amount;
    }
  }
  return point;
}


/**
 * DART 재무 트렌드 — annual/quarterly_unit/yearly_cumulative + 디스패처.
 *
 * 이식 출처: medigate `trend.service.ts`(10fb7f4) 131~602·918~1081행.
 * 기능축 5분리(STRUCTURAL #2). 이 파일 = "재무 시계열 조립 +
 * 데이터포인트 생성 + 성장률(QoQ/YoY) + 통합 디스패처" 축.
 * gemini 0. import 경로만 D2(api)/D3(indicators)/cache 로 재배선.
 */

import type {
  DartFinancialTrend,
  TrendDataPoint,
  TrendType,
  ReportCode,
} from "@/types/dart";
import { INDICATOR_DISPLAY_CONFIG } from "@/types/dart";
import {
  isEfficiencyIndicator,
  isGrowthIndicator,
  isAmountIndicator,
} from "../indicators";
import { getCachedFinancialStatements } from "./cache";
import {
  createFinancialDataPoint,
  createEfficiencyDataPoint,
  createGrowthDataPoint,
  createQ4AmountDataPoint,
  createCumulativeDataPoint,
} from "./points";
import { getWorkforceTrend } from "./workforce";
import { getGovernanceTrend } from "./governance";
import { getDividendTrend } from "./dividend";

/** 통합 지표 트렌드 디스패처 (dataSource 별 라우팅 + 성장률 후처리) */
export async function getIndicatorTrend(
  corpCode: string,
  indicator: string,
  dataSource: "financial" | "workforce" | "governance" | "dividend",
  trendType: TrendType,
  count: number,
  year?: number,
): Promise<DartFinancialTrend> {
  let trend: DartFinancialTrend;
  switch (dataSource) {
    case "financial":
      trend = await getFinancialTrend(corpCode, trendType, indicator, count, year);
      break;
    case "workforce":
      trend = await getWorkforceTrend(corpCode, trendType, indicator, count);
      break;
    case "governance":
      trend = await getGovernanceTrend(corpCode, trendType, indicator, count);
      break;
    case "dividend":
      trend = await getDividendTrend(corpCode, indicator, count);
      break;
    default:
      trend = await getFinancialTrend(corpCode, trendType, indicator, count, year);
  }
  if (trend.dataPoints.length >= 2) {
    calculateGrowthRates(trend.dataPoints, trendType, indicator);
  }
  return trend;
}

/** 재무 트렌드 조회 (annual/quarterly_unit/yearly_cumulative) */
export async function getFinancialTrend(
  corpCode: string,
  trendType: TrendType,
  indicator: string,
  count: number,
  year?: number,
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: "financial",
    trendType,
    dataPoints: [],
  };
  const currentYear = new Date().getFullYear();

  switch (trendType) {
    case "annual":
      trend.dataPoints = await getAnnualTrend(corpCode, indicator, count, currentYear);
      break;
    case "quarterly_unit":
      trend.dataPoints = await getQuarterlyTrend(corpCode, indicator, count, currentYear);
      break;
    case "yearly_cumulative":
      if (year) {
        trend.dataPoints = await getYearlyCumulativeTrend(corpCode, indicator, year);
      }
      break;
  }
  return trend;
}

async function getAnnualTrend(
  corpCode: string,
  indicator: string,
  years: number,
  currentYear: number,
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];
  for (let y = currentYear - years; y < currentYear; y++) {
    try {
      const financials = await getCachedFinancialStatements(corpCode, String(y), "11011");
      if (financials && financials.length > 0) {
        const point = createFinancialDataPoint(financials, indicator, String(y), `${y}년`);
        if (point.amount !== undefined || point.ratio !== undefined) {
          dataPoints.push(point);
        }
      }
    } catch {
      /* skip years with no data */
    }
  }
  return dataPoints;
}

async function getQuarterlyTrend(
  corpCode: string,
  indicator: string,
  quarters: number,
  currentYear: number,
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];
  const reportCodes: ReportCode[] = ["11013", "11012", "11014", "11011"];
  const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];
  let count = 0;

  for (let y = currentYear; y >= currentYear - 5 && count < quarters; y--) {
    for (let q = 3; q >= 0 && count < quarters; q--) {
      try {
        const financials = await getCachedFinancialStatements(
          corpCode,
          String(y),
          reportCodes[q],
        );
        if (financials && financials.length > 0) {
          const period = `${y}${quarterLabels[q]}`;
          const label = `${y}년 ${q + 1}분기`;
          let point: TrendDataPoint;

          if (isEfficiencyIndicator(indicator)) {
            point = createEfficiencyDataPoint(financials, indicator, period, label, q);
          } else if (isGrowthIndicator(indicator)) {
            point = await createGrowthDataPoint(
              corpCode, indicator, period, label, y, q, reportCodes,
            );
          } else if (q === 3 && isAmountIndicator(indicator)) {
            point = await createQ4AmountDataPoint(
              corpCode, financials, indicator, period, label, y,
            );
          } else {
            point = createFinancialDataPoint(financials, indicator, period, label);
          }

          if (point.amount !== undefined || point.ratio !== undefined) {
            dataPoints.unshift(point);
            count++;
          }
        }
      } catch {
        /* skip quarters with no data */
      }
    }
  }
  return dataPoints;
}

async function getYearlyCumulativeTrend(
  corpCode: string,
  indicator: string,
  year: number,
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];
  const reportCodes: ReportCode[] = ["11013", "11012", "11014", "11011"];
  const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];

  for (const y of [year - 1, year]) {
    for (let q = 0; q < 4; q++) {
      try {
        const financials = await getCachedFinancialStatements(
          corpCode,
          String(y),
          reportCodes[q],
        );
        if (financials && financials.length > 0) {
          const point = createCumulativeDataPoint(
            financials,
            indicator,
            `${y}${quarterLabels[q]}`,
            `${y}년 ${q + 1}분기 누적`,
          );
          if (point.amount !== undefined || point.ratio !== undefined) {
            dataPoints.push(point);
          }
        }
      } catch {
        /* skip quarters with no data */
      }
    }
  }

  // YoY (전년 동일 분기 비교)
  for (let i = 0; i < dataPoints.length; i++) {
    const curr = dataPoints[i];
    if (!curr.period) continue;
    const currYear = parseInt(curr.period.substring(0, 4));
    const prevYearPeriod = `${currYear - 1}${curr.period.substring(4)}`;
    const prevYearPoint = dataPoints.find((p) => p.period === prevYearPeriod);
    if (prevYearPoint) {
      const currValue = extractNumericValue(curr);
      const prevValue = extractNumericValue(prevYearPoint);
      if (currValue !== null && prevValue !== null && prevValue !== 0) {
        curr.yoyRate =
          Math.round(((currValue - prevValue) / Math.abs(prevValue)) * 1000) / 10;
      }
    }
  }
  return dataPoints;
}

// ==================== 성장률 계산 ====================

/**
 * 성장률 계산. valueType='percent' → 절대차(%p), 그 외 → 상대변화율(%).
 * annual 은 yoyRate=growthRate, 분기는 전년동기 비교.
 */
function calculateGrowthRates(
  dataPoints: TrendDataPoint[],
  trendType: TrendType,
  indicator: string,
): void {
  if (dataPoints.length < 2) return;
  const isAnnual = trendType === "annual";
  const valueType = INDICATOR_DISPLAY_CONFIG[indicator]?.valueType || "amount";
  const useAbsoluteDifference = valueType === "percent";

  for (let i = 1; i < dataPoints.length; i++) {
    const curr = dataPoints[i];
    const prev = dataPoints[i - 1];
    const currValue = extractNumericValue(curr);
    const prevValue = extractNumericValue(prev);
    if (currValue === null || prevValue === null) continue;

    if (useAbsoluteDifference) {
      curr.growthRate = Math.round((currValue - prevValue) * 10) / 10;
    } else if (prevValue !== 0) {
      curr.growthRate =
        Math.round(((currValue - prevValue) / Math.abs(prevValue)) * 100 * 10) / 10;
    }

    if (isAnnual) {
      curr.yoyRate = curr.growthRate;
    } else {
      const prevYearSamePeriod = findPrevYearSamePeriod(dataPoints, curr, i);
      if (prevYearSamePeriod) {
        const prevYearValue = extractNumericValue(prevYearSamePeriod);
        if (prevYearValue !== null) {
          if (useAbsoluteDifference) {
            curr.yoyRate = Math.round((currValue - prevYearValue) * 10) / 10;
          } else if (prevYearValue !== 0) {
            curr.yoyRate =
              Math.round(((currValue - prevYearValue) / Math.abs(prevYearValue)) * 100 * 10) / 10;
          }
        }
      }
    }
  }
}

function extractNumericValue(point: TrendDataPoint): number | null {
  if (point.value !== null) return point.value;
  if (point.amount !== undefined) return point.amount;
  if (point.ratio !== undefined) return point.ratio;
  return null;
}

function findPrevYearSamePeriod(
  dataPoints: TrendDataPoint[],
  current: TrendDataPoint,
  currentIndex: number,
): TrendDataPoint | null {
  const currPeriod = current.period;
  if (!currPeriod || currPeriod.length < 4) return null;
  try {
    const currYear = parseInt(currPeriod.substring(0, 4));
    const periodSuffix = currPeriod.length > 4 ? currPeriod.substring(4) : "";
    const targetPeriod = `${currYear - 1}${periodSuffix}`;
    for (let i = 0; i < currentIndex; i++) {
      if (dataPoints[i].period === targetPeriod) return dataPoints[i];
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

// ==================== 지표명 매핑 ====================

function getIndicatorName(key: string): string {
  const names: Record<string, string> = {
    revenue: "매출액",
    operatingIncome: "영업이익",
    netIncome: "당기순이익",
    debtRatio: "부채비율",
    roe: "ROE",
    roa: "ROA",
    grossProfitMargin: "매출총이익률",
    operatingProfitMargin: "영업이익률",
    netProfitMargin: "순이익률",
    currentRatio: "유동비율",
    quickRatio: "당좌비율",
    interestCoverage: "이자보상배율",
    debtDependency: "차입금의존도",
    netDebtRatio: "순부채비율",
    cashRatio: "현금비율",
    revenueGrowth: "매출성장률",
    operatingIncomeGrowth: "영업이익성장률",
    netIncomeGrowth: "순이익성장률",
    assetGrowth: "자산성장률",
    equityGrowth: "자본성장률",
    assetTurnover: "총자산회전율",
    receivablesTurnover: "매출채권회전율",
    inventoryTurnover: "재고자산회전율",
    payablesTurnover: "매입채무회전율",
    tangibleAssetTurnover: "유형자산회전율",
    operatingCF: "영업현금흐름",
    investingCF: "투자현금흐름",
    financingCF: "재무현금흐름",
    fcf: "잉여현금흐름",
  };
  return names[key] || key;
}

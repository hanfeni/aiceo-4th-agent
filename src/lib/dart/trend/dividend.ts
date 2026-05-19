/**
 * DART 배당 트렌드 — 연간(11011)만 가용.
 *
 * 이식 출처: medigate `trend.service.ts`(10fb7f4) 853~916·1106~1114행.
 * 기능축 5분리(STRUCTURAL #2). 배당 정보는 사업보고서(11011)에만
 * 존재 — 분기/반기 미가용(TC-41.21 가용성 차이). gemini 0.
 */

import type { DartFinancialTrend, TrendDataPoint } from "@/types/dart";
import {
  calculateDividendIndicators,
  extractIndicatorAmount,
} from "../indicators";
import { getDividends } from "../api";
import { getCachedFinancialStatements } from "./cache";

function getDividendIndicatorName(key: string): string {
  const names: Record<string, string> = {
    dps: "주당배당금",
    payoutRatio: "배당성향",
    dividendYield: "배당수익률",
    totalDividend: "총배당금",
  };
  return names[key] || key;
}

/** 배당 트렌드 조회 (연간 11011 — 사업보고서에만 배당 정보 존재) */
export async function getDividendTrend(
  corpCode: string,
  indicator: string,
  years: number,
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getDividendIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: "dividend",
    trendType: "annual",
    dataPoints: [],
  };
  const currentYear = new Date().getFullYear();

  for (let y = currentYear - years; y < currentYear; y++) {
    try {
      const dividends = await getDividends(corpCode, String(y), "11011");
      if (dividends && dividends.length > 0) {
        let netIncome: number | null = null;
        if (indicator === "payoutRatio") {
          const fin = await getCachedFinancialStatements(corpCode, String(y), "11011");
          if (fin && fin.length > 0) {
            netIncome = extractIndicatorAmount(fin, "netIncome");
          }
        }
        const target = calculateDividendIndicators(dividends, netIncome).find(
          (ind) => ind.key === indicator,
        );
        if (target && target.value !== null) {
          const point: TrendDataPoint = {
            year: y,
            period: String(y),
            periodLabel: `${y}년`,
            value: target.value,
          };
          if (target.unit === "%") point.ratio = target.value;
          else point.amount = target.value;
          trend.dataPoints.push(point);
        }
      }
    } catch {
      /* skip years with no data */
    }
  }
  return trend;
}

/**
 * DART 지배구조 트렌드 — 연간(11011)·반기(11012) 가용성.
 *
 * 이식 출처: medigate `trend.service.ts`(10fb7f4) 743~851·1095~1104행.
 * 기능축 5분리(STRUCTURAL #2). 주주/임원 데이터는 연간/반기만
 * (분기 미가용 — TC-41.21). gemini 0.
 */

import type {
  DartFinancialTrend,
  TrendDataPoint,
  TrendType,
  ReportCode,
} from "@/types/dart";
import { calculateGovernanceIndicators } from "../indicators";
import { getMajorShareholders, getExecutives } from "../api";

function getGovernanceIndicatorName(key: string): string {
  const names: Record<string, string> = {
    majorShareholderRatio: "최대주주지분율",
    relatedPartyRatio: "특수관계인지분율",
    totalExecutives: "총 임원수",
    outsideDirectorRatio: "사외이사비율",
    femaleExecutiveRatio: "여성임원비율",
  };
  return names[key] || key;
}

/** 지배구조 트렌드 조회 (annual: 연간 / quarterly_unit: 반기 H1·H2) */
export async function getGovernanceTrend(
  corpCode: string,
  trendType: TrendType,
  indicator: string,
  count: number,
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getGovernanceIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: "governance",
    trendType: trendType === "quarterly_unit" ? "quarterly_unit" : "annual",
    dataPoints: [],
  };
  const currentYear = new Date().getFullYear();

  if (trendType === "annual") {
    for (let y = currentYear - count; y < currentYear; y++) {
      try {
        const [shareholders, executives] = await Promise.all([
          getMajorShareholders(corpCode, String(y), "11011"),
          getExecutives(corpCode, String(y), "11011"),
        ]);
        if (
          (shareholders && shareholders.length > 0) ||
          (executives && executives.length > 0)
        ) {
          const target = calculateGovernanceIndicators(
            shareholders || [],
            executives || [],
          ).find((ind) => ind.key === indicator);
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
  } else if (trendType === "quarterly_unit") {
    const reportCodes: ReportCode[] = ["11012", "11011"];
    const halfYearLabels = ["H1", "H2"];
    let periodCount = 0;

    for (let y = currentYear; y >= currentYear - 5 && periodCount < count; y--) {
      for (let h = 1; h >= 0 && periodCount < count; h--) {
        try {
          const reportCode = reportCodes[h];
          const [shareholders, executives] = await Promise.all([
            getMajorShareholders(corpCode, String(y), reportCode),
            getExecutives(corpCode, String(y), reportCode),
          ]);
          if (
            (shareholders && shareholders.length > 0) ||
            (executives && executives.length > 0)
          ) {
            const target = calculateGovernanceIndicators(
              shareholders || [],
              executives || [],
            ).find((ind) => ind.key === indicator);
            if (target && target.value !== null) {
              const point: TrendDataPoint = {
                year: y,
                period: `${y}${halfYearLabels[h]}`,
                periodLabel: `${y}년 ${h === 0 ? "상반기" : "하반기"}`,
                value: target.value,
              };
              if (target.unit === "%") point.ratio = target.value;
              else point.amount = target.value;
              trend.dataPoints.unshift(point);
              periodCount++;
            }
          }
        } catch {
          /* skip periods with no data */
        }
      }
    }
  }
  return trend;
}

/**
 * DART 인력 트렌드 — 연간(11011)·반기(11012) 가용성.
 *
 * 이식 출처: medigate `trend.service.ts`(10fb7f4) 604~741·1031~1093행.
 * 기능축 5분리(STRUCTURAL #2). 인력 데이터는 연간/반기 보고서만
 * 존재(분기 미가용 — TC-41.21 가용성 차이). gemini 0.
 */

import type {
  DartFinancialTrend,
  TrendDataPoint,
  TrendType,
  DartEmployee,
  ReportCode,
} from "@/types/dart";
import {
  calculateWorkforceIndicators,
  extractIndicatorAmount,
} from "../indicators";
import { getEmployees } from "../api";
import { getCachedFinancialStatements } from "./cache";

/** 직원 데이터 유효성 (직원수>0 존재 여부) */
function hasValidEmployeeData(employees: DartEmployee[]): boolean {
  if (!employees || employees.length === 0) return false;
  for (const emp of employees) {
    if (parseInt(emp.sm?.replace(/,/g, "") || "0", 10) > 0) return true;
    const reg = parseInt(emp.rgllbrCo?.replace(/,/g, "") || "0", 10);
    const con = parseInt(emp.cnttkCo?.replace(/,/g, "") || "0", 10);
    if (reg > 0 || con > 0) return true;
  }
  return false;
}

function getWorkforceIndicatorName(key: string): string {
  const names: Record<string, string> = {
    totalEmployees: "총 직원수",
    avgSalary: "평균급여",
    regularRatio: "정규직비율",
    avgTenure: "평균근속연수",
    genderRatio: "남성비율",
    revenuePerEmployee: "1인당매출",
  };
  return names[key] || key;
}

/** 인력 트렌드 조회 (annual: 연간 / quarterly_unit: 반기 H1·H2) */
export async function getWorkforceTrend(
  corpCode: string,
  trendType: TrendType,
  indicator: string,
  count: number,
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getWorkforceIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: "workforce",
    trendType: trendType === "quarterly_unit" ? "quarterly_unit" : "annual",
    dataPoints: [],
  };
  const currentYear = new Date().getFullYear();
  const needsRevenue = indicator === "revenuePerEmployee";

  if (trendType === "annual") {
    for (let y = currentYear - count; y < currentYear; y++) {
      try {
        const employees = await getEmployees(corpCode, String(y), "11011");
        if (employees && employees.length > 0) {
          let revenue: number | null = null;
          if (needsRevenue) {
            const fin = await getCachedFinancialStatements(corpCode, String(y), "11011");
            if (fin && fin.length > 0) revenue = extractIndicatorAmount(fin, "revenue");
          }
          const target = calculateWorkforceIndicators(employees, revenue).find(
            (ind) => ind.key === indicator,
          );
          if (target && target.value !== null) {
            const point: TrendDataPoint = {
              year: y,
              period: String(y),
              periodLabel: `${y}년`,
              value: target.value,
            };
            if (["%", "년", "배"].includes(target.unit)) point.ratio = target.value;
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
          const employees = await getEmployees(corpCode, String(y), reportCode);
          if (
            employees &&
            employees.length > 0 &&
            hasValidEmployeeData(employees)
          ) {
            let revenue: number | null = null;
            if (needsRevenue) {
              if (h === 0) {
                const fin = await getCachedFinancialStatements(corpCode, String(y), "11012");
                if (fin) revenue = extractIndicatorAmount(fin, "revenue");
              } else {
                const annual = await getCachedFinancialStatements(corpCode, String(y), "11011");
                const h1 = await getCachedFinancialStatements(corpCode, String(y), "11012");
                const aRev = annual ? extractIndicatorAmount(annual, "revenue") : null;
                const hRev = h1 ? extractIndicatorAmount(h1, "revenue") : null;
                if (aRev !== null && hRev !== null) revenue = aRev - hRev;
                else if (aRev !== null) revenue = aRev / 2;
              }
            }
            const target = calculateWorkforceIndicators(employees, revenue).find(
              (ind) => ind.key === indicator,
            );
            if (target && target.value !== null) {
              let value = target.value;
              if (indicator === "avgSalary" && reportCode === "11012") {
                value = value * 2; // 반기 → 연환산
              }
              const point: TrendDataPoint = {
                year: y,
                period: `${y}${halfYearLabels[h]}`,
                periodLabel: `${y}년 ${h === 0 ? "상반기" : "하반기"}`,
                value,
              };
              if (["%", "년", "배"].includes(target.unit)) point.ratio = value;
              else point.amount = value;
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

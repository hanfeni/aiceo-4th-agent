/**
 * DART 지표 종합 계산 — 전체/그룹/인력/지배구조/배당 조립 (순수).
 *
 * 이식 출처: medigate `indicator-calculator.ts`(10fb7f4) 871~1386행.
 * 기능축 6분리(STRUCTURAL #2). 이 파일 = "정의 카탈로그를 순회하며
 * extract/ratio/efficiency 를 조립해 CalculatedIndicator[] 산출" 축.
 * 결측·자본잠식은 하위 함수가 null/수식값 결정적 반환(NFR-18).
 */

import type {
  DartFinancialItem,
  DartEmployee,
  DartShareholder,
  DartExecutive,
  DartDividend,
  CalculatedIndicator,
  IndicatorResult,
  IndicatorGroup,
} from "@/types/dart";
import {
  INDICATOR_DEFINITIONS,
  AMOUNT_INDICATORS,
  EFFICIENCY_INDICATORS,
  RATIO_INDICATORS,
  GROWTH_INDICATORS,
} from "./definitions";
import {
  calculateRatioIndicator,
  calculatePrevRatioIndicator,
  extractIndicatorAmount,
  extractPrevIndicatorAmount,
} from "./ratio";
import { calculateEfficiencyIndicatorForQuarter } from "./efficiency";

/** def.unit 에 따른 소수점 정규화 (원본 라운딩 규칙 보존) */
function roundByUnit(value: number, unit: string): number {
  if (unit === "%" || unit === "배" || unit === "회") {
    return Math.round(value * 100) / 100;
  }
  if (unit === "원") return Math.round(value);
  return value;
}

/** 단일 지표의 value/growthRate/yoyRate 계산 (전체/그룹 공통 로직) */
function computeIndicator(
  financials: DartFinancialItem[],
  def: { key: string; name: string; unit: string; group: IndicatorGroup },
  quarterIndex: number | undefined,
  reportCode: string | undefined,
  prevYearSamePeriodFinancials: DartFinancialItem[] | undefined,
): CalculatedIndicator {
  let value: number | null = null;

  if (AMOUNT_INDICATORS.has(def.key)) {
    value = extractIndicatorAmount(financials, def.key);
  } else if (
    EFFICIENCY_INDICATORS.has(def.key) &&
    quarterIndex !== undefined &&
    quarterIndex < 3
  ) {
    value = calculateEfficiencyIndicatorForQuarter(financials, def.key, quarterIndex);
  } else if (RATIO_INDICATORS.has(def.key)) {
    const prevData = GROWTH_INDICATORS.has(def.key)
      ? prevYearSamePeriodFinancials
      : undefined;
    value = calculateRatioIndicator(financials, def.key, prevData);
  }

  if (value !== null) value = roundByUnit(value, def.unit);

  let growthRate: number | null = null;
  let yoyRate: number | null = null;

  if (value !== null) {
    if (AMOUNT_INDICATORS.has(def.key)) {
      const prevValue = extractPrevIndicatorAmount(financials, def.key);
      if (prevValue !== null && prevValue !== 0) {
        growthRate =
          Math.round(((value - prevValue) / Math.abs(prevValue)) * 100 * 100) / 100;
      }
    } else if (RATIO_INDICATORS.has(def.key) && !GROWTH_INDICATORS.has(def.key)) {
      const prevValue = calculatePrevRatioIndicator(financials, def.key);
      if (prevValue !== null) {
        growthRate = Math.round((value - prevValue) * 100) / 100;
      }
    }

    if (reportCode === "11011") {
      yoyRate = growthRate;
    } else if (
      prevYearSamePeriodFinancials &&
      prevYearSamePeriodFinancials.length > 0
    ) {
      if (AMOUNT_INDICATORS.has(def.key)) {
        const prevYearValue = extractIndicatorAmount(
          prevYearSamePeriodFinancials,
          def.key,
        );
        if (prevYearValue !== null && prevYearValue !== 0) {
          yoyRate =
            Math.round(((value - prevYearValue) / Math.abs(prevYearValue)) * 100 * 100) /
            100;
        }
      } else if (RATIO_INDICATORS.has(def.key) && !GROWTH_INDICATORS.has(def.key)) {
        const prevYearRatio = calculateRatioIndicator(
          prevYearSamePeriodFinancials,
          def.key,
        );
        if (prevYearRatio !== null) {
          yoyRate = Math.round((value - prevYearRatio) * 100) / 100;
        }
      }
    }
  }

  return {
    key: def.key,
    name: def.name,
    value,
    unit: def.unit,
    group: def.group,
    growthRate,
    yoyRate,
  };
}

/** 모든 지표 계산 (workforce/governance/dividend 는 별도 API라 스킵) */
export function calculateAllIndicators(
  financials: DartFinancialItem[],
  corpCode: string,
  year: number,
  reportCode: string,
  quarterIndex?: number,
  prevYearSamePeriodFinancials?: DartFinancialItem[],
): IndicatorResult {
  const indicators: CalculatedIndicator[] = [];
  const byGroup: Record<IndicatorGroup, CalculatedIndicator[]> = {
    core: [],
    profitability: [],
    stability: [],
    growth: [],
    efficiency: [],
    cashflow: [],
    workforce: [],
    governance: [],
    dividend: [],
  };
  const skipGroups = new Set(["workforce", "governance", "dividend"]);

  for (const def of INDICATOR_DEFINITIONS) {
    if (skipGroups.has(def.group)) continue;
    const indicator = computeIndicator(
      financials,
      def,
      quarterIndex,
      reportCode,
      prevYearSamePeriodFinancials,
    );
    indicators.push(indicator);
    byGroup[def.group].push(indicator);
  }

  return {
    corpCode,
    year,
    quarter: quarterIndex !== undefined ? quarterIndex + 1 : undefined,
    reportCode,
    indicators,
    byGroup,
  };
}

/** 특정 그룹의 지표만 계산 */
export function calculateGroupIndicators(
  financials: DartFinancialItem[],
  group: IndicatorGroup,
  quarterIndex?: number,
  reportCode?: string,
  prevYearSamePeriodFinancials?: DartFinancialItem[],
): CalculatedIndicator[] {
  return INDICATOR_DEFINITIONS.filter((d) => d.group === group).map((def) =>
    computeIndicator(
      financials,
      def,
      quarterIndex,
      reportCode,
      prevYearSamePeriodFinancials,
    ),
  );
}

/** 인력 지표 계산 (직원현황 API 데이터 기반) */
export function calculateWorkforceIndicators(
  employees: DartEmployee[],
  revenue?: number | null,
): CalculatedIndicator[] {
  const defs = INDICATOR_DEFINITIONS.filter((d) => d.group === "workforce");

  let totalEmployees = 0;
  let maleCount = 0;
  let regularCount = 0;
  let totalTenureSum = 0;
  let tenureCount = 0;
  let weightedSalarySum = 0;
  let salaryEmployeeCount = 0;

  for (const emp of employees) {
    const sm = parseFloat(emp.sm?.replace(/,/g, "") || "0");
    const rgllbr = parseFloat(emp.rgllbrCo?.replace(/,/g, "") || "0");
    const tenure = parseFloat(emp.avrgCnwkSdytrn?.replace(/,/g, "") || "0");
    const janSalary = parseFloat(emp.janSalaryAm?.replace(/,/g, "") || "0");

    totalEmployees += sm;
    regularCount += rgllbr;
    if (emp.sexdstn === "남") maleCount += sm;

    if (tenure > 0) {
      totalTenureSum += tenure * sm;
      tenureCount += sm;
    }
    if (janSalary > 0 && sm > 0) {
      weightedSalarySum += janSalary * sm;
      salaryEmployeeCount += sm;
    }
  }

  const avgWeightedSalary =
    salaryEmployeeCount > 0 ? weightedSalarySum / salaryEmployeeCount : 0;

  return defs.map((def) => {
    let value: number | null = null;
    switch (def.key) {
      case "revenuePerEmployee":
        if (revenue && totalEmployees > 0) value = revenue / totalEmployees;
        break;
      case "avgSalary":
        if (avgWeightedSalary > 0) value = avgWeightedSalary;
        break;
      case "regularRatio":
        if (totalEmployees > 0) value = (regularCount / totalEmployees) * 100;
        break;
      case "avgTenure":
        if (tenureCount > 0) value = totalTenureSum / tenureCount;
        break;
      case "genderRatio":
        if (totalEmployees > 0) value = (maleCount / totalEmployees) * 100;
        break;
    }
    if (value !== null) {
      if (def.unit === "%") value = Math.round(value * 100) / 100;
      else if (def.unit === "년") value = Math.round(value * 10) / 10;
      else if (def.unit === "원") value = Math.round(value);
    }
    return {
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
    };
  });
}

/** 지배구조 지표 계산 (주주/임원현황 API 데이터 기반) */
export function calculateGovernanceIndicators(
  shareholders: DartShareholder[],
  executives: DartExecutive[],
): CalculatedIndicator[] {
  const defs = INDICATOR_DEFINITIONS.filter((d) => d.group === "governance");

  let largestShareholderRatio: number | null = null;
  let relatedPartyRatio: number | null = null;
  const commonStockHolders = shareholders.filter(
    (s) => s.stockKnd?.includes("보통주") || !s.stockKnd,
  );
  if (commonStockHolders.length > 0) {
    largestShareholderRatio = parseFloat(
      commonStockHolders[0].trmnPosessnStkQotaRt?.replace(/,/g, "") || "0",
    );
    relatedPartyRatio = commonStockHolders.reduce(
      (acc, h) =>
        acc + parseFloat(h.trmnPosessnStkQotaRt?.replace(/,/g, "") || "0"),
      0,
    );
  }

  let totalExecutives = 0;
  let outsideDirectors = 0;
  let femaleExecutives = 0;
  let registeredExecutives = 0;
  for (const exec of executives) {
    totalExecutives++;
    if (exec.rgistExctvAt === "등기임원") registeredExecutives++;
    if (exec.ofcpsNm?.includes("사외이사")) outsideDirectors++;
    if (exec.sexdstn === "여") femaleExecutives++;
  }

  return defs.map((def) => {
    let value: number | null = null;
    switch (def.key) {
      case "largestShareholderRatio":
        value = largestShareholderRatio;
        break;
      case "relatedPartyRatio":
        value = relatedPartyRatio;
        break;
      case "executiveCount":
        value = registeredExecutives > 0 ? registeredExecutives : totalExecutives;
        break;
      case "outsideDirectorRatio":
        if (totalExecutives > 0) value = (outsideDirectors / totalExecutives) * 100;
        break;
      case "femaleExecutiveRatio":
        if (totalExecutives > 0) value = (femaleExecutives / totalExecutives) * 100;
        break;
    }
    if (value !== null) {
      if (def.unit === "%") value = Math.round(value * 100) / 100;
      else if (def.unit === "명") value = Math.round(value);
    }
    return {
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
    };
  });
}

/** 배당 지표 계산 (배당정보 API 데이터 기반) */
export function calculateDividendIndicators(
  dividends: DartDividend[],
  netIncome?: number | null,
): CalculatedIndicator[] {
  const defs = INDICATOR_DEFINITIONS.filter((d) => d.group === "dividend");

  let dps: number | null = null;
  let dividendYield: number | null = null;
  let totalDividend: number | null = null;

  for (const div of dividends) {
    const seType = div.seType || "";
    const thstrm = div.thstrm?.replace(/,/g, "").replace(/-/g, "") || "";
    const value = parseFloat(thstrm) || 0;

    if (seType.includes("주당 현금배당금") || seType.includes("주당배당금")) {
      if ((!div.stockKnd || div.stockKnd.includes("보통주")) && value > 0) dps = value;
    }
    if (seType.includes("현금배당수익률") || seType.includes("시가배당율")) {
      if ((!div.stockKnd || div.stockKnd.includes("보통주")) && value > 0) {
        dividendYield = value;
      }
    }
    if (seType.includes("현금배당금총액") || seType.includes("배당금총액")) {
      if (value > 0) totalDividend = value * 1000000; // 백만원 → 원
    }
  }

  let payoutRatio: number | null = null;
  if (totalDividend && netIncome && netIncome > 0) {
    payoutRatio = (totalDividend / netIncome) * 100;
  }

  return defs.map((def) => {
    let value: number | null = null;
    switch (def.key) {
      case "dps":
        value = dps;
        break;
      case "payoutRatio":
        value = payoutRatio;
        break;
      case "dividendYield":
        value = dividendYield;
        break;
      case "totalDividend":
        value = totalDividend;
        break;
    }
    if (value !== null) {
      if (def.unit === "%") value = Math.round(value * 100) / 100;
      else if (def.unit === "원") value = Math.round(value);
    }
    return {
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
    };
  });
}

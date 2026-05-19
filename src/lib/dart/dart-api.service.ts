/**
 * DART API 서비스 — 기업 종합 데이터 조립 + 요약 가공.
 *
 * 이식 출처: medigate `dart-api.service.ts`(10fb7f4, 367줄). gemini/
 * auth/TokenUsage 의존 0(원본도 0 — FR-27) → 본문 그대로 이식,
 * 변경점은 import 경로 단 1곳(`@/lib/external/dart-api` → `./api`).
 * getFullCompanyData 가 분석 subagent 의 1차 수집 진입점(UC-41 Step4).
 */

import {
  searchCompanies,
  getCompanyInfo,
  getFinancialStatements,
  getEmployees,
  getMajorShareholders,
  getExecutives,
  getDividends,
  getDisclosures,
  getRecentDisclosures,
} from "./api";

import type {
  DartCompany,
  DartCompanyInfo,
  DartFinancialItem,
  DartEmployee,
  DisclosureListResult,
  CompanyFullInfo,
  FinancialSummary,
  WorkforceSummary,
  ReportCode,
} from "@/types/dart";

// ==================== 유틸리티 ====================

function parseNumber(str?: string): number {
  if (!str || str === "-" || str.trim() === "") return 0;
  const num = Number(str.replace(/,/g, "").trim());
  return isNaN(num) ? 0 : num;
}

function toHundredMillion(value: number): number {
  return Math.round(value / 100000000);
}

// ==================== 기업 검색·개황 ====================

export async function searchCompany(keyword: string): Promise<DartCompany[]> {
  if (!keyword || keyword.trim().length === 0) return [];
  return searchCompanies(keyword.trim());
}

export async function getCompanyOverview(
  corpCode: string,
): Promise<DartCompanyInfo | null> {
  return getCompanyInfo(corpCode);
}

/** 기업 종합 정보 조회 (개황+연간/분기 재무+주주/임원/직원/배당/공시) */
export async function getFullCompanyData(
  corpCode: string,
  disclosureCount: number = 10,
): Promise<CompanyFullInfo> {
  const currentYear = new Date().getFullYear();
  const lastYear = String(currentYear - 1);
  const twoYearsAgo = String(currentYear - 2);
  const annualReportCode: ReportCode = "11011";

  const companyInfo = await getCompanyInfo(corpCode);

  let financials = await getFinancialStatements(
    corpCode,
    lastYear,
    annualReportCode,
  );
  let annualYear = lastYear;
  if (!hasValidFinancialData(financials)) {
    financials = await getFinancialStatements(
      corpCode,
      twoYearsAgo,
      annualReportCode,
    );
    annualYear = twoYearsAgo;
  }

  const quarterlyReportCodes: ReportCode[] = ["11014", "11012", "11013"];
  let latestFinancials: DartFinancialItem[] | undefined;
  let latestYear = String(currentYear);
  let latestReportCode: ReportCode | undefined;

  for (const reportCode of quarterlyReportCodes) {
    const temp = await getFinancialStatements(corpCode, latestYear, reportCode);
    if (hasValidFinancialData(temp)) {
      latestFinancials = temp;
      latestReportCode = reportCode;
      break;
    }
  }
  if (!latestFinancials) {
    for (const reportCode of quarterlyReportCodes) {
      const temp = await getFinancialStatements(corpCode, lastYear, reportCode);
      if (hasValidFinancialData(temp)) {
        latestFinancials = temp;
        latestYear = lastYear;
        latestReportCode = reportCode;
        break;
      }
    }
  }
  if (!latestFinancials) {
    latestFinancials = financials;
    latestYear = annualYear;
    latestReportCode = annualReportCode;
  }

  const [shareholders, executives, employees, dividends, disclosures] =
    await Promise.all([
      getMajorShareholders(corpCode, annualYear, annualReportCode),
      getExecutives(corpCode, annualYear, annualReportCode),
      getEmployees(corpCode, annualYear, annualReportCode),
      getDividends(corpCode, annualYear, annualReportCode),
      disclosureCount > 0
        ? getRecentDisclosures(corpCode, disclosureCount)
        : Promise.resolve([]),
    ]);

  return {
    companyInfo: companyInfo || undefined,
    financials,
    latestFinancials,
    shareholders,
    executives,
    employees,
    dividends,
    disclosures,
    annualYear,
    latestYear,
    latestReportCode,
  };
}

// ==================== 재무 데이터 가공 ====================

function hasValidFinancialData(financials: DartFinancialItem[]): boolean {
  if (!financials || financials.length === 0) return false;
  const coreAccounts = new Set([
    "매출액", "수익(매출액)", "영업수익", "순매출액",
    "당기순이익", "당기순이익(손실)",
    "분기순이익", "분기순이익(손실)",
    "반기순이익", "반기순이익(손실)",
    "영업이익", "영업이익(손실)",
    "자산총계", "자본총계",
  ]);
  for (const item of financials) {
    if (coreAccounts.has(item.accountNm || "")) {
      const amount = item.thstrmAmount;
      if (amount && amount !== "-" && amount.trim() !== "") return true;
    }
  }
  return false;
}

function findAccount(
  financials: DartFinancialItem[],
  accountNames: string[],
): DartFinancialItem | undefined {
  for (const name of accountNames) {
    const item = financials.find((f) => f.accountNm === name);
    if (item) return item;
  }
  return undefined;
}

/** 재무 요약 추출 (억 단위 정규화 + 핵심 지표) */
export function extractFinancialSummary(
  financials: DartFinancialItem[],
  year: number,
): FinancialSummary {
  const revenueItem = findAccount(financials, [
    "매출액", "수익(매출액)", "영업수익", "순매출액",
  ]);
  const opProfitItem = findAccount(financials, ["영업이익", "영업이익(손실)"]);
  const netIncomeItem = findAccount(financials, [
    "당기순이익", "당기순이익(손실)",
    "분기순이익", "분기순이익(손실)",
    "반기순이익", "반기순이익(손실)",
  ]);
  const totalAssetsItem = findAccount(financials, ["자산총계"]);
  const totalLiabilitiesItem = findAccount(financials, ["부채총계"]);
  const totalEquityItem = findAccount(financials, ["자본총계"]);

  const revenue = parseNumber(revenueItem?.thstrmAmount);
  const operatingProfit = parseNumber(opProfitItem?.thstrmAmount);
  const netIncome = parseNumber(netIncomeItem?.thstrmAmount);
  const totalAssets = parseNumber(totalAssetsItem?.thstrmAmount);
  const totalLiabilities = parseNumber(totalLiabilitiesItem?.thstrmAmount);
  const totalEquity = parseNumber(totalEquityItem?.thstrmAmount);

  const debtRatio = totalEquity > 0 ? (totalLiabilities / totalEquity) * 100 : 0;
  const roe = totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0;
  const roa = totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0;

  return {
    year,
    revenue: toHundredMillion(revenue),
    operatingProfit: toHundredMillion(operatingProfit),
    netIncome: toHundredMillion(netIncome),
    totalAssets: toHundredMillion(totalAssets),
    totalLiabilities: toHundredMillion(totalLiabilities),
    totalEquity: toHundredMillion(totalEquity),
    debtRatio: Math.round(debtRatio * 10) / 10,
    roe: Math.round(roe * 10) / 10,
    roa: Math.round(roa * 10) / 10,
  };
}

/** 다년도 재무 요약 (연간 11011, 연도 오름차순) */
export async function getMultiYearFinancialSummary(
  corpCode: string,
  years: number = 5,
): Promise<FinancialSummary[]> {
  const currentYear = new Date().getFullYear();
  const summaries: FinancialSummary[] = [];
  for (let i = 1; i <= years; i++) {
    const year = currentYear - i;
    const financials = await getFinancialStatements(
      corpCode,
      String(year),
      "11011",
    );
    if (hasValidFinancialData(financials)) {
      summaries.push(extractFinancialSummary(financials, year));
    }
  }
  return summaries.sort((a, b) => a.year - b.year);
}

// ==================== 인력 데이터 가공 ====================

export function extractWorkforceSummary(
  employees: DartEmployee[],
  year: number,
): WorkforceSummary {
  let totalEmployees = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let regularCount = 0;
  let contractCount = 0;
  let tenureSum = 0;
  let tenureCount = 0;
  let salarySum = 0;
  let salaryCount = 0;

  for (const emp of employees) {
    const total = parseNumber(emp.sm);
    totalEmployees += total;
    if (emp.sexdstn === "남") maleCount += total;
    else if (emp.sexdstn === "여") femaleCount += total;
    regularCount += parseNumber(emp.rgllbrCo);
    contractCount += parseNumber(emp.cnttkCo);

    const tenure = parseFloat(emp.avrgCnwkSdytrn || "0");
    if (tenure > 0) {
      tenureSum += tenure;
      tenureCount++;
    }
    const salary = parseNumber(emp.janSalaryAm);
    if (salary > 0) {
      salarySum += salary;
      salaryCount++;
    }
  }

  return {
    year,
    totalEmployees,
    maleCount,
    femaleCount,
    regularCount,
    contractCount,
    averageTenure:
      tenureCount > 0 ? Math.round((tenureSum / tenureCount) * 10) / 10 : undefined,
    averageSalary:
      salaryCount > 0 ? Math.round(salarySum / salaryCount / 10000) : undefined,
  };
}

// ==================== 공시 데이터 ====================

export async function getCompanyDisclosures(
  corpCode: string,
  options?: {
    beginDate?: string;
    endDate?: string;
    pageNo?: number;
    pageCount?: number;
  },
): Promise<DisclosureListResult> {
  return getDisclosures(corpCode, options);
}

export {
  searchCompanies,
  getCompanyInfo,
  getFinancialStatements,
  getEmployees,
  getMajorShareholders,
  getExecutives,
  getDividends,
  getRecentDisclosures,
};

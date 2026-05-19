/**
 * DART API 서비스
 * 기업 정보 조회 및 데이터 가공 담당
 * Agent 4 전용
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
} from '@/lib/external/dart-api';

import type {
  DartCompany,
  DartCompanyInfo,
  DartFinancialItem,
  DartEmployee,
  DartShareholder,
  DartExecutive,
  DartDividend,
  DartDisclosure,
  DisclosureListResult,
  CompanyFullInfo,
  FinancialSummary,
  WorkforceSummary,
  ReportCode,
} from '@/types/dart';

// ==================== 유틸리티 함수 ====================

/**
 * 문자열을 숫자로 파싱 (콤마 제거)
 */
function parseNumber(str?: string): number {
  if (!str || str === '-' || str.trim() === '') return 0;
  const cleaned = str.replace(/,/g, '').trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * 원 단위를 억 단위로 변환
 */
function toHundredMillion(value: number): number {
  return Math.round(value / 100000000);
}

// ==================== 기업 검색 ====================

/**
 * 기업 검색
 */
export async function searchCompany(keyword: string): Promise<DartCompany[]> {
  if (!keyword || keyword.trim().length === 0) {
    return [];
  }
  return searchCompanies(keyword.trim());
}

// ==================== 기업 정보 조회 ====================

/**
 * 기업 개황 조회
 */
export async function getCompanyOverview(corpCode: string): Promise<DartCompanyInfo | null> {
  return getCompanyInfo(corpCode);
}

/**
 * 기업 종합 정보 조회
 */
export async function getFullCompanyData(
  corpCode: string,
  disclosureCount: number = 10
): Promise<CompanyFullInfo> {
  const currentYear = new Date().getFullYear();
  const lastYear = String(currentYear - 1);
  const twoYearsAgo = String(currentYear - 2);
  const annualReportCode: ReportCode = '11011';

  // 기업 개황
  const companyInfo = await getCompanyInfo(corpCode);

  // 연간 재무제표 조회 (전년도 → 2년전 순으로 시도)
  let financials = await getFinancialStatements(corpCode, lastYear, annualReportCode);
  let annualYear = lastYear;

  if (!hasValidFinancialData(financials)) {
    financials = await getFinancialStatements(corpCode, twoYearsAgo, annualReportCode);
    annualYear = twoYearsAgo;
  }

  // 최신 분기 재무제표 조회
  const quarterlyReportCodes: ReportCode[] = ['11014', '11012', '11013'];
  let latestFinancials: DartFinancialItem[] | undefined;
  let latestYear = String(currentYear);
  let latestReportCode: ReportCode | undefined;

  // 올해 분기 보고서 시도
  for (const reportCode of quarterlyReportCodes) {
    const tempFinancials = await getFinancialStatements(corpCode, latestYear, reportCode);
    if (hasValidFinancialData(tempFinancials)) {
      latestFinancials = tempFinancials;
      latestReportCode = reportCode;
      break;
    }
  }

  // 올해 분기 없으면 전년도 분기 시도
  if (!latestFinancials) {
    for (const reportCode of quarterlyReportCodes) {
      const tempFinancials = await getFinancialStatements(corpCode, lastYear, reportCode);
      if (hasValidFinancialData(tempFinancials)) {
        latestFinancials = tempFinancials;
        latestYear = lastYear;
        latestReportCode = reportCode;
        break;
      }
    }
  }

  // 분기 데이터가 없으면 연간 데이터 사용
  if (!latestFinancials) {
    latestFinancials = financials;
    latestYear = annualYear;
    latestReportCode = annualReportCode;
  }

  // 병렬로 나머지 데이터 조회
  const [shareholders, executives, employees, dividends, disclosures] = await Promise.all([
    getMajorShareholders(corpCode, annualYear, annualReportCode),
    getExecutives(corpCode, annualYear, annualReportCode),
    getEmployees(corpCode, annualYear, annualReportCode),
    getDividends(corpCode, annualYear, annualReportCode),
    disclosureCount > 0 ? getRecentDisclosures(corpCode, disclosureCount) : Promise.resolve([]),
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

/**
 * 재무제표 유효성 검사
 */
function hasValidFinancialData(financials: DartFinancialItem[]): boolean {
  if (!financials || financials.length === 0) return false;

  const coreAccounts = new Set([
    '매출액', '수익(매출액)', '영업수익', '순매출액',
    '당기순이익', '당기순이익(손실)',
    '분기순이익', '분기순이익(손실)',
    '반기순이익', '반기순이익(손실)',
    '영업이익', '영업이익(손실)',
    '자산총계', '자본총계',
  ]);

  for (const item of financials) {
    if (coreAccounts.has(item.accountNm || '')) {
      const amount = item.thstrmAmount;
      if (amount && amount !== '-' && amount.trim() !== '') {
        return true;
      }
    }
  }
  return false;
}

/**
 * 재무제표에서 특정 계정 찾기
 */
function findAccount(
  financials: DartFinancialItem[],
  accountNames: string[]
): DartFinancialItem | undefined {
  for (const name of accountNames) {
    const item = financials.find(f => f.accountNm === name);
    if (item) return item;
  }
  return undefined;
}

/**
 * 재무 요약 데이터 추출
 */
export function extractFinancialSummary(
  financials: DartFinancialItem[],
  year: number
): FinancialSummary {
  // 매출액
  const revenueItem = findAccount(financials, [
    '매출액', '수익(매출액)', '영업수익', '순매출액'
  ]);

  // 영업이익
  const opProfitItem = findAccount(financials, [
    '영업이익', '영업이익(손실)'
  ]);

  // 당기순이익
  const netIncomeItem = findAccount(financials, [
    '당기순이익', '당기순이익(손실)',
    '분기순이익', '분기순이익(손실)',
    '반기순이익', '반기순이익(손실)'
  ]);

  // 자산총계
  const totalAssetsItem = findAccount(financials, ['자산총계']);

  // 부채총계
  const totalLiabilitiesItem = findAccount(financials, ['부채총계']);

  // 자본총계
  const totalEquityItem = findAccount(financials, ['자본총계']);

  const revenue = parseNumber(revenueItem?.thstrmAmount);
  const operatingProfit = parseNumber(opProfitItem?.thstrmAmount);
  const netIncome = parseNumber(netIncomeItem?.thstrmAmount);
  const totalAssets = parseNumber(totalAssetsItem?.thstrmAmount);
  const totalLiabilities = parseNumber(totalLiabilitiesItem?.thstrmAmount);
  const totalEquity = parseNumber(totalEquityItem?.thstrmAmount);

  // 지표 계산
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

/**
 * 다년도 재무 요약 조회
 */
export async function getMultiYearFinancialSummary(
  corpCode: string,
  years: number = 5
): Promise<FinancialSummary[]> {
  const currentYear = new Date().getFullYear();
  const summaries: FinancialSummary[] = [];

  for (let i = 1; i <= years; i++) {
    const year = currentYear - i;
    const financials = await getFinancialStatements(corpCode, String(year), '11011');

    if (hasValidFinancialData(financials)) {
      summaries.push(extractFinancialSummary(financials, year));
    }
  }

  return summaries.sort((a, b) => a.year - b.year);
}

// ==================== 인력 데이터 가공 ====================

/**
 * 인력 요약 데이터 추출
 */
export function extractWorkforceSummary(
  employees: DartEmployee[],
  year: number
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

    if (emp.sexdstn === '남') {
      maleCount += total;
    } else if (emp.sexdstn === '여') {
      femaleCount += total;
    }

    regularCount += parseNumber(emp.rgllbrCo);
    contractCount += parseNumber(emp.cnttkCo);

    const tenure = parseFloat(emp.avrgCnwkSdytrn || '0');
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
    averageTenure: tenureCount > 0 ? Math.round(tenureSum / tenureCount * 10) / 10 : undefined,
    averageSalary: salaryCount > 0 ? Math.round(salarySum / salaryCount / 10000) : undefined, // 만원 단위
  };
}

// ==================== 공시 데이터 ====================

/**
 * 공시 목록 조회
 */
export async function getCompanyDisclosures(
  corpCode: string,
  options?: {
    beginDate?: string;
    endDate?: string;
    pageNo?: number;
    pageCount?: number;
  }
): Promise<DisclosureListResult> {
  return getDisclosures(corpCode, options);
}

// ==================== 내보내기 ====================

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

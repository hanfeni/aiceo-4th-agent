/**
 * DART 재무 지표 계산기
 * Agent 4 전용
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
  IndicatorDefinition,
} from '@/types/dart';

// ==================== 지표 분류 ====================

/** 비율 기반 지표 */
const RATIO_INDICATORS = new Set([
  'debtRatio', 'roe', 'grossProfitMargin', 'operatingProfitMargin', 'netProfitMargin', 'roa',
  'currentRatio', 'quickRatio', 'interestCoverage', 'debtDependency', 'netDebtRatio',
  'revenueGrowth', 'operatingIncomeGrowth', 'netIncomeGrowth', 'assetGrowth', 'equityGrowth',
  'assetTurnover', 'receivablesTurnover', 'inventoryTurnover', 'payablesTurnover', 'tangibleAssetTurnover',
  'cashRatio',
]);

/** 성장률 지표 */
const GROWTH_INDICATORS = new Set([
  'revenueGrowth', 'operatingIncomeGrowth', 'netIncomeGrowth', 'assetGrowth', 'equityGrowth',
]);

/** 효율성(회전율) 지표 */
const EFFICIENCY_INDICATORS = new Set([
  'assetTurnover', 'receivablesTurnover', 'inventoryTurnover', 'payablesTurnover', 'tangibleAssetTurnover',
]);

/** 금액 기반 지표 (4Q일 때 연간-3분기누적 필요) */
const AMOUNT_INDICATORS = new Set([
  'revenue', 'operatingIncome', 'netIncome', 'totalAssets',
  'operatingCF', 'investingCF', 'financingCF', 'fcf',
  'eps', // 주당순이익
]);

// ==================== 지표 정의 ====================

/** 모든 지표 정의 */
export const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  // 핵심 (오리지널: 매출액, 영업이익, 당기순이익, 부채비율, ROE)
  { key: 'revenue', name: '매출액', group: 'core', unit: '원', formula: '매출액' },
  { key: 'operatingIncome', name: '영업이익', group: 'core', unit: '원', formula: '영업이익' },
  { key: 'netIncome', name: '당기순이익', group: 'core', unit: '원', formula: '당기순이익' },
  { key: 'debtRatio', name: '부채비율', group: 'core', unit: '%', formula: '부채총계 / 자본총계 × 100' },
  { key: 'roe', name: 'ROE', group: 'core', unit: '%', formula: '당기순이익 / 자본총계 × 100' },

  // 수익성
  { key: 'grossProfitMargin', name: '매출총이익률', group: 'profitability', unit: '%', formula: '매출총이익 / 매출액 × 100' },
  { key: 'operatingProfitMargin', name: '영업이익률', group: 'profitability', unit: '%', formula: '영업이익 / 매출액 × 100' },
  { key: 'netProfitMargin', name: '순이익률', group: 'profitability', unit: '%', formula: '당기순이익 / 매출액 × 100' },
  { key: 'roa', name: 'ROA', group: 'profitability', unit: '%', formula: '당기순이익 / 자산총계 × 100' },
  { key: 'eps', name: 'EPS', group: 'profitability', unit: '원', formula: '주당순이익' },

  // 안정성
  { key: 'currentRatio', name: '유동비율', group: 'stability', unit: '%', formula: '유동자산 / 유동부채 × 100' },
  { key: 'quickRatio', name: '당좌비율', group: 'stability', unit: '%', formula: '(유동자산-재고자산) / 유동부채 × 100' },
  { key: 'interestCoverage', name: '이자보상배율', group: 'stability', unit: '배', formula: '영업이익 / 금융비용' },
  { key: 'debtDependency', name: '차입금의존도', group: 'stability', unit: '%', formula: '총차입금 / 자산총계 × 100' },
  { key: 'netDebtRatio', name: '순차입금비율', group: 'stability', unit: '%', formula: '(총차입금-현금) / 자본총계 × 100' },

  // 성장성
  { key: 'revenueGrowth', name: '매출성장률', group: 'growth', unit: '%', formula: '(당기-전기) / |전기| × 100' },
  { key: 'operatingIncomeGrowth', name: '영업이익성장률', group: 'growth', unit: '%', formula: '(당기-전기) / |전기| × 100' },
  { key: 'netIncomeGrowth', name: '순이익성장률', group: 'growth', unit: '%', formula: '(당기-전기) / |전기| × 100' },
  { key: 'assetGrowth', name: '자산성장률', group: 'growth', unit: '%', formula: '(당기-전기) / |전기| × 100' },
  { key: 'equityGrowth', name: '자본성장률', group: 'growth', unit: '%', formula: '(당기-전기) / |전기| × 100' },

  // 효율성
  { key: 'assetTurnover', name: '총자산회전율', group: 'efficiency', unit: '회', formula: '매출액 / 자산총계' },
  { key: 'receivablesTurnover', name: '매출채권회전율', group: 'efficiency', unit: '회', formula: '매출액 / 매출채권' },
  { key: 'inventoryTurnover', name: '재고자산회전율', group: 'efficiency', unit: '회', formula: '매출원가 / 재고자산' },
  { key: 'payablesTurnover', name: '매입채무회전율', group: 'efficiency', unit: '회', formula: '매출원가 / 매입채무' },
  { key: 'tangibleAssetTurnover', name: '유형자산회전율', group: 'efficiency', unit: '회', formula: '매출액 / 유형자산' },

  // 현금흐름
  { key: 'operatingCF', name: '영업활동CF', group: 'cashflow', unit: '원', formula: '영업활동현금흐름' },
  { key: 'investingCF', name: '투자활동CF', group: 'cashflow', unit: '원', formula: '투자활동현금흐름' },
  { key: 'financingCF', name: '재무활동CF', group: 'cashflow', unit: '원', formula: '재무활동현금흐름' },
  { key: 'fcf', name: '잉여현금흐름', group: 'cashflow', unit: '원', formula: '영업CF + 투자CF' },
  { key: 'cashRatio', name: '현금보유비율', group: 'cashflow', unit: '%', formula: '현금 / 자산총계 × 100' },

  // 인력 (workforce) - dataSource: workforce
  { key: 'revenuePerEmployee', name: '1인당 매출액', group: 'workforce', unit: '원', formula: '매출액 / 직원수' },
  { key: 'avgSalary', name: '평균 급여', group: 'workforce', unit: '원', formula: '연간급여총액 / 직원수' },
  { key: 'regularRatio', name: '정규직 비율', group: 'workforce', unit: '%', formula: '정규직 / 전체직원 × 100' },
  { key: 'avgTenure', name: '평균 근속연수', group: 'workforce', unit: '년', formula: '평균근속월수 / 12' },
  { key: 'genderRatio', name: '남성 비율', group: 'workforce', unit: '%', formula: '남성직원 / 전체직원 × 100' },

  // 지배구조 (governance) - dataSource: governance
  { key: 'largestShareholderRatio', name: '최대주주 지분율', group: 'governance', unit: '%', formula: '최대주주 보유주식 / 발행주식총수 × 100' },
  { key: 'relatedPartyRatio', name: '특수관계인 합산', group: 'governance', unit: '%', formula: '특수관계인 보유주식 합계 / 발행주식총수 × 100' },
  { key: 'executiveCount', name: '임원 수', group: 'governance', unit: '명', formula: '등기임원 수' },
  { key: 'outsideDirectorRatio', name: '사외이사 비율', group: 'governance', unit: '%', formula: '사외이사 / 전체이사 × 100' },
  { key: 'femaleExecutiveRatio', name: '여성임원 비율', group: 'governance', unit: '%', formula: '여성임원 / 전체임원 × 100' },

  // 배당 (dividend) - dataSource: dividend
  { key: 'dps', name: '주당배당금', group: 'dividend', unit: '원', formula: '주당 현금배당금' },
  { key: 'payoutRatio', name: '배당성향', group: 'dividend', unit: '%', formula: '배당금총액 / 당기순이익 × 100' },
  { key: 'dividendYield', name: '시가배당율', group: 'dividend', unit: '%', formula: '주당배당금 / 주가 × 100' },
  { key: 'totalDividend', name: '현금배당총액', group: 'dividend', unit: '원', formula: '현금배당금 총액' },
];

// ==================== 계정과목 매핑 ====================

/** 계정과목 이름 매핑 (DART API 계정과목명 기준) */
const ACCOUNT_NAMES: Record<string, string[]> = {
  // 손익계산서 항목
  revenue: [
    '수익(매출액)', '매출액', '영업수익', '매출',
    '영업이익', // 일부 기업은 영업이익이 매출처럼 표기
    '매출액(수익)', '수익', '순매출액', '순영업수익',
    '매출 및 기타영업수익', '영업수익(매출액)',
  ],
  operatingIncome: [
    '영업이익', '영업이익(손실)', '영업손익',
    '영업이익(영업손실)', '영업손실', '계속영업이익',
  ],
  netIncome: [
    '당기순이익', '당기순이익(손실)', '당기순손익',
    '분기순이익', '분기순이익(손실)', '분기순손익',
    '반기순이익', '반기순이익(손실)', '반기순손익',
    '총포괄손익', '당기총포괄이익', '당기총포괄손익',
    '지배기업 소유주지분', '지배기업의 소유주에게 귀속되는 당기순이익',
  ],
  grossProfit: [
    '매출총이익', '매출총이익(손실)', '매출총손익',
    '영업총이익', '영업총손익',
  ],
  costOfSales: [
    '매출원가', '영업비용', '매출비용',
    '영업원가', '원가',
  ],

  // 재무상태표 항목
  totalAssets: [
    '자산총계', '자산 총계', '총자산',
    '자산합계', '자산의 총계',
  ],
  totalEquity: [
    '자본총계', '자본 총계', '총자본',
    '자본합계', '자본의 총계',
    '지배기업 소유주지분', '지배기업의 소유주에게 귀속되는 자본',
  ],
  totalLiabilities: [
    '부채총계', '부채 총계', '총부채',
    '부채합계', '부채의 총계',
  ],
  currentAssets: [
    '유동자산', '유동자산 합계', '유동자산합계',
  ],
  currentLiabilities: [
    '유동부채', '유동부채 합계', '유동부채합계',
  ],
  inventory: [
    '재고자산', '재고자산(순액)', '순재고자산',
    '상품및제품', '재공품', '원재료',
  ],
  cash: [
    '현금및현금성자산', '현금 및 현금성자산',
    '현금및예금', '현금', '현금성자산',
    '현금및현금등가물',
  ],
  receivables: [
    '매출채권', '매출채권및기타채권',
    '매출채권 및 기타채권', '매출채권(순액)',
    '단기매출채권', '외상매출금',
  ],
  payables: [
    '매입채무', '매입채무및기타채무',
    '매입채무 및 기타채무',
    '단기매입채무', '외상매입금',
  ],
  tangibleAssets: [
    '유형자산', '유형자산(순액)', '순유형자산',
    '토지,건물및장비', '토지,건물 및 장비',
  ],

  // 차입금
  shortTermBorrowings: [
    '단기차입금', '단기금융부채', '단기사채',
    '유동성장기부채', '단기금융차입금',
  ],
  longTermBorrowings: [
    '장기차입금', '장기금융부채', '비유동금융부채',
    '장기금융차입금', '비유동차입금',
  ],
  bonds: [
    '사채', '전환사채', '신주인수권부사채',
    '교환사채', '회사채',
  ],

  // 기타
  financeCost: [
    '금융비용', '금융원가', '이자비용',
    '지급이자', '금융비용(손)', '이자비용(금융비용)',
  ],

  // 현금흐름표
  operatingCF: [
    '영업활동현금흐름', '영업활동으로인한현금흐름',
    '영업활동 현금흐름', '영업활동으로 인한 현금흐름',
    '영업활동순현금흐름',
  ],
  investingCF: [
    '투자활동현금흐름', '투자활동으로인한현금흐름',
    '투자활동 현금흐름', '투자활동으로 인한 현금흐름',
    '투자활동순현금흐름',
  ],
  financingCF: [
    '재무활동현금흐름', '재무활동으로인한현금흐름',
    '재무활동 현금흐름', '재무활동으로 인한 현금흐름',
    '재무활동순현금흐름',
  ],

  // EPS
  eps: [
    '기본주당이익', '기본주당순이익', '주당순이익',
    '주당이익', '기본주당이익(손실)',
  ],
};

// ==================== 금액 추출 함수 ====================

/**
 * 통화 단위를 고려한 금액 변환
 */
function convertToWon(amount: string | undefined, currency: string | undefined): number | null {
  if (!amount) return null;

  const cleanAmount = amount.replace(/,/g, '').trim();
  const value = parseFloat(cleanAmount);
  if (isNaN(value)) return null;

  // 백만원 단위 → 원
  if (currency === '백만원' || currency === '천원') {
    return currency === '백만원' ? value * 1000000 : value * 1000;
  }
  return value;
}

/**
 * 계정과목명 매칭 (부분 매칭 포함)
 */
function matchAccountName(accountNm: string | undefined, targetNames: string[]): boolean {
  if (!accountNm) return false;
  const normalized = accountNm.trim();

  for (const target of targetNames) {
    // 정확한 매칭
    if (normalized === target) return true;
    // 시작 부분 매칭 (예: "자산총계" 가 "자산총계(순액)" 와 매칭)
    if (normalized.startsWith(target)) return true;
    // 포함 매칭 (예: "연결재무상태표상의 자산총계" 와 "자산총계" 매칭)
    if (normalized.includes(target)) return true;
  }
  return false;
}

/**
 * 재무제표에서 특정 계정과목의 당기금액 추출
 */
export function extractAmount(financials: DartFinancialItem[], ...accountNames: string[]): number | null {
  // 1차: 정확한 매칭 시도
  for (const accountName of accountNames) {
    const item = financials.find(f => f.accountNm === accountName);
    if (item?.thstrmAmount) {
      const value = convertToWon(item.thstrmAmount, item.currency);
      if (value !== null) return value;
    }
  }

  // 2차: 부분 매칭 시도
  const item = financials.find(f => matchAccountName(f.accountNm, accountNames));
  if (item?.thstrmAmount) {
    const value = convertToWon(item.thstrmAmount, item.currency);
    if (value !== null) return value;
  }

  return null;
}

/**
 * 재무제표에서 특정 계정과목의 전기금액 추출
 */
export function extractPrevAmount(financials: DartFinancialItem[], ...accountNames: string[]): number | null {
  // 1차: 정확한 매칭 시도
  for (const accountName of accountNames) {
    const item = financials.find(f => f.accountNm === accountName);
    if (item?.frmtrmAmount) {
      const value = convertToWon(item.frmtrmAmount, item.currency);
      if (value !== null) return value;
    }
  }

  // 2차: 부분 매칭 시도
  const item = financials.find(f => matchAccountName(f.accountNm, accountNames));
  if (item?.frmtrmAmount) {
    const value = convertToWon(item.frmtrmAmount, item.currency);
    if (value !== null) return value;
  }

  return null;
}

/**
 * 재무제표에서 특정 계정과목의 누적금액 추출
 */
export function extractAddAmount(financials: DartFinancialItem[], ...accountNames: string[]): number | null {
  // 1차: 정확한 매칭 시도
  for (const accountName of accountNames) {
    const item = financials.find(f => f.accountNm === accountName);
    if (item?.thstrmAddAmount) {
      const value = convertToWon(item.thstrmAddAmount, item.currency);
      if (value !== null) return value;
    }
  }

  // 2차: 부분 매칭 시도
  const item = financials.find(f => matchAccountName(f.accountNm, accountNames));
  if (item?.thstrmAddAmount) {
    const value = convertToWon(item.thstrmAddAmount, item.currency);
    if (value !== null) return value;
  }

  return null;
}

/**
 * 계정 키로 금액 추출
 */
function extractByKey(financials: DartFinancialItem[], key: string): number | null {
  const names = ACCOUNT_NAMES[key];
  if (!names) return null;
  return extractAmount(financials, ...names);
}

/**
 * 계정 키로 전기 금액 추출
 */
function extractPrevByKey(financials: DartFinancialItem[], key: string): number | null {
  const names = ACCOUNT_NAMES[key];
  if (!names) return null;
  return extractPrevAmount(financials, ...names);
}

// ==================== 지표 계산 ====================

/**
 * 비율 지표 계산
 * @param financials - 현재 기간 재무제표
 * @param indicator - 지표 키
 * @param prevYearFinancials - 전년 동기 재무제표 (성장률 지표용, 선택적)
 */
export function calculateRatioIndicator(
  financials: DartFinancialItem[],
  indicator: string,
  prevYearFinancials?: DartFinancialItem[]
): number | null {
  const revenue = extractByKey(financials, 'revenue');
  const operatingIncome = extractByKey(financials, 'operatingIncome');
  const netIncome = extractByKey(financials, 'netIncome');
  const totalAssets = extractByKey(financials, 'totalAssets');
  const totalEquity = extractByKey(financials, 'totalEquity');
  const totalLiabilities = extractByKey(financials, 'totalLiabilities');
  const grossProfit = extractByKey(financials, 'grossProfit');
  const currentAssets = extractByKey(financials, 'currentAssets');
  const currentLiabilities = extractByKey(financials, 'currentLiabilities');
  const inventory = extractByKey(financials, 'inventory');
  const financeCost = extractByKey(financials, 'financeCost');
  const shortTermBorrowings = extractByKey(financials, 'shortTermBorrowings');
  const longTermBorrowings = extractByKey(financials, 'longTermBorrowings');
  const bonds = extractByKey(financials, 'bonds');
  const cash = extractByKey(financials, 'cash');
  const receivables = extractByKey(financials, 'receivables');
  const costOfSales = extractByKey(financials, 'costOfSales');
  const payables = extractByKey(financials, 'payables');
  const tangibleAssets = extractByKey(financials, 'tangibleAssets');

  const totalBorrowings = (shortTermBorrowings ?? 0) + (longTermBorrowings ?? 0) + (bonds ?? 0);

  switch (indicator) {
    // 핵심
    case 'debtRatio':
      if (totalLiabilities !== null && totalEquity !== null && totalEquity !== 0) {
        return (totalLiabilities / totalEquity) * 100;
      }
      break;
    case 'roe':
      if (netIncome !== null && totalEquity !== null && totalEquity !== 0) {
        return (netIncome / totalEquity) * 100;
      }
      break;

    // 수익성
    case 'grossProfitMargin':
      if (grossProfit !== null && revenue !== null && revenue !== 0) {
        return (grossProfit / revenue) * 100;
      }
      break;
    case 'operatingProfitMargin':
      if (operatingIncome !== null && revenue !== null && revenue !== 0) {
        return (operatingIncome / revenue) * 100;
      }
      break;
    case 'netProfitMargin':
      if (netIncome !== null && revenue !== null && revenue !== 0) {
        return (netIncome / revenue) * 100;
      }
      break;
    case 'roa':
      if (netIncome !== null && totalAssets !== null && totalAssets !== 0) {
        return (netIncome / totalAssets) * 100;
      }
      break;

    // 안정성
    case 'currentRatio':
      if (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0) {
        return (currentAssets / currentLiabilities) * 100;
      }
      break;
    case 'quickRatio':
      if (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0) {
        const quickAssets = currentAssets - (inventory ?? 0);
        return (quickAssets / currentLiabilities) * 100;
      }
      break;
    case 'interestCoverage':
      if (operatingIncome !== null && financeCost !== null && financeCost !== 0) {
        return operatingIncome / financeCost;
      }
      break;
    case 'debtDependency':
      if (totalAssets !== null && totalAssets !== 0) {
        return (totalBorrowings / totalAssets) * 100;
      }
      break;
    case 'netDebtRatio':
      if (totalEquity !== null && totalEquity !== 0) {
        const netDebt = totalBorrowings - (cash ?? 0);
        return (netDebt / totalEquity) * 100;
      }
      break;
    case 'cashRatio':
      if (cash !== null && totalAssets !== null && totalAssets !== 0) {
        return (cash / totalAssets) * 100;
      }
      break;

    // 효율성
    case 'assetTurnover':
      if (revenue !== null && totalAssets !== null && totalAssets !== 0) {
        return revenue / totalAssets;
      }
      break;
    case 'receivablesTurnover':
      if (revenue !== null && receivables !== null && receivables !== 0) {
        return revenue / receivables;
      }
      break;
    case 'inventoryTurnover':
      if (costOfSales !== null && inventory !== null && inventory !== 0) {
        return costOfSales / inventory;
      }
      break;
    case 'payablesTurnover':
      if (costOfSales !== null && payables !== null && payables !== 0) {
        return costOfSales / payables;
      }
      break;
    case 'tangibleAssetTurnover':
      if (revenue !== null && tangibleAssets !== null && tangibleAssets !== 0) {
        return revenue / tangibleAssets;
      }
      break;

    // 성장률 - prevYearFinancials 우선, 없으면 frmtrmAmount fallback
    case 'revenueGrowth': {
      // 전년 동기 데이터 우선 사용
      let revenuePrev = prevYearFinancials ? extractByKey(prevYearFinancials, 'revenue') : null;
      // fallback: frmtrmAmount
      if (revenuePrev === null) {
        revenuePrev = extractPrevByKey(financials, 'revenue');
      }
      if (revenue !== null && revenuePrev !== null && revenuePrev !== 0) {
        return ((revenue - revenuePrev) / Math.abs(revenuePrev)) * 100;
      }
      break;
    }
    case 'operatingIncomeGrowth': {
      let opIncomePrev = prevYearFinancials ? extractByKey(prevYearFinancials, 'operatingIncome') : null;
      if (opIncomePrev === null) {
        opIncomePrev = extractPrevByKey(financials, 'operatingIncome');
      }
      if (operatingIncome !== null && opIncomePrev !== null && opIncomePrev !== 0) {
        return ((operatingIncome - opIncomePrev) / Math.abs(opIncomePrev)) * 100;
      }
      break;
    }
    case 'netIncomeGrowth': {
      let netIncomePrev = prevYearFinancials ? extractByKey(prevYearFinancials, 'netIncome') : null;
      if (netIncomePrev === null) {
        netIncomePrev = extractPrevByKey(financials, 'netIncome');
      }
      if (netIncome !== null && netIncomePrev !== null && netIncomePrev !== 0) {
        return ((netIncome - netIncomePrev) / Math.abs(netIncomePrev)) * 100;
      }
      break;
    }
    case 'assetGrowth': {
      let assetsPrev = prevYearFinancials ? extractByKey(prevYearFinancials, 'totalAssets') : null;
      if (assetsPrev === null) {
        assetsPrev = extractPrevByKey(financials, 'totalAssets');
      }
      if (totalAssets !== null && assetsPrev !== null && assetsPrev !== 0) {
        return ((totalAssets - assetsPrev) / Math.abs(assetsPrev)) * 100;
      }
      break;
    }
    case 'equityGrowth': {
      let equityPrev = prevYearFinancials ? extractByKey(prevYearFinancials, 'totalEquity') : null;
      if (equityPrev === null) {
        equityPrev = extractPrevByKey(financials, 'totalEquity');
      }
      if (totalEquity !== null && equityPrev !== null && equityPrev !== 0) {
        return ((totalEquity - equityPrev) / Math.abs(equityPrev)) * 100;
      }
      break;
    }
  }
  return null;
}

/**
 * 금액 지표 추출
 */
export function extractIndicatorAmount(
  financials: DartFinancialItem[],
  indicator: string
): number | null {
  switch (indicator) {
    case 'revenue':
      return extractByKey(financials, 'revenue');
    case 'operatingIncome':
      return extractByKey(financials, 'operatingIncome');
    case 'netIncome':
      return extractByKey(financials, 'netIncome');
    case 'eps':
      return extractByKey(financials, 'eps');
    case 'operatingCF':
      return extractByKey(financials, 'operatingCF');
    case 'investingCF':
      return extractByKey(financials, 'investingCF');
    case 'financingCF':
      return extractByKey(financials, 'financingCF');
    case 'fcf': {
      const opCF = extractByKey(financials, 'operatingCF');
      const invCF = extractByKey(financials, 'investingCF');
      if (opCF !== null && invCF !== null) {
        return opCF + invCF;
      }
      return null;
    }
    case 'totalAssets':
      return extractByKey(financials, 'totalAssets');
    default:
      return null;
  }
}

/**
 * 전기 금액 지표 추출
 */
export function extractPrevIndicatorAmount(
  financials: DartFinancialItem[],
  indicator: string
): number | null {
  switch (indicator) {
    case 'revenue':
      return extractPrevByKey(financials, 'revenue');
    case 'operatingIncome':
      return extractPrevByKey(financials, 'operatingIncome');
    case 'netIncome':
      return extractPrevByKey(financials, 'netIncome');
    case 'eps':
      return extractPrevByKey(financials, 'eps');
    case 'operatingCF':
      return extractPrevByKey(financials, 'operatingCF');
    case 'investingCF':
      return extractPrevByKey(financials, 'investingCF');
    case 'financingCF':
      return extractPrevByKey(financials, 'financingCF');
    case 'fcf': {
      const opCF = extractPrevByKey(financials, 'operatingCF');
      const invCF = extractPrevByKey(financials, 'investingCF');
      if (opCF !== null && invCF !== null) {
        return opCF + invCF;
      }
      return null;
    }
    case 'totalAssets':
      return extractPrevByKey(financials, 'totalAssets');
    default:
      return null;
  }
}

/**
 * 전기 비율 지표 계산
 */
export function calculatePrevRatioIndicator(
  financials: DartFinancialItem[],
  indicator: string
): number | null {
  const revenuePrev = extractPrevByKey(financials, 'revenue');
  const operatingIncomePrev = extractPrevByKey(financials, 'operatingIncome');
  const netIncomePrev = extractPrevByKey(financials, 'netIncome');
  const totalAssetsPrev = extractPrevByKey(financials, 'totalAssets');
  const totalEquityPrev = extractPrevByKey(financials, 'totalEquity');
  const totalLiabilitiesPrev = extractPrevByKey(financials, 'totalLiabilities');
  const grossProfitPrev = extractPrevByKey(financials, 'grossProfit');
  const currentAssetsPrev = extractPrevByKey(financials, 'currentAssets');
  const currentLiabilitiesPrev = extractPrevByKey(financials, 'currentLiabilities');
  const inventoryPrev = extractPrevByKey(financials, 'inventory');
  const cashPrev = extractPrevByKey(financials, 'cash');
  const shortTermBorrowingsPrev = extractPrevByKey(financials, 'shortTermBorrowings');
  const longTermBorrowingsPrev = extractPrevByKey(financials, 'longTermBorrowings');
  const bondsPrev = extractPrevByKey(financials, 'bonds');

  const totalBorrowingsPrev = (shortTermBorrowingsPrev ?? 0) + (longTermBorrowingsPrev ?? 0) + (bondsPrev ?? 0);

  switch (indicator) {
    case 'debtRatio':
      if (totalLiabilitiesPrev !== null && totalEquityPrev !== null && totalEquityPrev !== 0) {
        return (totalLiabilitiesPrev / totalEquityPrev) * 100;
      }
      break;
    case 'roe':
      if (netIncomePrev !== null && totalEquityPrev !== null && totalEquityPrev !== 0) {
        return (netIncomePrev / totalEquityPrev) * 100;
      }
      break;
    case 'grossProfitMargin':
      if (grossProfitPrev !== null && revenuePrev !== null && revenuePrev !== 0) {
        return (grossProfitPrev / revenuePrev) * 100;
      }
      break;
    case 'operatingProfitMargin':
      if (operatingIncomePrev !== null && revenuePrev !== null && revenuePrev !== 0) {
        return (operatingIncomePrev / revenuePrev) * 100;
      }
      break;
    case 'netProfitMargin':
      if (netIncomePrev !== null && revenuePrev !== null && revenuePrev !== 0) {
        return (netIncomePrev / revenuePrev) * 100;
      }
      break;
    case 'roa':
      if (netIncomePrev !== null && totalAssetsPrev !== null && totalAssetsPrev !== 0) {
        return (netIncomePrev / totalAssetsPrev) * 100;
      }
      break;
    case 'currentRatio':
      if (currentAssetsPrev !== null && currentLiabilitiesPrev !== null && currentLiabilitiesPrev !== 0) {
        return (currentAssetsPrev / currentLiabilitiesPrev) * 100;
      }
      break;
    case 'quickRatio':
      if (currentAssetsPrev !== null && currentLiabilitiesPrev !== null && currentLiabilitiesPrev !== 0) {
        const quickAssets = currentAssetsPrev - (inventoryPrev ?? 0);
        return (quickAssets / currentLiabilitiesPrev) * 100;
      }
      break;
    case 'debtDependency':
      if (totalAssetsPrev !== null && totalAssetsPrev !== 0) {
        return (totalBorrowingsPrev / totalAssetsPrev) * 100;
      }
      break;
    case 'netDebtRatio':
      if (totalEquityPrev !== null && totalEquityPrev !== 0) {
        const netDebt = totalBorrowingsPrev - (cashPrev ?? 0);
        return (netDebt / totalEquityPrev) * 100;
      }
      break;
    case 'cashRatio':
      if (cashPrev !== null && totalAssetsPrev !== null && totalAssetsPrev !== 0) {
        return (cashPrev / totalAssetsPrev) * 100;
      }
      break;
  }
  return null;
}

/**
 * 효율성 지표의 분기별 계산 (연환산 적용)
 */
export function calculateEfficiencyIndicatorForQuarter(
  financials: DartFinancialItem[],
  indicator: string,
  quarterIndex: number // 0=Q1, 1=Q2, 2=Q3, 3=Q4
): number | null {
  // Q4는 일반 계산
  if (quarterIndex === 3) {
    return calculateRatioIndicator(financials, indicator);
  }

  const quartersElapsed = quarterIndex + 1;
  let annualizationFactor = 4.0 / quartersElapsed;

  // 누적 금액 시도, 없으면 단위 금액 사용
  let revenueCumul = extractAddAmount(financials, ...ACCOUNT_NAMES.revenue);
  let costOfSalesCumul = extractAddAmount(financials, ...ACCOUNT_NAMES.costOfSales);

  if (revenueCumul === null) {
    const revenueUnit = extractByKey(financials, 'revenue');
    if (revenueUnit !== null) {
      revenueCumul = revenueUnit;
      annualizationFactor = 4.0;
    }
  }
  if (costOfSalesCumul === null) {
    const costOfSalesUnit = extractByKey(financials, 'costOfSales');
    if (costOfSalesUnit !== null) {
      costOfSalesCumul = costOfSalesUnit;
    }
  }

  const totalAssets = extractByKey(financials, 'totalAssets');
  const receivables = extractByKey(financials, 'receivables');
  const inventory = extractByKey(financials, 'inventory');
  const payables = extractByKey(financials, 'payables');
  const tangibleAssets = extractByKey(financials, 'tangibleAssets');

  switch (indicator) {
    case 'assetTurnover':
      if (revenueCumul !== null && totalAssets !== null && totalAssets !== 0) {
        return (revenueCumul * annualizationFactor) / totalAssets;
      }
      break;
    case 'receivablesTurnover':
      if (revenueCumul !== null && receivables !== null && receivables !== 0) {
        return (revenueCumul * annualizationFactor) / receivables;
      }
      break;
    case 'inventoryTurnover':
      if (costOfSalesCumul !== null && inventory !== null && inventory !== 0) {
        return (costOfSalesCumul * annualizationFactor) / inventory;
      }
      break;
    case 'payablesTurnover':
      if (costOfSalesCumul !== null && payables !== null && payables !== 0) {
        return (costOfSalesCumul * annualizationFactor) / payables;
      }
      break;
    case 'tangibleAssetTurnover':
      if (revenueCumul !== null && tangibleAssets !== null && tangibleAssets !== 0) {
        return (revenueCumul * annualizationFactor) / tangibleAssets;
      }
      break;
  }
  return null;
}

/**
 * 4분기 단위 금액 계산 (연간 - 3분기누적)
 */
export function calculateQ4UnitAmount(
  annualFinancials: DartFinancialItem[],
  q3Financials: DartFinancialItem[],
  indicator: string
): number | null {
  if (!annualFinancials.length || !q3Financials.length) return null;

  const annualAmount = extractIndicatorAmount(annualFinancials, indicator);
  if (annualAmount === null) return null;

  const accountNames = getAmountIndicatorAccountNames(indicator);
  const q3CumulativeAmount = extractAddAmount(q3Financials, ...accountNames);

  if (q3CumulativeAmount === null) return null;

  return annualAmount - q3CumulativeAmount;
}

/**
 * 금액 지표의 계정과목명 반환
 */
function getAmountIndicatorAccountNames(indicator: string): string[] {
  switch (indicator) {
    case 'revenue':
      return ACCOUNT_NAMES.revenue;
    case 'operatingIncome':
      return ACCOUNT_NAMES.operatingIncome;
    case 'netIncome':
      return ACCOUNT_NAMES.netIncome;
    case 'operatingCF':
      return ACCOUNT_NAMES.operatingCF;
    case 'investingCF':
      return ACCOUNT_NAMES.investingCF;
    case 'financingCF':
      return ACCOUNT_NAMES.financingCF;
    case 'fcf':
      return ACCOUNT_NAMES.operatingCF; // FCF는 별도 계산 필요
    case 'totalAssets':
      return ACCOUNT_NAMES.totalAssets;
    default:
      return [];
  }
}

// ==================== 유틸리티 ====================

/**
 * 비율 기반 지표인지 확인
 */
export function isRatioBasedIndicator(indicator: string): boolean {
  return RATIO_INDICATORS.has(indicator);
}

/**
 * 성장률 지표인지 확인
 */
export function isGrowthIndicator(indicator: string): boolean {
  return GROWTH_INDICATORS.has(indicator);
}

/**
 * 효율성 지표인지 확인
 */
export function isEfficiencyIndicator(indicator: string): boolean {
  return EFFICIENCY_INDICATORS.has(indicator);
}

/**
 * 금액 기반 지표인지 확인
 */
export function isAmountIndicator(indicator: string): boolean {
  return AMOUNT_INDICATORS.has(indicator);
}

/**
 * 성장률 지표의 원천 계정과목명 반환
 */
export function getGrowthSourceAccountNames(indicator: string): string[] {
  switch (indicator) {
    case 'revenueGrowth':
      return ACCOUNT_NAMES.revenue;
    case 'operatingIncomeGrowth':
      return ACCOUNT_NAMES.operatingIncome;
    case 'netIncomeGrowth':
      return ACCOUNT_NAMES.netIncome;
    case 'assetGrowth':
      return ACCOUNT_NAMES.totalAssets;
    case 'equityGrowth':
      return ACCOUNT_NAMES.totalEquity;
    default:
      return [];
  }
}

// ==================== 종합 계산 ====================

/**
 * 모든 지표 계산
 * @param financials - 현재 기간 재무제표
 * @param corpCode - 기업 코드
 * @param year - 연도
 * @param reportCode - 보고서 코드
 * @param quarterIndex - 분기 인덱스 (0-3)
 * @param prevYearSamePeriodFinancials - 전년 동기 재무제표 (YoY 계산용)
 */
export function calculateAllIndicators(
  financials: DartFinancialItem[],
  corpCode: string,
  year: number,
  reportCode: string,
  quarterIndex?: number, // 0-3
  prevYearSamePeriodFinancials?: DartFinancialItem[] // 전년 동기 데이터
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

  // workforce/governance/dividend는 별도 API 데이터 필요 - 여기서는 스킵
  const skipGroups = new Set(['workforce', 'governance', 'dividend']);

  for (const def of INDICATOR_DEFINITIONS) {
    // 별도 데이터소스가 필요한 그룹은 스킵
    if (skipGroups.has(def.group)) {
      continue;
    }

    let value: number | null = null;

    if (AMOUNT_INDICATORS.has(def.key)) {
      value = extractIndicatorAmount(financials, def.key);
    } else if (EFFICIENCY_INDICATORS.has(def.key) && quarterIndex !== undefined && quarterIndex < 3) {
      value = calculateEfficiencyIndicatorForQuarter(financials, def.key, quarterIndex);
    } else if (RATIO_INDICATORS.has(def.key)) {
      // 성장률 지표는 전년 동기 데이터 전달
      const prevData = GROWTH_INDICATORS.has(def.key) ? prevYearSamePeriodFinancials : undefined;
      value = calculateRatioIndicator(financials, def.key, prevData);
    }

    // 소수점 처리
    if (value !== null) {
      if (def.unit === '%' || def.unit === '배' || def.unit === '회') {
        value = Math.round(value * 100) / 100;
      } else if (def.unit === '원') {
        value = Math.round(value);
      }
    }

    // 성장률 계산 (전기 대비 - QoQ/HoH)
    let growthRate: number | null = null;
    let yoyRate: number | null = null;

    if (value !== null) {
      // 금액 지표의 경우 전기 금액으로 성장률 계산
      if (AMOUNT_INDICATORS.has(def.key)) {
        const prevValue = extractPrevIndicatorAmount(financials, def.key);
        if (prevValue !== null && prevValue !== 0) {
          growthRate = ((value - prevValue) / Math.abs(prevValue)) * 100;
          growthRate = Math.round(growthRate * 100) / 100;
        }
      }
      // 비율 지표의 경우 전기 비율과의 차이(%p)로 계산
      else if (RATIO_INDICATORS.has(def.key) && !GROWTH_INDICATORS.has(def.key)) {
        const prevValue = calculatePrevRatioIndicator(financials, def.key);
        if (prevValue !== null) {
          growthRate = value - prevValue;
          growthRate = Math.round(growthRate * 100) / 100;
        }
      }

      // YoY 계산 (전년 동기 대비)
      // 연간 보고서(11011)의 경우 yoyRate = growthRate (전년 대비)
      if (reportCode === '11011') {
        yoyRate = growthRate;
      }
      // 분기/반기 보고서의 경우 전년 동기 데이터로 계산
      else if (prevYearSamePeriodFinancials && prevYearSamePeriodFinancials.length > 0) {
        if (AMOUNT_INDICATORS.has(def.key)) {
          const prevYearValue = extractIndicatorAmount(prevYearSamePeriodFinancials, def.key);
          if (prevYearValue !== null && prevYearValue !== 0) {
            yoyRate = ((value - prevYearValue) / Math.abs(prevYearValue)) * 100;
            yoyRate = Math.round(yoyRate * 100) / 100;
          }
        } else if (RATIO_INDICATORS.has(def.key) && !GROWTH_INDICATORS.has(def.key)) {
          const prevYearRatio = calculateRatioIndicator(prevYearSamePeriodFinancials, def.key);
          if (prevYearRatio !== null) {
            yoyRate = value - prevYearRatio;
            yoyRate = Math.round(yoyRate * 100) / 100;
          }
        }
      }
    }

    const indicator: CalculatedIndicator = {
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
      growthRate,
      yoyRate,
    };

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

/**
 * 특정 그룹의 지표만 계산
 * @param financials - 현재 기간 재무제표
 * @param group - 지표 그룹
 * @param quarterIndex - 분기 인덱스
 * @param reportCode - 보고서 코드
 * @param prevYearSamePeriodFinancials - 전년 동기 재무제표 (YoY 계산용)
 */
export function calculateGroupIndicators(
  financials: DartFinancialItem[],
  group: IndicatorGroup,
  quarterIndex?: number,
  reportCode?: string,
  prevYearSamePeriodFinancials?: DartFinancialItem[]
): CalculatedIndicator[] {
  const groupDefs = INDICATOR_DEFINITIONS.filter(d => d.group === group);
  const result: CalculatedIndicator[] = [];

  for (const def of groupDefs) {
    let value: number | null = null;

    if (AMOUNT_INDICATORS.has(def.key)) {
      value = extractIndicatorAmount(financials, def.key);
    } else if (EFFICIENCY_INDICATORS.has(def.key) && quarterIndex !== undefined && quarterIndex < 3) {
      value = calculateEfficiencyIndicatorForQuarter(financials, def.key, quarterIndex);
    } else if (RATIO_INDICATORS.has(def.key)) {
      // 성장률 지표는 전년 동기 데이터 전달
      const prevData = GROWTH_INDICATORS.has(def.key) ? prevYearSamePeriodFinancials : undefined;
      value = calculateRatioIndicator(financials, def.key, prevData);
    }

    if (value !== null) {
      if (def.unit === '%' || def.unit === '배' || def.unit === '회') {
        value = Math.round(value * 100) / 100;
      } else if (def.unit === '원') {
        value = Math.round(value);
      }
    }

    // 성장률 계산 (전기 대비 - QoQ/HoH)
    let growthRate: number | null = null;
    let yoyRate: number | null = null;

    if (value !== null) {
      if (AMOUNT_INDICATORS.has(def.key)) {
        const prevValue = extractPrevIndicatorAmount(financials, def.key);
        if (prevValue !== null && prevValue !== 0) {
          growthRate = ((value - prevValue) / Math.abs(prevValue)) * 100;
          growthRate = Math.round(growthRate * 100) / 100;
        }
      } else if (RATIO_INDICATORS.has(def.key) && !GROWTH_INDICATORS.has(def.key)) {
        const prevValue = calculatePrevRatioIndicator(financials, def.key);
        if (prevValue !== null) {
          growthRate = value - prevValue;
          growthRate = Math.round(growthRate * 100) / 100;
        }
      }

      // YoY 계산
      if (reportCode === '11011') {
        yoyRate = growthRate;
      } else if (prevYearSamePeriodFinancials && prevYearSamePeriodFinancials.length > 0) {
        if (AMOUNT_INDICATORS.has(def.key)) {
          const prevYearValue = extractIndicatorAmount(prevYearSamePeriodFinancials, def.key);
          if (prevYearValue !== null && prevYearValue !== 0) {
            yoyRate = ((value - prevYearValue) / Math.abs(prevYearValue)) * 100;
            yoyRate = Math.round(yoyRate * 100) / 100;
          }
        } else if (RATIO_INDICATORS.has(def.key) && !GROWTH_INDICATORS.has(def.key)) {
          const prevYearRatio = calculateRatioIndicator(prevYearSamePeriodFinancials, def.key);
          if (prevYearRatio !== null) {
            yoyRate = value - prevYearRatio;
            yoyRate = Math.round(yoyRate * 100) / 100;
          }
        }
      }
    }

    result.push({
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
      growthRate,
      yoyRate,
    });
  }

  return result;
}

// ==================== 인력/지배구조/배당 지표 계산 ====================

/**
 * 인력 지표 계산
 */
export function calculateWorkforceIndicators(
  employees: DartEmployee[],
  revenue?: number | null
): CalculatedIndicator[] {
  const result: CalculatedIndicator[] = [];
  const workforceDefs = INDICATOR_DEFINITIONS.filter(d => d.group === 'workforce');

  // 총 직원수 계산
  let totalEmployees = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let regularCount = 0;
  let contractCount = 0;
  let totalTenureSum = 0;
  let totalSalarySum = 0;
  let tenureCount = 0;

  // jan_salary_am: 1인당 연봉 (원 단위, 예: 130,000,000 = 1.3억원)
  // 가중평균 계산: Σ(jan_salary_am × 직원수) / 급여데이터가 있는 총 직원수
  let weightedSalarySum = 0;   // Σ(jan_salary_am × 직원수)
  let salaryEmployeeCount = 0; // 급여 데이터가 있는 직원수

  for (const emp of employees) {
    const sm = parseFloat(emp.sm?.replace(/,/g, '') || '0');
    const rgllbr = parseFloat(emp.rgllbrCo?.replace(/,/g, '') || '0');
    const cnttk = parseFloat(emp.cnttkCo?.replace(/,/g, '') || '0');
    const tenure = parseFloat(emp.avrgCnwkSdytrn?.replace(/,/g, '') || '0');
    const janSalary = parseFloat(emp.janSalaryAm?.replace(/,/g, '') || '0'); // 1인당 연봉

    totalEmployees += sm;
    regularCount += rgllbr;
    contractCount += cnttk;

    if (emp.sexdstn === '남') {
      maleCount += sm;
    } else if (emp.sexdstn === '여') {
      femaleCount += sm;
    }

    if (tenure > 0) {
      totalTenureSum += tenure * sm;
      tenureCount += sm;
    }

    // 1인당 연봉 가중합산
    if (janSalary > 0 && sm > 0) {
      weightedSalarySum += janSalary * sm;
      salaryEmployeeCount += sm;
    }
  }

  // 평균 연봉 계산 (가중평균)
  if (salaryEmployeeCount > 0) {
    totalSalarySum = weightedSalarySum / salaryEmployeeCount;
  }

  for (const def of workforceDefs) {
    let value: number | null = null;

    switch (def.key) {
      case 'revenuePerEmployee':
        if (revenue && totalEmployees > 0) {
          value = revenue / totalEmployees;
        }
        break;
      case 'avgSalary':
        // totalSalarySum은 이미 가중평균 연봉 (월급여 × 12)
        if (totalSalarySum > 0) {
          value = totalSalarySum;
        }
        break;
      case 'regularRatio':
        if (totalEmployees > 0) {
          value = (regularCount / totalEmployees) * 100;
        }
        break;
      case 'avgTenure':
        if (tenureCount > 0) {
          value = totalTenureSum / tenureCount;
        }
        break;
      case 'genderRatio':
        if (totalEmployees > 0) {
          value = (maleCount / totalEmployees) * 100;
        }
        break;
    }

    if (value !== null) {
      if (def.unit === '%') {
        value = Math.round(value * 100) / 100;
      } else if (def.unit === '년') {
        value = Math.round(value * 10) / 10;
      } else if (def.unit === '원') {
        value = Math.round(value);
      }
    }

    result.push({
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
    });
  }

  return result;
}

/**
 * 지배구조 지표 계산
 */
export function calculateGovernanceIndicators(
  shareholders: DartShareholder[],
  executives: DartExecutive[]
): CalculatedIndicator[] {
  const result: CalculatedIndicator[] = [];
  const governanceDefs = INDICATOR_DEFINITIONS.filter(d => d.group === 'governance');

  // 최대주주 지분율 (보통주 기준)
  let largestShareholderRatio: number | null = null;
  let relatedPartyRatio: number | null = null;

  const commonStockHolders = shareholders.filter(s =>
    s.stockKnd?.includes('보통주') || !s.stockKnd
  );

  if (commonStockHolders.length > 0) {
    // 첫 번째 = 최대주주
    const largest = commonStockHolders[0];
    largestShareholderRatio = parseFloat(largest.trmnPosessnStkQotaRt?.replace(/,/g, '') || '0');

    // 특수관계인 합산 (모든 주주의 지분율 합계)
    let totalRatio = 0;
    for (const holder of commonStockHolders) {
      totalRatio += parseFloat(holder.trmnPosessnStkQotaRt?.replace(/,/g, '') || '0');
    }
    relatedPartyRatio = totalRatio;
  }

  // 임원 통계
  let totalExecutives = 0;
  let outsideDirectors = 0;
  let femaleExecutives = 0;
  let registeredExecutives = 0;

  for (const exec of executives) {
    totalExecutives++;
    if (exec.rgistExctvAt === '등기임원') {
      registeredExecutives++;
    }
    if (exec.ofcpsNm?.includes('사외이사')) {
      outsideDirectors++;
    }
    if (exec.sexdstn === '여') {
      femaleExecutives++;
    }
  }

  for (const def of governanceDefs) {
    let value: number | null = null;

    switch (def.key) {
      case 'largestShareholderRatio':
        value = largestShareholderRatio;
        break;
      case 'relatedPartyRatio':
        value = relatedPartyRatio;
        break;
      case 'executiveCount':
        value = registeredExecutives > 0 ? registeredExecutives : totalExecutives;
        break;
      case 'outsideDirectorRatio':
        if (totalExecutives > 0) {
          value = (outsideDirectors / totalExecutives) * 100;
        }
        break;
      case 'femaleExecutiveRatio':
        if (totalExecutives > 0) {
          value = (femaleExecutives / totalExecutives) * 100;
        }
        break;
    }

    if (value !== null) {
      if (def.unit === '%') {
        value = Math.round(value * 100) / 100;
      } else if (def.unit === '명') {
        value = Math.round(value);
      }
    }

    result.push({
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
    });
  }

  return result;
}

/**
 * 배당 지표 계산
 */
export function calculateDividendIndicators(
  dividends: DartDividend[],
  netIncome?: number | null
): CalculatedIndicator[] {
  const result: CalculatedIndicator[] = [];
  const dividendDefs = INDICATOR_DEFINITIONS.filter(d => d.group === 'dividend');

  // 배당 데이터 파싱
  let dps: number | null = null;
  let dividendYield: number | null = null;
  let totalDividend: number | null = null;

  for (const div of dividends) {
    const seType = div.seType || '';
    const thstrm = div.thstrm?.replace(/,/g, '').replace(/-/g, '') || '';
    const value = parseFloat(thstrm) || 0;

    // 주당 현금배당금 (보통주)
    if (seType.includes('주당 현금배당금') || seType.includes('주당배당금')) {
      if (!div.stockKnd || div.stockKnd.includes('보통주')) {
        if (value > 0) dps = value;
      }
    }

    // 시가배당율
    if (seType.includes('현금배당수익률') || seType.includes('시가배당율')) {
      if (!div.stockKnd || div.stockKnd.includes('보통주')) {
        if (value > 0) dividendYield = value;
      }
    }

    // 현금배당금총액
    if (seType.includes('현금배당금총액') || seType.includes('배당금총액')) {
      if (value > 0) totalDividend = value * 1000000; // 백만원 → 원
    }
  }

  // 배당성향 계산
  let payoutRatio: number | null = null;
  if (totalDividend && netIncome && netIncome > 0) {
    payoutRatio = (totalDividend / netIncome) * 100;
  }

  for (const def of dividendDefs) {
    let value: number | null = null;

    switch (def.key) {
      case 'dps':
        value = dps;
        break;
      case 'payoutRatio':
        value = payoutRatio;
        break;
      case 'dividendYield':
        value = dividendYield;
        break;
      case 'totalDividend':
        value = totalDividend;
        break;
    }

    if (value !== null) {
      if (def.unit === '%') {
        value = Math.round(value * 100) / 100;
      } else if (def.unit === '원') {
        value = Math.round(value);
      }
    }

    result.push({
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      group: def.group,
    });
  }

  return result;
}

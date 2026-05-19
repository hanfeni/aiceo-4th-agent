/**
 * DART 트렌드 조회 서비스
 * Agent 4 전용
 */

import type {
  DartFinancialItem,
  DartFinancialTrend,
  TrendDataPoint,
  TrendType,
  DartEmployee,
  DartShareholder,
  DartExecutive,
  DartDividend,
  ReportCode,
} from '@/types/dart';
import { INDICATOR_DISPLAY_CONFIG } from '@/types/dart';
import {
  isRatioBasedIndicator,
  isEfficiencyIndicator,
  isGrowthIndicator,
  isAmountIndicator,
  calculateRatioIndicator,
  calculateEfficiencyIndicatorForQuarter,
  extractIndicatorAmount,
  calculateQ4UnitAmount,
  extractAddAmount,
  calculateWorkforceIndicators,
  calculateGovernanceIndicators,
  calculateDividendIndicators,
  getGrowthSourceAccountNames,
  extractAmount,
} from './indicator-calculator';
import {
  getFinancialStatements,
  getEmployees,
  getMajorShareholders,
  getExecutives,
  getDividends,
} from '@/lib/external/dart-api';

// ==================== 요청 레벨 캐시 (같은 분석 요청 내 중복 호출 방지) ====================

// 요청별 재무제표 캐시 (corpCode_year_reportCode -> DartFinancialItem[])
const requestFinancialCache = new Map<string, DartFinancialItem[]>();

/**
 * 요청 캐시 초기화 (새로운 분석 시작 시 호출)
 */
export function clearRequestCache(): void {
  requestFinancialCache.clear();
  console.log('[Trend Service] Request cache cleared');
}

/**
 * 캐시된 재무제표 조회 (요청 레벨)
 */
async function getCachedFinancialStatements(
  corpCode: string,
  year: string,
  reportCode: ReportCode
): Promise<DartFinancialItem[]> {
  const cacheKey = `${corpCode}_${year}_${reportCode}`;

  // 요청 캐시 확인
  const cached = requestFinancialCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // API 호출 (dart-api.ts의 캐시도 활용)
  const data = await getFinancialStatements(corpCode, year, reportCode);

  // 요청 캐시에 저장
  requestFinancialCache.set(cacheKey, data);

  return data;
}

/**
 * 재무제표 사전 로딩 (병렬로 한 번에 조회하여 캐시에 저장)
 * 분석 시작 전에 호출하면 이후 지표 계산 시 캐시 히트
 */
export async function preloadFinancialStatements(
  corpCode: string,
  annualYears: number,
  quarterlyCount: number
): Promise<{ annual: number; quarterly: number }> {
  const currentYear = new Date().getFullYear();
  const promises: Promise<DartFinancialItem[]>[] = [];
  const reportCodes: ReportCode[] = ['11013', '11012', '11014', '11011'];

  // 연간 데이터 (사업보고서 11011)
  for (let y = currentYear - annualYears; y < currentYear; y++) {
    promises.push(getCachedFinancialStatements(corpCode, String(y), '11011'));
  }

  // 분기 데이터
  if (quarterlyCount > 0) {
    let count = 0;
    for (let y = currentYear; y >= currentYear - 5 && count < quarterlyCount; y--) {
      for (let q = 3; q >= 0 && count < quarterlyCount; q--) {
        promises.push(getCachedFinancialStatements(corpCode, String(y), reportCodes[q]));
        count++;
      }
    }
  }

  console.log(`[Trend Service] Preloading ${promises.length} financial statements...`);

  // 병렬로 모두 조회 (실패해도 계속 진행)
  const results = await Promise.allSettled(promises);

  const fulfilled = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[Trend Service] Preloaded ${fulfilled}/${promises.length} financial statements`);

  return {
    annual: annualYears,
    quarterly: quarterlyCount,
  };
}

// ==================== 계정과목 매핑 ====================

const ACCOUNT_NAMES: Record<string, string[]> = {
  revenue: ['수익(매출액)', '매출액', '영업수익', '매출'],
  operatingIncome: ['영업이익', '영업이익(손실)'],
  netIncome: ['당기순이익', '당기순이익(손실)', '분기순이익', '분기순이익(손실)', '반기순이익', '반기순이익(손실)'],
};

// ==================== 트렌드 조회 ====================

/**
 * 통합 지표 트렌드 조회
 */
export async function getIndicatorTrend(
  corpCode: string,
  indicator: string,
  dataSource: 'financial' | 'workforce' | 'governance' | 'dividend',
  trendType: TrendType,
  count: number,
  year?: number
): Promise<DartFinancialTrend> {
  let trend: DartFinancialTrend;

  switch (dataSource) {
    case 'financial':
      trend = await getFinancialTrend(corpCode, trendType, indicator, count, year);
      break;
    case 'workforce':
      trend = await getWorkforceTrend(corpCode, trendType, indicator, count);
      break;
    case 'governance':
      trend = await getGovernanceTrend(corpCode, trendType, indicator, count);
      break;
    case 'dividend':
      trend = await getDividendTrend(corpCode, indicator, count);
      break;
    default:
      trend = await getFinancialTrend(corpCode, trendType, indicator, count, year);
  }

  // 성장률 계산 (지표 타입에 따라 다른 방식 적용)
  if (trend.dataPoints.length >= 2) {
    calculateGrowthRates(trend.dataPoints, trendType, indicator);
  }

  return trend;
}

/**
 * 재무 트렌드 조회
 */
export async function getFinancialTrend(
  corpCode: string,
  trendType: TrendType,
  indicator: string,
  count: number,
  year?: number
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: 'financial',
    trendType,
    dataPoints: [],
  };

  const currentYear = new Date().getFullYear();

  switch (trendType) {
    case 'annual':
      trend.dataPoints = await getAnnualTrend(corpCode, indicator, count, currentYear);
      break;
    case 'quarterly_unit':
      trend.dataPoints = await getQuarterlyTrend(corpCode, indicator, count, currentYear);
      break;
    case 'yearly_cumulative':
      if (year) {
        trend.dataPoints = await getYearlyCumulativeTrend(corpCode, indicator, year);
      }
      break;
  }

  return trend;
}

/**
 * 연간 트렌드 조회
 */
async function getAnnualTrend(
  corpCode: string,
  indicator: string,
  years: number,
  currentYear: number
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];

  for (let y = currentYear - years; y < currentYear; y++) {
    try {
      const financials = await getCachedFinancialStatements(corpCode, String(y), '11011');
      if (financials && financials.length > 0) {
        const point = createFinancialDataPoint(financials, indicator, String(y), `${y}년`);
        if (point.amount !== undefined || point.ratio !== undefined) {
          dataPoints.push(point);
        }
      }
    } catch {
      // Skip years with no data
    }
  }

  return dataPoints;
}

/**
 * 분기별 트렌드 조회
 */
async function getQuarterlyTrend(
  corpCode: string,
  indicator: string,
  quarters: number,
  currentYear: number
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];
  const reportCodes: ReportCode[] = ['11013', '11012', '11014', '11011'];
  const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];

  let count = 0;
  for (let y = currentYear; y >= currentYear - 5 && count < quarters; y--) {
    for (let q = 3; q >= 0 && count < quarters; q--) {
      try {
        const reportCode = reportCodes[q];
        const financials = await getCachedFinancialStatements(corpCode, String(y), reportCode as ReportCode);

        if (financials && financials.length > 0) {
          const period = `${y}${quarterLabels[q]}`;
          const label = `${y}년 ${q + 1}분기`;

          let point: TrendDataPoint;

          if (isEfficiencyIndicator(indicator)) {
            point = createEfficiencyDataPoint(financials, indicator, period, label, q);
          } else if (isGrowthIndicator(indicator)) {
            // 성장률 지표: 전분기 대비 성장률 계산
            point = await createGrowthDataPoint(corpCode, financials, indicator, period, label, y, q, reportCodes);
          } else if (q === 3 && isAmountIndicator(indicator)) {
            // 4분기 금액 지표: 연간 - 3분기누적 계산
            point = await createQ4AmountDataPoint(corpCode, financials, indicator, period, label, y);
          } else {
            point = createFinancialDataPoint(financials, indicator, period, label);
          }

          if (point.amount !== undefined || point.ratio !== undefined) {
            dataPoints.unshift(point);
            count++;
          }
        }
      } catch {
        // Skip quarters with no data
      }
    }
  }

  return dataPoints;
}

/**
 * 연간 누적 트렌드 조회
 * 선택 연도와 전년도의 분기별 누적 데이터를 비교
 */
async function getYearlyCumulativeTrend(
  corpCode: string,
  indicator: string,
  year: number
): Promise<TrendDataPoint[]> {
  const dataPoints: TrendDataPoint[] = [];
  const reportCodes: ReportCode[] = ['11013', '11012', '11014', '11011'];
  const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];

  // 전년도와 당해년도 모두 조회
  const years = [year - 1, year];

  for (const y of years) {
    for (let q = 0; q < 4; q++) {
      try {
        const reportCode = reportCodes[q];
        const financials = await getCachedFinancialStatements(corpCode, String(y), reportCode as ReportCode);

        if (financials && financials.length > 0) {
          const period = `${y}${quarterLabels[q]}`;
          const label = `${y}년 ${q + 1}분기 누적`;

          const point = createCumulativeDataPoint(financials, indicator, period, label);
          if (point.amount !== undefined || point.ratio !== undefined) {
            dataPoints.push(point);
          }
        }
      } catch {
        // Skip quarters with no data
      }
    }
  }

  // YoY 계산 (전년 동일 분기와 비교)
  for (let i = 0; i < dataPoints.length; i++) {
    const curr = dataPoints[i];
    const currPeriod = curr.period;
    if (!currPeriod) continue;

    const currYear = parseInt(currPeriod.substring(0, 4));
    const quarterSuffix = currPeriod.substring(4);
    const prevYearPeriod = `${currYear - 1}${quarterSuffix}`;

    const prevYearPoint = dataPoints.find(p => p.period === prevYearPeriod);
    if (prevYearPoint) {
      const currValue = extractNumericValue(curr);
      const prevValue = extractNumericValue(prevYearPoint);
      if (currValue !== null && prevValue !== null && prevValue !== 0) {
        curr.yoyRate = Math.round(((currValue - prevValue) / Math.abs(prevValue)) * 1000) / 10;
      }
    }
  }

  return dataPoints;
}

// ==================== 데이터 포인트 생성 ====================

/**
 * 재무 데이터 포인트 생성
 */
function createFinancialDataPoint(
  financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string
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

/**
 * 효율성 데이터 포인트 생성
 */
function createEfficiencyDataPoint(
  financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
  quarterIndex: number
): TrendDataPoint {
  const point: TrendDataPoint = {
    year: parseInt(period.substring(0, 4)),
    quarter: quarterIndex + 1,
    period,
    periodLabel: label,
    value: null,
  };

  const ratio = calculateEfficiencyIndicatorForQuarter(financials, indicator, quarterIndex);
  if (ratio !== null) {
    point.ratio = Math.round(ratio * 100) / 100;
    point.value = point.ratio;
  }

  return point;
}

/**
 * 성장률 데이터 포인트 생성 (분기별 성장률 계산)
 */
async function createGrowthDataPoint(
  corpCode: string,
  _financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
  year: number,
  quarterIndex: number,
  reportCodes: ReportCode[]
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

    // 현재 분기 금액 계산
    let currentAmount: number | null = null;
    if (quarterIndex === 3) {
      // 4분기: 연간 - 3분기누적
      currentAmount = await calculateQ4UnitAmountForGrowth(corpCode, currentYear, accountNames);
    } else {
      const reportCode = reportCodes[quarterIndex];
      const currentFinancials = await getCachedFinancialStatements(corpCode, currentYear, reportCode);
      if (currentFinancials && currentFinancials.length > 0) {
        currentAmount = extractAmount(currentFinancials, ...accountNames);
      }
    }

    if (currentAmount === null) return point;

    // 전분기 금액 계산
    let prevAmount: number | null = null;
    if (quarterIndex === 0) {
      // Q1: 전년도 4분기와 비교
      const prevYear = String(year - 1);
      prevAmount = await calculateQ4UnitAmountForGrowth(corpCode, prevYear, accountNames);
    } else if (quarterIndex === 1) {
      // Q2: Q1과 비교
      const prevFinancials = await getCachedFinancialStatements(corpCode, currentYear, reportCodes[0]);
      if (prevFinancials && prevFinancials.length > 0) {
        prevAmount = extractAmount(prevFinancials, ...accountNames);
      }
    } else if (quarterIndex === 2) {
      // Q3: Q2와 비교
      const prevFinancials = await getCachedFinancialStatements(corpCode, currentYear, reportCodes[1]);
      if (prevFinancials && prevFinancials.length > 0) {
        prevAmount = extractAmount(prevFinancials, ...accountNames);
      }
    } else {
      // Q4: Q3와 비교
      const prevFinancials = await getCachedFinancialStatements(corpCode, currentYear, reportCodes[2]);
      if (prevFinancials && prevFinancials.length > 0) {
        prevAmount = extractAmount(prevFinancials, ...accountNames);
      }
    }

    if (prevAmount !== null && prevAmount !== 0) {
      const growth = ((currentAmount - prevAmount) / Math.abs(prevAmount)) * 100;
      point.ratio = Math.round(growth * 10) / 10;
      point.value = point.ratio;
    }
  } catch {
    // Skip on error
  }

  return point;
}

/**
 * 4분기 단위 금액 계산 (성장률용)
 */
async function calculateQ4UnitAmountForGrowth(
  corpCode: string,
  year: string,
  accountNames: string[]
): Promise<number | null> {
  try {
    const annualFinancials = await getCachedFinancialStatements(corpCode, year, '11011');
    const q3Financials = await getCachedFinancialStatements(corpCode, year, '11014');

    if (!annualFinancials || annualFinancials.length === 0) return null;

    const annualAmount = extractAmount(annualFinancials, ...accountNames);
    const q3Amount = q3Financials ? extractAmount(q3Financials, ...accountNames) : null;

    if (annualAmount === null) return null;
    if (q3Amount === null) return annualAmount; // 3분기 데이터 없으면 연간값 사용

    return annualAmount - q3Amount;
  } catch {
    return null;
  }
}

/**
 * 4분기 금액 데이터 포인트 생성
 */
async function createQ4AmountDataPoint(
  corpCode: string,
  annualFinancials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string,
  year: number
): Promise<TrendDataPoint> {
  const point: TrendDataPoint = {
    year,
    quarter: 4,
    period,
    periodLabel: label,
    value: null,
  };

  try {
    // 3분기 재무제표 조회
    const q3Financials = await getCachedFinancialStatements(corpCode, String(year), '11014');

    // 4분기 단위 금액 계산 (연간 - 3분기누적)
    const q4Amount = calculateQ4UnitAmount(annualFinancials, q3Financials || [], indicator);

    if (q4Amount !== null) {
      point.amount = q4Amount;
      point.value = q4Amount;
    } else {
      // 계산 실패 시 연간값 사용 (fallback)
      const annualAmount = extractIndicatorAmount(annualFinancials, indicator);
      if (annualAmount !== null) {
        point.amount = annualAmount;
        point.value = annualAmount;
      }
    }
  } catch {
    // 3분기 데이터 없으면 연간값 사용
    const annualAmount = extractIndicatorAmount(annualFinancials, indicator);
    if (annualAmount !== null) {
      point.amount = annualAmount;
      point.value = annualAmount;
    }
  }

  return point;
}

/**
 * 누적 데이터 포인트 생성
 */
function createCumulativeDataPoint(
  financials: DartFinancialItem[],
  indicator: string,
  period: string,
  label: string
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
    const accountNames = ACCOUNT_NAMES[indicator] || [];
    let amount = extractAddAmount(financials, ...accountNames);

    if (amount === null) {
      amount = extractIndicatorAmount(financials, indicator);
    }

    if (amount !== null) {
      point.amount = amount;
      point.value = amount;
    }
  }

  return point;
}

// ==================== 인력/지배구조/배당 트렌드 ====================

/**
 * 인력 트렌드 조회
 * 인력 데이터는 연간(11011), 반기(11012) 보고서에 포함
 */
export async function getWorkforceTrend(
  corpCode: string,
  trendType: TrendType,
  indicator: string,
  count: number
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getWorkforceIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: 'workforce',
    trendType: trendType === 'quarterly_unit' ? 'quarterly_unit' : 'annual',
    dataPoints: [],
  };

  const currentYear = new Date().getFullYear();
  const needsRevenue = indicator === 'revenuePerEmployee';

  if (trendType === 'annual') {
    // 연간 데이터 조회
    for (let y = currentYear - count; y < currentYear; y++) {
      try {
        const employees = await getEmployees(corpCode, String(y), '11011');

        if (employees && employees.length > 0) {
          let revenue: number | null = null;
          if (needsRevenue) {
            const financials = await getCachedFinancialStatements(corpCode, String(y), '11011');
            if (financials && financials.length > 0) {
              revenue = extractIndicatorAmount(financials, 'revenue');
            }
          }

          const indicators = calculateWorkforceIndicators(employees, revenue);
          const targetIndicator = indicators.find(ind => ind.key === indicator);

          if (targetIndicator && targetIndicator.value !== null) {
            const point: TrendDataPoint = {
              year: y,
              period: String(y),
              periodLabel: `${y}년`,
              value: targetIndicator.value,
            };

            if (targetIndicator.unit === '%' || targetIndicator.unit === '년' || targetIndicator.unit === '배') {
              point.ratio = targetIndicator.value;
            } else {
              point.amount = targetIndicator.value;
            }

            trend.dataPoints.push(point);
          }
        }
      } catch {
        // Skip years with no data
      }
    }
  } else if (trendType === 'quarterly_unit') {
    // 반기별 데이터 조회 (H1: 11012, H2: 11011)
    const reportCodes: ReportCode[] = ['11012', '11011'];
    const halfYearLabels = ['H1', 'H2'];
    let periodCount = 0;

    for (let y = currentYear; y >= currentYear - 5 && periodCount < count; y--) {
      for (let h = 1; h >= 0 && periodCount < count; h--) {
        try {
          const reportCode = reportCodes[h];
          const employees = await getEmployees(corpCode, String(y), reportCode);

          if (employees && employees.length > 0 && hasValidEmployeeData(employees)) {
            let revenue: number | null = null;
            if (needsRevenue) {
              if (h === 0) {
                // H1: 반기 매출
                const financials = await getCachedFinancialStatements(corpCode, String(y), '11012');
                if (financials) {
                  revenue = extractIndicatorAmount(financials, 'revenue');
                }
              } else {
                // H2: 연간 - H1
                const annualFinancials = await getCachedFinancialStatements(corpCode, String(y), '11011');
                const h1Financials = await getCachedFinancialStatements(corpCode, String(y), '11012');
                const annualRevenue = annualFinancials ? extractIndicatorAmount(annualFinancials, 'revenue') : null;
                const h1Revenue = h1Financials ? extractIndicatorAmount(h1Financials, 'revenue') : null;

                if (annualRevenue !== null && h1Revenue !== null) {
                  revenue = annualRevenue - h1Revenue;
                } else if (annualRevenue !== null) {
                  revenue = annualRevenue / 2;
                }
              }
            }

            const period = `${y}${halfYearLabels[h]}`;
            const label = `${y}년 ${h === 0 ? '상반기' : '하반기'}`;

            // 반기 보고서의 경우 avgSalary는 ×2 필요
            const indicators = calculateWorkforceIndicators(employees, revenue);
            const targetIndicator = indicators.find(ind => ind.key === indicator);

            if (targetIndicator && targetIndicator.value !== null) {
              let value = targetIndicator.value;
              // 반기 보고서의 평균급여는 반기치이므로 연환산
              if (indicator === 'avgSalary' && reportCode === '11012') {
                value = value * 2;
              }

              const point: TrendDataPoint = {
                year: y,
                period,
                periodLabel: label,
                value,
              };

              if (targetIndicator.unit === '%' || targetIndicator.unit === '년' || targetIndicator.unit === '배') {
                point.ratio = value;
              } else {
                point.amount = value;
              }

              trend.dataPoints.unshift(point);
              periodCount++;
            }
          }
        } catch {
          // Skip periods with no data
        }
      }
    }
  }

  return trend;
}

/**
 * 지배구조 트렌드 조회
 * 지배구조 데이터는 연간(11011), 반기(11012) 보고서에 포함
 */
export async function getGovernanceTrend(
  corpCode: string,
  trendType: TrendType,
  indicator: string,
  count: number
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getGovernanceIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: 'governance',
    trendType: trendType === 'quarterly_unit' ? 'quarterly_unit' : 'annual',
    dataPoints: [],
  };

  const currentYear = new Date().getFullYear();

  if (trendType === 'annual') {
    // 연간 데이터 조회
    for (let y = currentYear - count; y < currentYear; y++) {
      try {
        const [shareholders, executives] = await Promise.all([
          getMajorShareholders(corpCode, String(y), '11011'),
          getExecutives(corpCode, String(y), '11011'),
        ]);

        if ((shareholders && shareholders.length > 0) || (executives && executives.length > 0)) {
          const indicators = calculateGovernanceIndicators(
            shareholders || [],
            executives || []
          );
          const targetIndicator = indicators.find(ind => ind.key === indicator);

          if (targetIndicator && targetIndicator.value !== null) {
            const point: TrendDataPoint = {
              year: y,
              period: String(y),
              periodLabel: `${y}년`,
              value: targetIndicator.value,
            };

            if (targetIndicator.unit === '%') {
              point.ratio = targetIndicator.value;
            } else {
              point.amount = targetIndicator.value;
            }

            trend.dataPoints.push(point);
          }
        }
      } catch {
        // Skip years with no data
      }
    }
  } else if (trendType === 'quarterly_unit') {
    // 반기별 데이터 조회 (H1: 11012, H2: 11011)
    const reportCodes: ReportCode[] = ['11012', '11011'];
    const halfYearLabels = ['H1', 'H2'];
    let periodCount = 0;

    for (let y = currentYear; y >= currentYear - 5 && periodCount < count; y--) {
      for (let h = 1; h >= 0 && periodCount < count; h--) {
        try {
          const reportCode = reportCodes[h];
          const [shareholders, executives] = await Promise.all([
            getMajorShareholders(corpCode, String(y), reportCode),
            getExecutives(corpCode, String(y), reportCode),
          ]);

          if ((shareholders && shareholders.length > 0) || (executives && executives.length > 0)) {
            const indicators = calculateGovernanceIndicators(
              shareholders || [],
              executives || []
            );
            const targetIndicator = indicators.find(ind => ind.key === indicator);

            if (targetIndicator && targetIndicator.value !== null) {
              const period = `${y}${halfYearLabels[h]}`;
              const label = `${y}년 ${h === 0 ? '상반기' : '하반기'}`;

              const point: TrendDataPoint = {
                year: y,
                period,
                periodLabel: label,
                value: targetIndicator.value,
              };

              if (targetIndicator.unit === '%') {
                point.ratio = targetIndicator.value;
              } else {
                point.amount = targetIndicator.value;
              }

              trend.dataPoints.unshift(point);
              periodCount++;
            }
          }
        } catch {
          // Skip periods with no data
        }
      }
    }
  }

  return trend;
}

/**
 * 배당 트렌드 조회
 * 배당 데이터는 연간 보고서(11011)에만 존재
 */
export async function getDividendTrend(
  corpCode: string,
  indicator: string,
  years: number
): Promise<DartFinancialTrend> {
  const trend: DartFinancialTrend = {
    indicator: getDividendIndicatorName(indicator),
    indicatorKey: indicator,
    dataSource: 'dividend',
    trendType: 'annual',
    dataPoints: [],
  };

  const currentYear = new Date().getFullYear();

  // 연간 데이터만 조회 (배당 정보는 사업보고서에만 포함)
  for (let y = currentYear - years; y < currentYear; y++) {
    try {
      // 배당 데이터 조회
      const dividends = await getDividends(corpCode, String(y), '11011');

      if (dividends && dividends.length > 0) {
        // 당기순이익 조회 (배당성향 계산용)
        let netIncome: number | null = null;
        if (indicator === 'payoutRatio') {
          const financials = await getCachedFinancialStatements(corpCode, String(y), '11011');
          if (financials && financials.length > 0) {
            netIncome = extractIndicatorAmount(financials, 'netIncome');
          }
        }

        // 지표 계산
        const indicators = calculateDividendIndicators(dividends, netIncome);
        const targetIndicator = indicators.find(ind => ind.key === indicator);

        if (targetIndicator && targetIndicator.value !== null) {
          const point: TrendDataPoint = {
            year: y,
            period: String(y),
            periodLabel: `${y}년`,
            value: targetIndicator.value,
          };

          // 단위에 따른 필드 설정
          if (targetIndicator.unit === '%') {
            point.ratio = targetIndicator.value;
          } else {
            point.amount = targetIndicator.value;
          }

          trend.dataPoints.push(point);
        }
      }
    } catch {
      // Skip years with no data
    }
  }

  return trend;
}

// ==================== 성장률 계산 ====================

/**
 * 성장률 계산
 *
 * 원본 코드 (growth-display.js) 기반:
 * - valueType === 'amount': 상대 변화율 (%) = ((current - prev) / |prev|) * 100
 * - valueType === 'percent': 절대 차이 (%p) = current - prev
 * - valueType === 'times': 상대 변화율 (%) = ((current - prev) / |prev|) * 100
 *
 * @param dataPoints - 트렌드 데이터 포인트
 * @param trendType - 트렌드 타입
 * @param indicator - 지표 ID (valueType 결정용)
 */
function calculateGrowthRates(dataPoints: TrendDataPoint[], trendType: TrendType, indicator: string): void {
  if (dataPoints.length < 2) return;

  const isAnnual = trendType === 'annual';

  // 지표 설정에서 valueType 조회
  const config = INDICATOR_DISPLAY_CONFIG[indicator];
  const valueType = config?.valueType || 'amount';

  // percent 타입은 절대 차이(%p)로 계산, 그 외는 상대 변화율(%)로 계산
  const useAbsoluteDifference = valueType === 'percent';

  for (let i = 1; i < dataPoints.length; i++) {
    const curr = dataPoints[i];
    const prev = dataPoints[i - 1];

    const currValue = extractNumericValue(curr);
    const prevValue = extractNumericValue(prev);

    if (currValue === null || prevValue === null) continue;

    // QoQ 성장률
    if (useAbsoluteDifference) {
      // 절대 차이 (%p): 비율 지표의 경우
      const diff = currValue - prevValue;
      curr.growthRate = Math.round(diff * 10) / 10;
    } else if (prevValue !== 0) {
      // 상대 변화율 (%): 금액 지표의 경우
      const growth = ((currValue - prevValue) / Math.abs(prevValue)) * 100;
      curr.growthRate = Math.round(growth * 10) / 10;
    }

    // YoY 성장률
    if (isAnnual) {
      curr.yoyRate = curr.growthRate;
    } else {
      const prevYearSamePeriod = findPrevYearSamePeriod(dataPoints, curr, i);
      if (prevYearSamePeriod) {
        const prevYearValue = extractNumericValue(prevYearSamePeriod);
        if (prevYearValue !== null) {
          if (useAbsoluteDifference) {
            // 절대 차이 (%p)
            const diff = currValue - prevYearValue;
            curr.yoyRate = Math.round(diff * 10) / 10;
          } else if (prevYearValue !== 0) {
            // 상대 변화율 (%)
            const yoy = ((currValue - prevYearValue) / Math.abs(prevYearValue)) * 100;
            curr.yoyRate = Math.round(yoy * 10) / 10;
          }
        }
      }
    }
  }
}

/**
 * 숫자값 추출
 */
function extractNumericValue(point: TrendDataPoint): number | null {
  if (point.value !== null) return point.value;
  if (point.amount !== undefined) return point.amount;
  if (point.ratio !== undefined) return point.ratio;
  return null;
}

/**
 * 전년 동기 데이터 찾기
 */
function findPrevYearSamePeriod(
  dataPoints: TrendDataPoint[],
  current: TrendDataPoint,
  currentIndex: number
): TrendDataPoint | null {
  const currPeriod = current.period;
  if (!currPeriod || currPeriod.length < 4) return null;

  try {
    const currYear = parseInt(currPeriod.substring(0, 4));
    const periodSuffix = currPeriod.length > 4 ? currPeriod.substring(4) : '';
    const targetPeriod = `${currYear - 1}${periodSuffix}`;

    for (let i = 0; i < currentIndex; i++) {
      if (dataPoints[i].period === targetPeriod) {
        return dataPoints[i];
      }
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

// ==================== 헬퍼 함수 ====================

/**
 * 직원 데이터 유효성 검사
 * 직원수가 0이 아닌 데이터가 있는지 확인
 */
function hasValidEmployeeData(employees: DartEmployee[]): boolean {
  if (!employees || employees.length === 0) return false;

  for (const emp of employees) {
    const sm = parseInt(emp.sm?.replace(/,/g, '') || '0', 10);
    if (sm > 0) return true;

    const rgllbrCo = parseInt(emp.rgllbrCo?.replace(/,/g, '') || '0', 10);
    const cnttkCo = parseInt(emp.cnttkCo?.replace(/,/g, '') || '0', 10);
    if (rgllbrCo > 0 || cnttkCo > 0) return true;
  }

  return false;
}

// ==================== 지표명 매핑 ====================

function getIndicatorName(key: string): string {
  const names: Record<string, string> = {
    revenue: '매출액',
    operatingIncome: '영업이익',
    netIncome: '당기순이익',
    debtRatio: '부채비율',
    roe: 'ROE',
    roa: 'ROA',
    grossProfitMargin: '매출총이익률',
    operatingProfitMargin: '영업이익률',
    netProfitMargin: '순이익률',
    currentRatio: '유동비율',
    quickRatio: '당좌비율',
    interestCoverage: '이자보상배율',
    debtDependency: '차입금의존도',
    netDebtRatio: '순부채비율',
    cashRatio: '현금비율',
    revenueGrowth: '매출성장률',
    operatingIncomeGrowth: '영업이익성장률',
    netIncomeGrowth: '순이익성장률',
    assetGrowth: '자산성장률',
    equityGrowth: '자본성장률',
    assetTurnover: '총자산회전율',
    receivablesTurnover: '매출채권회전율',
    inventoryTurnover: '재고자산회전율',
    payablesTurnover: '매입채무회전율',
    tangibleAssetTurnover: '유형자산회전율',
    operatingCF: '영업현금흐름',
    investingCF: '투자현금흐름',
    financingCF: '재무현금흐름',
    fcf: '잉여현금흐름',
  };
  return names[key] || key;
}

function getWorkforceIndicatorName(key: string): string {
  const names: Record<string, string> = {
    totalEmployees: '총 직원수',
    avgSalary: '평균급여',
    regularRatio: '정규직비율',
    avgTenure: '평균근속연수',
    genderRatio: '남성비율',
    revenuePerEmployee: '1인당매출',
  };
  return names[key] || key;
}

function getGovernanceIndicatorName(key: string): string {
  const names: Record<string, string> = {
    majorShareholderRatio: '최대주주지분율',
    relatedPartyRatio: '특수관계인지분율',
    totalExecutives: '총 임원수',
    outsideDirectorRatio: '사외이사비율',
    femaleExecutiveRatio: '여성임원비율',
  };
  return names[key] || key;
}

function getDividendIndicatorName(key: string): string {
  const names: Record<string, string> = {
    dps: '주당배당금',
    payoutRatio: '배당성향',
    dividendYield: '배당수익률',
    totalDividend: '총배당금',
  };
  return names[key] || key;
}

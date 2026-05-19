/**
 * DART 재무 지표 API
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getFinancialStatements,
  getEmployees,
  getMajorShareholders,
  getExecutives,
  getDividends,
} from '@/lib/external/dart-api';
import {
  calculateAllIndicators,
  calculateGroupIndicators,
  calculateWorkforceIndicators,
  calculateGovernanceIndicators,
  calculateDividendIndicators,
  extractIndicatorAmount,
  INDICATOR_DEFINITIONS,
} from '@/lib/services/dart/indicator-calculator';
import type { IndicatorGroup, ReportCode } from '@/types/dart';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const corpCode = searchParams.get('corpCode');
    const year = searchParams.get('year') || String(new Date().getFullYear() - 1);
    const reportCode = (searchParams.get('reportCode') || '11011') as ReportCode;
    const group = searchParams.get('group') as IndicatorGroup | null;

    if (!corpCode) {
      return NextResponse.json(
        { success: false, error: 'corpCode is required' },
        { status: 400 }
      );
    }

    // 재무제표 조회
    const financials = await getFinancialStatements(corpCode, year, reportCode);

    if (!financials || financials.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No financial data available for the specified period' },
        { status: 404 }
      );
    }

    // 전년 동기 재무제표 조회 (YoY 계산용)
    // 연간 보고서(11011)의 경우 frmtrmAmount에서 전년 데이터를 가져오므로 별도 조회 불필요
    // 분기/반기 보고서의 경우 전년 동일 분기/반기 보고서 조회
    let prevYearSamePeriodFinancials: typeof financials | undefined;
    if (reportCode !== '11011') {
      const prevYear = String(parseInt(year) - 1);
      try {
        prevYearSamePeriodFinancials = await getFinancialStatements(corpCode, prevYear, reportCode);
      } catch {
        // 전년 동기 데이터가 없을 수 있음 - 무시
      }
    }

    // 분기 인덱스 계산
    let quarterIndex: number | undefined;
    switch (reportCode) {
      case '11013': quarterIndex = 0; break;
      case '11012': quarterIndex = 1; break;
      case '11014': quarterIndex = 2; break;
      case '11011': quarterIndex = 3; break;
    }

    // 특정 그룹만 요청한 경우
    if (group) {
      const validGroups: IndicatorGroup[] = [
        'core', 'profitability', 'stability', 'growth',
        'efficiency', 'cashflow', 'workforce', 'governance', 'dividend'
      ];

      if (!validGroups.includes(group)) {
        return NextResponse.json(
          { success: false, error: `Invalid group. Must be one of: ${validGroups.join(', ')}` },
          { status: 400 }
        );
      }

      let indicators;

      // 인력/지배구조/배당은 연간 보고서(11011)에서만 데이터 존재
      const annualOnlyGroups = ['workforce', 'governance', 'dividend'];
      const useAnnualData = annualOnlyGroups.includes(group);
      const effectiveReportCode: ReportCode = useAnnualData ? '11011' : reportCode;
      const effectiveYear = useAnnualData && reportCode !== '11011'
        ? String(parseInt(year) - 1)
        : year;

      if (group === 'workforce') {
        const employees = await getEmployees(corpCode, effectiveYear, effectiveReportCode);
        const revenue = extractIndicatorAmount(financials, 'revenue');
        indicators = calculateWorkforceIndicators(employees, revenue);
      } else if (group === 'governance') {
        const [shareholders, executives] = await Promise.all([
          getMajorShareholders(corpCode, effectiveYear, effectiveReportCode),
          getExecutives(corpCode, effectiveYear, effectiveReportCode),
        ]);
        indicators = calculateGovernanceIndicators(shareholders, executives);
      } else if (group === 'dividend') {
        const dividends = await getDividends(corpCode, effectiveYear, effectiveReportCode);
        const netIncome = extractIndicatorAmount(financials, 'netIncome');
        indicators = calculateDividendIndicators(dividends, netIncome);
      } else {
        indicators = calculateGroupIndicators(financials, group, quarterIndex, reportCode, prevYearSamePeriodFinancials);
      }

      return NextResponse.json({
        success: true,
        data: {
          corpCode,
          year: parseInt(year),
          reportCode,
          group,
          indicators,
        },
      });
    }

    // 전체 지표 계산 (재무제표 기반)
    const result = calculateAllIndicators(
      financials,
      corpCode,
      parseInt(year),
      reportCode,
      quarterIndex,
      prevYearSamePeriodFinancials
    );

    // 인력/지배구조/배당 데이터는 연간 보고서(11011)에만 존재
    // 분기 보고서 요청 시에도 최신 연간 보고서에서 조회
    const annualReportCode: ReportCode = '11011';

    // 연간 보고서 연도 결정: 분기 보고서인 경우 해당 연도 또는 직전 연도
    // (예: 2024년 Q3 요청 시 2023년 연간 보고서 사용)
    const annualYear = reportCode === '11011' ? year : String(parseInt(year) - 1);

    const [employees, shareholders, executives, dividends] = await Promise.all([
      getEmployees(corpCode, annualYear, annualReportCode),
      getMajorShareholders(corpCode, annualYear, annualReportCode),
      getExecutives(corpCode, annualYear, annualReportCode),
      getDividends(corpCode, annualYear, annualReportCode),
    ]);

    // 매출액, 당기순이익 추출 (인력/배당 계산용)
    const revenue = extractIndicatorAmount(financials, 'revenue');
    const netIncome = extractIndicatorAmount(financials, 'netIncome');

    // 추가 지표 계산
    const workforceIndicators = calculateWorkforceIndicators(employees, revenue);
    const governanceIndicators = calculateGovernanceIndicators(shareholders, executives);
    const dividendIndicators = calculateDividendIndicators(dividends, netIncome);

    // 결과에 추가
    result.byGroup.workforce = workforceIndicators;
    result.byGroup.governance = governanceIndicators;
    result.byGroup.dividend = dividendIndicators;

    result.indicators.push(...workforceIndicators);
    result.indicators.push(...governanceIndicators);
    result.indicators.push(...dividendIndicators);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Indicators API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * 지표 정의 목록 조회
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'definitions') {
      return NextResponse.json({
        success: true,
        data: INDICATOR_DEFINITIONS,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Indicators API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

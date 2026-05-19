/**
 * DART 재무 정보 API
 * GET /api/dart/financial?corpCode={corpCode}&year={year}&reportCode={reportCode}
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import {
  getFinancialStatements,
  extractFinancialSummary,
  getMultiYearFinancialSummary,
} from '@/lib/services/dart/dart-api.service';
import type { ReportCode } from '@/types/dart';

export async function GET(req: NextRequest) {
  // 인증 확인
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 파라미터 확인
  const corpCode = req.nextUrl.searchParams.get('corpCode');
  if (!corpCode) {
    return NextResponse.json(
      { error: 'corpCode parameter is required' },
      { status: 400 }
    );
  }

  const year = req.nextUrl.searchParams.get('year');
  const reportCode = (req.nextUrl.searchParams.get('reportCode') || '11011') as ReportCode;
  const summary = req.nextUrl.searchParams.get('summary') === 'true';
  const multiYear = req.nextUrl.searchParams.get('multiYear') === 'true';
  const years = parseInt(req.nextUrl.searchParams.get('years') || '5', 10);

  try {
    // 다년도 요약 조회
    if (multiYear) {
      const summaries = await getMultiYearFinancialSummary(corpCode, years);

      return NextResponse.json({
        success: true,
        data: summaries,
        type: 'multiYear',
      });
    }

    // 단일 연도 조회
    const targetYear = year || String(new Date().getFullYear() - 1);
    const financials = await getFinancialStatements(corpCode, targetYear, reportCode);

    if (summary) {
      // 요약 데이터 반환
      const summaryData = extractFinancialSummary(financials, parseInt(targetYear, 10));

      return NextResponse.json({
        success: true,
        data: summaryData,
        type: 'summary',
        year: targetYear,
        reportCode,
      });
    }

    // 원본 데이터 반환
    return NextResponse.json({
      success: true,
      data: financials,
      type: 'raw',
      year: targetYear,
      reportCode,
      count: financials.length,
    });
  } catch (error) {
    console.error('Financial data error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get financial data',
      },
      { status: 500 }
    );
  }
}

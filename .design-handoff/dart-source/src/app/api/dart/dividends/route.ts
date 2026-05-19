/**
 * DART 배당 API
 * Agent 4 전용
 *
 * 오리지널: /admin2/dart/dividends?corpCode={}&years={}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDividends } from '@/lib/external/dart-api';
import type { DartDividend } from '@/types/dart';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const corpCode = searchParams.get('corpCode');
    const years = parseInt(searchParams.get('years') || '5');

    if (!corpCode) {
      return NextResponse.json(
        { success: false, error: 'corpCode is required' },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    const allDividends: DartDividend[] = [];

    // 다년간 배당 데이터 조회 (오리지널 방식)
    for (let i = 0; i < years; i++) {
      const year = currentYear - 1 - i; // 전년도부터 시작
      try {
        const dividends = await getDividends(corpCode, String(year));
        if (dividends && dividends.length > 0) {
          // 연도 정보 추가 (오리지널과 동일)
          dividends.forEach((d) => {
            d.year = year;
          });
          allDividends.push(...dividends);
        }
      } catch (err) {
        console.warn(`Failed to get dividends for year ${year}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      corpCode,
      years,
      dividends: allDividends,
      count: allDividends.length,
    });
  } catch (error) {
    console.error('Dividends API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

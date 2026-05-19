/**
 * DART 자회사 API
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSubsidiaries } from '@/lib/external/dart-api';
import type { ReportCode } from '@/types/dart';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const corpCode = searchParams.get('corpCode');
    const year = searchParams.get('year') || String(new Date().getFullYear() - 1);
    const reportCode = (searchParams.get('reportCode') || '11011') as ReportCode;

    if (!corpCode) {
      return NextResponse.json(
        { success: false, error: 'corpCode is required' },
        { status: 400 }
      );
    }

    const subsidiaries = await getSubsidiaries(corpCode, year, reportCode);

    return NextResponse.json({
      success: true,
      data: {
        corpCode,
        year: parseInt(year),
        reportCode,
        subsidiaries: subsidiaries || [],
        count: subsidiaries?.length || 0,
      },
    });
  } catch (error) {
    console.error('Subsidiaries API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

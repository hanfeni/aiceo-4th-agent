/**
 * DART 가용 기간 API
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAvailablePeriods } from '@/lib/external/dart-api';

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

    const periods = await getAvailablePeriods(corpCode, years);

    return NextResponse.json({
      success: true,
      data: periods,
    });
  } catch (error) {
    console.error('Available periods API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DART 트렌드 API
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIndicatorTrend } from '@/lib/services/dart/trend.service';
import type { TrendType } from '@/types/dart';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const corpCode = searchParams.get('corpCode');
    const indicator = searchParams.get('indicator') || 'revenue';
    const dataSource = searchParams.get('dataSource') || 'financial';
    const trendType = (searchParams.get('trendType') || 'annual') as TrendType;
    const count = parseInt(searchParams.get('count') || '5');
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;

    if (!corpCode) {
      return NextResponse.json(
        { success: false, error: 'corpCode is required' },
        { status: 400 }
      );
    }

    const validDataSources = ['financial', 'workforce', 'governance', 'dividend'];
    if (!validDataSources.includes(dataSource)) {
      return NextResponse.json(
        { success: false, error: 'Invalid dataSource. Must be one of: financial, workforce, governance, dividend' },
        { status: 400 }
      );
    }

    const validTrendTypes = ['annual', 'quarterly_unit', 'yearly_cumulative'];
    if (!validTrendTypes.includes(trendType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid trendType. Must be one of: annual, quarterly_unit, yearly_cumulative' },
        { status: 400 }
      );
    }

    const trend = await getIndicatorTrend(
      corpCode,
      indicator,
      dataSource as 'financial' | 'workforce' | 'governance' | 'dividend',
      trendType,
      count,
      year
    );

    return NextResponse.json({
      success: true,
      data: trend,
    });
  } catch (error) {
    console.error('Trend API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

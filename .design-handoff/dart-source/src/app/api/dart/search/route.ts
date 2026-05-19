/**
 * DART 기업 검색 API
 * GET /api/dart/search?q={keyword}
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import { searchCompany } from '@/lib/services/dart/dart-api.service';

export async function GET(req: NextRequest) {
  // 인증 확인
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 검색어 확인
  const query = req.nextUrl.searchParams.get('q');
  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const companies = await searchCompany(query);

    return NextResponse.json({
      success: true,
      data: companies,
      count: companies.length,
    });
  } catch (error) {
    console.error('Search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      },
      { status: 500 }
    );
  }
}

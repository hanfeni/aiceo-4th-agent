/**
 * DART 공시 목록 API
 * GET /api/dart/disclosure?corpCode={corpCode}&pageNo={pageNo}&pageCount={pageCount}
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import { getCompanyDisclosures } from '@/lib/services/dart/dart-api.service';

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

  const pageNo = parseInt(req.nextUrl.searchParams.get('pageNo') || '1', 10);
  const pageCount = parseInt(req.nextUrl.searchParams.get('pageCount') || '20', 10);
  const beginDate = req.nextUrl.searchParams.get('beginDate') || undefined;
  const endDate = req.nextUrl.searchParams.get('endDate') || undefined;

  try {
    const result = await getCompanyDisclosures(corpCode, {
      pageNo,
      pageCount,
      beginDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Disclosure list error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get disclosures',
      },
      { status: 500 }
    );
  }
}

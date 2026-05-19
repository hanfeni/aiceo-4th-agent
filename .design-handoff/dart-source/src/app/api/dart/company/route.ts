/**
 * DART 기업 상세 정보 API
 * GET /api/dart/company?corpCode={corpCode}
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import {
  getCompanyOverview,
  getFullCompanyData,
} from '@/lib/services/dart/dart-api.service';

export async function GET(req: NextRequest) {
  // 인증 확인
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 기업 코드 확인
  const corpCode = req.nextUrl.searchParams.get('corpCode');
  if (!corpCode) {
    return NextResponse.json(
      { error: 'corpCode parameter is required' },
      { status: 400 }
    );
  }

  // full 파라미터: 전체 정보 조회 여부
  const full = req.nextUrl.searchParams.get('full') === 'true';

  try {
    if (full) {
      // 전체 정보 조회 (공시 50건 - 오리지널 기준)
      const fullData = await getFullCompanyData(corpCode, 50);

      return NextResponse.json({
        success: true,
        data: fullData,
      });
    } else {
      // 기업 개황만 조회
      const companyInfo = await getCompanyOverview(corpCode);

      if (!companyInfo) {
        return NextResponse.json(
          { error: 'Company not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: companyInfo,
      });
    }
  } catch (error) {
    console.error('Company info error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get company info',
      },
      { status: 500 }
    );
  }
}

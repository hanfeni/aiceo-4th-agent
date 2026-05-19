/**
 * DART 공시 원문 문서 조회 API
 * GET /api/dart/disclosure-document?rceptNo={rceptNo}
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import { getDisclosureDocument } from '@/lib/services/dart/disclosure-parser.service';

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
  const rceptNo = req.nextUrl.searchParams.get('rceptNo');
  if (!rceptNo) {
    return NextResponse.json(
      { error: 'rceptNo parameter is required' },
      { status: 400 }
    );
  }

  try {
    const document = await getDisclosureDocument(rceptNo);

    if (document.error) {
      return NextResponse.json({
        success: false,
        error: document.error,
      });
    }

    return NextResponse.json({
      success: true,
      document,
    });
  } catch (error) {
    console.error('Disclosure document API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get disclosure document',
      },
      { status: 500 }
    );
  }
}

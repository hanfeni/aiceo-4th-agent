/**
 * DART 공시 섹션 내용 조회 API
 * GET /api/dart/disclosure-section?rceptNo={rceptNo}&tocId={tocId}
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import { getSectionContent } from '@/lib/services/dart/disclosure-parser.service';

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
  const tocId = req.nextUrl.searchParams.get('tocId');

  if (!rceptNo) {
    return NextResponse.json(
      { error: 'rceptNo parameter is required' },
      { status: 400 }
    );
  }

  if (!tocId) {
    return NextResponse.json(
      { error: 'tocId parameter is required' },
      { status: 400 }
    );
  }

  try {
    const content = await getSectionContent(rceptNo, tocId);

    if (content.error) {
      return NextResponse.json({
        success: false,
        error: content.error,
      });
    }

    return NextResponse.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error('Disclosure section API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get section content',
      },
      { status: 500 }
    );
  }
}

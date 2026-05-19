/**
 * DART API 상태 조회 엔드포인트
 *
 * GET /api/dart/status
 * - Rate Limit 상태 조회
 * - 차단 상태 확인
 *
 * POST /api/dart/status/clear
 * - 차단 상태 수동 해제 (관리자용)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRateLimitState,
  clearBlockedState,
  type RateLimitState,
} from '@/lib/services/dart/rate-limiter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dart/status
 * DART API 상태 조회
 */
export async function GET(): Promise<NextResponse> {
  try {
    const state = await getRateLimitState();

    return NextResponse.json({
      success: true,
      data: state,
    });
  } catch (error) {
    console.error('[DART Status API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get DART API status',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dart/status
 * 차단 상태 해제 (관리자용)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    if (body.action === 'clear') {
      await clearBlockedState();
      const state = await getRateLimitState();

      return NextResponse.json({
        success: true,
        message: 'Block state cleared',
        data: state,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action. Use { action: "clear" }',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[DART Status API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update DART API status',
      },
      { status: 500 }
    );
  }
}

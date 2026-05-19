/**
 * DART 감사의견 API
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuditOpinions } from '@/lib/external/dart-api';
import type { DartAuditOpinion } from '@/types/dart';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const corpCode = searchParams.get('corpCode');
    const startYear = parseInt(searchParams.get('startYear') || String(new Date().getFullYear() - 5));
    const endYear = parseInt(searchParams.get('endYear') || String(new Date().getFullYear()));

    if (!corpCode) {
      return NextResponse.json(
        { success: false, error: 'corpCode is required' },
        { status: 400 }
      );
    }

    // 연도 범위에 대해 감사의견 조회
    const allAuditOpinions: DartAuditOpinion[] = [];
    for (let year = endYear; year >= startYear; year--) {
      const opinions = await getAuditOpinions(corpCode, String(year));
      if (opinions && opinions.length > 0) {
        allAuditOpinions.push(...opinions);
      }
    }

    // 감사의견 요약 생성 (오리지널 스타일)
    let unqualifiedCount = 0;
    let qualifiedCount = 0;
    let adverseCount = 0;
    let disclaimerCount = 0;
    let consecutiveUnqualified = 0;
    let hasEmphasis = false;
    let countingConsecutive = true;

    for (const opinion of allAuditOpinions) {
      const opinionText = opinion.auditOpinion || '';

      if (opinionText.includes('적정') && !opinionText.includes('한정') && !opinionText.includes('부적정')) {
        unqualifiedCount++;
        if (countingConsecutive) consecutiveUnqualified++;
      } else {
        countingConsecutive = false;
        if (opinionText.includes('한정')) qualifiedCount++;
        else if (opinionText.includes('부적정')) adverseCount++;
        else if (opinionText.includes('의견거절') || opinionText.includes('거절')) disclaimerCount++;
      }

      if (opinion.emphsMatter && opinion.emphsMatter.trim() !== '' && opinion.emphsMatter !== '-') {
        hasEmphasis = true;
      }
    }

    const summary = {
      totalYears: allAuditOpinions.length,
      unqualifiedCount,
      qualifiedCount,
      adverseCount,
      disclaimerCount,
      consecutiveUnqualified,
      hasEmphasis,
    };

    // 오리지널 medigatenews 응답 구조에 맞춤
    return NextResponse.json({
      success: true,
      data: {
        corpCode,
        startYear,
        endYear,
        opinions: allAuditOpinions,  // 컴포넌트가 기대하는 필드명
        auditOpinions: allAuditOpinions,  // 하위호환
        summary,
      },
    });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

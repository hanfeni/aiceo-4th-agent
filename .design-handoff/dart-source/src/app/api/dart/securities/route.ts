/**
 * DART 증권발행 API
 * Agent 4 전용
 *
 * 유상증자, 전환사채(CB), 교환사채(EB), 신주인수권부사채(BW) 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPaidInCapitalIncrease,
  getConvertibleBonds,
  getExchangeableBonds,
  getBondsWithWarrant,
} from '@/lib/external/dart-api';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const corpCode = searchParams.get('corpCode');
    const startYear = searchParams.get('startYear') || String(new Date().getFullYear() - 5);
    const endYear = searchParams.get('endYear') || String(new Date().getFullYear());
    const type = searchParams.get('type'); // 'piic' | 'cb' | 'eb' | 'bw' | null (all)

    if (!corpCode) {
      return NextResponse.json(
        { success: false, error: 'corpCode is required' },
        { status: 400 }
      );
    }

    const startYearNum = parseInt(startYear);
    const endYearNum = parseInt(endYear);

    // 날짜 옵션 객체 (연도를 날짜 문자열로 변환)
    const dateOptions = {
      beginDate: `${startYear}0101`,
      endDate: `${endYear}1231`,
    };

    // 특정 타입만 요청한 경우
    if (type) {
      let data;
      switch (type) {
        case 'piic':
          data = await getPaidInCapitalIncrease(corpCode, dateOptions);
          break;
        case 'cb':
          data = await getConvertibleBonds(corpCode, dateOptions);
          break;
        case 'eb':
          data = await getExchangeableBonds(corpCode, dateOptions);
          break;
        case 'bw':
          data = await getBondsWithWarrant(corpCode, dateOptions);
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Invalid type. Must be: piic, cb, eb, or bw' },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        data: {
          corpCode,
          startYear: startYearNum,
          endYear: endYearNum,
          type,
          items: data || [],
          count: data?.length || 0,
        },
      });
    }

    // 전체 조회 (병렬)
    const [piic, cb, eb, bw] = await Promise.all([
      getPaidInCapitalIncrease(corpCode, dateOptions).catch(() => []),
      getConvertibleBonds(corpCode, dateOptions).catch(() => []),
      getExchangeableBonds(corpCode, dateOptions).catch(() => []),
      getBondsWithWarrant(corpCode, dateOptions).catch(() => []),
    ]);

    // 오리지널 medigatenews 응답 구조에 맞춤 (복수형 필드명 사용)
    return NextResponse.json({
      success: true,
      data: {
        corpCode,
        startYear: startYearNum,
        endYear: endYearNum,
        // 컴포넌트가 기대하는 복수형 필드명
        paidInCapitalIncreases: piic || [],
        convertibleBonds: cb || [],
        exchangeableBonds: eb || [],
        bondWithWarrants: bw || [],
        // 하위호환 (단수형)
        paidInCapitalIncrease: piic || [],
        bondsWithWarrant: bw || [],
        summary: {
          piicCount: piic?.length || 0,
          cbCount: cb?.length || 0,
          ebCount: eb?.length || 0,
          bwCount: bw?.length || 0,
          totalCount: (piic?.length || 0) + (cb?.length || 0) + (eb?.length || 0) + (bw?.length || 0),
        },
        totalCount: (piic?.length || 0) + (cb?.length || 0) + (eb?.length || 0) + (bw?.length || 0),
      },
    });
  } catch (error) {
    console.error('Securities API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

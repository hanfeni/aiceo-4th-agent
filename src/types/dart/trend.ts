/**
 * DART 트렌드 타입 — 시계열 데이터 포인트 + 가용 기간.
 *
 * 이식 출처: medigate-manager `types/dart.ts`(10fb7f4) 208~253행.
 * 기능축 분리(STRUCTURAL #2). 이 파일 = "시계열·가용성" 축.
 * D3 trend/ 모듈(annual/quarterly_unit/yearly_cumulative 조립)이 소비.
 */

/** 트렌드 유형 */
export type TrendType =
  | 'annual'              // 5개년 연간
  | 'quarterly_unit'      // 최근 N개 분기 (단위 금액)
  | 'quarterly_cumulative'// 분기 누적
  | 'yearly_cumulative';  // 특정 연도 Q1→Q4

/** 트렌드 데이터 포인트 */
export interface TrendDataPoint {
  year: number;
  quarter?: number;
  period: string;           // "2024Q3", "2024H1", "2024"
  periodLabel: string;      // "2024년 3분기", "2024년 상반기", "2024년"
  value: number | null;
  amount?: number;          // 금액 (원)
  ratio?: number;           // 비율 (%)
  growthRate?: number;      // QoQ 성장률
  yoyRate?: number;         // YoY 성장률
}

/** 재무 트렌드 */
export interface DartFinancialTrend {
  indicator: string;        // 지표명
  indicatorKey: string;     // 지표 키 (영문)
  unit?: string;            // 단위
  dataSource: 'financial' | 'workforce' | 'governance' | 'dividend';
  trendType: TrendType;
  dataPoints: TrendDataPoint[];
}

// ==================== 가용 기간 ====================

/** 연도별 가용 보고서 */
export interface AvailableYear {
  year: number;
  q1Available: boolean;     // 11013
  q2Available: boolean;     // 11012 (반기)
  q3Available: boolean;     // 11014
  annualAvailable: boolean; // 11011 (Q4)
}

/** 기업 가용 기간 정보 */
export interface AvailablePeriods {
  corpCode: string;
  years: AvailableYear[];
  latestYear: number;
  latestQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
}

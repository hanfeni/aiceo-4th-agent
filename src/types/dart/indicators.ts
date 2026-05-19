/**
 * DART 재무지표 메타 — 그룹/정의/데이터 가용성/표시설정 상수
 * + 순수 판정 함수(getIndicatorDeltaConfig).
 *
 * 이식 출처: medigate-manager `types/dart.ts`(10fb7f4) 334~712·727~1240행.
 * 기능축 분리(STRUCTURAL #2). 이 파일 = "지표 카탈로그·가용성·메타" 축.
 *
 * 미이식 (STRUCTURAL #2 — 원본 복사 금지, 무관 코드 제거):
 *  - getGrowthColorClass / getGrowthColorClassByIndicator /
 *    formatGrowthForTable (원본 1255~1286·1361~1374행) = Tailwind
 *    색상 클래스('text-red-500')·UI 셀 포맷 유틸. 본 프로젝트는
 *    standalone UI 비목표(PRD §3.9) — 분석 백엔드에 UI 의존 유입 0.
 *    (사용자 HITL 확정 2026-05-19 — D1 검증 충돌 정합화, R8.)
 *  이식한 순수 함수(UI 비의존 — 후속 D3 trend/·D5 context-formatter
 *  가 분석 텍스트 생성에 소비): getIndicatorDeltaConfig(비교축 판정),
 *  getChangeUnit, shouldShowGrowth, formatGrowthRate, formatGrowthFull,
 *  extractGrowthRate. 전부 데이터 가용성 테이블/표시설정과 강결합 →
 *  카탈로그와 동거가 맞음(분리 시 순환).
 *
 * INDICATOR_DISPLAY_CONFIG 는 UI 렌더링이 아니라 분석 프롬프트가
 * 지표 formula/description/signMeaning 을 LLM 에 설명하는 컨텍스트
 * 메타데이터 — D5 context-formatter / D7 dartPrompts 가 소비.
 */

import type { TrendDataPoint } from "./trend";

/** 지표 그룹 */
export type IndicatorGroup =
  | 'core'          // 핵심
  | 'profitability' // 수익성
  | 'stability'     // 안정성
  | 'growth'        // 성장성
  | 'efficiency'    // 효율성
  | 'cashflow'      // 현금흐름
  | 'workforce'     // 인력
  | 'governance'    // 지배구조
  | 'dividend';     // 배당

/** 재무 지표 정의 */
export interface IndicatorDefinition {
  key: string;
  name: string;
  group: IndicatorGroup;
  unit: '%' | '배' | '원' | '명' | '년' | '회';
  description?: string;
  formula?: string;
}

/** 계산된 재무 지표 */
export interface CalculatedIndicator {
  key: string;
  name: string;
  value: number | null;
  unit: string;
  group: IndicatorGroup;
  prevValue?: number | null;  // 전기 값
  growthRate?: number | null; // QoQ/HoH 성장률 (전분기/전반기 대비)
  yoyRate?: number | null;    // YoY 성장률 (전년동기 대비)
}

/** 지표 계산 결과 */
export interface IndicatorResult {
  corpCode: string;
  year: number;
  quarter?: number;
  reportCode: string;
  indicators: CalculatedIndicator[];
  byGroup: Record<IndicatorGroup, CalculatedIndicator[]>;
}

/**
 * 지표별 데이터 가용성 매핑
 * - dataSource: 데이터 소스 타입 (financial/workforce/governance/dividend)
 * - annual: 연간 데이터 지원 여부
 * - quarterly: 분기 패턴 ('QF'=전분기, 'QH'=반기, false=미지원)
 * - cumulative: 누적 패턴 ('CF'=전분기, 'CP'=부분, false=미지원)
 * - latestPeriod: 대시보드 최신값 기준 ('quarterly'=최신분기, 'annual'=최신연간)
 */
export interface IndicatorDataAvailability {
  dataSource: 'financial' | 'workforce' | 'governance' | 'dividend';
  annual: boolean;
  quarterly: 'QF' | 'QH' | false;
  cumulative: 'CF' | 'CP' | false;
  latestPeriod: 'quarterly' | 'annual';
}

export const INDICATOR_DATA_AVAILABILITY: Record<string, IndicatorDataAvailability> = {
  // === 핵심(core) - 재무제표 API ===
  revenue:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: 'CF', latestPeriod: 'quarterly' },
  operatingIncome: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: 'CF', latestPeriod: 'quarterly' },
  netIncome:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: 'CP', latestPeriod: 'quarterly' },
  debtRatio:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  roe:             { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 수익성(profitability) - 재무제표 API ===
  grossProfitMargin:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  operatingProfitMargin: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  netProfitMargin:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  roa:                   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  eps:                   { dataSource: 'financial', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },

  // === 안정성(stability) - 재무제표 API ===
  currentRatio:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  quickRatio:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  interestCoverage: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  debtDependency:   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  netDebtRatio:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 성장성(growth) - 재무제표 API ===
  revenueGrowth:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  operatingIncomeGrowth: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  netIncomeGrowth:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  assetGrowth:           { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  equityGrowth:          { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 효율성(efficiency) - 재무제표 API ===
  assetTurnover:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  receivablesTurnover:   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  inventoryTurnover:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  payablesTurnover:      { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  tangibleAssetTurnover: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 현금흐름(cashflow) - 재무제표 API ===
  operatingCF: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  investingCF: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  financingCF: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  fcf:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  cashRatio:   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 인력(workforce) - 직원현황 API ===
  revenuePerEmployee: { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  avgSalary:          { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  regularRatio:       { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  avgTenure:          { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  genderRatio:        { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  employeeCount:      { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },

  // === 지배구조(governance) - 주주/임원현황 API ===
  largestShareholderRatio: { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  relatedPartyRatio:       { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  executiveCount:          { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  outsideDirectorRatio:    { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  femaleExecutiveRatio:    { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },

  // === 배당(dividend) - 배당정보 API ===
  dps:           { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  payoutRatio:   { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  dividendYield: { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  totalDividend: { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
};

/**
 * 지표별 Delta(비교축) 설정 조회 — 순수 함수.
 * @returns label='QoQ'|'HoH'|'YoY', rateField='growthRate'|'yoyRate'
 */
export function getIndicatorDeltaConfig(
  indicatorKey: string,
): { label: 'QoQ' | 'HoH' | 'YoY'; rateField: 'growthRate' | 'yoyRate' } {
  const availability = INDICATOR_DATA_AVAILABILITY[indicatorKey];

  if (!availability) {
    // 미등록 지표는 YoY 기본값
    return { label: 'YoY', rateField: 'yoyRate' };
  }

  const { quarterly, latestPeriod } = availability;

  // latestPeriod 가 'quarterly' 이고 분기 데이터가 있으면 QoQ 또는 HoH
  if (latestPeriod === 'quarterly' && quarterly) {
    const label = quarterly === 'QH' ? 'HoH' : 'QoQ';
    return { label, rateField: 'growthRate' };
  }

  // 그 외에는 YoY
  return { label: 'YoY', rateField: 'yoyRate' };
}

/** 지표 그룹 정보 */
export const INDICATOR_GROUPS: Record<IndicatorGroup, { name: string; description: string }> = {
  core: { name: '핵심', description: '부채비율, ROE 등 핵심 지표' },
  profitability: { name: '수익성', description: '매출총이익률, 영업이익률, 순이익률, ROA' },
  stability: { name: '안정성', description: '유동비율, 당좌비율, 이자보상배율' },
  growth: { name: '성장성', description: '매출/영업이익/순이익/자산/자본 성장률' },
  efficiency: { name: '효율성', description: '총자산/매출채권/재고자산/매입채무 회전율' },
  cashflow: { name: '현금흐름', description: '영업/투자/재무 현금흐름, FCF' },
  workforce: { name: '인력', description: '직원수, 평균급여, 정규직비율, 평균근속' },
  governance: { name: '지배구조', description: '최대주주지분, 사외이사비율, 여성임원비율' },
  dividend: { name: '배당', description: 'DPS, 배당성향, 배당수익률' },
};

/** 값 타입 */
export type ValueType = 'amount' | 'percent' | 'times' | 'count' | 'years';

/** 성장률 의미 */
export type SignMeaning = 'higher_better' | 'lower_better' | 'neutral';

/** 성장률 표시 방식 */
export type GrowthDisplay = 'yoy' | 'qoq' | 'none';

/** 지표 표시 설정 (분석 프롬프트 컨텍스트 메타 — UI 아님) */
export interface IndicatorDisplayConfig {
  label: string;
  description: string;
  formula: string;
  valueType: ValueType;
  unit: string;
  growthDisplay: GrowthDisplay;
  signMeaning: SignMeaning;
  changeUnit: string;  // '%' 또는 '%p'
}

/**
 * 지표별 표시 설정 매핑 (45개) — formula/description 이 분석 LLM
 * 컨텍스트의 지표 설명 소스. core5·profitability5·stability5·growth5·
 * efficiency5·cashflow5·workforce6·governance5·dividend4.
 */
export const INDICATOR_DISPLAY_CONFIG: Record<string, IndicatorDisplayConfig> = {
  // 핵심 (core) - 5
  revenue: { label: '매출액', description: '기업의 주된 영업활동에서 발생한 총 수익.', formula: '제품/서비스 판매 수익의 총합', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  operatingIncome: { label: '영업이익', description: '주된 영업활동에서 발생한 이익.', formula: '매출액 - 매출원가 - 판매비와관리비', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  netIncome: { label: '당기순이익', description: '모든 수익과 비용을 차감한 최종 이익.', formula: '영업이익 + 영업외수익 - 영업외비용 - 법인세비용', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  debtRatio: { label: '부채비율', description: '자기자본 대비 부채의 비율. 낮을수록 안정적.', formula: '(부채총계 ÷ 자본총계) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'lower_better', changeUnit: '%p' },
  roe: { label: 'ROE', description: '자기자본이익률. 주주 투자 대비 이익 창출 능력.', formula: '(당기순이익 ÷ 자본총계) × 100', valueType: 'percent', unit: '%', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%p' },

  // 수익성 (profitability) - 5
  grossProfitMargin: { label: '매출총이익률', description: '매출액에서 매출원가를 차감한 이익의 비율.', formula: '(매출총이익 ÷ 매출액) × 100', valueType: 'percent', unit: '%', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%p' },
  operatingProfitMargin: { label: '영업이익률', description: '매출액 대비 영업이익의 비율.', formula: '(영업이익 ÷ 매출액) × 100', valueType: 'percent', unit: '%', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%p' },
  netProfitMargin: { label: '순이익률', description: '매출액 대비 당기순이익의 비율.', formula: '(당기순이익 ÷ 매출액) × 100', valueType: 'percent', unit: '%', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%p' },
  roa: { label: 'ROA', description: '총자산이익률. 자산 활용 효율성.', formula: '(당기순이익 ÷ 자산총계) × 100', valueType: 'percent', unit: '%', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%p' },
  eps: { label: 'EPS', description: '주당순이익.', formula: '당기순이익 ÷ 발행주식수', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },

  // 안정성 (stability) - 5
  currentRatio: { label: '유동비율', description: '단기 채무 상환 능력.', formula: '(유동자산 ÷ 유동부채) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  quickRatio: { label: '당좌비율', description: '즉시 현금화 가능한 자산의 비율.', formula: '((유동자산 - 재고자산) ÷ 유동부채) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  interestCoverage: { label: '이자보상배율', description: '영업이익으로 이자비용 감당 능력.', formula: '영업이익 ÷ 이자비용', valueType: 'times', unit: '배', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%' },
  debtDependency: { label: '차입금의존도', description: '총자산 중 차입금 비율.', formula: '((단기+장기차입금+사채) ÷ 자산총계) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'lower_better', changeUnit: '%p' },
  netDebtRatio: { label: '순차입금비율', description: '순차입금의 자기자본 대비 비율.', formula: '((차입금 - 현금) ÷ 자본총계) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'lower_better', changeUnit: '%p' },

  // 성장성 (growth) - 5
  revenueGrowth: { label: '매출 성장률', description: '매출액 증가율.', formula: '((당기 - 전기) ÷ |전기|) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  operatingIncomeGrowth: { label: '영업이익 성장률', description: '영업이익 증가율.', formula: '((당기 - 전기) ÷ |전기|) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  netIncomeGrowth: { label: '순이익 성장률', description: '당기순이익 증가율.', formula: '((당기 - 전기) ÷ |전기|) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  assetGrowth: { label: '자산 성장률', description: '총자산 증가율.', formula: '((당기 - 전기) ÷ |전기|) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  equityGrowth: { label: '자본 성장률', description: '자기자본 증가율.', formula: '((당기 - 전기) ÷ |전기|) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },

  // 효율성 (efficiency) - 5
  assetTurnover: { label: '총자산회전율', description: '자산이 매출 창출에 기여하는 정도.', formula: '매출액 ÷ 평균 자산총계', valueType: 'times', unit: '회', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  receivablesTurnover: { label: '매출채권회전율', description: '매출채권 회수 효율성.', formula: '매출액 ÷ 평균 매출채권', valueType: 'times', unit: '회', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  inventoryTurnover: { label: '재고자산회전율', description: '재고 판매 효율성.', formula: '매출원가 ÷ 평균 재고자산', valueType: 'times', unit: '회', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  payablesTurnover: { label: '매입채무회전율', description: '매입채무 결제 빈도.', formula: '매출원가 ÷ 평균 매입채무', valueType: 'times', unit: '회', growthDisplay: 'yoy', signMeaning: 'neutral', changeUnit: '%' },
  tangibleAssetTurnover: { label: '유형자산회전율', description: '유형자산 활용 효율성.', formula: '매출액 ÷ 평균 유형자산', valueType: 'times', unit: '회', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },

  // 현금흐름 (cashflow) - 5
  operatingCF: { label: '영업활동CF', description: '영업활동에서 발생한 현금흐름.', formula: '당기순이익 + 비현금비용 - 비현금수익 ± 운전자본 변동', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  investingCF: { label: '투자활동CF', description: '투자활동에서 발생한 현금흐름.', formula: '유형자산 취득/처분 + 투자자산 증감', valueType: 'amount', unit: '원', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%' },
  financingCF: { label: '재무활동CF', description: '재무활동에서 발생한 현금흐름.', formula: '차입금 증감 + 유상증자 - 배당금 지급', valueType: 'amount', unit: '원', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%' },
  fcf: { label: '잉여현금흐름', description: 'Free Cash Flow.', formula: '영업활동현금흐름 - 자본적지출(CAPEX)', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  cashRatio: { label: '현금보유비율', description: '총자산 중 현금 비율.', formula: '(현금 ÷ 자산총계) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%p' },

  // 인력 (workforce) - 6
  employeeCount: { label: '직원 수', description: '총 직원 수.', formula: '정규직 + 계약직', valueType: 'count', unit: '명', growthDisplay: 'yoy', signMeaning: 'neutral', changeUnit: '%' },
  revenuePerEmployee: { label: '1인당 매출액', description: '직원 1인당 창출 매출액.', formula: '매출액 ÷ 총 직원수', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  avgSalary: { label: '평균 급여', description: '직원 1인당 평균 연봉.', formula: '급여총액 ÷ 총 직원수', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'neutral', changeUnit: '%' },
  regularRatio: { label: '정규직 비율', description: '전체 직원 중 정규직 비율.', formula: '(정규직 수 ÷ 총 직원수) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  avgTenure: { label: '평균 근속연수', description: '직원들의 평균 근속 기간.', formula: '전체 직원 근속연수 합계 ÷ 총 직원수', valueType: 'years', unit: '년', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%' },
  genderRatio: { label: '남성 비율', description: '전체 직원 중 남성 비율.', formula: '(남성 직원수 ÷ 총 직원수) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%p' },

  // 지배구조 (governance) - 5
  largestShareholderRatio: { label: '최대주주 지분율', description: '최대주주 보유 지분 비율.', formula: '(최대주주 보유주식수 ÷ 발행주식총수) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%p' },
  relatedPartyRatio: { label: '특수관계인 합산', description: '최대주주와 특수관계인 지분 합계.', formula: '((최대주주 + 특수관계인) ÷ 발행주식총수) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%p' },
  executiveCount: { label: '임원 수', description: '등기임원 총 인원수.', formula: '등기이사 + 감사', valueType: 'count', unit: '명', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%' },
  outsideDirectorRatio: { label: '사외이사 비율', description: '전체 이사 중 사외이사 비율.', formula: '(사외이사 수 ÷ 전체 이사 수) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  femaleExecutiveRatio: { label: '여성임원 비율', description: '전체 임원 중 여성 비율.', formula: '(여성 임원수 ÷ 전체 임원수) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },

  // 배당 (dividend) - 4
  dps: { label: '주당배당금', description: '주식 1주당 지급 배당금.', formula: '현금배당총액 ÷ 발행주식수', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
  payoutRatio: { label: '배당성향', description: '순이익 중 배당금 지급 비율.', formula: '(배당금총액 ÷ 당기순이익) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'neutral', changeUnit: '%p' },
  dividendYield: { label: '시가배당율', description: '현재 주가 대비 배당금 비율.', formula: '(주당배당금 ÷ 기말주가) × 100', valueType: 'percent', unit: '%', growthDisplay: 'none', signMeaning: 'higher_better', changeUnit: '%p' },
  totalDividend: { label: '현금배당총액', description: '해당 사업연도 현금배당 총액.', formula: '주당배당금 × 배당지급 대상 주식수', valueType: 'amount', unit: '원', growthDisplay: 'yoy', signMeaning: 'higher_better', changeUnit: '%' },
};

// ==================== 성장률 표시 — UI 비의존 순수 함수 ====================
//
// 이식 출처: medigate `types/dart.ts` 1288~1356행. Tailwind 색상 유틸
// (getGrowthColorClass*·formatGrowthForTable)은 미이식(위 헤더 참조).
// 아래 5개는 색상/DOM 의존 0 — 분석 텍스트(예: "YoY +5.2%") 생성에 쓰여
// D3 trend/·D5 context-formatter 가 소비. 동일입력 동일출력(NFR-18).

/** 지표별 변화량 단위 반환 ('%' 또는 '%p') */
export function getChangeUnit(indicatorKey: string): string {
  return INDICATOR_DISPLAY_CONFIG[indicatorKey]?.changeUnit || '%';
}

/** 성장률 표시 여부 (growthDisplay !== 'none') */
export function shouldShowGrowth(indicatorKey: string): boolean {
  return INDICATOR_DISPLAY_CONFIG[indicatorKey]?.growthDisplay !== 'none';
}

/**
 * 성장률 포맷팅 — 숫자 → 부호 포함 문자열.
 * @param rate 성장률 / @param unit '%' 또는 '%p' / @param includeSign 부호 포함
 */
export function formatGrowthRate(
  rate: number | null | undefined,
  unit: string = '%',
  includeSign: boolean = true,
): string {
  if (rate === null || rate === undefined) return '-';
  const sign = includeSign && rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}${unit}`;
}

/**
 * 성장률 전체 표시 문자열 (예: "YoY +5.2%") — 분석 본문 표기용.
 */
export function formatGrowthFull(
  rate: number | null | undefined,
  indicatorKey: string,
): string {
  if (rate === null || rate === undefined) return '-';
  const { label } = getIndicatorDeltaConfig(indicatorKey);
  const unit = getChangeUnit(indicatorKey);
  return `${label} ${formatGrowthRate(rate, unit)}`;
}

/**
 * DataPoint 에서 지표 비교축에 맞는 성장률 값 추출 — D3 trend/ 의존.
 * rateField 가 yoyRate 면 YoY 우선·growthRate fallback.
 */
export function extractGrowthRate(
  dataPoint: TrendDataPoint | null,
  indicatorKey: string,
): number | null {
  if (!dataPoint) return null;
  const { rateField } = getIndicatorDeltaConfig(indicatorKey);
  if (rateField === 'yoyRate') {
    return dataPoint.yoyRate ?? dataPoint.growthRate ?? null;
  }
  return dataPoint.growthRate ?? null;
}

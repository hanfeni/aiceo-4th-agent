/**
 * DART 지표 카탈로그·분류·계정과목 매핑.
 *
 * 이식 출처: medigate `indicator-calculator.ts`(10fb7f4) 18~230행.
 * 기능축 6분리(STRUCTURAL #2 — 원본 1386줄 단일 복사 금지). 이 파일 =
 * "지표 정의 + 분류 Set + DART 계정과목명 매핑" 축(순수 상수).
 */

import type { IndicatorDefinition } from "@/types/dart";

// ==================== 지표 분류 ====================

/** 비율 기반 지표 */
export const RATIO_INDICATORS = new Set([
  "debtRatio", "roe", "grossProfitMargin", "operatingProfitMargin",
  "netProfitMargin", "roa", "currentRatio", "quickRatio",
  "interestCoverage", "debtDependency", "netDebtRatio",
  "revenueGrowth", "operatingIncomeGrowth", "netIncomeGrowth",
  "assetGrowth", "equityGrowth", "assetTurnover", "receivablesTurnover",
  "inventoryTurnover", "payablesTurnover", "tangibleAssetTurnover",
  "cashRatio",
]);

/** 성장률 지표 */
export const GROWTH_INDICATORS = new Set([
  "revenueGrowth", "operatingIncomeGrowth", "netIncomeGrowth",
  "assetGrowth", "equityGrowth",
]);

/** 효율성(회전율) 지표 */
export const EFFICIENCY_INDICATORS = new Set([
  "assetTurnover", "receivablesTurnover", "inventoryTurnover",
  "payablesTurnover", "tangibleAssetTurnover",
]);

/** 금액 기반 지표 (4Q일 때 연간−3분기누적 필요) */
export const AMOUNT_INDICATORS = new Set([
  "revenue", "operatingIncome", "netIncome", "totalAssets",
  "operatingCF", "investingCF", "financingCF", "fcf", "eps",
]);

// ==================== 지표 정의 ====================

/** 모든 지표 정의 (45개) */
export const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  // 핵심
  { key: "revenue", name: "매출액", group: "core", unit: "원", formula: "매출액" },
  { key: "operatingIncome", name: "영업이익", group: "core", unit: "원", formula: "영업이익" },
  { key: "netIncome", name: "당기순이익", group: "core", unit: "원", formula: "당기순이익" },
  { key: "debtRatio", name: "부채비율", group: "core", unit: "%", formula: "부채총계 / 자본총계 × 100" },
  { key: "roe", name: "ROE", group: "core", unit: "%", formula: "당기순이익 / 자본총계 × 100" },
  // 수익성
  { key: "grossProfitMargin", name: "매출총이익률", group: "profitability", unit: "%", formula: "매출총이익 / 매출액 × 100" },
  { key: "operatingProfitMargin", name: "영업이익률", group: "profitability", unit: "%", formula: "영업이익 / 매출액 × 100" },
  { key: "netProfitMargin", name: "순이익률", group: "profitability", unit: "%", formula: "당기순이익 / 매출액 × 100" },
  { key: "roa", name: "ROA", group: "profitability", unit: "%", formula: "당기순이익 / 자산총계 × 100" },
  { key: "eps", name: "EPS", group: "profitability", unit: "원", formula: "주당순이익" },
  // 안정성
  { key: "currentRatio", name: "유동비율", group: "stability", unit: "%", formula: "유동자산 / 유동부채 × 100" },
  { key: "quickRatio", name: "당좌비율", group: "stability", unit: "%", formula: "(유동자산-재고자산) / 유동부채 × 100" },
  { key: "interestCoverage", name: "이자보상배율", group: "stability", unit: "배", formula: "영업이익 / 금융비용" },
  { key: "debtDependency", name: "차입금의존도", group: "stability", unit: "%", formula: "총차입금 / 자산총계 × 100" },
  { key: "netDebtRatio", name: "순차입금비율", group: "stability", unit: "%", formula: "(총차입금-현금) / 자본총계 × 100" },
  // 성장성
  { key: "revenueGrowth", name: "매출성장률", group: "growth", unit: "%", formula: "(당기-전기) / |전기| × 100" },
  { key: "operatingIncomeGrowth", name: "영업이익성장률", group: "growth", unit: "%", formula: "(당기-전기) / |전기| × 100" },
  { key: "netIncomeGrowth", name: "순이익성장률", group: "growth", unit: "%", formula: "(당기-전기) / |전기| × 100" },
  { key: "assetGrowth", name: "자산성장률", group: "growth", unit: "%", formula: "(당기-전기) / |전기| × 100" },
  { key: "equityGrowth", name: "자본성장률", group: "growth", unit: "%", formula: "(당기-전기) / |전기| × 100" },
  // 효율성
  { key: "assetTurnover", name: "총자산회전율", group: "efficiency", unit: "회", formula: "매출액 / 자산총계" },
  { key: "receivablesTurnover", name: "매출채권회전율", group: "efficiency", unit: "회", formula: "매출액 / 매출채권" },
  { key: "inventoryTurnover", name: "재고자산회전율", group: "efficiency", unit: "회", formula: "매출원가 / 재고자산" },
  { key: "payablesTurnover", name: "매입채무회전율", group: "efficiency", unit: "회", formula: "매출원가 / 매입채무" },
  { key: "tangibleAssetTurnover", name: "유형자산회전율", group: "efficiency", unit: "회", formula: "매출액 / 유형자산" },
  // 현금흐름
  { key: "operatingCF", name: "영업활동CF", group: "cashflow", unit: "원", formula: "영업활동현금흐름" },
  { key: "investingCF", name: "투자활동CF", group: "cashflow", unit: "원", formula: "투자활동현금흐름" },
  { key: "financingCF", name: "재무활동CF", group: "cashflow", unit: "원", formula: "재무활동현금흐름" },
  { key: "fcf", name: "잉여현금흐름", group: "cashflow", unit: "원", formula: "영업CF + 투자CF" },
  { key: "cashRatio", name: "현금보유비율", group: "cashflow", unit: "%", formula: "현금 / 자산총계 × 100" },
  // 인력
  { key: "revenuePerEmployee", name: "1인당 매출액", group: "workforce", unit: "원", formula: "매출액 / 직원수" },
  { key: "avgSalary", name: "평균 급여", group: "workforce", unit: "원", formula: "연간급여총액 / 직원수" },
  { key: "regularRatio", name: "정규직 비율", group: "workforce", unit: "%", formula: "정규직 / 전체직원 × 100" },
  { key: "avgTenure", name: "평균 근속연수", group: "workforce", unit: "년", formula: "평균근속월수 / 12" },
  { key: "genderRatio", name: "남성 비율", group: "workforce", unit: "%", formula: "남성직원 / 전체직원 × 100" },
  // 지배구조
  { key: "largestShareholderRatio", name: "최대주주 지분율", group: "governance", unit: "%", formula: "최대주주 보유주식 / 발행주식총수 × 100" },
  { key: "relatedPartyRatio", name: "특수관계인 합산", group: "governance", unit: "%", formula: "특수관계인 보유주식 합계 / 발행주식총수 × 100" },
  { key: "executiveCount", name: "임원 수", group: "governance", unit: "명", formula: "등기임원 수" },
  { key: "outsideDirectorRatio", name: "사외이사 비율", group: "governance", unit: "%", formula: "사외이사 / 전체이사 × 100" },
  { key: "femaleExecutiveRatio", name: "여성임원 비율", group: "governance", unit: "%", formula: "여성임원 / 전체임원 × 100" },
  // 배당
  { key: "dps", name: "주당배당금", group: "dividend", unit: "원", formula: "주당 현금배당금" },
  { key: "payoutRatio", name: "배당성향", group: "dividend", unit: "%", formula: "배당금총액 / 당기순이익 × 100" },
  { key: "dividendYield", name: "시가배당율", group: "dividend", unit: "%", formula: "주당배당금 / 주가 × 100" },
  { key: "totalDividend", name: "현금배당총액", group: "dividend", unit: "원", formula: "현금배당금 총액" },
];

// ==================== 계정과목 매핑 ====================

/** 계정과목 이름 매핑 (DART API 계정과목명 기준 — 부분 매칭 후보) */
export const ACCOUNT_NAMES: Record<string, string[]> = {
  revenue: [
    "수익(매출액)", "매출액", "영업수익", "매출", "영업이익",
    "매출액(수익)", "수익", "순매출액", "순영업수익",
    "매출 및 기타영업수익", "영업수익(매출액)",
  ],
  operatingIncome: [
    "영업이익", "영업이익(손실)", "영업손익",
    "영업이익(영업손실)", "영업손실", "계속영업이익",
  ],
  netIncome: [
    "당기순이익", "당기순이익(손실)", "당기순손익",
    "분기순이익", "분기순이익(손실)", "분기순손익",
    "반기순이익", "반기순이익(손실)", "반기순손익",
    "총포괄손익", "당기총포괄이익", "당기총포괄손익",
    "지배기업 소유주지분", "지배기업의 소유주에게 귀속되는 당기순이익",
  ],
  grossProfit: [
    "매출총이익", "매출총이익(손실)", "매출총손익",
    "영업총이익", "영업총손익",
  ],
  costOfSales: ["매출원가", "영업비용", "매출비용", "영업원가", "원가"],
  totalAssets: ["자산총계", "자산 총계", "총자산", "자산합계", "자산의 총계"],
  totalEquity: [
    "자본총계", "자본 총계", "총자본", "자본합계", "자본의 총계",
    "지배기업 소유주지분", "지배기업의 소유주에게 귀속되는 자본",
  ],
  totalLiabilities: ["부채총계", "부채 총계", "총부채", "부채합계", "부채의 총계"],
  currentAssets: ["유동자산", "유동자산 합계", "유동자산합계"],
  currentLiabilities: ["유동부채", "유동부채 합계", "유동부채합계"],
  inventory: [
    "재고자산", "재고자산(순액)", "순재고자산",
    "상품및제품", "재공품", "원재료",
  ],
  cash: [
    "현금및현금성자산", "현금 및 현금성자산", "현금및예금",
    "현금", "현금성자산", "현금및현금등가물",
  ],
  receivables: [
    "매출채권", "매출채권및기타채권", "매출채권 및 기타채권",
    "매출채권(순액)", "단기매출채권", "외상매출금",
  ],
  payables: [
    "매입채무", "매입채무및기타채무", "매입채무 및 기타채무",
    "단기매입채무", "외상매입금",
  ],
  tangibleAssets: [
    "유형자산", "유형자산(순액)", "순유형자산",
    "토지,건물및장비", "토지,건물 및 장비",
  ],
  shortTermBorrowings: [
    "단기차입금", "단기금융부채", "단기사채",
    "유동성장기부채", "단기금융차입금",
  ],
  longTermBorrowings: [
    "장기차입금", "장기금융부채", "비유동금융부채",
    "장기금융차입금", "비유동차입금",
  ],
  bonds: ["사채", "전환사채", "신주인수권부사채", "교환사채", "회사채"],
  financeCost: [
    "금융비용", "금융원가", "이자비용",
    "지급이자", "금융비용(손)", "이자비용(금융비용)",
  ],
  operatingCF: [
    "영업활동현금흐름", "영업활동으로인한현금흐름",
    "영업활동 현금흐름", "영업활동으로 인한 현금흐름", "영업활동순현금흐름",
  ],
  investingCF: [
    "투자활동현금흐름", "투자활동으로인한현금흐름",
    "투자활동 현금흐름", "투자활동으로 인한 현금흐름", "투자활동순현금흐름",
  ],
  financingCF: [
    "재무활동현금흐름", "재무활동으로인한현금흐름",
    "재무활동 현금흐름", "재무활동으로 인한 현금흐름", "재무활동순현금흐름",
  ],
  eps: [
    "기본주당이익", "기본주당순이익", "주당순이익",
    "주당이익", "기본주당이익(손실)",
  ],
};

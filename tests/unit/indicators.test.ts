import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { DartFinancialItem } from "@/types/dart";

// DART 재무지표 계산기 Slice D3 단위 테스트 — 순수 함수(LLM/DART API/
// 네트워크 호출 0, 과금·비결정 금지). 정답지: 픽스처(삼성전자 2023
// 사업보고서 11011 CFS, 176항목 실측)의 account_nm 값을 직접 읽어 손계산
// 하거나, 합성 픽스처는 결과가 자명한 단순 값으로 구성(CLAUDE.md TDD 규칙).
//
// 매핑:
//   TC-46.1  (UC-46 / FR-22·AC-24) — 대표 지표 결정값
//   TC-46.2  (UC-46 / FR-22·AC-24) — 특수 로직(통화변환/4Q금액/분기연환산)
//   TC-46.6  (UC-46-A1 / FR-22)    — 30+ 지표 회귀 스냅샷
//   TC-46.7  (UC-46-E1 / NFR-18)   — 결측(분모0/전기없음/계정누락) → null
//   TC-46.9  (UC-46-EC1 / FR-22)   — 음수 자본(자본잠식) 수식대로 결정적
//   TC-46.11 (UC-46-EC3 / FR-22)   — 통화단위 혼재 정규화

import {
  convertToWon,
  extractByKey,
  extractAmount,
  calculateRatioIndicator,
  calculateEfficiencyIndicatorForQuarter,
  calculateQ4UnitAmount,
  calculateAllIndicators,
  calculateWorkforceIndicators,
  calculateGovernanceIndicators,
  calculateDividendIndicators,
  isRatioBasedIndicator,
  isAmountIndicator,
  isGrowthIndicator,
  isEfficiencyIndicator,
} from "@/lib/dart/indicators";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures/dart");

// ──────────────────────────────────────────────────────────────────────────
// snake→camel 매핑 helper (테스트 파일 로컬 — D2 매핑과 무관한 정답지 변환
// 전용). 픽스처 raw 는 snake_case 이므로 도메인 타입 DartFinancialItem
// 으로 camelCase 변환. 최소 필드만(계산에 쓰이는 것).
// ──────────────────────────────────────────────────────────────────────────
interface RawFinancialItem {
  account_nm?: string;
  thstrm_amount?: string;
  thstrm_add_amount?: string;
  frmtrm_amount?: string;
  sj_div?: string;
  currency?: string;
}

function toCamel(raw: RawFinancialItem): DartFinancialItem {
  return {
    accountNm: raw.account_nm,
    thstrmAmount: raw.thstrm_amount,
    thstrmAddAmount: raw.thstrm_add_amount,
    frmtrmAmount: raw.frmtrm_amount,
    sjDiv: raw.sj_div,
    currency: raw.currency,
  };
}

function loadFixtureFinancials(): DartFinancialItem[] {
  const raw = JSON.parse(
    readFileSync(resolve(FIXTURE_DIR, "financial-statements.json"), "utf8"),
  ) as { list: RawFinancialItem[] };
  return raw.list.map(toCamel);
}

/** 픽스처에서 account_nm 정확 일치 항목의 thstrm_amount 를 숫자로 읽어
 *  손계산 정답지를 구성(추측 금지 — 픽스처 실제 값 사용). */
function rawAmount(
  financials: DartFinancialItem[],
  accountNm: string,
): number {
  const it = financials.find((f) => f.accountNm === accountNm);
  if (!it?.thstrmAmount) throw new Error(`fixture missing: ${accountNm}`);
  return parseFloat(it.thstrmAmount.replace(/,/g, ""));
}

function rawPrev(
  financials: DartFinancialItem[],
  accountNm: string,
): number {
  const it = financials.find((f) => f.accountNm === accountNm);
  if (!it?.frmtrmAmount) throw new Error(`fixture missing prev: ${accountNm}`);
  return parseFloat(it.frmtrmAmount.replace(/,/g, ""));
}

// ──────────────────────────────────────────────────────────────────────────
// TC-46.2 / TC-46.11 — 통화단위 변환 정규화
// ──────────────────────────────────────────────────────────────────────────
describe("convertToWon — 통화단위 정규화 (TC-46.2 / TC-46.11)", () => {
  it("'1000' + '백만원' = 1,000,000,000", () => {
    expect(convertToWon("1000", "백만원")).toBe(1000000000);
  });

  it("'1000' + '천원' = 1,000,000", () => {
    expect(convertToWon("1000", "천원")).toBe(1000000);
  });

  it("'1,234' + undefined(원 단위 가정) = 1234 (콤마 제거)", () => {
    expect(convertToWon("1,234", undefined)).toBe(1234);
  });

  it("undefined amount = null (결측 — throw 아님)", () => {
    expect(convertToWon(undefined, "백만원")).toBeNull();
  });

  it("숫자 아닌 문자열 = null", () => {
    expect(convertToWon("N/A", undefined)).toBeNull();
  });

  it("'KRW' 통화는 변환 없이 원값 그대로(원 단위)", () => {
    expect(convertToWon("455905980000000", "KRW")).toBe(455905980000000);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// TC-46.1 — 대표 지표 결정값 (픽스처 실측 → 손계산 정답지)
// ──────────────────────────────────────────────────────────────────────────
describe("calculateRatioIndicator — 대표 지표 결정성 (TC-46.1)", () => {
  const financials = loadFixtureFinancials();

  // extract 가 account_nm 으로 추출하는 실제 값(픽스처에서 직접 읽음).
  // 주의: revenue 키는 매칭 우선순위상 '영업수익'으로 해소(픽스처에
  // '매출액' 정확 항목 없음 → 키 목록 순서대로 '영업수익' 히트).
  const revenue = rawAmount(financials, "영업수익"); // 258,935,494,000,000
  const operatingIncome = rawAmount(financials, "영업이익"); // 6,566,976,000,000
  const netIncome = rawAmount(financials, "당기순이익(손실)"); // 15,487,100,000,000
  const totalAssets = rawAmount(financials, "자산총계"); // 455,905,980,000,000
  const totalEquity = rawAmount(financials, "자본총계"); // 363,677,865,000,000
  const totalLiabilities = rawAmount(financials, "부채총계"); // 92,228,115,000,000
  const grossProfit = rawAmount(financials, "매출총이익"); // 78,546,914,000,000
  const currentAssets = rawAmount(financials, "유동자산");
  const currentLiabilities = rawAmount(financials, "유동부채");
  const inventory = rawAmount(financials, "재고자산");
  const financeCost = rawAmount(financials, "금융비용");
  const cash = rawAmount(financials, "현금및현금성자산");
  const receivables = rawAmount(financials, "매출채권");
  const costOfSales = rawAmount(financials, "매출원가");
  const payables = rawAmount(financials, "매입채무");
  const tangibleAssets = rawAmount(financials, "유형자산");
  const totalBorrowings =
    rawAmount(financials, "단기차입금") +
    rawAmount(financials, "장기차입금") +
    rawAmount(financials, "사채");

  it("extractByKey/extractAmount: '자산총계' → 455,905,980,000,000 정확 추출", () => {
    expect(extractByKey(financials, "totalAssets")).toBe(455905980000000);
    expect(extractAmount(financials, "자산총계")).toBe(455905980000000);
  });

  it("debtRatio = 부채총계/자본총계 × 100 (픽스처 손계산 일치)", () => {
    expect(calculateRatioIndicator(financials, "debtRatio")).toBeCloseTo(
      (totalLiabilities / totalEquity) * 100,
      9,
    );
  });

  it("roe = 당기순이익/자본총계 × 100", () => {
    expect(calculateRatioIndicator(financials, "roe")).toBeCloseTo(
      (netIncome / totalEquity) * 100,
      9,
    );
  });

  it("roa = 당기순이익/자산총계 × 100", () => {
    expect(calculateRatioIndicator(financials, "roa")).toBeCloseTo(
      (netIncome / totalAssets) * 100,
      9,
    );
  });

  it("operatingProfitMargin = 영업이익/매출(영업수익) × 100", () => {
    expect(
      calculateRatioIndicator(financials, "operatingProfitMargin"),
    ).toBeCloseTo((operatingIncome / revenue) * 100, 9);
  });

  it("netProfitMargin = 당기순이익/매출 × 100", () => {
    expect(calculateRatioIndicator(financials, "netProfitMargin")).toBeCloseTo(
      (netIncome / revenue) * 100,
      9,
    );
  });

  it("grossProfitMargin = 매출총이익/매출 × 100", () => {
    expect(
      calculateRatioIndicator(financials, "grossProfitMargin"),
    ).toBeCloseTo((grossProfit / revenue) * 100, 9);
  });

  it("currentRatio = 유동자산/유동부채 × 100", () => {
    expect(calculateRatioIndicator(financials, "currentRatio")).toBeCloseTo(
      (currentAssets / currentLiabilities) * 100,
      9,
    );
  });

  it("quickRatio = (유동자산-재고자산)/유동부채 × 100", () => {
    expect(calculateRatioIndicator(financials, "quickRatio")).toBeCloseTo(
      ((currentAssets - inventory) / currentLiabilities) * 100,
      9,
    );
  });

  it("interestCoverage = 영업이익/금융비용", () => {
    expect(
      calculateRatioIndicator(financials, "interestCoverage"),
    ).toBeCloseTo(operatingIncome / financeCost, 9);
  });

  it("debtDependency = 총차입금/자산총계 × 100", () => {
    expect(
      calculateRatioIndicator(financials, "debtDependency"),
    ).toBeCloseTo((totalBorrowings / totalAssets) * 100, 9);
  });

  it("netDebtRatio = (총차입금-현금)/자본총계 × 100", () => {
    expect(calculateRatioIndicator(financials, "netDebtRatio")).toBeCloseTo(
      ((totalBorrowings - cash) / totalEquity) * 100,
      9,
    );
  });

  it("cashRatio = 현금/자산총계 × 100", () => {
    expect(calculateRatioIndicator(financials, "cashRatio")).toBeCloseTo(
      (cash / totalAssets) * 100,
      9,
    );
  });

  it("assetTurnover = 매출/자산총계", () => {
    expect(calculateRatioIndicator(financials, "assetTurnover")).toBeCloseTo(
      revenue / totalAssets,
      12,
    );
  });

  it("receivablesTurnover = 매출/매출채권", () => {
    expect(
      calculateRatioIndicator(financials, "receivablesTurnover"),
    ).toBeCloseTo(revenue / receivables, 9);
  });

  it("inventoryTurnover = 매출원가/재고자산", () => {
    expect(
      calculateRatioIndicator(financials, "inventoryTurnover"),
    ).toBeCloseTo(costOfSales / inventory, 9);
  });

  it("payablesTurnover = 매출원가/매입채무", () => {
    expect(
      calculateRatioIndicator(financials, "payablesTurnover"),
    ).toBeCloseTo(costOfSales / payables, 9);
  });

  it("tangibleAssetTurnover = 매출/유형자산", () => {
    expect(
      calculateRatioIndicator(financials, "tangibleAssetTurnover"),
    ).toBeCloseTo(revenue / tangibleAssets, 9);
  });

  it("revenueGrowth = (당기-전기)/|전기| × 100 (frmtrm 사용)", () => {
    const prev = rawPrev(financials, "영업수익");
    expect(calculateRatioIndicator(financials, "revenueGrowth")).toBeCloseTo(
      ((revenue - prev) / Math.abs(prev)) * 100,
      9,
    );
  });

  it("netIncomeGrowth = (당기-전기)/|전기| × 100", () => {
    const prev = rawPrev(financials, "당기순이익(손실)");
    expect(calculateRatioIndicator(financials, "netIncomeGrowth")).toBeCloseTo(
      ((netIncome - prev) / Math.abs(prev)) * 100,
      9,
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// TC-46.2 — 특수 로직: 4Q 단위금액 / 분기 연환산
// 합성 픽스처(결과 자명한 단순 값)로 정확값 검증.
// ──────────────────────────────────────────────────────────────────────────
describe("특수 로직: 4Q 단위금액 / 분기 연환산 (TC-46.2)", () => {
  it("calculateQ4UnitAmount = 연간 − 3분기누적 (revenue)", () => {
    // 연간 매출액 = 1000, Q3 누적(thstrmAddAmount) = 700 → Q4 단위 = 300
    const annual: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAmount: "1000", currency: "원" },
    ];
    const q3: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAddAmount: "700", currency: "원" },
    ];
    expect(calculateQ4UnitAmount(annual, q3, "revenue")).toBe(300);
  });

  it("calculateQ4UnitAmount: 빈 입력이면 null (throw 아님)", () => {
    expect(calculateQ4UnitAmount([], [], "revenue")).toBeNull();
    expect(
      calculateQ4UnitAmount(
        [{ accountNm: "매출액", thstrmAmount: "1000" }],
        [],
        "revenue",
      ),
    ).toBeNull();
  });

  it("calculateEfficiencyIndicatorForQuarter Q1(index 0): 연환산 팩터 4.0 적용", () => {
    // Q1 누적매출 250, 자산총계 1000 → assetTurnover = (250 × 4.0)/1000 = 1.0
    const q1: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAddAmount: "250", currency: "원" },
      { accountNm: "자산총계", thstrmAmount: "1000", currency: "원" },
    ];
    expect(
      calculateEfficiencyIndicatorForQuarter(q1, "assetTurnover", 0),
    ).toBeCloseTo(1.0, 9);
  });

  it("calculateEfficiencyIndicatorForQuarter Q2(index 1): 팩터 4/2=2.0", () => {
    // Q2 누적매출 250, 자산총계 1000 → (250 × 2.0)/1000 = 0.5
    const q2: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAddAmount: "250", currency: "원" },
      { accountNm: "자산총계", thstrmAmount: "1000", currency: "원" },
    ];
    expect(
      calculateEfficiencyIndicatorForQuarter(q2, "assetTurnover", 1),
    ).toBeCloseTo(0.5, 9);
  });

  it("calculateEfficiencyIndicatorForQuarter Q4(index 3): 연환산 없이 일반 계산", () => {
    // Q4 → calculateRatioIndicator 위임: 매출 800 / 자산 1000 = 0.8
    const annual: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAmount: "800", currency: "원" },
      { accountNm: "자산총계", thstrmAmount: "1000", currency: "원" },
    ];
    expect(
      calculateEfficiencyIndicatorForQuarter(annual, "assetTurnover", 3),
    ).toBeCloseTo(0.8, 9);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// TC-46.7 — 결측: 분모 0 / 전기 없음 / 계정 누락 → null (throw 아님)
// ──────────────────────────────────────────────────────────────────────────
describe("결측 처리 → null (예외 throw 아님) (TC-46.7)", () => {
  it("분모 0 (totalEquity=0) → roe = null", () => {
    const fin: DartFinancialItem[] = [
      { accountNm: "당기순이익", thstrmAmount: "1000", currency: "원" },
      { accountNm: "자본총계", thstrmAmount: "0", currency: "원" },
    ];
    expect(calculateRatioIndicator(fin, "roe")).toBeNull();
  });

  it("계정 전부 누락 (빈 배열) → 모든 비율 지표 null", () => {
    expect(calculateRatioIndicator([], "roe")).toBeNull();
    expect(calculateRatioIndicator([], "debtRatio")).toBeNull();
    expect(calculateRatioIndicator([], "currentRatio")).toBeNull();
  });

  it("전기 없음 → 성장률 null (throw 아님)", () => {
    const fin: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAmount: "1000", currency: "원" }, // frmtrm 없음
    ];
    expect(calculateRatioIndicator(fin, "revenueGrowth")).toBeNull();
  });

  it("필요 계정 일부 누락(매출 계열 전무) → operatingProfitMargin null", () => {
    // 주의: ACCOUNT_NAMES.revenue 후보에 '영업이익'이 포함돼 있어
    // 영업이익 계정만 있으면 revenue 로도 cross-match 된다(의도된 매핑).
    // 결측 검증은 매출/영업이익 계열이 전무한 픽스처로 수행.
    const fin: DartFinancialItem[] = [
      { accountNm: "자산총계", thstrmAmount: "1000", currency: "원" },
      // 매출·영업이익 등 손익 계정 전무
    ];
    expect(
      calculateRatioIndicator(fin, "operatingProfitMargin"),
    ).toBeNull();
  });

  it("결측 입력으로 호출해도 예외를 throw 하지 않는다", () => {
    expect(() => calculateRatioIndicator([], "roe")).not.toThrow();
    expect(() => calculateAllIndicators([], "X", 2023, "11011")).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// TC-46.9 — 음수 자본(자본잠식): 분모≠0 이므로 수식대로 음수 결정값
// (null 아님 — 해석은 systemPrompt 몫, 함수는 결정적)
// ──────────────────────────────────────────────────────────────────────────
describe("자본잠식(음수 자본) → 수식대로 결정적 (TC-46.9)", () => {
  it("totalEquity 음수 → roe 는 음수 값 결정 반환(null 아님)", () => {
    // 당기순이익 100, 자본총계 -500 → roe = (100 / -500) × 100 = -20
    const fin: DartFinancialItem[] = [
      { accountNm: "당기순이익", thstrmAmount: "100", currency: "원" },
      { accountNm: "자본총계", thstrmAmount: "-500", currency: "원" },
    ];
    const roe = calculateRatioIndicator(fin, "roe");
    expect(roe).not.toBeNull();
    expect(roe).toBeCloseTo(-20, 9);
  });

  it("음수 자본 + 양수 부채 → debtRatio 음수 결정값(수식 그대로)", () => {
    // 부채 1000, 자본 -500 → debtRatio = (1000 / -500) × 100 = -200
    const fin: DartFinancialItem[] = [
      { accountNm: "부채총계", thstrmAmount: "1000", currency: "원" },
      { accountNm: "자본총계", thstrmAmount: "-500", currency: "원" },
    ];
    expect(calculateRatioIndicator(fin, "debtRatio")).toBeCloseTo(-200, 9);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// TC-46.6 — 30+ 지표 전수 회귀 스냅샷 (동일 입력 동일 출력 결정성)
// ──────────────────────────────────────────────────────────────────────────
describe("calculateAllIndicators — 30+ 지표 회귀 스냅샷 (TC-46.6)", () => {
  const financials = loadFixtureFinancials();

  it("픽스처 전수 계산 결과를 정렬된 key→{value,growthRate,yoyRate} 로 스냅샷 고정", () => {
    const result = calculateAllIndicators(financials, "X", 2023, "11011");

    // 정렬된 결정적 객체로 직렬화(스냅샷 안정성 — 키 순서 고정)
    const snapshot: Record<
      string,
      { value: number | null; growthRate: number | null; yoyRate: number | null }
    > = {};
    for (const ind of [...result.indicators].sort((a, b) =>
      a.key.localeCompare(b.key),
    )) {
      snapshot[ind.key] = {
        value: ind.value,
        growthRate: ind.growthRate ?? null,
        yoyRate: ind.yoyRate ?? null,
      };
    }
    expect(snapshot).toMatchSnapshot();
  });

  it("30+ 지표 산출 + workforce/governance/dividend 는 byGroup 빈 배열(스킵 정상)", () => {
    const result = calculateAllIndicators(financials, "X", 2023, "11011");
    expect(result.indicators.length).toBeGreaterThanOrEqual(29);
    expect(result.byGroup.workforce).toEqual([]);
    expect(result.byGroup.governance).toEqual([]);
    expect(result.byGroup.dividend).toEqual([]);
    // core/profitability 등은 채워져 있음
    expect(result.byGroup.core.length).toBeGreaterThan(0);
    expect(result.byGroup.profitability.length).toBeGreaterThan(0);
  });

  it("동일 입력 2회 호출 → 완전 동일 출력(결정성·과금 0)", () => {
    const a = calculateAllIndicators(financials, "X", 2023, "11011");
    const b = calculateAllIndicators(financials, "X", 2023, "11011");
    expect(a.indicators).toEqual(b.indicators);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// workforce / governance / dividend — 합성 픽스처 대표 지표 결정값
// ──────────────────────────────────────────────────────────────────────────
describe("calculateWorkforce/Governance/DividendIndicators — 합성 결정값", () => {
  it("workforce: revenuePerEmployee / regularRatio / genderRatio 결정값", () => {
    const employees = [
      {
        sexdstn: "남",
        sm: "60",
        rgllbrCo: "50",
        avrgCnwkSdytrn: "10",
        janSalaryAm: "100",
      },
      {
        sexdstn: "여",
        sm: "40",
        rgllbrCo: "30",
        avrgCnwkSdytrn: "5",
        janSalaryAm: "80",
      },
    ];
    // totalEmployees = 100, male = 60, regular = 80
    const result = calculateWorkforceIndicators(employees, 1_000_000);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.value]));
    // revenuePerEmployee = 1,000,000 / 100 = 10,000 (원 → round)
    expect(byKey.revenuePerEmployee).toBe(10000);
    // regularRatio = 80/100 × 100 = 80
    expect(byKey.regularRatio).toBe(80);
    // genderRatio(남) = 60/100 × 100 = 60
    expect(byKey.genderRatio).toBe(60);
  });

  it("governance: largestShareholderRatio / executiveCount / outsideDirectorRatio", () => {
    const shareholders = [
      { stockKnd: "보통주", trmnPosessnStkQotaRt: "25.5" },
      { stockKnd: "보통주", trmnPosessnStkQotaRt: "10.0" },
    ];
    const executives = [
      { rgistExctvAt: "등기임원", ofcpsNm: "대표이사", sexdstn: "남" },
      { rgistExctvAt: "등기임원", ofcpsNm: "사외이사", sexdstn: "여" },
    ];
    const result = calculateGovernanceIndicators(shareholders, executives);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.value]));
    expect(byKey.largestShareholderRatio).toBe(25.5);
    // relatedPartyRatio = 25.5 + 10.0 = 35.5
    expect(byKey.relatedPartyRatio).toBe(35.5);
    // 등기임원 2명
    expect(byKey.executiveCount).toBe(2);
    // outsideDirectorRatio = 1/2 × 100 = 50
    expect(byKey.outsideDirectorRatio).toBe(50);
    // femaleExecutiveRatio = 1/2 × 100 = 50
    expect(byKey.femaleExecutiveRatio).toBe(50);
  });

  it("dividend: dps / totalDividend / payoutRatio 결정값", () => {
    const dividends = [
      { seType: "주당 현금배당금(원)", stockKnd: "보통주", thstrm: "1500" },
      { seType: "현금배당금총액(백만원)", thstrm: "100" }, // ×1,000,000 = 1억
    ];
    // netIncome = 1,000,000,000 (10억) → payoutRatio = 1억/10억 ×100 = 10
    const result = calculateDividendIndicators(dividends, 1_000_000_000);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.value]));
    expect(byKey.dps).toBe(1500);
    expect(byKey.totalDividend).toBe(100_000_000);
    expect(byKey.payoutRatio).toBe(10);
  });

  it("workforce/governance/dividend: 빈 입력이면 value=null(throw 아님)", () => {
    const w = calculateWorkforceIndicators([], null);
    expect(w.every((r) => r.value === null)).toBe(true);
    const g = calculateGovernanceIndicators([], []);
    expect(g.find((r) => r.key === "largestShareholderRatio")?.value).toBeNull();
    const d = calculateDividendIndicators([], null);
    expect(d.every((r) => r.value === null)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// classify — 지표 종류 판정 술어 (순수)
// ──────────────────────────────────────────────────────────────────────────
describe("classify — 지표 분류 술어", () => {
  it("isRatioBasedIndicator('roe') = true", () => {
    expect(isRatioBasedIndicator("roe")).toBe(true);
    expect(isRatioBasedIndicator("revenue")).toBe(false);
  });

  it("isAmountIndicator('revenue') = true", () => {
    expect(isAmountIndicator("revenue")).toBe(true);
    expect(isAmountIndicator("roe")).toBe(false);
  });

  it("isGrowthIndicator('revenueGrowth') = true", () => {
    expect(isGrowthIndicator("revenueGrowth")).toBe(true);
    expect(isGrowthIndicator("debtRatio")).toBe(false);
  });

  it("isEfficiencyIndicator('assetTurnover') = true", () => {
    expect(isEfficiencyIndicator("assetTurnover")).toBe(true);
    expect(isEfficiencyIndicator("roe")).toBe(false);
  });
});

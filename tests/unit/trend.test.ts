/**
 * DART 트렌드 5분리(Slice D4) 단위 테스트 — 역검증(green 기대).
 *
 * 대상: src/lib/dart/trend/{cache,financial,points,workforce,governance,
 *       dividend,index}.ts
 *
 * 네트워크/실제 DART/LLM 호출 0 — D2 api 함수(@/lib/dart/api)는 전부
 * vi.mock 으로 격리(과금·비결정 금지, CLAUDE.md "Mock 금지"의 예외 =
 * 외부 그래프/HTTP 는 모킹 필수). 정답지는 합성 픽스처의 자명한 값 또는
 * 손계산(추측 금지 — CLAUDE.md TDD 규칙). 트렌드 시계열은 연도별 다른
 * 단순 financials 로 결과가 자명하게.
 *
 * TC 매핑:
 *  - TC-46.3  (UC-46 / FR-23·AC-24)  트렌드 조립 결정성
 *               (annual/quarterly_unit/yearly_cumulative)
 *  - TC-46.8  (UC-46-E2 / FR-21·NFR-18) — 본 파일 범위 외(parser 측)
 *  - TC-46.10 (UC-46-EC2 / FR-23·AC-24) 가용성 차이 모드 결정
 *  - TC-41.21 (UC-41-EC3 / FR-23·AC-24) workforce/governance=반기 ·
 *               dividend=연간 가용성(보고서코드 검증)
 *  - NFR-18   동일입력 동일출력(LLM/네트워크 0)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { DartFinancialItem, DartEmployee } from "@/types/dart";

// ──────────────────────────────────────────────────────────────────────────
// D2 api 모킹 (@/lib/dart/api 배럴 — trend/ 가 import 하는 단일 진입점)
// 네트워크 0. 호출 인자(reportCode)는 가용성 차이 검증의 정답지.
// ──────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/dart/api", () => ({
  getFinancialStatements: vi.fn(),
  getEmployees: vi.fn(),
  getMajorShareholders: vi.fn(),
  getExecutives: vi.fn(),
  getDividends: vi.fn(),
  getRecentDisclosures: vi.fn(),
}));

import {
  getFinancialStatements,
  getEmployees,
  getMajorShareholders,
  getExecutives,
  getDividends,
} from "@/lib/dart/api";
import {
  clearRequestCache,
  getCachedFinancialStatements,
  preloadFinancialStatements,
} from "@/lib/dart/trend";
import {
  getFinancialTrend,
  getIndicatorTrend,
} from "@/lib/dart/trend";
import {
  createFinancialDataPoint,
  createEfficiencyDataPoint,
  createCumulativeDataPoint,
  createGrowthDataPoint,
  createQ4AmountDataPoint,
} from "@/lib/dart/trend";

const mockGetFin = vi.mocked(getFinancialStatements);
const mockGetEmp = vi.mocked(getEmployees);
const mockGetShareholders = vi.mocked(getMajorShareholders);
const mockGetExecs = vi.mocked(getExecutives);
const mockGetDiv = vi.mocked(getDividends);

// ──────────────────────────────────────────────────────────────────────────
// 합성 픽스처 — BS 최소셋. extractByKey 정확매칭(accountNm===대상)으로
// 결과 자명. (자산/부채/자본/매출/순익만, 단위=원, currency 미지정)
// ──────────────────────────────────────────────────────────────────────────
function fin(
  vals: {
    assets?: number;
    liab?: number;
    equity?: number;
    revenue?: number;
    netIncome?: number;
    operatingIncome?: number;
  },
): DartFinancialItem[] {
  const items: DartFinancialItem[] = [];
  const push = (nm: string, amt: number | undefined) => {
    if (amt !== undefined) {
      items.push({ accountNm: nm, thstrmAmount: String(amt) });
    }
  };
  push("자산총계", vals.assets);
  push("부채총계", vals.liab);
  push("자본총계", vals.equity);
  push("매출액", vals.revenue);
  push("당기순이익", vals.netIncome);
  push("영업이익", vals.operatingIncome);
  return items;
}

const CURRENT_YEAR = new Date().getFullYear();

beforeEach(() => {
  clearRequestCache();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════
// 1. cache — 요청 레벨 캐시 + preload [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("trend/cache 요청 레벨 캐시 + preload", () => {
  it("getCachedFinancialStatements: 첫 호출은 D2 위임, 같은 키 재호출은 캐시 히트(D2 1회)", async () => {
    const fx = fin({ assets: 100 });
    mockGetFin.mockResolvedValue(fx);

    const a = await getCachedFinancialStatements("00126380", "2023", "11011");
    const b = await getCachedFinancialStatements("00126380", "2023", "11011");

    expect(a).toEqual(fx);
    expect(b).toBe(a); // 동일 참조(캐시 객체 그대로)
    expect(mockGetFin).toHaveBeenCalledTimes(1); // 재호출은 네트워크 0
    expect(mockGetFin).toHaveBeenCalledWith("00126380", "2023", "11011");
  });

  it("clearRequestCache 후엔 캐시 무효 → D2 재위임", async () => {
    mockGetFin.mockResolvedValue(fin({ assets: 1 }));
    await getCachedFinancialStatements("X", "2023", "11011");
    clearRequestCache();
    await getCachedFinancialStatements("X", "2023", "11011");
    expect(mockGetFin).toHaveBeenCalledTimes(2);
  });

  it("다른 키(연도/보고서코드)는 별도 캐시 엔트리", async () => {
    mockGetFin.mockResolvedValue(fin({ assets: 1 }));
    await getCachedFinancialStatements("X", "2022", "11011");
    await getCachedFinancialStatements("X", "2023", "11011");
    await getCachedFinancialStatements("X", "2023", "11012");
    expect(mockGetFin).toHaveBeenCalledTimes(3);
  });

  it("preloadFinancialStatements: 병렬 조회 후 캐시 적재 → 이후 조회 캐시 히트", async () => {
    mockGetFin.mockResolvedValue(fin({ assets: 1 }));
    // annual 2년 + quarterly 2 = preload 가 4건 적재
    const r = await preloadFinancialStatements("X", 2, 2);
    expect(r).toEqual({ annual: 2, quarterly: 2 });
    const callsAfterPreload = mockGetFin.mock.calls.length;
    expect(callsAfterPreload).toBeGreaterThan(0);

    // preload 가 채운 연간 키 재조회 → 추가 네트워크 0
    await getCachedFinancialStatements("X", String(CURRENT_YEAR - 1), "11011");
    expect(mockGetFin).toHaveBeenCalledTimes(callsAfterPreload);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. TC-46.3 — financial annual 조립 결정성 + 디스패처 라우팅 [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-46.3 getFinancialTrend(annual) 결정적 시계열", () => {
  it("연도별 다른 financials → dataPoints 가 자명한 결정 시계열(amount)", async () => {
    // CURRENT_YEAR-3 .. CURRENT_YEAR-1 (annual 3개년, 11011)
    const y1 = CURRENT_YEAR - 3;
    const y2 = CURRENT_YEAR - 2;
    const y3 = CURRENT_YEAR - 1;
    mockGetFin.mockImplementation(async (_c, year) => {
      if (year === String(y1)) return fin({ revenue: 1000 });
      if (year === String(y2)) return fin({ revenue: 2000 });
      if (year === String(y3)) return fin({ revenue: 3500 });
      return [];
    });

    const trend = await getFinancialTrend("X", "annual", "revenue", 3);

    expect(trend.dataSource).toBe("financial");
    expect(trend.trendType).toBe("annual");
    expect(trend.indicator).toBe("매출액");
    expect(trend.dataPoints.map((p) => p.period)).toEqual([
      String(y1),
      String(y2),
      String(y3),
    ]);
    expect(trend.dataPoints.map((p) => p.amount)).toEqual([1000, 2000, 3500]);
    expect(trend.dataPoints.map((p) => p.value)).toEqual([1000, 2000, 3500]);
    expect(trend.dataPoints.map((p) => p.periodLabel)).toEqual([
      `${y1}년`,
      `${y2}년`,
      `${y3}년`,
    ]);
  });

  it("annual ratio 지표(debtRatio): 손계산 비율 + 데이터 없는 연도 누락", async () => {
    const y2 = CURRENT_YEAR - 2;
    const y3 = CURRENT_YEAR - 1;
    mockGetFin.mockImplementation(async (_c, year) => {
      // y(CURRENT_YEAR-3): 데이터 없음 → 누락
      if (year === String(y2)) return fin({ liab: 200, equity: 100 }); // 200%
      if (year === String(y3)) return fin({ liab: 150, equity: 100 }); // 150%
      return [];
    });

    const trend = await getFinancialTrend("X", "annual", "debtRatio", 3);
    expect(trend.dataPoints.map((p) => p.period)).toEqual([
      String(y2),
      String(y3),
    ]);
    // debtRatio = 부채/자본*100, 소수 2자리 반올림
    expect(trend.dataPoints.map((p) => p.ratio)).toEqual([200, 150]);
  });

  it("동일 입력 동일 출력(NFR-18 결정성) — 2회 호출 deep equal", async () => {
    mockGetFin.mockResolvedValue(fin({ revenue: 777 }));
    const a = await getFinancialTrend("X", "annual", "revenue", 2);
    clearRequestCache();
    const b = await getFinancialTrend("X", "annual", "revenue", 2);
    expect(a).toEqual(b);
  });

  it("getIndicatorTrend(dataSource='financial') → getFinancialTrend 라우팅", async () => {
    mockGetFin.mockResolvedValue(fin({ revenue: 100 }));
    const trend = await getIndicatorTrend(
      "X",
      "revenue",
      "financial",
      "annual",
      3,
    );
    expect(trend.dataSource).toBe("financial");
    expect(mockGetEmp).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. TC-46.3 — quarterly_unit / yearly_cumulative 조립 + 성장률 [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-46.3 quarterly_unit / yearly_cumulative + QoQ/YoY", () => {
  it("quarterly_unit(2분기, 일반 amount 지표): 시계열 오름차순 + growthRate(QoQ)", async () => {
    // q index 0..3 → reportCodes ["11013","11012","11014","11011"]
    // 최근 2분기: CURRENT_YEAR Q1(11013)=netIncome 100,
    //              직전 = CURRENT_YEAR-1 Q4 처리는 q===3 → createQ4Amount
    // 단순화: CURRENT_YEAR Q1·Q2 만 데이터 부여(나머지 빈배열)
    mockGetFin.mockImplementation(async (_c, year, rc) => {
      if (year === String(CURRENT_YEAR) && rc === "11013")
        return fin({ netIncome: 100 }); // Q1
      if (year === String(CURRENT_YEAR) && rc === "11012")
        return fin({ netIncome: 250 }); // Q2
      return [];
    });

    // growthRate(QoQ)는 디스패처(getIndicatorTrend)가 후처리한다
    // (financial.ts: getFinancialTrend 자체는 성장률 미계산 — 설계).
    const trend = await getIndicatorTrend(
      "X",
      "netIncome",
      "financial",
      "quarterly_unit",
      2,
    );
    // unshift 로 누적 → 시계열 오름차순(Q1 먼저, Q2 나중)
    expect(trend.dataPoints.map((p) => p.period)).toEqual([
      `${CURRENT_YEAR}Q1`,
      `${CURRENT_YEAR}Q2`,
    ]);
    expect(trend.dataPoints.map((p) => p.amount)).toEqual([100, 250]);
    // QoQ growthRate = (250-100)/|100|*100 = 150.0 (amount 지표 → 상대%)
    expect(trend.dataPoints[1].growthRate).toBe(150);
    expect(trend.dataPoints[0].growthRate).toBeUndefined();
  });

  it("yearly_cumulative: year-1·year 의 Q1..Q4 누적 + YoY(전년 동분기)", async () => {
    const Y = 2023;
    // 누적금액(thstrmAddAmount) 기반 — createCumulativeDataPoint 가
    // TREND_ACCOUNT_NAMES[revenue] → extractAddAmount 사용
    const cum = (add: number): DartFinancialItem[] => [
      { accountNm: "매출액", thstrmAddAmount: String(add) },
    ];
    mockGetFin.mockImplementation(async (_c, year, rc) => {
      // 2022 Q1(11013)=100, 2023 Q1(11013)=150 → YoY = +50%
      if (year === "2022" && rc === "11013") return cum(100);
      if (year === "2023" && rc === "11013") return cum(150);
      return [];
    });

    const trend = await getFinancialTrend(
      "X",
      "yearly_cumulative",
      "revenue",
      4,
      Y,
    );
    const p2022 = trend.dataPoints.find((p) => p.period === "2022Q1");
    const p2023 = trend.dataPoints.find((p) => p.period === "2023Q1");
    expect(p2022?.amount).toBe(100);
    expect(p2023?.amount).toBe(150);
    // YoY = (150-100)/|100|*100 = 50.0 (소수 1자리)
    expect(p2023?.yoyRate).toBe(50);
  });

  it("percent 지표(debtRatio) annual: growthRate=절대차(%p), yoyRate=growthRate", async () => {
    const y2 = CURRENT_YEAR - 2;
    const y3 = CURRENT_YEAR - 1;
    mockGetFin.mockImplementation(async (_c, year) => {
      if (year === String(y2)) return fin({ liab: 100, equity: 100 }); // 100%
      if (year === String(y3)) return fin({ liab: 130, equity: 100 }); // 130%
      return [];
    });
    // 성장률은 디스패처가 후처리 (getFinancialTrend 단독은 미계산)
    const trend = await getIndicatorTrend(
      "X",
      "debtRatio",
      "financial",
      "annual",
      3,
    );
    // valueType='percent' → 절대차: 130 - 100 = 30.0 %p
    expect(trend.dataPoints[1].growthRate).toBe(30);
    // annual → yoyRate = growthRate
    expect(trend.dataPoints[1].yoyRate).toBe(30);
  });

  it("amount 지표 annual growthRate: 상대변화율(%), annual→yoyRate=growthRate", async () => {
    const y2 = CURRENT_YEAR - 2;
    const y3 = CURRENT_YEAR - 1;
    mockGetFin.mockImplementation(async (_c, year) => {
      if (year === String(y2)) return fin({ revenue: 1000 });
      if (year === String(y3)) return fin({ revenue: 1250 });
      return [];
    });
    const trend = await getIndicatorTrend(
      "X",
      "revenue",
      "financial",
      "annual",
      3,
    );
    // (1250-1000)/|1000|*100 = 25.0
    expect(trend.dataPoints[1].growthRate).toBe(25);
    expect(trend.dataPoints[1].yoyRate).toBe(25);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. points — 데이터포인트 생성 함수군 결정성 [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("trend/points 데이터포인트 생성 결정성", () => {
  it("createFinancialDataPoint: amount 지표(revenue) 직접 추출", () => {
    const p = createFinancialDataPoint(
      fin({ revenue: 5000 }),
      "revenue",
      "2023",
      "2023년",
    );
    expect(p).toMatchObject({
      year: 2023,
      period: "2023",
      periodLabel: "2023년",
      amount: 5000,
      value: 5000,
    });
    expect(p.ratio).toBeUndefined();
  });

  it("createFinancialDataPoint: ratio 지표(roe) 손계산 + 소수 2자리", () => {
    // roe = netIncome/equity*100 = 50/400*100 = 12.5
    const p = createFinancialDataPoint(
      fin({ netIncome: 50, equity: 400 }),
      "roe",
      "2023",
      "2023년",
    );
    expect(p.ratio).toBe(12.5);
    expect(p.value).toBe(12.5);
    expect(p.amount).toBeUndefined();
  });

  it("createEfficiencyDataPoint: 결측이면 ratio/value 미설정(throw 0)", () => {
    // 효율성 지표는 평균자산 등 추가 계정 필요 → 합성 최소셋이면 null
    const p = createEfficiencyDataPoint(
      fin({ revenue: 100 }),
      "assetTurnover",
      "2023Q3",
      "2023년 3분기",
      2,
    );
    expect(p.year).toBe(2023);
    expect(p.quarter).toBe(3); // quarterIndex+1
    expect(p.value).toBeNull();
    expect(p.ratio).toBeUndefined();
  });

  it("createCumulativeDataPoint: 누적금액(thstrmAddAmount) 우선 추출", () => {
    const items: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAddAmount: "9999" },
    ];
    const p = createCumulativeDataPoint(items, "revenue", "2023Q2", "2023년 2분기 누적");
    expect(p.amount).toBe(9999);
    expect(p.value).toBe(9999);
  });

  it("createGrowthDataPoint: 분기 성장(전분기 대비) 손계산 — cache 모킹", async () => {
    // revenueGrowth, quarterIndex=1(Q2, reportCodes[1]=11012)
    // 당분기(11012) revenue=1200, 전분기(11013) revenue=1000
    // ratio = (1200-1000)/|1000|*100 = 20.0
    mockGetFin.mockImplementation(async (_c, _y, rc) => {
      if (rc === "11012") return fin({ revenue: 1200 });
      if (rc === "11013") return fin({ revenue: 1000 });
      return [];
    });
    const reportCodes = ["11013", "11012", "11014", "11011"] as const;
    const p = await createGrowthDataPoint(
      "X",
      "revenueGrowth",
      "2023Q2",
      "2023년 2분기",
      2023,
      1,
      [...reportCodes],
    );
    expect(p.ratio).toBe(20);
    expect(p.value).toBe(20);
  });

  it("createQ4AmountDataPoint: 4Q 단위금액 = 연간 − 3분기누적", async () => {
    // 연간(11011) revenue thstrmAmount=4000,
    // Q3(11014) 누적 thstrmAddAmount=3000 → Q4 단위 = 4000-3000 = 1000
    const annual: DartFinancialItem[] = [
      { accountNm: "매출액", thstrmAmount: "4000" },
    ];
    mockGetFin.mockImplementation(async (_c, _y, rc) => {
      if (rc === "11014")
        return [{ accountNm: "매출액", thstrmAddAmount: "3000" }];
      return [];
    });
    const p = await createQ4AmountDataPoint(
      "X",
      annual,
      "revenue",
      "2023Q4",
      "2023년 4분기",
      2023,
    );
    expect(p.quarter).toBe(4);
    expect(p.amount).toBe(1000);
    expect(p.value).toBe(1000);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. TC-41.21 / TC-46.10 — workforce/governance 반기 · dividend 연간 가용성
// ══════════════════════════════════════════════════════════════════════════
describe("TC-41.21/46.10 가용성 차이 — 보고서코드 검증", () => {
  it("workforce annual: getEmployees 가 연간(11011)만 호출", async () => {
    const emp: DartEmployee[] = [
      { sexdstn: "남", sm: "100", rgllbrCo: "80", avrgCnwkSdytrn: "5" },
    ];
    mockGetEmp.mockResolvedValue(emp);

    const trend = await getIndicatorTrend(
      "X",
      "regularRatio",
      "workforce",
      "annual",
      2,
    );
    expect(trend.dataSource).toBe("workforce");
    expect(trend.trendType).toBe("annual");
    // 모든 getEmployees 호출의 reportCode 가 11011(연간)
    const codes = mockGetEmp.mock.calls.map((c) => c[2]);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c === "11011")).toBe(true);
    // regularRatio = 80/100*100 = 80 (% → ratio)
    expect(trend.dataPoints.every((p) => p.ratio === 80)).toBe(true);
  });

  it("workforce quarterly_unit: 반기 보고서코드만(H1=11012 / H2=11011), 분기코드 미사용", async () => {
    const emp: DartEmployee[] = [{ sexdstn: "남", sm: "10", rgllbrCo: "10" }];
    mockGetEmp.mockResolvedValue(emp);

    const trend = await getIndicatorTrend(
      "X",
      "regularRatio",
      "workforce",
      "quarterly_unit",
      2,
    );
    expect(trend.trendType).toBe("quarterly_unit");
    const codes = new Set(mockGetEmp.mock.calls.map((c) => c[2]));
    // 반기(11012)·연간(11011=H2)만 — 분기코드 11013/11014 절대 미사용
    expect(codes.has("11013")).toBe(false);
    expect(codes.has("11014")).toBe(false);
    for (const c of codes) expect(["11011", "11012"]).toContain(c);
    // period 라벨이 H1/H2 (분기 Q 표기 아님 — 가용성 차이 결정)
    expect(
      trend.dataPoints.every(
        (p) => p.period.endsWith("H1") || p.period.endsWith("H2"),
      ),
    ).toBe(true);
  });

  it("governance quarterly_unit: 주주/임원도 반기코드만(분기 미가용)", async () => {
    mockGetShareholders.mockResolvedValue([
      { stockKnd: "보통주", trmnPosessnStkQotaRt: "45.5" },
    ]);
    mockGetExecs.mockResolvedValue([
      { ofcpsNm: "대표이사", rgistExctvAt: "등기임원", sexdstn: "남" },
    ]);

    const trend = await getIndicatorTrend(
      "X",
      "largestShareholderRatio",
      "governance",
      "quarterly_unit",
      2,
    );
    expect(trend.dataSource).toBe("governance");
    const shCodes = new Set(mockGetShareholders.mock.calls.map((c) => c[2]));
    const exCodes = new Set(mockGetExecs.mock.calls.map((c) => c[2]));
    for (const c of [...shCodes, ...exCodes]) {
      expect(["11011", "11012"]).toContain(c);
    }
    expect(shCodes.has("11013")).toBe(false);
    expect(shCodes.has("11014")).toBe(false);
    // 최대주주지분율 = 45.5 결정값
    expect(trend.dataPoints.every((p) => p.ratio === 45.5)).toBe(true);
  });

  it("dividend: trendType 무관 연간(11011)만 — 반기/분기 절대 미사용", async () => {
    mockGetDiv.mockResolvedValue([
      {
        seType: "주당 현금배당금(원)",
        stockKnd: "보통주",
        thstrm: "1500",
      },
    ]);

    // quarterly_unit 을 요청해도 dividend 경로는 연간만
    const trend = await getIndicatorTrend(
      "X",
      "dps",
      "dividend",
      "quarterly_unit",
      3,
    );
    expect(trend.dataSource).toBe("dividend");
    expect(trend.trendType).toBe("annual"); // 항상 annual 로 고정
    const codes = mockGetDiv.mock.calls.map((c) => c[2]);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c === "11011")).toBe(true);
    // dps = 1500 (원 → amount)
    expect(trend.dataPoints.every((p) => p.amount === 1500)).toBe(true);
  });

  it("디스패처 라우팅 배타성: workforce 요청 시 financial/dividend api 미호출", async () => {
    mockGetEmp.mockResolvedValue([{ sm: "10", rgllbrCo: "10" }]);
    await getIndicatorTrend("X", "regularRatio", "workforce", "annual", 1);
    expect(mockGetDiv).not.toHaveBeenCalled();
    expect(mockGetShareholders).not.toHaveBeenCalled();
  });
});

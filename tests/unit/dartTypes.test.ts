import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// DART 타입 4분리(Slice D1) 단위 테스트 — LLM/DART API 호출 0(과금·비결정 금지).
// 픽스처는 이미 디스크 확보(tests/fixtures/dart/, OPEN-4 실측 삼성전자 응답),
// 네트워크 0. 타입은 컴파일 타임 소거라 (a) raw 픽스처 구조 계약 회귀 고정
// (b) 배럴 무손실 re-export 컴파일 검증 + 런타임 const 값 보존 (c) 1000줄
// 자동 게이트 3축으로 검증한다.
// 매핑: TC-46.5 (UC-46 / FR-21·NFR-18·OPEN-4) / TC-48.2 (UC-48 / NFR-17·AC-25)
// 정답지: .design-handoff/dart-source/src/types/dart.ts (원본 1374줄) 실측값.
//
// TDD red: src/types/dart/{entities,securities,indicators,trend,index}.ts
// 구현 전이므로 배럴 import 가 ERR_MODULE_NOT_FOUND 로 FAIL 하는 것이 정상.

// ──────────────────────────────────────────────────────────────────────────
// 배럴 import — 구현 전엔 모듈 부재로 전체 스위트 FAIL (의도된 TDD red).
//   type-only import 는 컴파일 검증용(D1 에선 snake→camel 변환 X, D2 책임).
//   런타임 값(const)은 실제 import 해 원본 값 보존 회귀 단언.
// ──────────────────────────────────────────────────────────────────────────
import type {
  DartCompanyInfo,
  DartFinancialItem,
  DartDisclosure,
  DartSubsidiary,
  DartAuditOpinion,
  DartConvertibleBond,
  DartSecuritiesOffering,
  IndicatorGroup,
  IndicatorDefinition,
  TrendType,
  DartFinancialTrend,
  AvailablePeriods,
  ReportCode,
  DartApiResponse,
} from "@/types/dart";
import {
  REPORT_CODES,
  CORP_CLS_NAMES,
  INDICATOR_GROUPS,
  INDICATOR_DATA_AVAILABILITY,
  INDICATOR_DISPLAY_CONFIG,
} from "@/types/dart";

// 타입 import 컴파일 가능성 보증용 더미(소거되지 않게 값 위치에서 1회 참조).
type _CompileProbe = {
  a: DartCompanyInfo;
  b: DartFinancialItem;
  c: DartDisclosure;
  d: DartSubsidiary;
  e: DartAuditOpinion;
  f: DartConvertibleBond;
  g: DartSecuritiesOffering;
  h: IndicatorGroup;
  i: IndicatorDefinition;
  j: TrendType;
  k: DartFinancialTrend;
  l: AvailablePeriods;
  m: ReportCode;
  n: DartApiResponse<unknown>;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../fixtures/dart");
const TYPES_DIR = resolve(HERE, "../../src/types/dart");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8"));
}

function lineCount(absPath: string): number {
  // 마지막 개행 제거 후 줄 수(원본 wc -l 1374 와 동일 기준).
  const text = readFileSync(absPath, "utf8");
  if (text.length === 0) return 0;
  return text.replace(/\n$/, "").split("\n").length;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. TC-46.5 — OPEN-4 실측 픽스처 ↔ raw 응답 구조 계약 회귀 고정
//   실측 노트 §1: raw 응답 = snake_case, 도메인 타입 = camelCase, 변환은 D2.
//   D1 은 "raw 픽스처가 DART 봉투 규약(status/message, list 계열 list[])을
//   만족 + raw 필드명이 실측 목록과 일치"만 런타임 단언(D2 매핑 정답지 회귀).
// ══════════════════════════════════════════════════════════════════════════
describe("TC-46.5 — OPEN-4 실측 픽스처 raw 구조 계약 (D2 매핑 정답지 회귀 고정)", () => {
  it("company.json: DART 봉투(status='000'/message) + 회사 raw 키(snake_case) 보존", () => {
    const c = readFixture("company.json") as Record<string, unknown>;
    expect(c.status).toBe("000");
    expect(c.message).toBe("정상");
    // D2 snake→camel 매핑 정답지: 이 키들이 사라지면 변환이 깨짐.
    expect(c).toHaveProperty("corp_code");
    expect(c).toHaveProperty("corp_name");
    expect(c).toHaveProperty("stock_code");
    expect(c).toHaveProperty("corp_cls");
    expect(c.corp_code).toBe("00126380"); // 삼성전자 실측 corp_code
    expect(c.stock_code).toBe("005930");
    expect(c.corp_cls).toBe("Y");
    // 실측 노트 §2 추가 필드(D2 CompanyInfo 매핑 대상) 회귀 고정.
    for (const k of ["ceo_nm", "induty_code", "est_dt", "acc_mt"]) {
      expect(c).toHaveProperty(k);
    }
    // camelCase 누출 0 — D1 은 raw 그대로(변환은 D2).
    expect(c).not.toHaveProperty("corpCode");
    expect(c).not.toHaveProperty("stockCode");
  });

  it("financial-statements.json: 봉투 + list[] 배열 + 재무항목 raw 키 보존", () => {
    const f = readFixture("financial-statements.json") as {
      status: string;
      message: string;
      list: Array<Record<string, unknown>>;
    };
    expect(f.status).toBe("000");
    expect(f.message).toBe("정상");
    // list 계열은 list[] 봉투 규약(실측 노트 §1).
    expect(Array.isArray(f.list)).toBe(true);
    expect(f.list.length).toBeGreaterThan(0);
    const row = f.list[0];
    // D2 재무 매핑 정답지: account_nm/thstrm_amount/sj_div 등 회귀 고정.
    for (const k of [
      "account_nm",
      "thstrm_amount",
      "sj_div",
      "account_id",
      "frmtrm_amount",
      "bfefrmtrm_amount",
      "reprt_code",
      "bsns_year",
      "currency",
    ]) {
      expect(row).toHaveProperty(k);
    }
    // 실측 노트: 금액은 문자열(쉼표/숫자 문자열) — D2 가 number 로 파싱.
    expect(typeof row.thstrm_amount).toBe("string");
    // reprt_code 는 ReportCode union 후보값이어야(11011=사업보고서).
    expect(["11011", "11012", "11013", "11014"]).toContain(row.reprt_code);
  });

  it("disclosure-list.json: 봉투 + 페이지 메타 + list[] 공시 raw 키 보존", () => {
    const d = readFixture("disclosure-list.json") as {
      status: string;
      message: string;
      list: Array<Record<string, unknown>>;
      [k: string]: unknown;
    };
    expect(d.status).toBe("000");
    expect(d.message).toBe("정상");
    // 공시목록 페이지 메타(D2 DisclosureListResult 매핑 대상).
    for (const k of ["page_no", "page_count", "total_count", "total_page"]) {
      expect(d).toHaveProperty(k);
    }
    expect(Array.isArray(d.list)).toBe(true);
    expect(d.list.length).toBeGreaterThan(0);
    const item = d.list[0];
    // D2 공시 매핑 정답지: rcept_no/report_nm 등 회귀 고정.
    for (const k of [
      "rcept_no",
      "report_nm",
      "corp_code",
      "corp_name",
      "flr_nm",
      "rcept_dt",
    ]) {
      expect(item).toHaveProperty(k);
    }
    expect(item.corp_code).toBe("00126380"); // 삼성전자 실측
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. 타입 배럴 무손실 re-export (컴파일 검증 + 런타임 const 값 보존)
//   배럴(src/types/dart/index.ts)이 원본 주요 export 를 빠짐없이 노출하는지.
//   const 정답지는 .design-handoff/dart-source/src/types/dart.ts 실측값.
// ══════════════════════════════════════════════════════════════════════════
describe("배럴 무손실 re-export — 원본 export 노출 + const 값 보존 회귀", () => {
  it("type-only import 가 컴파일된다(배럴이 주요 타입 export 노출)", () => {
    // 모듈 부재 시 이 파일 자체가 import 단계에서 FAIL(TDD red).
    // 컴파일까지 도달했다면 _CompileProbe 타입이 해석된 것.
    const probe: Partial<_CompileProbe> = {};
    expect(probe).toBeTypeOf("object");
  });

  it("REPORT_CODES: 4개 보고서 코드 + name/quarter 원본값 보존", () => {
    expect(Object.keys(REPORT_CODES).sort()).toEqual([
      "11011",
      "11012",
      "11013",
      "11014",
    ]);
    expect(REPORT_CODES["11011"]).toEqual({ name: "사업보고서", quarter: 4 });
    expect(REPORT_CODES["11012"]).toEqual({ name: "반기보고서", quarter: 2 });
    expect(REPORT_CODES["11013"]).toEqual({ name: "1분기보고서", quarter: 1 });
    expect(REPORT_CODES["11014"]).toEqual({ name: "3분기보고서", quarter: 3 });
  });

  it("CORP_CLS_NAMES: 법인구분 4종 원본 매핑 보존", () => {
    expect(CORP_CLS_NAMES["Y"]).toBe("유가증권");
    expect(CORP_CLS_NAMES["K"]).toBe("코스닥");
    expect(CORP_CLS_NAMES["N"]).toBe("코넥스");
    expect(CORP_CLS_NAMES["E"]).toBe("기타");
  });

  it("INDICATOR_GROUPS: 9개 그룹(core~dividend) + name/description 보존", () => {
    const keys = Object.keys(INDICATOR_GROUPS).sort();
    expect(keys).toEqual(
      [
        "cashflow",
        "core",
        "dividend",
        "efficiency",
        "governance",
        "growth",
        "profitability",
        "stability",
        "workforce",
      ].sort(),
    );
    expect(keys).toHaveLength(9);
    expect(INDICATOR_GROUPS.core).toEqual({
      name: "핵심",
      description: "부채비율, ROE 등 핵심 지표",
    });
    expect(INDICATOR_GROUPS.dividend.name).toBe("배당");
  });

  it("INDICATOR_DATA_AVAILABILITY: 45개 지표 가용성 + 대표 엔트리 구조 보존", () => {
    expect(Object.keys(INDICATOR_DATA_AVAILABILITY)).toHaveLength(45);
    expect(INDICATOR_DATA_AVAILABILITY.revenue).toEqual({
      dataSource: "financial",
      annual: true,
      quarterly: "QF",
      cumulative: "CF",
      latestPeriod: "quarterly",
    });
    expect(INDICATOR_DATA_AVAILABILITY.eps.quarterly).toBe(false);
    expect(INDICATOR_DATA_AVAILABILITY.dps.dataSource).toBe("dividend");
    expect(INDICATOR_DATA_AVAILABILITY.largestShareholderRatio.dataSource).toBe(
      "governance",
    );
  });

  it("INDICATOR_DISPLAY_CONFIG: 45개 표시설정 + revenue 엔트리 원본값 보존", () => {
    expect(Object.keys(INDICATOR_DISPLAY_CONFIG)).toHaveLength(45);
    expect(INDICATOR_DISPLAY_CONFIG.revenue).toEqual({
      label: "매출액",
      description: "기업의 주된 영업활동에서 발생한 총 수익.",
      formula: "제품/서비스 판매 수익의 총합",
      valueType: "amount",
      unit: "원",
      growthDisplay: "yoy",
      signMeaning: "higher_better",
      changeUnit: "%",
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. TC-48.2 — 1000줄 상한 자동 게이트 (manual-gate 자동화)
//   원본 단일 1374줄 → 5파일 분리. 각 ≤420줄(architect 예산),
//   전부 ≤1000줄(AC-25/NFR-17 하드 상한). 1건↑ 초과 시 FAIL.
// ══════════════════════════════════════════════════════════════════════════
describe("TC-48.2 — 1000줄 상한 자동 게이트 (NFR-17 / AC-25)", () => {
  const FILES = [
    "entities.ts",
    "securities.ts",
    "indicators.ts",
    "trend.ts",
    "index.ts",
  ] as const;

  it("원본 단일 파일이 5개로 분리됐다(파일 존재 + 배럴 포함)", () => {
    for (const f of FILES) {
      const p = resolve(TYPES_DIR, f);
      // 파일 부재 시 readFileSync 가 ENOENT throw → FAIL (TDD red).
      expect(() => readFileSync(p, "utf8")).not.toThrow();
    }
  });

  it.each([
    "entities.ts",
    "securities.ts",
    "indicators.ts",
    "trend.ts",
    "index.ts",
  ])("%s — architect 예산 ≤420줄 (분리 적정성)", (f) => {
    const n = lineCount(resolve(TYPES_DIR, f));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(420);
  });

  it.each([
    "entities.ts",
    "securities.ts",
    "indicators.ts",
    "trend.ts",
    "index.ts",
  ])("%s — AC-25/NFR-17 하드 상한 ≤1000줄 (초과 0 회귀 고정)", (f) => {
    const n = lineCount(resolve(TYPES_DIR, f));
    expect(n).toBeLessThanOrEqual(1000);
  });

  // 원본(1374줄)에서 Tailwind/UI 셀 포맷 3개는 의도적 미이식
  // (PRD §3.9 standalone UI 비목표 / 사용자 HITL 확정 2026-05-19,
  // R8 정합화). 라인 수 하한이 아니라 "명시 제외 3개를 뺀 나머지
  // 심볼이 배럴에 보존됐는지"를 직접 검증한다 — 라인 수는 UI 코드
  // 제거로 정당히 줄어들 수 있으므로 누락 프록시로 부적절.
  it("명시 제외(UI 3개)만 빠지고 순수 심볼은 배럴에 전부 보존", async () => {
    const mod = await import("@/types/dart");
    // 이식 확정 순수 함수 5개 — D3 trend/·D5 context-formatter 소비
    expect(typeof mod.getIndicatorDeltaConfig).toBe("function");
    expect(typeof mod.getChangeUnit).toBe("function");
    expect(typeof mod.shouldShowGrowth).toBe("function");
    expect(typeof mod.formatGrowthRate).toBe("function");
    expect(typeof mod.formatGrowthFull).toBe("function");
    expect(typeof mod.extractGrowthRate).toBe("function");
    // 의도적 미이식 — Tailwind/UI 셀 포맷 3개 (분석 백엔드 무관)
    const m = mod as Record<string, unknown>;
    expect(m.getGrowthColorClass).toBeUndefined();
    expect(m.getGrowthColorClassByIndicator).toBeUndefined();
    expect(m.formatGrowthForTable).toBeUndefined();
  });

  it("순수 함수 결정성 — 동일 입력 동일 출력 (NFR-18)", async () => {
    const { formatGrowthRate, formatGrowthFull, getChangeUnit, shouldShowGrowth,
      extractGrowthRate, getIndicatorDeltaConfig } = await import("@/types/dart");
    expect(formatGrowthRate(5.234)).toBe("+5.2%");
    expect(formatGrowthRate(-3.1, "%p")).toBe("-3.1%p");
    expect(formatGrowthRate(null)).toBe("-");
    expect(getChangeUnit("debtRatio")).toBe("%p"); // 원본 config
    expect(getChangeUnit("revenue")).toBe("%");
    expect(shouldShowGrowth("revenue")).toBe(true);
    expect(shouldShowGrowth("debtRatio")).toBe(false); // growthDisplay:'none'
    // revenue: quarterly QF + latestPeriod quarterly → QoQ/growthRate
    expect(getIndicatorDeltaConfig("revenue")).toEqual({
      label: "QoQ", rateField: "growthRate",
    });
    expect(formatGrowthFull(5.2, "revenue")).toBe("QoQ +5.2%");
    expect(
      extractGrowthRate({ year: 2024, period: "2024", periodLabel: "2024년",
        value: 1, growthRate: 7.7 }, "revenue"),
    ).toBe(7.7);
    expect(extractGrowthRate(null, "revenue")).toBeNull();
  });
});

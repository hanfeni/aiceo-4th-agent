/**
 * DART 컨텍스트 압축 레이어(Slice D5 — OPEN-5) 단위 테스트 — 역검증(green 기대).
 *
 * 대상: src/lib/dart/context-formatter.ts (203줄, 순수 모듈 — LLM/IO/네트워크 0).
 *
 * 정답지(추측 금지):
 *  - top-N 절단 상수: 구현 명세(MAX_FINANCIAL_YEARS=5 / SHAREHOLDERS=5 /
 *    DIVIDEND_ROWS=8) → 합성 입력의 자명한 길이로 검증.
 *  - 8관점 selectSections 매핑: medigate `AI_ANALYSIS_REFERENCES.md` §5
 *    "분석 관점별 기본 선택 DART 항목"(271~284행) 환원 규칙
 *    (financial←core/profitability/stability/growth/efficiency/cashflow,
 *     shareholders←governance, workforce←workforce, dividend←dividend,
 *     disclosure←disclosure|audit) — 사용자 HITL "원본 매핑 그대로".
 *  - 스냅샷(toMatchSnapshot)은 idempotent: 2회 실행 시 미갱신(NFR-18).
 *
 * LLM/DART API/네트워크 호출 0 — 순수 함수만(과금·비결정 금지).
 *
 * TC 매핑:
 *  - TC-41.19 (UC-41-EC2 / OPEN-5·FR-24·AC-24) P0 — 토큰폭발 회귀 스냅샷
 *  - TC-46.x계열 (UC-46 / FR-22·NFR-18·AC-24) P0 — top-N 절단 결정성
 *  - TC-41.19/41.20 (UC-41-EC2 / OPEN-5) P0 — 8관점 selectSections 선별
 *  - TC-42.7  (UC-42-E2 / OPEN-5) P1 인접 — 비상장사(공시 주입력) 시나리오
 *  - TC-47.2  (UC-47 / FR-24·AC-22) P0 — gemini/perplexity 정적검사 0
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  FinancialSummary,
  WorkforceSummary,
  DartShareholder,
  DartDividend,
} from "@/types/dart";
import {
  formatFinancialData,
  formatWorkforceData,
  formatShareholderData,
  formatDividendData,
  formatDartContext,
  type AnalysisPerspective,
  type DartCompactInput,
} from "@/lib/dart/context-formatter";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "../../src/lib/dart/context-formatter.ts");

// ──────────────────────────────────────────────────────────────────────────
// 합성 입력 빌더 (정답지 = 자명한 값. 추측 금지 — 입력 길이/연도가 곧 정답)
// ──────────────────────────────────────────────────────────────────────────

/** N년치 재무 요약 — year 가 1900..1900+N (slice(-5) 보존 검증용). */
function makeFinancials(n: number): FinancialSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    year: 1900 + i,
    revenue: 1000 + i,
    operatingProfit: 100 + i,
    netIncome: 50 + i,
    totalAssets: 5000 + i,
    totalEquity: 3000 + i,
    debtRatio: 40 + i,
    roe: 10 + i,
    roa: 5 + i,
  }));
}

/** N명 주주 — nm 가 SH0..SH(N-1) (slice(0,5) top5 보존 검증용). */
function makeShareholders(n: number): DartShareholder[] {
  return Array.from({ length: n }, (_, i) => ({
    nm: `SH${i}`,
    relate: "본인",
    trmnPosessnStkQotaRt: `${i}`,
  }));
}

/** N행 배당 — seType 가 DV0..DV(N-1) (slice(0,8) top8 보존 검증용). */
function makeDividends(n: number): DartDividend[] {
  return Array.from({ length: n }, (_, i) => ({
    seType: `DV${i}`,
    stockKnd: "보통주",
    thstrm: `${i}`,
    frmtrm: `${i - 1}`,
  }));
}

const WORKFORCE: WorkforceSummary = {
  year: 2024,
  totalEmployees: 1000,
  regularCount: 800,
  contractCount: 200,
  averageTenure: 7,
  averageSalary: 9000,
};

/** 모든 섹션 데이터를 채운 입력(selectSections 분별을 출력 헤더로 검증). */
function fullInput(
  perspective: AnalysisPerspective,
): DartCompactInput {
  return {
    perspective,
    financialSummaries: makeFinancials(3),
    workforceSummary: WORKFORCE,
    shareholders: makeShareholders(3),
    dividends: makeDividends(3),
    disclosureContext: "==공시원문섹션마커==",
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 1. TC-41.19 — 토큰폭발 회귀 스냅샷 + raw JSON 미진입 (P0)
//   매우 큰 입력이라도 출력은 top-N 절단으로 bounded. 동일 입력 결정성.
// ══════════════════════════════════════════════════════════════════════════
describe("TC-41.19 — 토큰폭발 회귀 스냅샷 (OPEN-5 / FR-24·AC-24)", () => {
  const huge: DartCompactInput = {
    perspective: "comprehensive",
    financialSummaries: makeFinancials(20), // 20년치 → 5년만
    workforceSummary: WORKFORCE,
    shareholders: makeShareholders(30), // 30명 → top5
    dividends: makeDividends(20), // 20행 → top8
    disclosureContext: "공시원문(이미 D4 에서 길이 제한됨)",
  };

  it("큰 입력 → comprehensive 압축 결과를 회귀 스냅샷으로 고정(bounded 출력)", () => {
    expect(formatDartContext(huge)).toMatchSnapshot();
  });

  it("입력이 커도 출력은 top-N 절단 반영: 재무 5년·주주 5명·배당 8행만", () => {
    const out = formatDartContext(huge);
    // 재무: [1915년]..[1919년] 5개 (slice(-5) → 최근 5년 보존, 1900~1914 제거)
    const yearBlocks = out.match(/\[\d{4}년\]/g) ?? [];
    expect(yearBlocks).toHaveLength(5);
    expect(out).toContain("[1919년]"); // 최근 연도 보존
    expect(out).toContain("[1915년]"); // 절단 경계(가장 오래된 보존)
    expect(out).not.toContain("[1914년]"); // 절단 제거
    expect(out).not.toContain("[1900년]");
    // 주주 top5: SH0..SH4 만 (SH5+ 제거)
    expect(out).toContain("- SH0 (본인): 0%");
    expect(out).toContain("- SH4 (본인): 4%");
    expect(out).not.toContain("SH5 ");
    expect(out).not.toContain("SH29 ");
    // 배당 top8: DV0..DV7 만 (DV8+ 제거)
    expect(out).toContain("DV0(보통주): 당기 0");
    expect(out).toContain("DV7(보통주): 당기 7");
    expect(out).not.toContain("DV8(");
    expect(out).not.toContain("DV19(");
  });

  it("동일 입력 2회 호출 → 완전 동일 출력(결정성 NFR-18)", () => {
    const a = formatDartContext(huge);
    const b = formatDartContext(huge);
    expect(a).toEqual(b);
    // deep equal: 별도 truncation 미들웨어·route 분기 없이 함수 단독 결정성
    expect(a === b || a.length === b.length).toBe(true);
  });

  it("raw JSON 미진입: 출력에 JSON 직렬화 흔적 0(컴팩트 텍스트만)", () => {
    const out = formatDartContext(huge);
    // 객체/배열 JSON 시작 토큰이 본문에 없음(억단위·% 포맷만)
    expect(out).not.toContain('{"');
    expect(out).not.toContain("[{");
    expect(out).not.toContain('":"');
    expect(out).not.toContain("JSON.stringify");
    // 컴팩트 포맷 마커는 존재(텍스트 직렬화 증거)
    expect(out).toMatch(/\[\d{4}년\]/);
    expect(out).toContain("억");
  });

  it("입력 raw 필드명(trmnPosessnStkQotaRt 등)이 출력에 노출 0", () => {
    const out = formatDartContext(huge);
    // raw DART 키가 그대로 새어나오지 않음(억단위·% 라벨로만 표현)
    for (const rawKey of [
      "trmnPosessnStkQotaRt",
      "financialSummaries",
      "operatingProfit",
      "totalEquity",
      "disclosureContext",
      "seType",
      "stockKnd",
    ]) {
      expect(out).not.toContain(rawKey);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. top-N 절단 결정성 + 빈 입력 (P0)
//   format*Data 단위 함수: slice 동작 + "데이터 없음" 마커.
// ══════════════════════════════════════════════════════════════════════════
describe("top-N 절단 결정성 (FR-22 / NFR-18·AC-24)", () => {
  it("formatFinancialData(25년치) → 최근 5개 [년] 블록만(MAX_FINANCIAL_YEARS)", () => {
    const out = formatFinancialData(makeFinancials(25));
    const blocks = out.match(/\[\d{4}년\]/g) ?? [];
    expect(blocks).toHaveLength(5);
    // slice(-5): year 1920..1924 보존, 1919 이하 제거
    expect(out).toContain("[1924년]");
    expect(out).toContain("[1920년]");
    expect(out).not.toContain("[1919년]");
    expect(out).not.toContain("[1900년]");
  });

  it("formatShareholderData(30명) → 5줄(top5, slice(0,5))", () => {
    const out = formatShareholderData(makeShareholders(30));
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(5);
    expect(out).toContain("SH0");
    expect(out).toContain("SH4");
    expect(out).not.toContain("SH5 ");
  });

  it("formatDividendData(20행) → 8줄(top8, slice(0,8))", () => {
    const out = formatDividendData(makeDividends(20));
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(8);
    expect(out).toContain("DV0(");
    expect(out).toContain("DV7(");
    expect(out).not.toContain("DV8(");
  });

  it("빈 입력 → 각 함수의 '데이터 없음' 마커(결정적)", () => {
    expect(formatFinancialData([])).toBe("재무 데이터 없음");
    expect(formatWorkforceData(undefined)).toBe("인력 데이터 없음");
    expect(formatShareholderData([])).toBe("주주 데이터 없음");
    expect(formatDividendData([])).toBe("배당 데이터 없음");
  });

  it("formatWorkforceData(요약) → 인력현황 텍스트(명/만원 포맷)", () => {
    const out = formatWorkforceData(WORKFORCE);
    expect(out).toContain("[2024년 인력현황]");
    expect(out).toContain("총 직원수: 1,000명");
    expect(out).toContain("정규직: 800명");
    expect(out).toContain("1인 평균급여: 9,000만원");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. 8관점 selectSections 선별 (formatDartContext 경유, medigate §5 정답지)
//   정답 = AI_ANALYSIS_REFERENCES.md §5 환원 규칙. ### 헤더 포함/제외로 검증.
//   disclosure 섹션은 selectSections=true AND disclosureContext 존재 시만 출력
//   → fullInput 은 disclosureContext 채워 selectSections.disclosure 정확 분별.
// ══════════════════════════════════════════════════════════════════════════
describe("8관점 selectSections (medigate AI_ANALYSIS_REFERENCES §5 정답지)", () => {
  /** 출력에서 각 섹션 ### 헤더 존재 여부 추출. */
  function sections(perspective: AnalysisPerspective) {
    const out = formatDartContext(fullInput(perspective));
    return {
      financial: out.includes("### 재무"),
      workforce: out.includes("### 인력"),
      shareholders: out.includes("### 주주"),
      dividend: out.includes("### 배당"),
      disclosure: out.includes("### 공시 원문"),
    };
  }

  // §5 매핑 환원 정답지(271~284행):
  //  comprehensive    : 전체 11항목 → 5섹션 전부
  //  financial_health : core,stability,cashflow,disclosure,audit
  //  growth           : core,growth,efficiency,disclosure
  //  profitability    : core,profitability,efficiency,audit
  //  valuation        : core,profitability,growth,dividend,audit
  //  governance       : core,governance,workforce,disclosure
  //  risk             : core,stability,cashflow,disclosure,audit
  //  workforce        : core,workforce,profitability,governance
  const EXPECTED: Record<
    AnalysisPerspective,
    {
      financial: boolean;
      workforce: boolean;
      shareholders: boolean;
      dividend: boolean;
      disclosure: boolean;
    }
  > = {
    comprehensive: {
      financial: true,
      workforce: true,
      shareholders: true,
      dividend: true,
      disclosure: true,
    },
    financial_health: {
      financial: true, // core,stability,cashflow
      workforce: false,
      shareholders: false, // governance 없음
      dividend: false,
      disclosure: true, // disclosure|audit
    },
    growth: {
      financial: true, // core,growth,efficiency
      workforce: false,
      shareholders: false,
      dividend: false,
      disclosure: true, // disclosure
    },
    profitability: {
      financial: true, // core,profitability,efficiency
      workforce: false,
      shareholders: false,
      dividend: false,
      disclosure: true, // audit
    },
    valuation: {
      financial: true, // core,profitability,growth
      workforce: false,
      shareholders: false,
      dividend: true, // dividend
      disclosure: true, // audit
    },
    governance: {
      financial: true, // core
      workforce: true, // workforce
      shareholders: true, // governance
      dividend: false,
      disclosure: true, // disclosure
    },
    risk: {
      financial: true, // core,stability,cashflow
      workforce: false,
      shareholders: false,
      dividend: false,
      disclosure: true, // disclosure|audit
    },
    workforce: {
      financial: true, // core,profitability
      workforce: true, // workforce
      shareholders: true, // governance
      dividend: false,
      disclosure: false, // disclosure/audit 없음
    },
  };

  for (const p of Object.keys(EXPECTED) as AnalysisPerspective[]) {
    it(`${p} 관점 → §5 매핑대로 섹션 선별`, () => {
      expect(sections(p)).toEqual(EXPECTED[p]);
    });
  }

  it("comprehensive: 5섹션 전부 + 관점 헤더 노출", () => {
    const out = formatDartContext(fullInput("comprehensive"));
    expect(out).toContain("## DART 분석 데이터 (관점: comprehensive)");
    expect(out).toContain("### 재무");
    expect(out).toContain("### 인력");
    expect(out).toContain("### 주주");
    expect(out).toContain("### 배당");
    expect(out).toContain("### 공시 원문");
  });

  it("workforce: disclosure/audit 항목 없음 → 공시 원문 섹션 미출력(데이터 채워도)", () => {
    const out = formatDartContext(fullInput("workforce"));
    // disclosureContext 를 채웠어도 selectSections.disclosure=false 라 제외
    expect(out).not.toContain("### 공시 원문");
    expect(out).not.toContain("==공시원문섹션마커==");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. 비상장사 시나리오 (P1 — TC-42.7 인접)
//   financialSummaries=[] + disclosureContext 채움 → "재무 데이터 없음" +
//   공시 원문 섹션 포함(비상장 주 입력은 공시 전문).
// ══════════════════════════════════════════════════════════════════════════
describe("비상장사 시나리오 (OPEN-5 — 공시 주입력)", () => {
  it("재무 빈배열 + disclosureContext → '재무 데이터 없음' + 공시 원문 포함", () => {
    const input: DartCompactInput = {
      perspective: "comprehensive",
      financialSummaries: [],
      disclosureContext: "비상장사 공시 전문(D4 context.ts 산출)",
    };
    const out = formatDartContext(input);
    // comprehensive 는 financial 섹션 선별됨 → 빈배열이라 마커 출력
    expect(out).toContain("### 재무");
    expect(out).toContain("재무 데이터 없음");
    // disclosure 항목 보유 + disclosureContext 존재 → 공시 원문 섹션 포함
    expect(out).toContain("### 공시 원문");
    expect(out).toContain("비상장사 공시 전문(D4 context.ts 산출)");
    // 주주/배당 미제공 → 해당 섹션은 "데이터 없음" 마커(throw 아님)
    expect(out).toContain("주주 데이터 없음");
    expect(out).toContain("배당 데이터 없음");
  });

  it("disclosureContext 부재 시 selectSections.disclosure=true 라도 공시 섹션 미출력", () => {
    const out = formatDartContext({
      perspective: "financial_health", // disclosure 항목 보유
      financialSummaries: makeFinancials(2),
      // disclosureContext 없음
    });
    expect(out).toContain("### 재무");
    expect(out).not.toContain("### 공시 원문");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. TC-47 — gemini/perplexity 정적검사 0 (P0, AC-22/AC-26)
//   context-formatter.ts 소스에 폐기 종속 import/심볼 0건(주석/문자열 제외 후
//   실행 경로 판정 — tool-limitations: grep≠AST 7종 중 import/심볼 확인).
// ══════════════════════════════════════════════════════════════════════════
describe("TC-47 — 폐기 종속 정적검사 0 (FR-24·FR-27 / AC-22·AC-26)", () => {
  const source = readFileSync(SOURCE, "utf8");

  /** 줄단위 라인주석(//) 및 블록주석 본문 제거 → 실행 경로만 남김. */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "") // 블록 주석
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "")) // 라인 주석
      .join("\n");
  }
  const code = stripComments(source);

  it("import/심볼에 gemini·generative-ai·GoogleGenerativeAI 0건", () => {
    // 주석엔 'gemini 0' 같은 설명 잔존 가능 → stripComments 후 실행 경로만
    expect(/GoogleGenerativeAI/.test(code)).toBe(false);
    expect(/@google\/generative-ai/.test(code)).toBe(false);
    expect(/\bgemini\b/i.test(code)).toBe(false);
  });

  it("analyzeCompany* / perplexity 분석 경로 0건(AC-26·AC-27)", () => {
    expect(/analyzeCompany/i.test(code)).toBe(false);
    expect(/perplexity/i.test(code)).toBe(false);
  });

  it("import 문에 LLM/네트워크 클라이언트 0(순수 모듈 — 타입 import 만)", () => {
    // import 는 멀티라인(`import type {\n ...\n} from "@/types/dart"`)이라
    // 라인 단위 필터로는 from 경로를 놓침 → import…from 절 전체를 매칭.
    const importStmts = code.match(/import[\s\S]*?from\s+["'][^"']+["'];?/g) ?? [];
    const joined = importStmts.join("\n");
    // 유일 import = @/types/dart (타입). LLM/HTTP/genai 클라이언트 없음.
    expect(joined).toContain("@/types/dart");
    expect(/@langchain|openai|@google|axios|node-fetch|undici/i.test(joined)).toBe(
      false,
    );
    // 'import type' 인지 확인(런타임 값 import 0 = 순수 모듈)
    expect(/import\s+type\s/.test(joined)).toBe(true);
  });
});

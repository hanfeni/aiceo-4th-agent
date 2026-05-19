/**
 * DART 고정 분석 파이프라인(Slice D10) 단위 테스트 — 역검증(green 기대).
 *
 * 대상: src/lib/dart/analyze-pipeline.ts (213줄)
 *  - collectDartContext  : 구 dartTool 본문(ClientTool 래퍼 제거). IO —
 *    실 DART/LLM/네트워크 0 (vi.mock 으로 @/lib/dart·disclosure·
 *    context-formatter 모킹). 실패는 throw 아닌 {ok:false, 안내문}.
 *  - buildDartAnalysisQuery : medigate route.ts 1529행 추출 — **순수
 *    함수**(LLM/IO 0, mock 불요 — 정확 문자열 단언).
 *
 * 정답지(추측 금지 — medigate PERSPECTIVE_LABELS):
 *  comprehensive=종합 분석 / financial_health=재무건전성 /
 *  growth=성장성 / profitability=수익성 / valuation=밸류에이션 /
 *  governance=지배구조 / risk=리스크 / workforce=인력/조직.
 *
 * 실 DART/LLM/네트워크 호출 0 — 과금·비결정·네트워크 금지.
 *
 * TC 매핑:
 *  - UC-41 Step2/Step4 (식별·상장/비상장 분기) P0
 *  - TC-41.10 (UC-41-E1 식별 분기 결정 — 검색0건/미종결 graceful) P0
 *  - TC-41.15 (UC-41-E6 — 상장사 재무 미공시 공시 폴백) P0
 *  - TC-41.19 계열 (buildDartAnalysisQuery 순수 결정성) P0
 *  - TC-46.4 (UC-46 8관점-라벨 매핑 — AC-30 결정) P0
 *  - TC-47.1/47.7 (UC-47 폐기 종속 0 — AC-26 정적검사) P0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// vi.mock — 실 DART/LLM/네트워크 0 (과금·네트워크 금지). 호이스트되므로
// 팩토리 내부에 vi.fn() 만 두고 모듈 import 후 캐스팅해 제어한다.
// ──────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/dart", () => ({
  searchCompany: vi.fn(),
  getCompanyInfo: vi.fn(),
  getMultiYearFinancialSummary: vi.fn(),
  extractWorkforceSummary: vi.fn(),
  getEmployees: vi.fn(),
  getMajorShareholders: vi.fn(),
  getDividends: vi.fn(),
}));
vi.mock("@/lib/dart/disclosure", () => ({
  getUnlistedCompanyDisclosureContext: vi.fn(),
}));
vi.mock("@/lib/dart/context-formatter", () => ({
  formatDartContext: vi.fn(),
}));

import {
  searchCompany,
  getCompanyInfo,
  getMultiYearFinancialSummary,
  extractWorkforceSummary,
  getEmployees,
  getMajorShareholders,
  getDividends,
} from "@/lib/dart";
import { getUnlistedCompanyDisclosureContext } from "@/lib/dart/disclosure";
import { formatDartContext } from "@/lib/dart/context-formatter";
import {
  PERSPECTIVES,
  collectDartContext,
  buildDartAnalysisQuery,
} from "@/lib/dart/analyze-pipeline";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "../../src/lib/dart/analyze-pipeline.ts");

// mock 핸들 캐스팅(타입 안전 vi 제어)
const mSearch = vi.mocked(searchCompany);
const mInfo = vi.mocked(getCompanyInfo);
const mMultiYear = vi.mocked(getMultiYearFinancialSummary);
const mWorkforce = vi.mocked(extractWorkforceSummary);
const mEmployees = vi.mocked(getEmployees);
const mShareholders = vi.mocked(getMajorShareholders);
const mDividends = vi.mocked(getDividends);
const mDisclosure = vi.mocked(getUnlistedCompanyDisclosureContext);
const mFormat = vi.mocked(formatDartContext);

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값(개별 테스트에서 override). formatDartContext 는 압축 텍스트 마커.
  mFormat.mockReturnValue("==FORMATTED-CTX==");
});

// 정답지(medigate PERSPECTIVE_LABELS — 추측 금지, task 명시값).
const LABELS: Record<string, string> = {
  comprehensive: "종합 분석",
  financial_health: "재무건전성",
  growth: "성장성",
  profitability: "수익성",
  valuation: "밸류에이션",
  governance: "지배구조",
  risk: "리스크",
  workforce: "인력/조직",
};

// ══════════════════════════════════════════════════════════════════════════
// 1. collectDartContext — 기업 식별 (UC-41 Step2 / TC-41.10 graceful) P0
//    공백·검색실패·미존재 → throw 0, {ok:false, 안내문}.
// ══════════════════════════════════════════════════════════════════════════
describe("collectDartContext — 기업 식별 graceful (UC-41 Step2 / TC-41.10)", () => {
  it("corpName 공백 → {ok:false, '기업명이 비어'} (searchCompany 미호출)", async () => {
    const r = await collectDartContext("   ", "financial_health");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("기업명이 비어");
    expect(mSearch).not.toHaveBeenCalled();
  });

  it("corpName 빈 문자열 → {ok:false, '기업명이 비어'}", async () => {
    const r = await collectDartContext("", "growth");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("기업명이 비어");
    expect(mSearch).not.toHaveBeenCalled();
  });

  it("searchCompany throw → {ok:false, '검색 중 오류'} (throw 미전파 — graceful)", async () => {
    mSearch.mockRejectedValueOnce(new Error("network down"));
    const r = await collectDartContext("삼성전자", "comprehensive");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("검색 중 오류");
    expect(r.corpName).toBe("삼성전자");
  });

  it("searchCompany [] → {ok:false, '찾지 못했'} (미존재 안내)", async () => {
    mSearch.mockResolvedValueOnce([] as never);
    const r = await collectDartContext("없는회사", "risk");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("찾지 못했");
    expect(r.corpName).toBe("없는회사");
  });

  it("식별 단계 전체에서 예외 throw 0 (graceful — NFR-18/UC-41 에러분기)", async () => {
    mSearch.mockRejectedValueOnce(new Error("boom"));
    await expect(
      collectDartContext("삼성전자", "financial_health"),
    ).resolves.toBeDefined();
    mSearch.mockResolvedValueOnce(null as never);
    await expect(
      collectDartContext("삼성전자", "financial_health"),
    ).resolves.toMatchObject({ ok: false });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. collectDartContext — 상장사 흐름 (UC-41 Step4) P0
// ══════════════════════════════════════════════════════════════════════════
describe("collectDartContext — 상장사 흐름 (UC-41 Step4)", () => {
  it("stockCode 보유 후보 → 다년재무·인력·주주·배당 수집 + formatDartContext 인자 전달", async () => {
    mSearch.mockResolvedValueOnce([
      { corpCode: "00126380", stockCode: "005930" },
    ] as never);
    mInfo.mockResolvedValueOnce({
      corpName: "삼성전자",
      stockCode: "005930",
    } as never);
    const SUMMARIES = [{ year: 2024, revenue: 300 }];
    const EMPLOYEES = [{ fo_bbm: "전체" }];
    const SHAREHOLDERS = [{ nm: "이재용" }];
    const DIVIDENDS = [{ seType: "주당배당금" }];
    mMultiYear.mockResolvedValueOnce(SUMMARIES as never);
    mEmployees.mockResolvedValueOnce(EMPLOYEES as never);
    mShareholders.mockResolvedValueOnce(SHAREHOLDERS as never);
    mDividends.mockResolvedValueOnce(DIVIDENDS as never);
    mWorkforce.mockReturnValueOnce({ totalEmployees: 1000 } as never);
    mFormat.mockReturnValueOnce("==LISTED-CTX==");

    const r = await collectDartContext("삼성전자", "financial_health");

    expect(r.ok).toBe(true);
    expect(r.isListed).toBe(true);
    expect(r.corpCode).toBe("00126380");
    expect(r.corpName).toBe("삼성전자");
    // 헤더 + formatDartContext 결과 합성
    expect(r.text).toContain("기업: 삼성전자 (corp_code=00126380");
    expect(r.text).toContain("종목 005930");
    expect(r.text).toContain("==LISTED-CTX==");
    // formatDartContext 인자 검증
    const arg = mFormat.mock.calls[0][0];
    expect(arg.perspective).toBe("financial_health");
    expect(arg.financialSummaries).toBe(SUMMARIES);
    expect(arg.shareholders).toBe(SHAREHOLDERS);
    expect(arg.dividends).toBe(DIVIDENDS);
    // employees 있음 → extractWorkforceSummary 결과 설정
    expect(mWorkforce).toHaveBeenCalledWith(EMPLOYEES, 2025);
    expect(arg.workforceSummary).toEqual({ totalEmployees: 1000 });
  });

  it("employees 비어있음 → workforceSummary 미설정(extractWorkforceSummary 미호출)", async () => {
    mSearch.mockResolvedValueOnce([
      { corpCode: "C1", stockCode: "111111" },
    ] as never);
    mInfo.mockResolvedValueOnce({ corpName: "상장사X" } as never);
    mMultiYear.mockResolvedValueOnce([{ year: 2024 }] as never);
    mEmployees.mockResolvedValueOnce([] as never);
    mShareholders.mockResolvedValueOnce([] as never);
    mDividends.mockResolvedValueOnce([] as never);

    const r = await collectDartContext("상장사X", "growth");

    expect(r.ok).toBe(true);
    expect(r.isListed).toBe(true);
    expect(mWorkforce).not.toHaveBeenCalled();
    const arg = mFormat.mock.calls[0][0];
    expect(arg.workforceSummary).toBeUndefined();
  });

  it("상장사 but 다년재무 [] → getUnlistedCompanyDisclosureContext 폴백 (UC-41-E6/TC-41.15)", async () => {
    mSearch.mockResolvedValueOnce([
      { corpCode: "C2", stockCode: "222222" },
    ] as never);
    mInfo.mockResolvedValueOnce({ corpName: "신규상장" } as never);
    mMultiYear.mockResolvedValueOnce([] as never); // 재무 미공시
    mEmployees.mockResolvedValueOnce([] as never);
    mShareholders.mockResolvedValueOnce([] as never);
    mDividends.mockResolvedValueOnce([] as never);
    mDisclosure.mockResolvedValueOnce({
      success: true,
      context: "==DISCLOSURE-FALLBACK==",
    } as never);

    const r = await collectDartContext("신규상장", "comprehensive");

    expect(r.ok).toBe(true);
    expect(r.isListed).toBe(true); // stockCode 있으니 상장 판정 유지
    expect(mDisclosure).toHaveBeenCalledWith("C2", "신규상장");
    const arg = mFormat.mock.calls[0][0];
    expect(arg.disclosureContext).toBe("==DISCLOSURE-FALLBACK==");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. collectDartContext — 비상장사 흐름 (UC-41 Step4 분기) P0
// ══════════════════════════════════════════════════════════════════════════
describe("collectDartContext — 비상장사 흐름 (UC-41 Step4)", () => {
  it("stockCode 없음 + 공시 success → {ok:true, isListed:false, 비상장 헤더}", async () => {
    mSearch.mockResolvedValueOnce([{ corpCode: "U1" }] as never);
    mInfo.mockResolvedValueOnce({ corpName: "비상장㈜" } as never);
    mDisclosure.mockResolvedValueOnce({
      success: true,
      context: "==UNLISTED-CTX==",
    } as never);
    mFormat.mockReturnValueOnce("==FMT-UNLISTED==");

    const r = await collectDartContext("비상장㈜", "governance");

    expect(r.ok).toBe(true);
    expect(r.isListed).toBe(false);
    expect(r.corpCode).toBe("U1");
    expect(r.text).toContain("비상장"); // 헤더에 ", 비상장"
    expect(r.text).toContain("==FMT-UNLISTED==");
    // 비상장은 재무/인력/주주/배당 미수집(분기 격리)
    expect(mMultiYear).not.toHaveBeenCalled();
    expect(mShareholders).not.toHaveBeenCalled();
    const arg = mFormat.mock.calls[0][0];
    expect(arg.disclosureContext).toBe("==UNLISTED-CTX==");
  });

  it("비상장 + 공시 success:false → {ok:false, '공시를 찾지 못했', isListed:false}", async () => {
    mSearch.mockResolvedValueOnce([{ corpCode: "U2" }] as never);
    mInfo.mockResolvedValueOnce({ corpName: "공시없음㈜" } as never);
    mDisclosure.mockResolvedValueOnce({
      success: false,
      error: "감사보고서 없음",
    } as never);

    const r = await collectDartContext("공시없음㈜", "risk");

    expect(r.ok).toBe(false);
    expect(r.isListed).toBe(false);
    expect(r.corpCode).toBe("U2");
    expect(r.text).toContain("공시를 찾지 못했");
    expect(r.text).toContain("감사보고서 없음");
    expect(mFormat).not.toHaveBeenCalled(); // 실패 → 압축 미진입
  });

  it("후보 stockCode 없음이나 companyInfo.stockCode 존재 → 상장 판정(isListed:true)", async () => {
    mSearch.mockResolvedValueOnce([{ corpCode: "C3" }] as never);
    mInfo.mockResolvedValueOnce({
      corpName: "후행상장",
      stockCode: "333333",
    } as never);
    mMultiYear.mockResolvedValueOnce([{ year: 2024 }] as never);
    mEmployees.mockResolvedValueOnce([] as never);
    mShareholders.mockResolvedValueOnce([] as never);
    mDividends.mockResolvedValueOnce([] as never);

    const r = await collectDartContext("후행상장", "profitability");

    expect(r.ok).toBe(true);
    expect(r.isListed).toBe(true); // companyInfo.stockCode 로 상장 판정
    expect(mMultiYear).toHaveBeenCalled(); // 상장 경로 진입
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. buildDartAnalysisQuery — 순수 결정성 (TC-41.19 계열 / AC-24) P0
//    mock 불요 — LLM/IO 0 순수 함수. 정확 문자열 단언.
// ══════════════════════════════════════════════════════════════════════════
describe("buildDartAnalysisQuery — 순수 결정성 (AC-24)", () => {
  it("정확 문자열 구조: 헤더·관점라벨·dartContext·taskInstruction·면책문", () => {
    const out = buildDartAnalysisQuery(
      "삼성전자",
      "financial_health",
      "CTX",
      "TASK",
    );
    expect(out).toContain("# 삼성전자 DART 분석 요청");
    expect(out).toContain("**분석 관점**: 재무건전성");
    expect(out).toContain("**데이터원**: DART 전자공시");
    expect(out).toContain("## DART 공시 데이터");
    // dartContext 삽입 위치: 'DART 공시 데이터' 헤더 뒤
    const ctxIdx = out.indexOf("CTX");
    const taskIdx = out.indexOf("TASK");
    expect(ctxIdx).toBeGreaterThan(out.indexOf("## DART 공시 데이터"));
    // taskInstruction 은 dartContext 뒤, 면책문 앞
    expect(taskIdx).toBeGreaterThan(ctxIdx);
    expect(out).toContain("⚠️ 본 분석은 참고용");
    expect(out.indexOf("⚠️ 본 분석은 참고용")).toBeGreaterThan(taskIdx);
  });

  it("동일 입력 2회 호출 → 완전 동일 출력(결정성 NFR-18)", () => {
    const a = buildDartAnalysisQuery("현대차", "growth", "C", "T");
    const b = buildDartAnalysisQuery("현대차", "growth", "C", "T");
    expect(a).toEqual(b);
    expect(a === b || a.length === b.length).toBe(true);
  });

  it("시그니처 4-arg (contextItems/annualYears/quarterlyCount 폐기)", () => {
    // 함수 길이 = 명시 파라미터 수. 폐기 인자가 남아있으면 4 초과.
    expect(buildDartAnalysisQuery.length).toBe(4);
  });

  it("8관점 라벨 전수: PERSPECTIVE_LABELS 정답지(medigate 기준)", () => {
    for (const p of PERSPECTIVES) {
      const out = buildDartAnalysisQuery("X", p, "C", "T");
      expect(out).toContain(`**분석 관점**: ${LABELS[p]}`);
    }
    // 각 라벨이 실제로 한글 정답인지 명시 검증(추측 금지)
    expect(buildDartAnalysisQuery("X", "comprehensive", "C", "T")).toContain(
      "**분석 관점**: 종합 분석",
    );
    expect(buildDartAnalysisQuery("X", "governance", "C", "T")).toContain(
      "**분석 관점**: 지배구조",
    );
    expect(buildDartAnalysisQuery("X", "workforce", "C", "T")).toContain(
      "**분석 관점**: 인력/조직",
    );
    expect(buildDartAnalysisQuery("X", "valuation", "C", "T")).toContain(
      "**분석 관점**: 밸류에이션",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. PERSPECTIVES 정합 (D5 AnalysisPerspective 1:1, 미이식 4종 부재) P0
// ══════════════════════════════════════════════════════════════════════════
describe("PERSPECTIVES 정합 (D5 1:1 / 미이식 4종 부재)", () => {
  it("PERSPECTIVES = 8종, AnalysisPerspective(D5) 와 1:1", () => {
    expect([...PERSPECTIVES].sort()).toEqual(
      [
        "comprehensive",
        "financial_health",
        "governance",
        "growth",
        "profitability",
        "risk",
        "valuation",
        "workforce",
      ].sort(),
    );
    expect(PERSPECTIVES).toHaveLength(8);
    // 중복 0
    expect(new Set(PERSPECTIVES).size).toBe(8);
  });

  it("미이식 4종(investment_thesis/peer_comparison 등) 부재", () => {
    const set = new Set<string>(PERSPECTIVES as readonly string[]);
    for (const absent of [
      "investment_thesis",
      "peer_comparison",
      "esg",
      "macro",
    ]) {
      expect(set.has(absent)).toBe(false);
    }
  });

  it("모든 PERSPECTIVES 가 LABELS 정답지에 한글 라벨을 가짐", () => {
    for (const p of PERSPECTIVES) {
      expect(LABELS[p]).toBeTruthy();
      expect(/[가-힣]/.test(LABELS[p])).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. 폐기 의존 0 (AC-26 — TC-47.1/47.7 정적검사) P0
//    소스 import 문에 gemini/perplexity/kis/auth/next-server/TokenUsage 0.
//    grep≠AST: 주석 제거 후 실행 경로 import 절만 판정.
// ══════════════════════════════════════════════════════════════════════════
describe("폐기 종속 정적검사 0 (AC-26 / TC-47.1·47.7)", () => {
  const source = readFileSync(SOURCE, "utf8");

  /** 줄단위 라인주석(//) + 블록주석(/* *​/) 본문 제거 → 실행 경로만. */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
  }
  const code = stripComments(source);
  const importStmts =
    code.match(/import[\s\S]*?from\s+["'][^"']+["'];?/g) ?? [];
  const joined = importStmts.join("\n");

  it("import 절에 gemini/generative-ai/perplexity/kis 0건", () => {
    expect(/@google\/generative-ai/i.test(joined)).toBe(false);
    expect(/GoogleGenerativeAI/i.test(joined)).toBe(false);
    expect(/\bgemini\b/i.test(joined)).toBe(false);
    expect(/perplexity/i.test(joined)).toBe(false);
    expect(/\bkis\b/i.test(joined)).toBe(false);
  });

  it("import 절에 auth/next-server/TokenUsage 0건 (폐기 4종)", () => {
    expect(/next\/server/.test(joined)).toBe(false);
    expect(/\bTokenUsage/.test(joined)).toBe(false);
    expect(/from\s+["'][^"']*\/auth["']/.test(joined)).toBe(false);
  });

  it("실행 경로(주석 제외)에 analyzeCompany*/perplexity 호출 0건", () => {
    expect(/analyzeCompany/i.test(code)).toBe(false);
    expect(/perplexity/i.test(code)).toBe(false);
    expect(/GoogleGenerativeAI/.test(code)).toBe(false);
  });

  it("import 경로 = @/lib/dart 계열 + context-formatter 만(폐기 클라이언트 0)", () => {
    expect(joined).toContain("@/lib/dart");
    expect(joined).toContain("@/lib/dart/disclosure");
    expect(joined).toContain("@/lib/dart/context-formatter");
    expect(/@langchain|openai|axios|node-fetch|undici/i.test(joined)).toBe(
      false,
    );
  });
});

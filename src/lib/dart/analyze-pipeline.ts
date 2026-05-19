/**
 * DART 고정 분석 파이프라인 (고정흐름 재설계 — D10).
 *
 * medigate `ai-analysis/route.ts` 동형의 **고정 흐름** — LLM 자율
 * 위임 0. 전용 라우트(D11)가 이 모듈을 명시 호출한다.
 *
 *  - collectDartContext  : 구 dartTool(7c90b19, 폐기) 본문에서 ClientTool
 *    래퍼·zod·description 만 벗긴 데이터 수집 흐름(IO). searchCompany
 *    식별 → 상장/비상장 분기 → 다년재무·인력·주주·배당 or 공시원문 →
 *    context-formatter(D5/OPEN-5) 압축 텍스트. 실패는 throw 아닌 안내
 *    문자열(graceful — NFR-18, UC-41 에러분기).
 *  - buildDartAnalysisQuery : medigate `route.ts` 1529행 추출(순수
 *    문자열 조립). contextItems/annualYears/quarterlyCount 인자
 *    **폐기**(고정흐름 — 사용자는 corpName+perspective 만 제공,
 *    데이터 범위는 collectDartContext 가 고정). gemini/auth/
 *    TokenUsage 의존 0.
 *
 * 순수/IO 분리: buildDartAnalysisQuery 는 LLM/IO 0 순수 함수(단위
 * 테스트 mock 불요). collectDartContext 는 백엔드 IO(테스트 시 mock).
 * gemini/perplexity/kis/auth/next-server 의존 0(FR-27).
 */

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
import {
  formatDartContext,
  type AnalysisPerspective,
  type DartCompactInput,
} from "@/lib/dart/context-formatter";

/** 8관점 (D5 AnalysisPerspective / D11 zod enum 정합 SSOT) */
export const PERSPECTIVES = [
  "financial_health",
  "growth",
  "profitability",
  "valuation",
  "governance",
  "risk",
  "workforce",
  "comprehensive",
] as const satisfies readonly AnalysisPerspective[];

/** 관점 한글 라벨 (medigate PERSPECTIVE_LABELS 8관점만 — 미이식 2종 제외) */
const PERSPECTIVE_LABELS: Record<AnalysisPerspective, string> = {
  comprehensive: "종합 분석",
  financial_health: "재무건전성",
  growth: "성장성",
  profitability: "수익성",
  valuation: "밸류에이션",
  governance: "지배구조",
  risk: "리스크",
  workforce: "인력/조직",
};

/** 직전 사업연도(연간 11011 기준 — 최신 확정 보고서) */
function lastYear(): string {
  return String(new Date().getFullYear() - 1);
}

/** 수집 결과 — 성공 시 압축 컨텍스트, 실패 시 안내 메시지(graceful) */
export interface DartContextResult {
  ok: boolean;
  /** ok=true: context-formatter 압축 텍스트(+헤더). ok=false: 안내문 */
  text: string;
  corpName: string;
  corpCode?: string;
  isListed?: boolean;
}

/**
 * DART 데이터 수집 (구 dartTool 본문 — ClientTool 래퍼 제거).
 * corpName → corpCode 식별 → 상장/비상장 분기 → 압축 텍스트.
 * 실패는 throw 가 아닌 ok:false + 안내문(라우트가 SSE 로 전달).
 */
export async function collectDartContext(
  corpName: string,
  perspective: AnalysisPerspective,
): Promise<DartContextResult> {
  const name = corpName?.trim();
  if (!name) {
    return {
      ok: false,
      text: "기업명이 비어 있습니다. 분석할 기업명을 알려주세요.",
      corpName: corpName ?? "",
    };
  }

  // 기업 식별 (UC-41 Step2)
  let candidates;
  try {
    candidates = await searchCompany(name);
  } catch {
    return {
      ok: false,
      text: `"${name}" 기업 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`,
      corpName: name,
    };
  }
  if (!candidates || candidates.length === 0) {
    return {
      ok: false,
      text: `"${name}" 에 해당하는 DART 등록 기업을 찾지 못했습니다. 정확한 상호를 확인해주세요.`,
      corpName: name,
    };
  }

  // 상장사 우선 정렬(searchCompany)이므로 첫 후보 채택 (UC-41-E1).
  const picked = candidates[0];
  const corpCode = picked.corpCode;
  const companyInfo = await getCompanyInfo(corpCode);
  const isListed = !!picked.stockCode || !!companyInfo?.stockCode;

  const input: DartCompactInput = { perspective, financialSummaries: [] };

  if (isListed) {
    // 상장사: 다년 재무 요약 + 인력/주주/배당 (UC-41 Step4)
    const [summaries, employees, shareholders, dividends] = await Promise.all([
      getMultiYearFinancialSummary(corpCode, 5),
      getEmployees(corpCode, lastYear(), "11011"),
      getMajorShareholders(corpCode, lastYear(), "11011"),
      getDividends(corpCode, lastYear(), "11011"),
    ]);
    input.financialSummaries = summaries;
    if (employees.length > 0) {
      input.workforceSummary = extractWorkforceSummary(
        employees,
        Number(lastYear()),
      );
    }
    input.shareholders = shareholders;
    input.dividends = dividends;

    if (summaries.length === 0) {
      // 상장사이나 재무 미공시 — 공시 원문 폴백(UC-41-E6)
      const ctx = await getUnlistedCompanyDisclosureContext(
        corpCode,
        companyInfo?.corpName || name,
      );
      if (ctx.success) input.disclosureContext = ctx.context;
    }
  } else {
    // 비상장사: 재무제표 없음 → 공시 원문이 주 입력
    const ctx = await getUnlistedCompanyDisclosureContext(
      corpCode,
      companyInfo?.corpName || name,
    );
    if (!ctx.success) {
      return {
        ok: false,
        text: `"${name}"(비상장)의 분석 가능한 공시를 찾지 못했습니다: ${
          ctx.error ?? "공시 없음"
        }`,
        corpName: name,
        corpCode,
        isListed: false,
      };
    }
    input.disclosureContext = ctx.context;
  }

  const header = `기업: ${companyInfo?.corpName || name} (corp_code=${corpCode}${
    picked.stockCode ? `, 종목 ${picked.stockCode}` : ", 비상장"
  })`;
  // OPEN-5: context-formatter 가 raw → 압축 텍스트. LLM 미진입 보장.
  return {
    ok: true,
    text: `${header}\n\n${formatDartContext(input)}`,
    corpName: companyInfo?.corpName || name,
    corpCode,
    isListed,
  };
}

/**
 * DART 분석 LLM 쿼리 빌드 (medigate route.ts 1529행 — 순수).
 * contextItems/annualYears/quarterlyCount 인자 폐기(고정흐름).
 * dartContext = collectDartContext 압축 텍스트, taskInstruction =
 * dartPrompts.getTaskInstruction(perspective).
 */
export function buildDartAnalysisQuery(
  corpName: string,
  perspective: AnalysisPerspective,
  dartContext: string,
  taskInstruction: string,
): string {
  const perspectiveLabel = PERSPECTIVE_LABELS[perspective] || perspective;

  return `# ${corpName} DART 분석 요청

## 분석 설정
- **분석 관점**: ${perspectiveLabel}
- **데이터원**: DART 전자공시(재무·인력·주주·배당 또는 공시 원문)

---

## DART 공시 데이터

${dartContext}

---

${taskInstruction}

⚠️ 본 분석은 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.`;
}

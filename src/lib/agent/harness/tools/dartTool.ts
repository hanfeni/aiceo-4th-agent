import { tool } from "langchain";
import { z } from "zod";
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

/**
 * DART 기업 펀더멘털 데이터 수집 ClientTool (FR-21 — H4 커스텀 도구).
 *
 * exampleTool(현재시각)과 동일 ClientTool 패턴(`tool()` from langchain,
 * zod ^4 — R1). webSearchTool 의 *DisplayName/*Description 별도 export
 * 패턴도 동습("도구 1개 = 파일 1개", NFR-3).
 *
 * R5 격리 (architect 확정): dartTool 은 **HARNESS_TOOLS 에 등록하지
 * 않는다**. dartAnalyst subagent 의 tools:[dartTool] 에만 직접 주입 —
 * 메인 에이전트가 직접 DART 를 호출하면 raw/대용량 출력이 본문에
 * 누출될 위험이 있어, subagent namespace 차단(agent.ts isSubagent
 * Namespace)으로 R5/FR-26 을 구조적으로 보장한다. 단 사고 패널
 * 한글 표시는 필요하므로 HARNESS_TOOL_DISPLAY_NAMES 에는 등록(FR-08).
 *
 * 동작: corpName → corpCode 식별(UC-41 Step2) → 상장사면 다년 재무
 * 요약+인력+주주+배당 수집, 비상장/재무없음이면 공시 원문 맥락 →
 * context-formatter(D5, OPEN-5)로 관점별 압축 직렬화. raw JSON 은
 * LLM 컨텍스트 미진입(D5 가 보장). rate-limit 은 D3 가 흡수.
 *
 * 실패는 throw 가 아닌 안내 문자열 반환(graceful — NFR-18, subagent
 * 가 🔴미확인 표기 후 진행. UC-41 에러 분기).
 */

/** 사고 패널 한글 표시명 (FR-08 — 백엔드 미제공, 도구 파일이 선언) */
export const dartToolDisplayName = "DART 기업데이터";

/** ServerTool 류와 구조 호환 — introspect 역결합 회피(webSearch 동형) */
export const dartToolDescription =
  "기업명으로 DART 전자공시 펀더멘털 데이터(재무·인력·주주·배당 또는 " +
  "비상장 공시 원문)를 수집해 분석 관점별로 압축한 텍스트를 반환한다. " +
  "raw JSON 미반환(컨텍스트 압축 — OPEN-5). 8관점 분석 subagent 전용.";

const PERSPECTIVES = [
  "financial_health",
  "growth",
  "profitability",
  "valuation",
  "governance",
  "risk",
  "workforce",
  "comprehensive",
] as const satisfies readonly AnalysisPerspective[];

export const dartTool = tool(
  async ({
    corpName,
    perspective,
  }: {
    corpName: string;
    perspective: AnalysisPerspective;
  }): Promise<string> => {
    const name = corpName?.trim();
    if (!name) return "기업명이 비어 있습니다. 분석할 기업명을 알려주세요.";

    // Step 2 — 기업 식별 (UC-41 Step2)
    let candidates;
    try {
      candidates = await searchCompany(name);
    } catch {
      return `"${name}" 기업 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`;
    }
    if (!candidates || candidates.length === 0) {
      return `"${name}" 에 해당하는 DART 등록 기업을 찾지 못했습니다. 정확한 상호를 확인해주세요.`;
    }
    // 상장사 우선 정렬(searchCompany)이므로 첫 후보 채택. 동명이인은
    // 후보 목록을 안내(subagent 가 사용자에게 확인 — UC-41-E1).
    const picked = candidates[0];
    const corpCode = picked.corpCode;

    const companyInfo = await getCompanyInfo(corpCode);
    const isListed = !!picked.stockCode || !!companyInfo?.stockCode;

    const input: DartCompactInput = {
      perspective,
      financialSummaries: [],
    };

    if (isListed) {
      // 상장사: 다년 재무 요약 + 인력/주주/배당 (UC-41 Step4)
      const [summaries, employees, shareholders, dividends] =
        await Promise.all([
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
        // 상장사이나 재무 미공시 — 공시 원문 폴백(UC-41-E6 흐름)
        const ctx = await getUnlistedCompanyDisclosureContext(
          corpCode,
          companyInfo?.corpName || name,
        );
        if (ctx.success) input.disclosureContext = ctx.context;
      }
    } else {
      // 비상장사: 재무제표 없음 → 공시 원문이 주 입력 (UC-41 비상장)
      const ctx = await getUnlistedCompanyDisclosureContext(
        corpCode,
        companyInfo?.corpName || name,
      );
      if (!ctx.success) {
        return `"${name}"(비상장)의 분석 가능한 공시를 찾지 못했습니다: ${
          ctx.error ?? "공시 없음"
        }`;
      }
      input.disclosureContext = ctx.context;
    }

    const header = `기업: ${companyInfo?.corpName || name} (corp_code=${corpCode}${
      picked.stockCode ? `, 종목 ${picked.stockCode}` : ", 비상장"
    })`;
    // OPEN-5: context-formatter 가 raw → 압축 텍스트. LLM 미진입 보장.
    return `${header}\n\n${formatDartContext(input)}`;
  },
  {
    name: "dart_company_data",
    description: dartToolDescription,
    schema: z.object({
      corpName: z.string().describe("분석 대상 기업명 (예: '삼성전자')"),
      perspective: z
        .enum(PERSPECTIVES)
        .describe(
          "분석 관점. 8종 — financial_health/growth/profitability/" +
            "valuation/governance/risk/workforce/comprehensive(종합).",
        ),
    }),
  },
);

/** 직전 사업연도(연간 11011 기준 — 최신 확정 보고서) */
function lastYear(): string {
  return String(new Date().getFullYear() - 1);
}

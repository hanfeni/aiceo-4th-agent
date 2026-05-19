/**
 * DART 분석 컨텍스트 압축 레이어 (OPEN-5 — PRD §3.10 확정).
 *
 * 이식 출처: medigate `analysis.service.ts`(10fb7f4) 44~97행의
 * format*Data() **만** 이식(STRUCTURAL #3 — analysis.service 통째
 * 이식 금지: GoogleGenerativeAI·analyzeCompany* 미이식 → gemini 0).
 *
 * 역할: raw DART 데이터(재무/인력/주주/배당/공시)를 LLM 컨텍스트
 * 진입 **직전** 경계에서 컴팩트 텍스트로 직렬화. raw JSON 은
 * subagent 컨텍스트에 절대 들어가지 않는다(architect OPEN-5 발견 —
 * 원본도 raw stringify 경로 부재). 8관점별 항목 선별 + top-N 절단 +
 * 통화 정규화로 토큰 폭발을 결정적으로 방어(TC-41.19 회귀 스냅샷).
 *
 * 순수 모듈: LLM/IO/네트워크 0. 동일 입력 동일 출력(NFR-18) —
 * D6 dartTool 이 백엔드 수집 결과를 이 함수로 직렬화해 반환.
 */

import type {
  FinancialSummary,
  WorkforceSummary,
  DartShareholder,
  DartDividend,
} from "@/types/dart";

/** 8관점 (PRD §3 — D7 dartPrompts 와 공유될 SSOT) */
export type AnalysisPerspective =
  | "financial_health"
  | "growth"
  | "profitability"
  | "valuation"
  | "governance"
  | "risk"
  | "workforce"
  | "comprehensive";

/** 압축 상한 (토큰 폭발 방어 — top-N 절단 결정 상수) */
const MAX_FINANCIAL_YEARS = 5; // 재무 시계열 최대 연수
const MAX_SHAREHOLDERS = 5; // 주주 top-N (원본 slice(0,5) 보존)
const MAX_DIVIDEND_ROWS = 8; // 배당 항목 상한

/** 숫자 포맷 (억 단위 — 원본 formatBillion 보존) */
function formatBillion(value?: number): string {
  if (value === undefined || value === null) return "-";
  return `${value.toLocaleString()}억`;
}

/** 재무 데이터 → 컴팩트 텍스트 (원본 formatFinancialData + 연수 절단) */
export function formatFinancialData(summaries: FinancialSummary[]): string {
  if (summaries.length === 0) return "재무 데이터 없음";
  // top-N 절단: 최근 MAX_FINANCIAL_YEARS 만 (토큰 폭발 방어)
  const bounded = summaries.slice(-MAX_FINANCIAL_YEARS);
  return bounded
    .map(
      (s) => `
[${s.year}년]
- 매출액: ${formatBillion(s.revenue)}
- 영업이익: ${formatBillion(s.operatingProfit)}
- 당기순이익: ${formatBillion(s.netIncome)}
- 총자산: ${formatBillion(s.totalAssets)}
- 자기자본: ${formatBillion(s.totalEquity)}
- 부채비율: ${s.debtRatio?.toFixed(1)}%
- ROE: ${s.roe?.toFixed(1)}%
- ROA: ${s.roa?.toFixed(1)}%
`,
    )
    .join("\n");
}

/** 인력 데이터 → 컴팩트 텍스트 (원본 formatWorkforceData 보존) */
export function formatWorkforceData(summary?: WorkforceSummary): string {
  if (!summary) return "인력 데이터 없음";
  return `
[${summary.year}년 인력현황]
- 총 직원수: ${summary.totalEmployees?.toLocaleString()}명
- 정규직: ${summary.regularCount?.toLocaleString()}명
- 계약직: ${summary.contractCount?.toLocaleString()}명
- 평균 근속연수: ${summary.averageTenure || "-"}년
- 1인 평균급여: ${
    summary.averageSalary ? `${summary.averageSalary.toLocaleString()}만원` : "-"
  }
`;
}

/** 주주 데이터 → 컴팩트 텍스트 (원본 top5 절단 보존) */
export function formatShareholderData(shareholders: DartShareholder[]): string {
  if (shareholders.length === 0) return "주주 데이터 없음";
  return shareholders
    .slice(0, MAX_SHAREHOLDERS)
    .map((s) => `- ${s.nm} (${s.relate}): ${s.trmnPosessnStkQotaRt || "-"}%`)
    .join("\n");
}

/** 배당 데이터 → 컴팩트 텍스트 (top-N 절단 — 원본엔 없던 압축 강화) */
export function formatDividendData(dividends: DartDividend[]): string {
  if (dividends.length === 0) return "배당 데이터 없음";
  return dividends
    .slice(0, MAX_DIVIDEND_ROWS)
    .map(
      (d) =>
        `- ${d.seType || d.se || "구분"}${
          d.stockKnd ? `(${d.stockKnd})` : ""
        }: 당기 ${d.thstrm || "-"} / 전기 ${d.frmtrm || "-"}`,
    )
    .join("\n");
}

/** D6 dartTool 이 넘기는 압축 입력 (raw 가 아닌 요약 단계 산출) */
export interface DartCompactInput {
  perspective: AnalysisPerspective;
  financialSummaries: FinancialSummary[];
  workforceSummary?: WorkforceSummary;
  shareholders?: DartShareholder[];
  dividends?: DartDividend[];
  /** 비상장사 공시 전문(D4 context.ts 산출, 이미 길이 제한됨) */
  disclosureContext?: string;
}

/**
 * 관점별 기본 DART 항목 매핑 (medigate 원본 SSOT — 사용자 HITL
 * 2026-05-19 "원본 매핑 그대로"). 출처: medigate
 * `AI_ANALYSIS_REFERENCES.md` §5 "분석 관점별 기본 선택 DART 항목".
 * medigate 에서 실측 검증된 도메인 지식(추측 아님).
 *
 * 항목 = 지표 그룹 단위. context-formatter 의 5개 섹션으로 환원:
 *  - financial   ← core/profitability/stability/growth/efficiency/
 *                  cashflow 중 하나 이상(재무제표 파생)
 *  - shareholders ← governance 항목
 *  - workforce    ← workforce 항목
 *  - dividend     ← dividend 항목
 *  - disclosure   ← disclosure 또는 audit 항목
 */
const PERSPECTIVE_ITEMS: Record<AnalysisPerspective, readonly string[]> = {
  comprehensive: [
    "core", "profitability", "stability", "growth", "efficiency",
    "cashflow", "governance", "workforce", "dividend",
    "disclosure", "audit",
  ],
  financial_health: ["core", "stability", "cashflow", "disclosure", "audit"],
  growth: ["core", "growth", "efficiency", "disclosure"],
  profitability: ["core", "profitability", "efficiency", "audit"],
  valuation: ["core", "profitability", "growth", "dividend", "audit"],
  governance: ["core", "governance", "workforce", "disclosure"],
  risk: ["core", "stability", "cashflow", "disclosure", "audit"],
  workforce: ["core", "workforce", "profitability", "governance"],
};

const FINANCIAL_ITEMS = new Set([
  "core", "profitability", "stability", "growth", "efficiency", "cashflow",
]);

/**
 * 관점별 DART 섹션 선별 — OPEN-5 압축의 핵심. 원본 항목 매핑을
 * 5개 섹션으로 환원(관점 무관 섹션 제외 = 토큰 압축 + 노이즈 제거).
 * 비상장사(financialSummaries 비어 disclosureContext 가 주 입력)는
 * 호출부(formatDartContext)가 disclosureContext 존재 시 항상 포함하므로
 * 여기선 관점 매핑만 충실히 반영(disclosure 항목 유무).
 */
function selectSections(perspective: AnalysisPerspective): {
  financial: boolean;
  workforce: boolean;
  shareholders: boolean;
  dividend: boolean;
  disclosure: boolean;
} {
  const items = PERSPECTIVE_ITEMS[perspective];
  const has = (k: string) => items.includes(k);
  return {
    financial: items.some((i) => FINANCIAL_ITEMS.has(i)),
    workforce: has("workforce"),
    shareholders: has("governance"),
    dividend: has("dividend"),
    disclosure: has("disclosure") || has("audit"),
  };
}

/**
 * 압축 입력 → subagent 컨텍스트 텍스트 (관점 선별 + 직렬화).
 * 이것이 LLM 에 들어가는 유일한 DART 표현 — raw JSON 미진입.
 */
export function formatDartContext(input: DartCompactInput): string {
  const sel = selectSections(input.perspective);
  const parts: string[] = [`## DART 분석 데이터 (관점: ${input.perspective})`];

  if (sel.financial) {
    parts.push(`### 재무\n${formatFinancialData(input.financialSummaries)}`);
  }
  if (sel.workforce) {
    parts.push(`### 인력\n${formatWorkforceData(input.workforceSummary)}`);
  }
  if (sel.shareholders) {
    parts.push(
      `### 주주\n${formatShareholderData(input.shareholders ?? [])}`,
    );
  }
  if (sel.dividend) {
    parts.push(`### 배당\n${formatDividendData(input.dividends ?? [])}`);
  }
  if (sel.disclosure && input.disclosureContext) {
    parts.push(`### 공시 원문\n${input.disclosureContext}`);
  }

  return parts.join("\n\n");
}

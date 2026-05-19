/**
 * DART AI 분석 서비스
 * Gemini를 사용한 기업 분석
 * Agent 4 전용
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  DartCompanyInfo,
  FinancialSummary,
  WorkforceSummary,
  DartShareholder,
  DartDividend,
  CompanyAnalysis,
} from '@/types/dart';
import type { TokenUsage } from '@/lib/external/gemini';

// 분석 결과 (토큰 포함)
export interface AnalyzeCompanyResult {
  analysis: CompanyAnalysis;
  usage: TokenUsage;
}

// 스트리밍 메타데이터 타입
export interface StreamUsageMetadata {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string;
}

export type AnalysisStreamChunk = string | StreamUsageMetadata;

// Gemini API 클라이언트
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * 숫자 포맷팅 (억 단위)
 */
function formatBillion(value?: number): string {
  if (value === undefined || value === null) return '-';
  return `${value.toLocaleString()}억`;
}

/**
 * 재무 데이터를 문자열로 변환
 */
function formatFinancialData(summaries: FinancialSummary[]): string {
  if (summaries.length === 0) return '재무 데이터 없음';

  return summaries.map(s => `
[${s.year}년]
- 매출액: ${formatBillion(s.revenue)}
- 영업이익: ${formatBillion(s.operatingProfit)}
- 당기순이익: ${formatBillion(s.netIncome)}
- 총자산: ${formatBillion(s.totalAssets)}
- 자기자본: ${formatBillion(s.totalEquity)}
- 부채비율: ${s.debtRatio?.toFixed(1)}%
- ROE: ${s.roe?.toFixed(1)}%
- ROA: ${s.roa?.toFixed(1)}%
`).join('\n');
}

/**
 * 인력 데이터를 문자열로 변환
 */
function formatWorkforceData(summary?: WorkforceSummary): string {
  if (!summary) return '인력 데이터 없음';

  return `
[${summary.year}년 인력현황]
- 총 직원수: ${summary.totalEmployees?.toLocaleString()}명
- 정규직: ${summary.regularCount?.toLocaleString()}명
- 계약직: ${summary.contractCount?.toLocaleString()}명
- 평균 근속연수: ${summary.averageTenure || '-'}년
- 1인 평균급여: ${summary.averageSalary ? `${summary.averageSalary.toLocaleString()}만원` : '-'}
`;
}

/**
 * 주주 데이터를 문자열로 변환
 */
function formatShareholderData(shareholders: DartShareholder[]): string {
  if (shareholders.length === 0) return '주주 데이터 없음';

  const top5 = shareholders.slice(0, 5);
  return top5.map(s =>
    `- ${s.nm} (${s.relate}): ${s.trmnPosessnStkQotaRt || '-'}%`
  ).join('\n');
}

const MODEL_NAME = 'gemini-2.0-flash';

/**
 * 기업 AI 분석 수행 (토큰 포함)
 */
export async function analyzeCompanyWithUsage(params: {
  companyInfo: DartCompanyInfo;
  financialSummaries: FinancialSummary[];
  workforceSummary?: WorkforceSummary;
  shareholders?: DartShareholder[];
  dividends?: DartDividend[];
}): Promise<AnalyzeCompanyResult> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const { companyInfo, financialSummaries, workforceSummary, shareholders } = params;

  const prompt = `
당신은 전문 기업 분석가입니다. 다음 기업의 데이터를 분석하여 종합적인 투자 의견을 제시하세요.

## 기업 정보
- 기업명: ${companyInfo.corpName}
- 영문명: ${companyInfo.corpNameEng || '-'}
- 대표자: ${companyInfo.ceoName || '-'}
- 업종: ${companyInfo.industryCode || '-'}
- 설립일: ${companyInfo.estDate || '-'}
- 결산월: ${companyInfo.accMonth || '-'}월
- 주소: ${companyInfo.address || '-'}

## 재무 현황
${formatFinancialData(financialSummaries)}

## 인력 현황
${formatWorkforceData(workforceSummary)}

## 주요 주주
${shareholders ? formatShareholderData(shareholders) : '데이터 없음'}

---

다음 JSON 형식으로 분석 결과를 작성하세요:

{
  "summary": "기업에 대한 2-3문장 종합 요약",
  "strengths": ["강점 1", "강점 2", "강점 3"],
  "weaknesses": ["약점 1", "약점 2"],
  "opportunities": ["기회 1", "기회 2"],
  "threats": ["위협 1", "위협 2"],
  "financialHighlights": "재무 현황에 대한 핵심 분석 (2-3문장)",
  "riskFactors": ["리스크 요인 1", "리스크 요인 2"],
  "recommendation": "투자 의견 및 근거 (3-4문장)"
}

주의사항:
- 실제 데이터를 기반으로 구체적인 수치를 언급하세요
- 긍정적/부정적 측면을 균형있게 분석하세요
- 투자 조언이 아닌 정보 제공 목적임을 명심하세요
- 반드시 유효한 JSON 형식으로 응답하세요
`;

  const defaultUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    model: MODEL_NAME,
  };

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 토큰 사용량 추출
    const usageMetadata = result.response.usageMetadata;
    const usage: TokenUsage = {
      inputTokens: usageMetadata?.promptTokenCount || 0,
      outputTokens: usageMetadata?.candidatesTokenCount || 0,
      cachedTokens: (usageMetadata as { cachedContentTokenCount?: number })?.cachedContentTokenCount || 0,
      model: MODEL_NAME,
    };

    console.log(`[DART AI] analyzeCompany 완료 - Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Model: ${usage.model}`);

    // JSON 추출
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }

    const analysis: CompanyAnalysis = JSON.parse(jsonMatch[0]);

    // 필수 필드 검증
    if (!analysis.summary || !analysis.strengths || !analysis.weaknesses) {
      throw new Error('Invalid analysis format');
    }

    return { analysis, usage };
  } catch (error) {
    console.error('Failed to analyze company:', error);

    // 기본 분석 반환
    return {
      analysis: {
        summary: `${companyInfo.corpName}에 대한 분석을 수행할 수 없습니다.`,
        strengths: ['데이터 분석 중 오류가 발생했습니다.'],
        weaknesses: [],
        opportunities: [],
        threats: [],
        recommendation: '분석을 다시 시도해 주세요.',
      },
      usage: defaultUsage,
    };
  }
}

/**
 * 기존 호환성 유지 함수
 */
export async function analyzeCompany(params: {
  companyInfo: DartCompanyInfo;
  financialSummaries: FinancialSummary[];
  workforceSummary?: WorkforceSummary;
  shareholders?: DartShareholder[];
  dividends?: DartDividend[];
}): Promise<CompanyAnalysis> {
  const result = await analyzeCompanyWithUsage(params);
  return result.analysis;
}

/**
 * 스트리밍 기업 분석 (토큰 포함)
 */
export async function* analyzeCompanyStream(params: {
  companyInfo: DartCompanyInfo;
  financialSummaries: FinancialSummary[];
  workforceSummary?: WorkforceSummary;
  shareholders?: DartShareholder[];
}): AsyncGenerator<AnalysisStreamChunk, void, unknown> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const { companyInfo, financialSummaries, workforceSummary, shareholders } = params;

  const prompt = `
당신은 전문 기업 분석가입니다. 다음 기업의 데이터를 분석하여 종합적인 리포트를 작성하세요.

## 기업 정보
- 기업명: ${companyInfo.corpName}
- 영문명: ${companyInfo.corpNameEng || '-'}
- 대표자: ${companyInfo.ceoName || '-'}
- 업종: ${companyInfo.industryCode || '-'}
- 설립일: ${companyInfo.estDate || '-'}

## 재무 현황
${formatFinancialData(financialSummaries)}

## 인력 현황
${formatWorkforceData(workforceSummary)}

## 주요 주주
${shareholders ? formatShareholderData(shareholders) : '데이터 없음'}

---

다음 형식으로 분석 리포트를 작성하세요:

## 📊 기업 개요
[2-3문장으로 기업 소개]

## 💪 강점
- [강점 1]
- [강점 2]
- [강점 3]

## ⚠️ 약점
- [약점 1]
- [약점 2]

## 💡 기회 요인
- [기회 1]
- [기회 2]

## 🚨 위험 요인
- [위험 1]
- [위험 2]

## 💰 재무 분석
[재무 현황에 대한 상세 분석]

## 📈 투자 의견
[투자 관점에서의 종합 의견]

---
⚠️ 본 분석은 정보 제공 목적이며, 투자 결정의 근거로 사용할 수 없습니다.
`;

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  try {
    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }

      // 토큰 사용량 추출
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || 0;
        outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        cachedTokens = (chunk.usageMetadata as { cachedContentTokenCount?: number }).cachedContentTokenCount || 0;
      }
    }

    // 마지막에 토큰 사용량 메타데이터 전송
    console.log(`[DART AI] 스트리밍 완료 - Input: ${inputTokens}, Output: ${outputTokens}, Model: ${MODEL_NAME}`);
    yield {
      type: 'usage',
      inputTokens,
      outputTokens,
      cachedTokens,
      model: MODEL_NAME,
    };
  } catch (error) {
    console.error('Streaming analysis error:', error);
    yield `분석 중 오류가 발생했습니다: ${error}`;
  }
}

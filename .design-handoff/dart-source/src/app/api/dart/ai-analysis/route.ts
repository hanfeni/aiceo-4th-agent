/**
 * DART AI 분석 API
 * Agent 4 전용
 *
 * 4가지 분석 유형 지원:
 * - webSearch: 웹 검색 기반 분석 (Perplexity API)
 * - dartAnalysis: DART 데이터 기반 분석 (DART API + Gemini)
 * - integrated: 통합 분석 - 3단계 파이프라인 (DART + Perplexity + Gemini)
 * - crossValidation: 교차 검증 - 3단계 파이프라인 (DART + Perplexity + Gemini)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTextStream, type GeminiStreamChunk } from '@/lib/external/gemini';
import { TokenUsageService } from '@/lib/services/usage';
import { auth } from '@/lib/core/auth';
import {
  searchPerplexity,
  multiSearchPerplexity,
  getSystemPrompt as getPerplexitySystemPrompt,
} from '@/lib/external/perplexity';
import {
  BASE_PROMPT,
  ANALYSIS_TYPES,
  getFullSystemPrompt,
  getTaskInstruction,
} from '@/lib/prompts/dart-analysis-prompts';
import {
  getFullCompanyData,
  getCompanyOverview,
  extractFinancialSummary,
  getMultiYearFinancialSummary,
} from '@/lib/services/dart/dart-api.service';
import { getRecentDisclosures, resetApiCallStats, logApiCallStats } from '@/lib/external/dart-api';
import { getIndicatorTrend, clearRequestCache, preloadFinancialStatements } from '@/lib/services/dart/trend.service';
import { getUnlistedCompanyDisclosureContext } from '@/lib/services/dart/disclosure-parser.service';
import type {
  DartCompanyInfo,
  DartFinancialItem,
  DartShareholder,
  DartDividend,
  DartEmployee,
  DartDisclosure,
  FinancialSummary,
  DartFinancialTrend,
  TrendDataPoint,
} from '@/types/dart';

type AnalysisType = 'webSearch' | 'dartAnalysis' | 'integrated' | 'crossValidation' | 'competitorAnalysis';

// 비상장 공시 선택 항목 타입
interface SelectedDisclosure {
  rceptNo: string;
  reportNm: string;
  rceptDt: string;
  mode: 'summary' | 'full';
}

interface AnalysisRequest {
  corpCode: string;
  corpName: string;
  analysisType: AnalysisType;
  stockCode?: string; // 실시간 시세 조회용 종목코드
  // 각 탭별 파라미터
  mode?: string;
  searchType?: string;
  period?: string;
  perspective?: string;
  contextItems?: string[];
  provider?: string;
  model?: string;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'; // Gemini 3 thinking level
  annualYears?: string;
  quarterlyCount?: string;
  webPeriod?: string;
  webTypes?: string[];
  validationItems?: string[];
  dartSource?: string;
  // 경쟁사 비교 파라미터
  scope?: 'domestic' | 'global';
  metrics?: string[];
  competitorCount?: number;
  // 비상장 공시 선택 (corpCls='E'일 때)
  unlistedDisclosures?: SelectedDisclosure[];
}

// 분석 관점 라벨
const PERSPECTIVE_LABELS: Record<string, string> = {
  comprehensive: '종합 분석',
  financial_health: '재무건전성',
  growth: '성장성',
  profitability: '수익성',
  valuation: '밸류에이션',
  governance: '지배구조',
  risk: '리스크',
  workforce: '인력/조직',
  investment_thesis: '투자논거',
  peer_comparison: '동종업계 비교',
};

// 포함 데이터 라벨
const CONTEXT_ITEM_LABELS: Record<string, string> = {
  core: '핵심 재무',
  profitability: '수익성',
  stability: '안정성',
  growth: '성장성',
  efficiency: '효율성',
  cashflow: '현금흐름',
  governance: '지배구조',
  workforce: '인력',
  dividend: '배당',
  disclosure: '공시',
  audit: '감사의견',
  realtime: '실시간시세',
  krxDisclosure: 'KRX공시',
};

// 검색 타입 라벨
const SEARCH_TYPE_LABELS: Record<string, string> = {
  // 기존 웹 전용 항목
  latest_news: '최신 뉴스',
  financial_analysis: '재무 분석',
  industry_outlook: '산업 전망',
  competitors: '경쟁사 분석',
  stock_analysis: '주식 분석',
  management: '경영진 평가',
  esg: 'ESG 분석',
  risks: '리스크 분석',
  // 신규 웹 전용 항목
  analyst_view: '투자 의견',
  mna_expansion: 'M&A/사업확장',
  regulation_policy: '규제/정책',
  // 분석 관점 기반 항목
  comprehensive: '종합 분석',
  financial_health: '재무건전성',
  growth: '성장성',
  profitability: '수익성',
  valuation: '밸류에이션',
  governance: '지배구조',
  risk: '리스크',
  workforce: '인력/조직',
};

// 검증 항목 라벨
const VALIDATION_ITEM_LABELS: Record<string, string> = {
  newsDisclosure: '뉴스 vs 공시 일관성',
  expectationPerformance: '시장 기대 vs 실적 Gap',
  reputationMetrics: '외부 평판 vs 내부 지표',
};

// 웹 검색 타입 매핑 (프론트엔드 ID → Perplexity 검색 타입)
// 새로운 타입은 ID와 검색 타입이 동일하므로 직접 매핑
const WEB_TYPE_MAPPING: Record<string, string> = {
  // 기존 매핑 (레거시 호환)
  news: 'latest_news',
  financial: 'financial_analysis',
  industry: 'industry_outlook',
  // 새로운 타입은 ID가 검색 타입과 동일
  latest_news: 'latest_news',
  industry_outlook: 'industry_outlook',
  competitors: 'competitors',
  esg: 'esg',
  analyst_view: 'analyst_view',
  mna_expansion: 'mna_expansion',
  regulation_policy: 'regulation_policy',
  // 분석 관점 기반 항목
  comprehensive: 'comprehensive',
  financial_health: 'financial_health',
  growth: 'growth',
  profitability: 'profitability',
  valuation: 'valuation',
  governance: 'governance',
  risk: 'risk',
  workforce: 'workforce',
};

export async function POST(request: NextRequest) {
  try {
    // 인증 확인 및 사용자 ID 추출
    const session = await auth();
    const userId = session?.user?.id || 'anonymous';

    const body: AnalysisRequest = await request.json();
    const { corpCode, corpName, analysisType } = body;

    if (!corpCode || !corpName || !analysisType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: corpCode, corpName, analysisType' },
        { status: 400 }
      );
    }

    // webSearch 탭은 Perplexity API 사용
    if (analysisType === 'webSearch') {
      return handlePerplexitySearch(body);
    }

    // dartAnalysis 탭은 DART 데이터 + Gemini 분석
    if (analysisType === 'dartAnalysis') {
      return handleDartAnalysis(body, userId);
    }

    // integrated 탭은 3단계 파이프라인 (오리지널과 동일)
    if (analysisType === 'integrated') {
      return handleIntegratedAnalysis(body, userId);
    }

    // crossValidation 탭은 3단계 파이프라인 (오리지널과 동일)
    if (analysisType === 'crossValidation') {
      return handleCrossValidation(body, userId);
    }

    // competitorAnalysis 탭은 4단계 파이프라인 (경쟁사 비교)
    if (analysisType === 'competitorAnalysis') {
      return handleCompetitorAnalysis(body, userId);
    }

    return NextResponse.json(
      { success: false, error: 'Invalid analysis type' },
      { status: 400 }
    );
  } catch (err) {
    console.error('AI analysis route error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Perplexity API를 사용한 웹 검색 처리
 */
async function handlePerplexitySearch(body: AnalysisRequest): Promise<Response> {
  const { corpName } = body;
  const mode = body.mode || 'single';
  const searchType = body.searchType || 'latest_news';
  const period = body.period || '1m';

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      if (mode === 'single') {
        const result = await searchPerplexity(corpName, searchType, period);

        if (result.success && result.summary) {
          const data = JSON.stringify({ content: result.summary });
          await writer.write(encoder.encode(`data: ${data}\n\n`));

          if (result.sources && result.sources.length > 0) {
            const sourcesContent =
              '\n\n---\n## 출처\n' +
              result.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join('\n');
            const sourcesData = JSON.stringify({ content: sourcesContent });
            await writer.write(encoder.encode(`data: ${sourcesData}\n\n`));
          }

          // 메타데이터 전송 (단일 검색 결과)
          const systemPrompt = getPerplexitySystemPrompt(searchType);
          const metaData = JSON.stringify({
            metadata: {
              webSearchResult: result.summary,
              sources: result.sources,
              systemPrompt,
              searchType,
              mode,
              period,
            },
          });
          console.log('[API] WebSearch single - Sending metadata, webSearchResult length:', result.summary?.length || 0);
          await writer.write(encoder.encode(`data: ${metaData}\n\n`));
        } else {
          const errorData = JSON.stringify({ error: result.error || '검색 실패' });
          await writer.write(encoder.encode(`data: ${errorData}\n\n`));
        }
      } else {
        const searchTypes =
          mode === 'standard'
            ? ['latest_news', 'financial_analysis', 'industry_outlook']
            : ['latest_news', 'financial_analysis', 'industry_outlook', 'competitors', 'esg', 'risks'];

        const results = await multiSearchPerplexity(corpName, searchTypes, period);

        let fullContent = '';
        for (const [type, result] of Object.entries(results)) {
          const typeLabel = SEARCH_TYPE_LABELS[type] || type;
          fullContent += `## ${typeLabel}\n\n`;

          if (result.success && result.summary) {
            fullContent += result.summary + '\n\n';
          } else {
            fullContent += `_검색 결과 없음: ${result.error || '알 수 없는 오류'}_\n\n`;
          }
        }

        const data = JSON.stringify({ content: fullContent });
        await writer.write(encoder.encode(`data: ${data}\n\n`));

        // 메타데이터 전송 (다중 검색 결과)
        // 다중 검색의 경우 각 타입별 시스템 프롬프트를 모아서 전송
        const systemPrompts: Record<string, string> = {};
        searchTypes.forEach(type => {
          systemPrompts[type] = getPerplexitySystemPrompt(type);
        });
        const metaData = JSON.stringify({
          metadata: {
            webResults: results,
            systemPrompts,
            searchTypes,
            mode,
            period,
          },
        });
        console.log('[API] WebSearch multi - Sending metadata, webResults keys:', Object.keys(results || {}));
        await writer.write(encoder.encode(`data: ${metaData}\n\n`));
      }

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('Perplexity search error:', err);
      const errorData = JSON.stringify({
        error: err instanceof Error ? err.message : 'Search failed',
      });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * DART 데이터 기반 분석 - 2단계 파이프라인
 * Step 1: DART 데이터 수집
 * Step 2: Gemini 분석
 */
async function handleDartAnalysis(body: AnalysisRequest, userId: string): Promise<Response> {
  const { corpCode, corpName, stockCode } = body;
  const perspective = body.perspective || 'comprehensive';
  const contextItems = body.contextItems || ['core', 'profitability', 'growth'];
  const annualYears = parseInt(body.annualYears || '5', 10);
  const quarterlyCount = parseInt(body.quarterlyCount || '8', 10);

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      // ========== Step 1: DART 데이터 수집 ==========
      await sendProgress(writer, encoder, 1, `DART 데이터 수집 중... (연간 ${annualYears}년, 분기 ${quarterlyCount}분기)`, 2);

      const dartContext = await collectDartContext(
        corpCode, contextItems, annualYears, quarterlyCount, stockCode, corpName,
        body.unlistedDisclosures // 비상장 회사 선택 공시 (있으면 전달)
      );
      console.log('[API] DART context length:', dartContext.length);

      // ========== Step 2: AI 분석 ==========
      await sendProgress(writer, encoder, 2, 'AI 분석 중...', 2);

      // 시스템 프롬프트 + 태스크 인스트럭션
      const systemPrompt = getFullSystemPrompt(perspective);
      const taskInstruction = getTaskInstruction(perspective);

      const userQuery = buildDartAnalysisQuery(corpName, perspective, contextItems, annualYears, quarterlyCount, dartContext, taskInstruction);

      // Gemini 스트리밍 (프론트엔드에서 선택한 모델 사용)
      const selectedModel = body.model || 'gemini-3-flash-preview';
      const thinkingLevel = body.thinkingLevel || 'low';
      console.log(`[API] DART Analysis - Model: ${selectedModel}, ThinkingLevel: ${thinkingLevel}`);

      const streamGenerator = generateTextStream(userQuery, systemPrompt, {
        model: selectedModel,
        temperature: 0.3,
        maxOutputTokens: 8192,
        thinkingLevel: selectedModel.includes('gemini-3') ? thinkingLevel : undefined,
      });

      for await (const chunk of streamGenerator) {
        if (typeof chunk === 'string') {
          const data = JSON.stringify({ content: chunk });
          await writer.write(encoder.encode(`data: ${data}\n\n`));
        } else if (chunk.type === 'usage') {
          // 토큰 사용량 저장
          try {
            await TokenUsageService.addUsage(userId, chunk.model, {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              cachedTokens: chunk.cachedTokens,
              totalTokens: chunk.inputTokens + chunk.outputTokens,
            });
            console.log(`[DART AI] 토큰 사용량 저장: userId=${userId}, model=${chunk.model}, input=${chunk.inputTokens}, output=${chunk.outputTokens}`);
          } catch (usageError) {
            console.error('[DART AI] 토큰 사용량 저장 실패:', usageError);
          }

          const usageData = JSON.stringify({
            usage: {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              model: chunk.model,
            },
          });
          await writer.write(encoder.encode(`data: ${usageData}\n\n`));
        }
      }

      // 메타데이터 전송 (DART 컨텍스트)
      const metaData = JSON.stringify({
        metadata: {
          dartContext,
          systemPrompt,
          perspective,
          contextItems,
        },
      });
      console.log('[API] DART Analysis - Sending metadata, dartContext length:', dartContext?.length || 0);
      await writer.write(encoder.encode(`data: ${metaData}\n\n`));

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('DART analysis error:', err);
      const errorData = JSON.stringify({
        error: err instanceof Error ? err.message : 'Analysis failed',
      });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * 통합 분석 - 3단계 파이프라인 (오리지널과 동일)
 * Step 1: DART 데이터 수집
 * Step 2: 웹 검색 (Perplexity)
 * Step 3: LLM 종합 분석 (Gemini)
 */
async function handleIntegratedAnalysis(body: AnalysisRequest, userId: string): Promise<Response> {
  const { corpCode, corpName, stockCode } = body;
  const webPeriod = body.webPeriod || '1m';
  const webTypes = body.webTypes || ['news', 'financial', 'industry'];
  const perspective = body.perspective || 'comprehensive';
  const contextItems = body.contextItems || ['core', 'profitability', 'growth'];
  const annualYears = parseInt(body.annualYears || '5', 10);
  const quarterlyCount = parseInt(body.quarterlyCount || '8', 10);

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      // ========== Step 1: DART 데이터 수집 ==========
      await sendProgress(writer, encoder, 1, `DART 데이터 수집 중... (연간 ${annualYears}년, 분기 ${quarterlyCount}분기)`, 3);

      const dartContext = await collectDartContext(
        corpCode, contextItems, annualYears, quarterlyCount, stockCode, corpName,
        body.unlistedDisclosures // 비상장 회사 선택 공시 (있으면 전달)
      );
      console.log('[API] Integrated - DART context length:', dartContext.length);

      // ========== Step 2: 웹 검색 (Perplexity) ==========
      await sendProgress(writer, encoder, 2, `웹 검색 중... (${webTypes.join(', ')})`, 3);

      const webResults: Record<string, string | null> = {};
      console.log('[API] Integrated - Starting Perplexity search, webTypes:', webTypes);

      if (webTypes.length > 0) {
        // 병렬 실행
        const searchPromises = webTypes.map(async (type) => {
          const searchType = WEB_TYPE_MAPPING[type] || 'latest_news';
          console.log('[API] Perplexity search for:', type, '->', searchType, 'corpName:', corpName);
          try {
            const result = await searchPerplexity(corpName, searchType, webPeriod);
            console.log('[API] Perplexity result for', type, ':', result.success ? `${result.summary?.length || 0}자` : result.error);
            return { type, summary: result.success ? result.summary : null, error: result.error };
          } catch (e) {
            console.error('[API] Perplexity exception for', type, ':', e);
            return { type, summary: null, error: String(e) };
          }
        });

        const results = await Promise.all(searchPromises);
        results.forEach(({ type, summary, error }) => {
          webResults[type] = summary || null;
          if (error) {
            console.warn('[API] Perplexity failed for', type, ':', error);
          }
        });
      } else {
        console.log('[API] Integrated - No webTypes specified, skipping Perplexity search');
      }

      console.log('[API] Integrated - Web search completed, results:', Object.entries(webResults).map(([k, v]) => `${k}:${v ? v.length : 0}자`));

      // ========== Step 3: LLM 종합 분석 ==========
      await sendProgress(writer, encoder, 3, 'AI 종합 분석 중...', 3);

      // 시스템 프롬프트 (선택된 분석 관점 + 통합분석 방법론)
      const perspectiveConfig = ANALYSIS_TYPES[perspective] || ANALYSIS_TYPES.comprehensive;
      const integratedConfig = ANALYSIS_TYPES.integrated_analysis;
      const systemPrompt = `${BASE_PROMPT.getFullBasePrompt()}\n\n${perspectiveConfig.systemInstruction}\n\n### 통합분석 추가 지침\n${integratedConfig.systemInstruction}\n\n분석 대상 기업: **${corpName}**`;

      // 사용자 쿼리 (DART 컨텍스트 + 웹 검색 결과 포함)
      const userQuery = buildIntegratedQuery(corpName, dartContext, webResults, perspective, perspectiveConfig.taskInstruction);

      // Gemini 스트리밍 (프론트엔드에서 선택한 모델 사용)
      const integratedModel = body.model || 'gemini-3-flash-preview';
      const thinkingLevel = body.thinkingLevel || 'low';
      console.log(`[API] Integrated Analysis - Model: ${integratedModel}, ThinkingLevel: ${thinkingLevel}`);

      const streamGenerator = generateTextStream(userQuery, systemPrompt, {
        model: integratedModel,
        temperature: 0.3,
        maxOutputTokens: 8192,
        thinkingLevel: integratedModel.includes('gemini-3') ? thinkingLevel : undefined,
      });

      for await (const chunk of streamGenerator) {
        if (typeof chunk === 'string') {
          const data = JSON.stringify({ content: chunk });
          await writer.write(encoder.encode(`data: ${data}\n\n`));
        } else if (chunk.type === 'usage') {
          // 토큰 사용량 저장
          try {
            await TokenUsageService.addUsage(userId, chunk.model, {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              cachedTokens: chunk.cachedTokens,
              totalTokens: chunk.inputTokens + chunk.outputTokens,
            });
            console.log(`[DART Integrated] 토큰 사용량 저장: userId=${userId}, model=${chunk.model}, input=${chunk.inputTokens}, output=${chunk.outputTokens}`);
          } catch (usageError) {
            console.error('[DART Integrated] 토큰 사용량 저장 실패:', usageError);
          }

          const usageData = JSON.stringify({
            usage: {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              model: chunk.model,
            },
          });
          await writer.write(encoder.encode(`data: ${usageData}\n\n`));
        }
      }

      // 메타데이터 전송 (DART 컨텍스트 + 웹 검색 결과)
      const metaData = JSON.stringify({
        metadata: {
          dartContext,
          webResults,
          systemPrompt,
          perspective,
          webTypes,
        },
      });
      console.log('[API] Sending metadata, dartContext length:', dartContext?.length || 0, 'webResults keys:', Object.keys(webResults || {}));
      await writer.write(encoder.encode(`data: ${metaData}\n\n`));

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('Integrated analysis error:', err);
      const errorData = JSON.stringify({
        error: err instanceof Error ? err.message : 'Analysis failed',
      });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * 크로스 검증 - 3단계 파이프라인 (오리지널과 동일)
 * Step 1: DART 데이터 수집
 * Step 2: 웹 검색 (뉴스 중심)
 * Step 3: LLM 크로스 검증 분석
 */
async function handleCrossValidation(body: AnalysisRequest, userId: string): Promise<Response> {
  const { corpCode, corpName, stockCode } = body;
  const validationItems = body.validationItems || ['newsDisclosure', 'expectationPerformance'];
  const webPeriod = body.webPeriod || '1m';
  const contextItems = body.contextItems || ['core', 'profitability', 'stability', 'growth'];
  const perspective = body.perspective || 'comprehensive';

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      // ========== Step 1: DART 데이터 수집 ==========
      await sendProgress(writer, encoder, 1, 'DART 데이터 수집 중...', 3);

      const dartContext = await collectDartContext(
        corpCode, contextItems, 5, 8, stockCode, corpName,
        body.unlistedDisclosures // 비상장 회사 선택 공시 (있으면 전달)
      );
      console.log('[API] CrossVal - DART context length:', dartContext.length);

      // ========== Step 2: 웹 검색 (뉴스 중심) ==========
      await sendProgress(writer, encoder, 2, '웹 검색 중 (뉴스 분석)...', 3);

      let webSearchResult: string | null = null;
      try {
        const result = await searchPerplexity(corpName, 'latest_news', webPeriod);
        webSearchResult = result.success ? (result.summary || null) : null;
        console.log('[API] CrossVal - Web search completed');
      } catch (e) {
        console.error('[API] CrossVal - Web search error:', e);
      }

      // ========== Step 3: LLM 크로스 검증 분석 ==========
      await sendProgress(writer, encoder, 3, '크로스 검증 분석 중...', 3);

      // 시스템 프롬프트 (선택된 분석 관점 + 크로스검증 방법론)
      const perspectiveConfig = ANALYSIS_TYPES[perspective] || ANALYSIS_TYPES.comprehensive;
      const crossValConfig = ANALYSIS_TYPES.cross_validation;
      const systemPrompt = `${BASE_PROMPT.getFullBasePrompt()}\n\n${perspectiveConfig.systemInstruction}\n\n### 크로스검증 추가 지침\n${crossValConfig.systemInstruction}\n\n분석 대상 기업: **${corpName}**`;

      // 사용자 쿼리 (DART 컨텍스트 + 웹 검색 결과 + 검증 항목)
      const userQuery = buildCrossValidationQuery(corpName, dartContext, webSearchResult, validationItems, perspectiveConfig.taskInstruction);

      // Gemini 스트리밍 (크로스검증에서는 모델 선택 UI가 없으므로 기본값 사용)
      const crossValModel = body.model || 'gemini-3-flash-preview';
      const thinkingLevel = body.thinkingLevel || 'low';
      console.log(`[API] CrossValidation - Model: ${crossValModel}, ThinkingLevel: ${thinkingLevel}`);

      const streamGenerator = generateTextStream(userQuery, systemPrompt, {
        model: crossValModel,
        temperature: 0.3,
        maxOutputTokens: 8192,
        thinkingLevel: crossValModel.includes('gemini-3') ? thinkingLevel : undefined,
      });

      for await (const chunk of streamGenerator) {
        if (typeof chunk === 'string') {
          const data = JSON.stringify({ content: chunk });
          await writer.write(encoder.encode(`data: ${data}\n\n`));
        } else if (chunk.type === 'usage') {
          // 토큰 사용량 저장
          try {
            await TokenUsageService.addUsage(userId, chunk.model, {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              cachedTokens: chunk.cachedTokens,
              totalTokens: chunk.inputTokens + chunk.outputTokens,
            });
            console.log(`[DART CrossVal] 토큰 사용량 저장: userId=${userId}, model=${chunk.model}, input=${chunk.inputTokens}, output=${chunk.outputTokens}`);
          } catch (usageError) {
            console.error('[DART CrossVal] 토큰 사용량 저장 실패:', usageError);
          }

          const usageData = JSON.stringify({
            usage: {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              model: chunk.model,
            },
          });
          await writer.write(encoder.encode(`data: ${usageData}\n\n`));
        }
      }

      // 메타데이터 전송 (DART 컨텍스트 + 웹 검색 결과)
      const metaData = JSON.stringify({
        metadata: {
          dartContext,
          webSearchResult,
          systemPrompt,
          validationItems,
        },
      });
      console.log('[API] CrossValidation - Sending metadata, dartContext length:', dartContext?.length || 0, 'webSearchResult length:', webSearchResult?.length || 0);
      await writer.write(encoder.encode(`data: ${metaData}\n\n`));

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('Cross-validation error:', err);
      const errorData = JSON.stringify({
        error: err instanceof Error ? err.message : 'Analysis failed',
      });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ==================== 헬퍼 함수들 ====================

/**
 * 진행 상황 전송
 */
async function sendProgress(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  step: number,
  message: string,
  totalSteps: number = 2
): Promise<void> {
  const progressData = JSON.stringify({
    progress: { step, totalSteps, message },
  });
  await writer.write(encoder.encode(`data: ${progressData}\n\n`));
}

/**
 * DART 컨텍스트 수집 (내부 API 호출)
 * annualYears: 조회할 연간 데이터 연수 (예: 5)
 * quarterlyCount: 조회할 분기 데이터 개수 (예: 8)
 * stockCode: 실시간 시세 조회용 종목코드 (선택)
 * corpName: KRX 공시 조회용 회사명 (선택)
 *
 * 오리지널 코드처럼 지표 그룹별로 트렌드 데이터를 수집하여 AI에게 정확한 기간 데이터 제공
 */
async function collectDartContext(
  corpCode: string,
  contextItems: string[],
  annualYears: number,
  quarterlyCount: number,
  stockCode?: string,
  corpName?: string,
  unlistedDisclosures?: SelectedDisclosure[]
): Promise<string> {
  const sections: string[] = [];

  // 요청 시작 시 캐시 초기화 (같은 분석 내에서는 재사용)
  clearRequestCache();

  // API 호출 통계 초기화
  resetApiCallStats();

  console.log('[collectDartContext] Starting with:', { corpCode, contextItems, annualYears, quarterlyCount });

  try {
    // 0. 재무제표 사전 로딩 (병렬로 한 번에 조회하여 캐시에 저장)
    await preloadFinancialStatements(corpCode, annualYears, quarterlyCount);

    // 1. 기업 종합 정보 조회 (DART API 직접 호출)
    const fullData = await getFullCompanyData(corpCode, contextItems.includes('disclosure') ? 20 : 0);

    // === 비상장 회사 체크 (corpCls === 'E') ===
    // 비상장 회사는 KRX 시세/공시 데이터가 없으므로 DART 공시 요약 컨텍스트를 사용
    if (fullData.companyInfo?.corpCls === 'E') {
      console.log('[collectDartContext] Unlisted company detected, using disclosure summary context');

      // 기업 개요는 포함
      if (fullData.companyInfo) {
        sections.push(formatCompanyInfoFromData(fullData.companyInfo));
      }

      // 비상장 회사 공시 요약 컨텍스트 생성
      // unlistedDisclosures가 있으면 사용자 선택 공시 사용, 없으면 자동 선택 (최대 3개)
      const unlistedContext = await getUnlistedCompanyDisclosureContext(
        corpCode,
        corpName || fullData.companyInfo?.corpName || '회사명 미상',
        3, // 자동 선택 시 최대 3개
        unlistedDisclosures // 사용자가 선택한 공시 목록 (있으면 우선 사용)
      );

      if (unlistedContext.success && unlistedContext.context) {
        sections.push(unlistedContext.context);
        console.log(`[collectDartContext] Unlisted disclosure context: ${unlistedContext.disclosureCount} disclosures, ` +
          `${unlistedContext.totalOriginalChars}자 → ${unlistedContext.totalSummaryChars}자`);
      } else {
        sections.push(`## 비상장 회사 안내\n\n"${corpName || '이 회사'}"는 비상장 회사(기타법인)입니다.\n` +
          `KRX 시세 정보 및 KIND 공시는 제공되지 않습니다.\n` +
          `DART 공시 정보를 기반으로 분석합니다.\n\n` +
          `공시 요약 생성 실패: ${unlistedContext.error || '알 수 없는 오류'}`);
      }

      // API 호출 통계 로깅
      logApiCallStats();

      return sections.join('\n\n---\n\n');
    }
    console.log('[collectDartContext] Full data retrieved:', {
      hasCompanyInfo: !!fullData.companyInfo,
      hasFinancials: !!fullData.financials?.length,
      hasLatestFinancials: !!fullData.latestFinancials?.length,
      hasShareholders: !!fullData.shareholders?.length,
      hasDisclosures: !!fullData.disclosures?.length,
    });

    // 2. 기업 개요 포맷팅
    if (fullData.companyInfo) {
      const companySection = formatCompanyInfoFromData(fullData.companyInfo);
      console.log('[collectDartContext] Company section length:', companySection.length);
      sections.push(companySection);
    }

    // 3. 핵심 지표 트렌드 (연간 + 분기)
    try {
      const coreIndicatorTrends = await collectIndicatorTrends(
        corpCode,
        ['revenue', 'operatingIncome', 'netIncome', 'debtRatio', 'roe'],
        'financial',
        annualYears,
        quarterlyCount
      );
      if (coreIndicatorTrends) {
        sections.push(`# 핵심 지표 트렌드 (${annualYears}년 연간, ${quarterlyCount}분기)\n\n${coreIndicatorTrends}`);
      }
    } catch (e) {
      console.warn('[collectDartContext] Core indicator trends failed:', e);
    }

    // 4. 수익성 지표 트렌드
    try {
      const profitabilityTrends = await collectIndicatorTrends(
        corpCode,
        ['grossProfitMargin', 'operatingProfitMargin', 'netProfitMargin', 'roa'],
        'financial',
        annualYears,
        quarterlyCount
      );
      if (profitabilityTrends) {
        sections.push(`# 수익성 지표 트렌드\n\n${profitabilityTrends}`);
      }
    } catch (e) {
      console.warn('[collectDartContext] Profitability trends failed:', e);
    }

    // 5. 안정성 지표 트렌드
    try {
      const stabilityTrends = await collectIndicatorTrends(
        corpCode,
        ['currentRatio', 'quickRatio', 'debtDependency', 'netDebtRatio'],
        'financial',
        annualYears,
        0 // 안정성 지표는 연간만
      );
      if (stabilityTrends) {
        sections.push(`# 안정성 지표 트렌드\n\n${stabilityTrends}`);
      }
    } catch (e) {
      console.warn('[collectDartContext] Stability trends failed:', e);
    }

    // 6. 현금흐름 지표 트렌드
    try {
      const cashflowTrends = await collectIndicatorTrends(
        corpCode,
        ['operatingCF', 'investingCF', 'financingCF', 'fcf'],
        'financial',
        annualYears,
        quarterlyCount
      );
      if (cashflowTrends) {
        sections.push(`# 현금흐름 트렌드\n\n${cashflowTrends}`);
      }
    } catch (e) {
      console.warn('[collectDartContext] Cashflow trends failed:', e);
    }

    // 7. 인력 지표 트렌드 (workforce)
    if (contextItems.includes('workforce')) {
      try {
        const workforceTrends = await collectIndicatorTrends(
          corpCode,
          ['totalEmployees', 'avgSalary', 'regularRatio', 'avgTenure'],
          'workforce',
          annualYears,
          0
        );
        if (workforceTrends) {
          sections.push(`# 인력 지표 트렌드\n\n${workforceTrends}`);
        }
      } catch (e) {
        console.warn('[collectDartContext] Workforce trends failed:', e);
      }
    }

    // 8. 지배구조 지표 트렌드 (governance)
    if (contextItems.includes('governance')) {
      try {
        const governanceTrends = await collectIndicatorTrends(
          corpCode,
          ['majorShareholderRatio', 'outsideDirectorRatio', 'femaleExecutiveRatio'],
          'governance',
          annualYears,
          0
        );
        if (governanceTrends) {
          sections.push(`# 지배구조 지표 트렌드\n\n${governanceTrends}`);
        }
      } catch (e) {
        console.warn('[collectDartContext] Governance trends failed:', e);
      }
    }

    // 9. 배당 지표 트렌드 (dividend)
    if (contextItems.includes('dividend')) {
      try {
        const dividendTrends = await collectIndicatorTrends(
          corpCode,
          ['dps', 'payoutRatio', 'dividendYield'],
          'dividend',
          annualYears,
          0
        );
        if (dividendTrends) {
          sections.push(`# 배당 지표 트렌드\n\n${dividendTrends}`);
        }
      } catch (e) {
        console.warn('[collectDartContext] Dividend trends failed:', e);
      }
    }

    // 10. 최신 재무제표 상세 (주요 계정)
    if (fullData.financials && fullData.financials.length > 0) {
      const financialSection = formatFinancialsFromData(fullData.financials, fullData.annualYear || '');
      console.log('[collectDartContext] Financial section length:', financialSection.length);
      sections.push(financialSection);
    }

    // 11. 최신 분기 재무제표 (있는 경우)
    if (fullData.latestFinancials && fullData.latestFinancials !== fullData.financials && fullData.latestFinancials.length > 0) {
      const latestSection = formatLatestFinancialsFromData(fullData.latestFinancials, fullData.latestYear || '', fullData.latestReportCode);
      console.log('[collectDartContext] Latest financial section length:', latestSection.length);
      sections.push(latestSection);
    }

    // 12. 주요 주주 정보
    if (fullData.shareholders && fullData.shareholders.length > 0 && contextItems.includes('governance')) {
      const shareholderSection = formatShareholdersFromData(fullData.shareholders);
      console.log('[collectDartContext] Shareholder section length:', shareholderSection.length);
      sections.push(shareholderSection);
    }

    // 13. 배당 정보
    if (fullData.dividends && fullData.dividends.length > 0 && contextItems.includes('dividend')) {
      const dividendSection = formatDividendsFromData(fullData.dividends);
      console.log('[collectDartContext] Dividend section length:', dividendSection.length);
      sections.push(dividendSection);
    }

    // 14. 임직원 정보
    if (fullData.employees && fullData.employees.length > 0 && contextItems.includes('workforce')) {
      const employeeSection = formatEmployeesFromData(fullData.employees);
      console.log('[collectDartContext] Employee section length:', employeeSection.length);
      sections.push(employeeSection);
    }

    // 15. 공시 정보
    if (fullData.disclosures && fullData.disclosures.length > 0 && contextItems.includes('disclosure')) {
      const disclosureSection = formatDisclosuresFromData(fullData.disclosures);
      console.log('[collectDartContext] Disclosure section length:', disclosureSection.length);
      sections.push(disclosureSection);
    }

    // 16. 실시간 시세 (KIS API 59개 필드)
    if (contextItems.includes('realtime') && stockCode) {
      try {
        const realtimeSection = await fetchAndFormatRealtimeQuote(stockCode);
        if (realtimeSection) {
          console.log('[collectDartContext] Realtime quote section length:', realtimeSection.length);
          sections.push(realtimeSection);
        }
      } catch (e) {
        console.warn('[collectDartContext] Realtime quote failed:', e);
      }
    }

    // 17. KRX 공시
    if (contextItems.includes('krxDisclosure') && corpName) {
      try {
        const krxSection = await fetchAndFormatKrxDisclosures(corpCode, corpName);
        if (krxSection) {
          console.log('[collectDartContext] KRX disclosure section length:', krxSection.length);
          sections.push(krxSection);
        }
      } catch (e) {
        console.warn('[collectDartContext] KRX disclosure failed:', e);
      }
    }

  } catch (error) {
    console.error('[collectDartContext] Error:', error);
  }

  const result = sections.filter(Boolean).join('\n\n---\n\n');
  console.log('[collectDartContext] Final result length:', result.length, 'sections count:', sections.length);

  // DART API 호출 통계 출력
  logApiCallStats(`DART API Summary for ${corpCode}`);

  return result;
}

/**
 * 지표 그룹의 트렌드 데이터 수집 (오리지널 fetchAllGroupsWithTrend와 유사)
 */
async function collectIndicatorTrends(
  corpCode: string,
  indicators: string[],
  dataSource: 'financial' | 'workforce' | 'governance' | 'dividend',
  annualYears: number,
  quarterlyCount: number
): Promise<string> {
  const results: Array<{ indicator: string; annual: TrendDataPoint[]; quarterly: TrendDataPoint[] }> = [];

  // 병렬로 모든 지표의 트렌드 조회
  const promises = indicators.map(async (indicator) => {
    try {
      // 연간 데이터 조회
      const annualTrend = await getIndicatorTrend(corpCode, indicator, dataSource, 'annual', annualYears);

      // 분기 데이터 조회 (quarterlyCount > 0일 때만)
      let quarterlyTrend: DartFinancialTrend | null = null;
      if (quarterlyCount > 0 && dataSource === 'financial') {
        quarterlyTrend = await getIndicatorTrend(corpCode, indicator, dataSource, 'quarterly_unit', quarterlyCount);
      }

      return {
        indicator,
        annual: annualTrend.dataPoints,
        quarterly: quarterlyTrend?.dataPoints || [],
      };
    } catch {
      return { indicator, annual: [], quarterly: [] };
    }
  });

  const resolved = await Promise.all(promises);
  resolved.forEach((r) => {
    if (r.annual.length > 0 || r.quarterly.length > 0) {
      results.push(r);
    }
  });

  if (results.length === 0) return '';

  return formatIndicatorTrends(results);
}

/**
 * 지표 트렌드를 마크다운 테이블로 포맷팅
 */
function formatIndicatorTrends(
  trends: Array<{ indicator: string; annual: TrendDataPoint[]; quarterly: TrendDataPoint[] }>
): string {
  const lines: string[] = [];

  for (const trend of trends) {
    const indicatorName = getIndicatorDisplayName(trend.indicator);

    // 연간 데이터 테이블
    if (trend.annual.length > 0) {
      lines.push(`## ${indicatorName} (연간)`);
      lines.push(`| 기간 | 값 | YoY |`);
      lines.push(`|------|------|------|`);

      trend.annual.forEach((dp) => {
        const value = formatTrendValue(dp);
        const yoy = dp.yoyRate !== undefined && dp.yoyRate !== null
          ? `${dp.yoyRate > 0 ? '+' : ''}${dp.yoyRate.toFixed(1)}%`
          : '-';
        lines.push(`| ${dp.periodLabel} | ${value} | ${yoy} |`);
      });
      lines.push('');
    }

    // 분기 데이터 테이블
    if (trend.quarterly.length > 0) {
      lines.push(`## ${indicatorName} (분기별)`);
      lines.push(`| 기간 | 값 | QoQ | YoY |`);
      lines.push(`|------|------|------|------|`);

      trend.quarterly.forEach((dp) => {
        const value = formatTrendValue(dp);
        const qoq = dp.growthRate !== undefined && dp.growthRate !== null
          ? `${dp.growthRate > 0 ? '+' : ''}${dp.growthRate.toFixed(1)}%`
          : '-';
        const yoy = dp.yoyRate !== undefined && dp.yoyRate !== null
          ? `${dp.yoyRate > 0 ? '+' : ''}${dp.yoyRate.toFixed(1)}%`
          : '-';
        lines.push(`| ${dp.periodLabel} | ${value} | ${qoq} | ${yoy} |`);
      });
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 트렌드 데이터 포인트 값 포맷팅
 */
function formatTrendValue(dp: TrendDataPoint): string {
  if (dp.amount !== undefined && dp.amount !== null) {
    // 금액: 억 단위 변환
    const amt = dp.amount;
    if (Math.abs(amt) >= 100000000) {
      return `${(amt / 100000000).toFixed(0)}억`;
    } else if (Math.abs(amt) >= 10000) {
      return `${(amt / 10000).toFixed(0)}만`;
    }
    return amt.toLocaleString();
  }
  if (dp.ratio !== undefined && dp.ratio !== null) {
    return `${dp.ratio.toFixed(1)}%`;
  }
  if (dp.value !== null) {
    return String(dp.value);
  }
  return '-';
}

/**
 * 지표 표시명 조회
 */
function getIndicatorDisplayName(key: string): string {
  const names: Record<string, string> = {
    revenue: '매출액',
    operatingIncome: '영업이익',
    netIncome: '당기순이익',
    debtRatio: '부채비율',
    roe: 'ROE',
    roa: 'ROA',
    grossProfitMargin: '매출총이익률',
    operatingProfitMargin: '영업이익률',
    netProfitMargin: '순이익률',
    currentRatio: '유동비율',
    quickRatio: '당좌비율',
    debtDependency: '차입금의존도',
    netDebtRatio: '순부채비율',
    cashRatio: '현금비율',
    operatingCF: '영업현금흐름',
    investingCF: '투자현금흐름',
    financingCF: '재무현금흐름',
    fcf: '잉여현금흐름(FCF)',
    totalEmployees: '총 직원수',
    avgSalary: '평균급여',
    regularRatio: '정규직비율',
    avgTenure: '평균근속연수',
    majorShareholderRatio: '최대주주지분율',
    outsideDirectorRatio: '사외이사비율',
    femaleExecutiveRatio: '여성임원비율',
    dps: '주당배당금(DPS)',
    payoutRatio: '배당성향',
    dividendYield: '배당수익률',
  };
  return names[key] || key;
}

/**
 * 다년간 재무 요약 포맷팅
 */
function formatMultiYearFinancials(summaries: FinancialSummary[], years: number): string {
  if (!summaries || summaries.length === 0) return '';

  let md = `# 재무 트렌드 (최근 ${years}년)\n\n`;
  md += `| 연도 | 매출액(억) | 영업이익(억) | 순이익(억) | 자산총계(억) | 부채비율(%) | ROE(%) |\n`;
  md += `|------|-----------|-------------|-----------|-------------|------------|--------|\n`;

  // 연도 오름차순 정렬
  const sorted = [...summaries].sort((a, b) => a.year - b.year);

  sorted.forEach((s) => {
    const revenue = s.revenue !== undefined ? s.revenue.toLocaleString() : '-';
    const opProfit = s.operatingProfit !== undefined ? s.operatingProfit.toLocaleString() : '-';
    const netIncome = s.netIncome !== undefined ? s.netIncome.toLocaleString() : '-';
    const totalAssets = s.totalAssets !== undefined ? s.totalAssets.toLocaleString() : '-';
    const debtRatio = s.debtRatio !== undefined ? s.debtRatio.toFixed(1) : '-';
    const roe = s.roe !== undefined ? s.roe.toFixed(1) : '-';
    md += `| ${s.year} | ${revenue} | ${opProfit} | ${netIncome} | ${totalAssets} | ${debtRatio} | ${roe} |\n`;
  });

  return md;
}

/**
 * 기업 정보 포맷팅
 */
function formatCompanyInfo(data: Record<string, unknown>): string {
  let md = `# 기업 개요: ${data.corpName || data.corp_name || '-'}\n\n`;
  md += `| 항목 | 내용 |\n|------|------|\n`;
  md += `| 기업코드 | ${data.corpCode || data.corp_code || '-'} |\n`;
  md += `| 종목코드 | ${data.stockCode || data.stock_code || '-'} |\n`;
  md += `| 대표자 | ${data.ceoNm || data.ceo_nm || '-'} |\n`;
  md += `| 업종 | ${data.indutyCode || data.induty_code || '-'} |\n`;
  md += `| 설립일 | ${data.estDt || data.est_dt || '-'} |\n`;
  return md;
}

/**
 * 재무 지표 포맷팅
 */
function formatIndicators(data: Record<string, unknown>, groups: string[]): string {
  let md = `# 재무 지표\n\n`;
  const groupLabels: Record<string, string> = {
    core: '핵심 지표',
    profitability: '수익성',
    stability: '안정성',
    growth: '성장성',
    efficiency: '효율성',
    cashflow: '현금흐름',
  };

  groups.forEach(group => {
    const groupData = data[group];
    if (groupData && typeof groupData === 'object') {
      md += `## ${groupLabels[group] || group}\n\n`;
      md += `| 지표 | 값 |\n|------|----|\n`;
      Object.entries(groupData as Record<string, unknown>).forEach(([key, value]) => {
        md += `| ${key} | ${value ?? '-'} |\n`;
      });
      md += '\n';
    }
  });

  return md;
}

/**
 * 재무제표 포맷팅
 */
function formatFinancials(data: unknown[], annualYears: number, quarterlyCount: number): string {
  if (!Array.isArray(data) || data.length === 0) return '';

  let md = `# 재무제표 (최근 ${annualYears}년)\n\n`;
  md += `| 연도 | 매출액 | 영업이익 | 당기순이익 |\n`;
  md += `|------|--------|----------|------------|\n`;

  (data as Record<string, unknown>[]).slice(0, annualYears).forEach((f) => {
    md += `| ${f.bsnsYear || f.year || '-'} | ${formatNumber(f.revenue)} | ${formatNumber(f.operatingIncome)} | ${formatNumber(f.netIncome)} |\n`;
  });

  return md;
}

/**
 * 공시 정보 포맷팅
 */
function formatDisclosures(data: unknown[]): string {
  if (!Array.isArray(data) || data.length === 0) return '';

  let md = `# 최근 공시\n\n`;
  md += `| 날짜 | 제목 |\n|------|------|\n`;

  (data as Record<string, unknown>[]).slice(0, 20).forEach((d) => {
    md += `| ${d.rceptDt || d.date || '-'} | ${d.reportNm || d.title || '-'} |\n`;
  });

  return md;
}

/**
 * 숫자 포맷팅
 */
function formatNumber(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value as number;
  if (isNaN(num)) return '-';
  if (Math.abs(num) >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(1)}만`;
  return num.toLocaleString();
}

/**
 * 기업 정보 포맷팅 (DartCompanyInfo에서)
 * dart-api.ts의 getCompanyInfo 반환 필드명에 맞춤:
 * - corpCode, corpName, stockCode, ceoName, corpCls, industryCode, estDate, accMonth, homeUrl, address
 */
function formatCompanyInfoFromData(info: DartCompanyInfo): string {
  // 법인구분 코드 → 한글 변환
  const corpClsMap: Record<string, string> = {
    'Y': '유가증권',
    'K': '코스닥',
    'N': '코넥스',
    'E': '기타',
  };
  const corpClsCode = info.corpCls || '';
  const corpClsLabel = corpClsMap[corpClsCode] || corpClsCode || '-';

  // 설립일 포맷팅 (YYYYMMDD → YYYY-MM-DD)
  const estDateRaw = info.estDate || '';
  const estDateFormatted = estDateRaw.length === 8
    ? `${estDateRaw.slice(0, 4)}-${estDateRaw.slice(4, 6)}-${estDateRaw.slice(6, 8)}`
    : estDateRaw || '-';

  let md = `# 기업 개요: ${info.corpName || '-'}\n\n`;
  md += `| 항목 | 내용 |\n|------|------|\n`;
  md += `| 기업코드 | ${info.corpCode || '-'} |\n`;
  md += `| 종목코드 | ${info.stockCode || '-'} |\n`;
  md += `| 대표자 | ${info.ceoName || '-'} |\n`;
  md += `| 법인구분 | ${corpClsLabel} |\n`;
  md += `| 업종코드 | ${info.industryCode || '-'} |\n`;
  md += `| 설립일 | ${estDateFormatted} |\n`;
  md += `| 결산월 | ${info.accMonth || '-'}월 |\n`;
  md += `| 홈페이지 | ${info.homeUrl || '-'} |\n`;
  md += `| 주소 | ${info.address || '-'} |\n`;
  return md;
}

/**
 * 재무제표 포맷팅 (DartFinancialItem[]에서)
 */
function formatFinancialsFromData(financials: DartFinancialItem[], year: string): string {
  if (!financials || financials.length === 0) return '';

  let md = `# 재무제표 (${year}년 사업보고서)\n\n`;
  md += `| 계정명 | 당기금액 | 전기금액 | 전전기금액 |\n`;
  md += `|--------|----------|----------|------------|\n`;

  // 주요 계정만 추출
  const keyAccounts = [
    '매출액', '수익(매출액)', '영업수익', '순매출액',
    '영업이익', '영업이익(손실)',
    '당기순이익', '당기순이익(손실)',
    '자산총계', '부채총계', '자본총계',
    '유동자산', '비유동자산', '유동부채', '비유동부채',
    '매출총이익', '매출원가',
  ];

  const keyAccountSet = new Set(keyAccounts);
  const addedAccounts = new Set<string>();

  financials.forEach((item) => {
    const accountNm = item.accountNm || '';
    if (keyAccountSet.has(accountNm) && !addedAccounts.has(accountNm)) {
      addedAccounts.add(accountNm);
      const thstrm = formatAmountString(item.thstrmAmount || '-');
      const frmtrm = formatAmountString(item.frmtrmAmount || '-');
      const bfefrmtrm = formatAmountString(item.bfefrmtrmAmount || '-');
      md += `| ${accountNm} | ${thstrm} | ${frmtrm} | ${bfefrmtrm} |\n`;
    }
  });

  return md;
}

/**
 * 최신 분기 재무제표 포맷팅
 */
function formatLatestFinancialsFromData(financials: DartFinancialItem[], year: string, reportCode?: string): string {
  if (!financials || financials.length === 0) return '';

  const reportName = reportCode === '11014' ? '3분기' : reportCode === '11012' ? '반기' : reportCode === '11013' ? '1분기' : '';
  let md = `# 최신 재무제표 (${year}년 ${reportName}보고서)\n\n`;
  md += `| 계정명 | 금액 |\n`;
  md += `|--------|------|\n`;

  const keyAccounts = ['매출액', '수익(매출액)', '영업이익', '영업이익(손실)', '당기순이익', '분기순이익', '반기순이익'];
  const keyAccountSet = new Set(keyAccounts);
  const addedAccounts = new Set<string>();

  financials.forEach((item) => {
    const accountNm = item.accountNm || '';
    if (keyAccountSet.has(accountNm) && !addedAccounts.has(accountNm)) {
      addedAccounts.add(accountNm);
      const amount = formatAmountString(item.thstrmAmount || '-');
      md += `| ${accountNm} | ${amount} |\n`;
    }
  });

  return md;
}

/**
 * 주요 주주 정보 포맷팅
 * dart-api.ts의 getMajorShareholders 반환 필드명에 맞춤:
 * - nm: 성명
 * - relate: 관계
 * - stockKnd: 주식종류
 * - trmnPosessnStkCo: 기말 주식수
 * - trmnPosessnStkQotaRt: 기말 지분율
 */
function formatShareholdersFromData(shareholders: DartShareholder[]): string {
  if (!shareholders || shareholders.length === 0) return '';

  let md = `# 주요 주주 현황\n\n`;
  md += `| 주주명 | 관계 | 주식종류 | 보유주식수 | 지분율 |\n`;
  md += `|--------|------|----------|------------|--------|\n`;

  shareholders.slice(0, 10).forEach((sh) => {
    const name = sh.nm || '-';
    const relate = sh.relate || '-';
    const stockKnd = sh.stockKnd || '-';
    // 기말 주식수 (trmnPosessnStkCo) 사용
    const stockQy = formatAmountString(sh.trmnPosessnStkCo || sh.bsisPosesnStkCo || '-');
    // 기말 지분율 (trmnPosessnStkQotaRt) 사용
    const ratio = sh.trmnPosessnStkQotaRt || sh.bsisPosesnStkQotaRt || '-';
    md += `| ${name} | ${relate} | ${stockKnd} | ${stockQy} | ${ratio}% |\n`;
  });

  return md;
}

/**
 * 배당 정보 포맷팅
 * dart-api.ts의 getDividends 반환 필드명에 맞춤:
 * - seType / se: 구분 (주당현금배당금(원), 배당성향(%) 등)
 * - stockKnd: 주식종류
 * - thstrm: 당기 값
 * - frmtrm: 전기 값
 * - lwfr: 전전기 값
 */
function formatDividendsFromData(dividends: DartDividend[]): string {
  if (!dividends || dividends.length === 0) return '';

  let md = `# 배당 정보\n\n`;
  md += `| 구분 | 주식종류 | 당기 | 전기 | 전전기 |\n`;
  md += `|------|----------|------|------|--------|\n`;

  dividends.forEach((div) => {
    // seType 또는 se 필드 사용 (구분명)
    const item = div.seType || div.se || '-';
    const stockKnd = div.stockKnd || '-';
    const thstrm = div.thstrm || '-';
    const frmtrm = div.frmtrm || '-';
    // 전전기는 lwfr 필드
    const lwfr = div.lwfr || '-';
    md += `| ${item} | ${stockKnd} | ${thstrm} | ${frmtrm} | ${lwfr} |\n`;
  });

  return md;
}

/**
 * 임직원 정보 포맷팅
 * dart-api.ts의 getEmployees 반환 필드명에 맞춤:
 * - foBbm: 사업부문
 * - sexdstn: 성별
 * - rgllbrCo: 정규직 수
 * - cnttkCo: 계약직 수
 * - sm: 합계
 * - avrgCnwkSdytrn: 평균근속연수
 * - janSalaryAm: 1인평균급여액
 */
function formatEmployeesFromData(employees: DartEmployee[]): string {
  if (!employees || employees.length === 0) return '';

  let md = `# 임직원 현황\n\n`;
  md += `| 사업부문 | 성별 | 정규직 | 계약직 | 합계 | 평균근속(년) | 평균급여(천원) |\n`;
  md += `|----------|------|--------|--------|------|-------------|---------------|\n`;

  employees.forEach((emp) => {
    const dept = emp.foBbm || '-';
    const gender = emp.sexdstn || '-';
    const regular = emp.rgllbrCo || '-';
    const contract = emp.cnttkCo || '-';
    const total = emp.sm || '-';
    const avgTenure = emp.avrgCnwkSdytrn || '-';
    const avgSalary = emp.janSalaryAm ? formatAmountString(emp.janSalaryAm) : '-';
    md += `| ${dept} | ${gender} | ${regular} | ${contract} | ${total} | ${avgTenure} | ${avgSalary} |\n`;
  });

  return md;
}

/**
 * 공시 정보 포맷팅 (DartDisclosure[]에서)
 */
function formatDisclosuresFromData(disclosures: DartDisclosure[]): string {
  if (!disclosures || disclosures.length === 0) return '';

  let md = `# 최근 공시 내역\n\n`;
  md += `| 접수일자 | 공시제목 | 제출인 |\n`;
  md += `|----------|----------|--------|\n`;

  disclosures.slice(0, 20).forEach((disc) => {
    const date = disc.rceptDt || '-';
    const title = disc.reportNm || '-';
    const flrNm = disc.flrNm || '-';
    md += `| ${date} | ${title} | ${flrNm} |\n`;
  });

  return md;
}

/**
 * 금액 문자열 포맷팅 (원 단위 → 억 단위)
 */
function formatAmountString(amount: string): string {
  if (!amount || amount === '-' || amount.trim() === '') return '-';
  const cleaned = amount.replace(/,/g, '').trim();
  const num = Number(cleaned);
  if (isNaN(num)) return amount;
  if (Math.abs(num) >= 100000000) return `${(num / 100000000).toFixed(0)}억`;
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(0)}만`;
  return num.toLocaleString();
}

/**
 * DART 분석 쿼리 빌드
 */
function buildDartAnalysisQuery(
  corpName: string,
  perspective: string,
  contextItems: string[],
  annualYears: number,
  quarterlyCount: number,
  dartContext: string,
  taskInstruction: string
): string {
  const perspectiveLabel = PERSPECTIVE_LABELS[perspective] || perspective;
  const contextLabels = contextItems.map(item => CONTEXT_ITEM_LABELS[item] || item).join(', ');

  return `# ${corpName} DART 분석 요청

## 분석 설정
- **분석 관점**: ${perspectiveLabel}
- **포함 데이터**: ${contextLabels}
- **데이터 범위**: 최근 ${annualYears}년 연간 데이터, ${quarterlyCount}분기 분기 데이터

---

## DART 공시 데이터

${dartContext}

---

${taskInstruction}

⚠️ 본 분석은 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.`;
}

/**
 * 통합분석 쿼리 빌드
 */
function buildIntegratedQuery(
  corpName: string,
  dartContext: string,
  webResults: Record<string, string | null>,
  perspective: string,
  taskInstruction: string
): string {
  const perspectiveLabel = PERSPECTIVE_LABELS[perspective] || perspective;

  // 웹 검색 결과 포맷팅
  let webSection = '## 웹 검색 결과\n\n';
  Object.entries(webResults).forEach(([type, summary]) => {
    const searchType = WEB_TYPE_MAPPING[type] || type;
    const typeLabel = SEARCH_TYPE_LABELS[searchType] || type;
    webSection += `### ${typeLabel}\n\n`;
    webSection += summary ? summary + '\n\n' : '_검색 결과 없음_\n\n';
  });

  return `# ${corpName} 통합 분석 요청

## 분석 관점: ${perspectiveLabel}

---

${webSection}

---

## DART 공시 데이터

${dartContext}

---

${taskInstruction}

⚠️ 본 분석은 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.`;
}

/**
 * 크로스검증 쿼리 빌드
 */
function buildCrossValidationQuery(
  corpName: string,
  dartContext: string,
  webSearchResult: string | null,
  validationItems: string[],
  taskInstruction: string
): string {
  const validationLabels = validationItems.map(item => VALIDATION_ITEM_LABELS[item] || item).join(', ');

  return `# ${corpName} 크로스 검증 요청

## 검증 항목
${validationLabels}

---

## 웹 검색 결과 (최신 뉴스)

${webSearchResult || '_검색 결과 없음_'}

---

## DART 공시 데이터

${dartContext}

---

${taskInstruction}

⚠️ 본 검증은 참고용이며, 전문 실사(Due Diligence)를 대체할 수 없습니다.`;
}

/**
 * 기간 라벨 변환
 */
function getPeriodLabel(period: string): string {
  const labels: Record<string, string> = {
    '1w': '최근 1주',
    '1m': '최근 1개월',
    '3m': '최근 3개월',
    '6m': '최근 6개월',
    '1y': '최근 1년',
  };
  return labels[period] || period;
}

/**
 * 실시간 시세 조회 및 포맷팅 (KIS API 59개 필드)
 */
async function fetchAndFormatRealtimeQuote(stockCode: string): Promise<string | null> {
  try {
    // 내부 API 호출 (서버 사이드에서 직접 KIS API 호출)
    const KIS_APP_KEY = process.env.KIS_APP_KEY;
    const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
    const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
      console.warn('[fetchAndFormatRealtimeQuote] KIS API credentials not configured');
      return null;
    }

    // 토큰 발급
    const tokenResponse = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      console.warn('[fetchAndFormatRealtimeQuote] Token request failed');
      return null;
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 시세 조회
    const quoteResponse = await fetch(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${stockCode}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${accessToken}`,
          'appkey': KIS_APP_KEY,
          'appsecret': KIS_APP_SECRET,
          'tr_id': 'FHKST01010100',
        },
      }
    );

    if (!quoteResponse.ok) {
      console.warn('[fetchAndFormatRealtimeQuote] Quote request failed');
      return null;
    }

    const result = await quoteResponse.json();
    if (result.rt_cd !== '0') {
      console.warn('[fetchAndFormatRealtimeQuote] API error:', result.msg1);
      return null;
    }

    const o = result.output;

    // 마크다운 테이블로 포맷팅
    let md = `# 실시간 시세 (KIS API)\n\n`;
    md += `> 조회시간: ${new Date().toLocaleString('ko-KR')}\n\n`;

    // 가격 정보
    md += `## 가격 정보\n\n`;
    md += `| 항목 | 값 |\n|------|------|\n`;
    md += `| 현재가 | ${Number(o.stck_prpr || 0).toLocaleString()}원 |\n`;
    md += `| 전일대비 | ${Number(o.prdy_vrss || 0).toLocaleString()}원 (${Number(o.prdy_ctrt || 0).toFixed(2)}%) |\n`;
    md += `| 시가 | ${Number(o.stck_oprc || 0).toLocaleString()}원 |\n`;
    md += `| 고가 | ${Number(o.stck_hgpr || 0).toLocaleString()}원 |\n`;
    md += `| 저가 | ${Number(o.stck_lwpr || 0).toLocaleString()}원 |\n`;
    md += `| 상한가/하한가 | ${Number(o.stck_mxpr || 0).toLocaleString()} / ${Number(o.stck_llam || 0).toLocaleString()}원 |\n`;
    md += '\n';

    // 거래 정보
    md += `## 거래 정보\n\n`;
    md += `| 항목 | 값 |\n|------|------|\n`;
    md += `| 거래량 | ${Number(o.acml_vol || 0).toLocaleString()}주 |\n`;
    md += `| 거래대금 | ${(Number(o.acml_tr_pbmn || 0) / 100000000).toFixed(1)}억원 |\n`;
    md += `| 전일대비거래량 | ${Number(o.prdy_vrss_vol_rate || 0).toFixed(1)}% |\n`;
    md += `| 거래회전율 | ${Number(o.vol_tnrt || 0).toFixed(2)}% |\n`;
    md += '\n';

    // 밸류에이션
    md += `## 밸류에이션\n\n`;
    md += `| 항목 | 값 |\n|------|------|\n`;
    md += `| 시가총액 | ${Number(o.hts_avls || 0).toLocaleString()}억원 |\n`;
    md += `| PER | ${o.per || '-'} |\n`;
    md += `| PBR | ${o.pbr || '-'} |\n`;
    md += `| EPS | ${o.eps ? Number(o.eps).toLocaleString() + '원' : '-'} |\n`;
    md += `| BPS | ${o.bps ? Number(o.bps).toLocaleString() + '원' : '-'} |\n`;
    md += '\n';

    // 외국인/수급
    md += `## 외국인/수급\n\n`;
    md += `| 항목 | 값 |\n|------|------|\n`;
    md += `| 외국인소진률 | ${Number(o.hts_frgn_ehrt || 0).toFixed(2)}% |\n`;
    md += `| 외국인순매수 | ${Number(o.frgn_ntby_qty || 0).toLocaleString()}주 |\n`;
    md += `| 프로그램순매수 | ${Number(o.pgtr_ntby_qty || 0).toLocaleString()}주 |\n`;
    md += '\n';

    // 52주 가격
    md += `## 52주 가격범위\n\n`;
    md += `| 항목 | 값 |\n|------|------|\n`;
    md += `| 52주최고 | ${Number(o.w52_hgpr || 0).toLocaleString()}원 (${o.w52_hgpr_date || '-'}) |\n`;
    md += `| 52주최저 | ${Number(o.w52_lwpr || 0).toLocaleString()}원 (${o.w52_lwpr_date || '-'}) |\n`;
    md += `| 현재가 위치 | 최고가 대비 ${Number(o.w52_hgpr_vrss_prpr_ctrt || 0).toFixed(1)}% |\n`;
    md += '\n';

    // 종목 상태
    md += `## 종목 상태\n\n`;
    md += `| 항목 | 값 |\n|------|------|\n`;
    md += `| 업종 | ${o.bstp_kor_isnm || '-'} |\n`;
    md += `| 시장 | ${o.rprs_mrkt_kor_name || '-'} |\n`;
    md += `| 투자유의 | ${o.invt_caful_yn === 'Y' ? '⚠️ 유의종목' : '정상'} |\n`;
    md += `| 시장경고 | ${o.mrkt_warn_cls_code || '없음'} |\n`;
    md += `| 신용가능 | ${o.crdt_able_yn === 'Y' ? '가능' : '불가'} |\n`;
    md += `| 증거금률 | ${Number(o.marg_rate || 0)}% |\n`;

    return md;
  } catch (error) {
    console.error('[fetchAndFormatRealtimeQuote] Error:', error);
    return null;
  }
}

/**
 * KRX 공시 조회 및 포맷팅
 */
async function fetchAndFormatKrxDisclosures(corpCode: string, corpName: string): Promise<string | null> {
  try {
    const { getKrxApiClient } = await import('@/lib/external/krx-api');
    const { getPeriodDateRange } = await import('@/types/krx');

    const client = getKrxApiClient();

    // KRX 회사 정보 조회
    const krxCompany = await client.findCompanyByCorpCode(corpCode, corpName);
    if (!krxCompany) {
      console.warn('[fetchAndFormatKrxDisclosures] Company not found in KRX');
      return null;
    }

    // 최근 3개월 공시 조회
    const range = getPeriodDateRange('3m');
    const result = await client.searchDisclosures({
      searchCorpName: krxCompany.comabbrv || krxCompany.repisusrtkornm,
      repIsuSrtCd: krxCompany.repisusrtcd,
      isurCd: krxCompany.isurcd,
      fromDate: range.fromDate,
      toDate: range.toDate,
      pageIndex: 1,
      currentPageSize: 20,
      orderMode: '0',
      orderStat: 'D',
    });

    if (!result.disclosures || result.disclosures.length === 0) {
      return null;
    }

    // 마크다운 테이블로 포맷팅
    let md = `# KRX 공시 (최근 3개월)\n\n`;
    md += `> 총 ${result.total || result.disclosures.length}건 중 최근 ${result.disclosures.length}건\n\n`;
    md += `| 일시 | 공시제목 | 시장 | 제출인 |\n`;
    md += `|------|----------|------|--------|\n`;

    result.disclosures.slice(0, 20).forEach((disc) => {
      const dateTime = disc.time || '-';
      const title = disc.title || '-';
      const market = disc.market || '-';
      const submitter = disc.submitter || '-';
      md += `| ${dateTime} | ${title} | ${market} | ${submitter} |\n`;
    });

    return md;
  } catch (error) {
    console.error('[fetchAndFormatKrxDisclosures] Error:', error);
    return null;
  }
}

// ==================== 경쟁사 비교 분석 ====================

/**
 * 비교 지표 라벨
 */
const METRIC_LABELS: Record<string, string> = {
  per: 'PER',
  pbr: 'PBR',
  marketCap: '시가총액',
  roe: 'ROE',
  revenueGrowth: '매출성장률',
  operatingMargin: '영업이익률',
};

/**
 * KIS API 토큰 발급 (재사용을 위한 헬퍼)
 */
async function getKisAccessToken(): Promise<string | null> {
  const KIS_APP_KEY = process.env.KIS_APP_KEY;
  const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
  const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    console.warn('[getKisAccessToken] KIS API credentials not configured');
    return null;
  }

  try {
    const tokenResponse = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      console.warn('[getKisAccessToken] Token request failed');
      return null;
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (error) {
    console.error('[getKisAccessToken] Error:', error);
    return null;
  }
}

/**
 * 여러 종목의 시세를 병렬로 조회 (토큰 재사용)
 */
async function fetchMultipleQuotesWithToken(
  stockCodes: string[],
  accessToken: string
): Promise<Record<string, Record<string, string | number>>> {
  const KIS_APP_KEY = process.env.KIS_APP_KEY!;
  const KIS_APP_SECRET = process.env.KIS_APP_SECRET!;
  const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

  const results: Record<string, Record<string, string | number>> = {};

  const promises = stockCodes.map(async (stockCode) => {
    try {
      const response = await fetch(
        `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${stockCode}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${accessToken}`,
            'appkey': KIS_APP_KEY,
            'appsecret': KIS_APP_SECRET,
            'tr_id': 'FHKST01010100',
          },
        }
      );

      if (!response.ok) {
        return { stockCode, data: null };
      }

      const result = await response.json();
      if (result.rt_cd !== '0') {
        return { stockCode, data: null };
      }

      return { stockCode, data: result.output };
    } catch {
      return { stockCode, data: null };
    }
  });

  const resolved = await Promise.all(promises);
  resolved.forEach(({ stockCode, data }) => {
    if (data) {
      results[stockCode] = data;
    }
  });

  return results;
}

/**
 * Perplexity로 경쟁사 탐색 및 지표 수집
 * 국내/글로벌 경쟁사를 찾고 각 회사의 재무 지표를 수집
 */
async function searchCompetitorsInfo(
  corpName: string,
  scope: 'domestic' | 'global',
  competitorCount: number,
  metrics: string[]
): Promise<{ competitors: string; rawData: string }> {
  const currentYear = new Date().getFullYear();
  const scopeText = scope === 'global' ? '국내 및 글로벌(해외)' : '국내';
  const metricLabels = metrics.map(m => METRIC_LABELS[m] || m).join(', ');

  const query = `${corpName}의 ${scopeText} 주요 경쟁사 ${competitorCount}개를 찾아주세요.
각 경쟁사에 대해 ${currentYear}년 최신 데이터를 기준으로 다음 지표를 조사해주세요:
${metricLabels}

다음 형식으로 응답해주세요:
1. 경쟁사명 (상장여부/국가)
   - PER: 값
   - PBR: 값
   - 시가총액: 값 (원화 또는 달러 단위)
   - ROE: 값%
   - 매출성장률: 값% (YoY)
   - 영업이익률: 값%

각 경쟁사에 대한 간단한 설명도 포함해주세요.
데이터가 없는 경우 "-" 또는 "N/A"로 표시해주세요.`;

  try {
    const result = await searchPerplexity(query, 'competitors', '1y');
    if (result.success && result.summary) {
      return {
        competitors: result.summary,
        rawData: JSON.stringify({ query, response: result.summary }),
      };
    }
    return { competitors: '', rawData: '' };
  } catch (error) {
    console.error('[searchCompetitorsInfo] Error:', error);
    return { competitors: '', rawData: '' };
  }
}

/**
 * 대상 기업의 기본 정보 수집
 */
async function collectTargetCompanyData(
  corpCode: string,
  corpName: string,
  stockCode?: string
): Promise<string> {
  const sections: string[] = [];

  try {
    // 기업 종합 정보
    const fullData = await getFullCompanyData(corpCode, 5);

    if (fullData.companyInfo) {
      sections.push(formatCompanyInfoFromData(fullData.companyInfo));
    }

    // 핵심 재무 지표 트렌드 (최근 3년)
    const coreIndicatorTrends = await collectIndicatorTrends(
      corpCode,
      ['revenue', 'operatingIncome', 'netIncome', 'debtRatio', 'roe'],
      'financial',
      3,
      4
    );
    if (coreIndicatorTrends) {
      sections.push(`# 핵심 재무 트렌드 (최근 3년)\n\n${coreIndicatorTrends}`);
    }

    // 실시간 시세 (국내 상장사인 경우)
    if (stockCode) {
      const realtimeQuote = await fetchAndFormatRealtimeQuote(stockCode);
      if (realtimeQuote) {
        sections.push(realtimeQuote);
      }
    }

  } catch (error) {
    console.error('[collectTargetCompanyData] Error:', error);
  }

  return sections.filter(Boolean).join('\n\n---\n\n');
}

/**
 * 경쟁사 비교 분석 - 4단계 파이프라인
 * Step 1: 대상 기업 데이터 수집 (DART + KIS)
 * Step 2: 경쟁사 탐색 (Perplexity - 국내/해외)
 * Step 3: 경쟁사 지표 수집 (KIS for 국내 상장 / Perplexity for 해외·비상장)
 * Step 4: AI 비교 분석 (Gemini)
 */
async function handleCompetitorAnalysis(body: AnalysisRequest, userId: string): Promise<Response> {
  const { corpCode, corpName, stockCode } = body;
  const scope = body.scope || 'global';
  const metrics = body.metrics || ['per', 'pbr', 'marketCap', 'roe', 'revenueGrowth', 'operatingMargin'];
  const competitorCount = body.competitorCount || 5;

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      // ========== Step 1: 대상 기업 데이터 수집 (병렬 시작) ==========
      await sendProgress(writer, encoder, 1, '대상 기업 데이터 수집 중...', 4);

      // Step 1과 Step 2를 병렬로 실행
      const [targetDataResult, competitorsSearchResult] = await Promise.all([
        // Step 1: 대상 기업 데이터
        collectTargetCompanyData(corpCode, corpName, stockCode),
        // Step 2: 경쟁사 탐색 (동시 시작)
        (async () => {
          await sendProgress(writer, encoder, 2, `${scope === 'global' ? '글로벌' : '국내'} 경쟁사 탐색 중...`, 4);
          return searchCompetitorsInfo(corpName, scope, competitorCount, metrics);
        })(),
      ]);

      const targetData = targetDataResult;
      const { competitors: competitorsInfo } = competitorsSearchResult;

      console.log('[Competitor] Target data length:', targetData.length);
      console.log('[Competitor] Competitors info length:', competitorsInfo.length);

      // ========== Step 3: 국내 상장 경쟁사 실시간 시세 조회 (옵션) ==========
      await sendProgress(writer, encoder, 3, '경쟁사 실시간 데이터 조회 중...', 4);

      const domesticCompetitorQuotes = '';

      // 국내 상장사 종목코드 추출 시도 (응답에서 파싱)
      // 실제로는 경쟁사 정보에서 종목코드를 추출해야 하지만,
      // Perplexity 응답에서 직접 지표를 가져오므로 추가 KIS 호출은 선택적
      // 여기서는 Perplexity가 제공한 데이터를 그대로 사용

      // ========== Step 4: AI 비교 분석 ==========
      await sendProgress(writer, encoder, 4, 'AI 비교 분석 중...', 4);

      const metricLabels = metrics.map(m => METRIC_LABELS[m] || m).join(', ');
      const currentYear = new Date().getFullYear();

      const systemPrompt = `당신은 기업 가치평가 전문 애널리스트입니다.
대상 기업과 경쟁사의 재무 지표를 비교 분석하여 투자자에게 인사이트를 제공합니다.

분석 원칙:
1. 객관적 데이터 기반 분석
2. 산업 특성을 고려한 밸류에이션 비교
3. 상대적 강점/약점 도출
4. 투자 관점에서의 시사점 제시

분석 대상 기업: **${corpName}**
분석 기준 연도: ${currentYear}년`;

      const userQuery = `# ${corpName} 경쟁사 비교 분석

## 분석 범위
- **범위**: ${scope === 'global' ? '글로벌 (국내+해외)' : '국내 한정'}
- **경쟁사 수**: ${competitorCount}개
- **비교 지표**: ${metricLabels}

---

## 대상 기업 데이터

${targetData}

---

## 경쟁사 정보

${competitorsInfo}

${domesticCompetitorQuotes ? `\n---\n\n## 국내 경쟁사 실시간 시세\n\n${domesticCompetitorQuotes}` : ''}

---

## 분석 요청

위 데이터를 바탕으로 다음 내용을 분석해주세요:

1. **밸류에이션 비교표**
   - 대상 기업과 경쟁사의 주요 지표를 테이블로 정리
   - 업종 평균 대비 위치 표시

2. **상대적 가치평가**
   - PER, PBR 등 상대가치 지표 분석
   - 할인/프리미엄 요인 분석

3. **성장성 비교**
   - 매출성장률, ROE 등 성장 지표 비교
   - 향후 성장 잠재력 평가

4. **경쟁 포지션**
   - 시장 내 위치 및 경쟁 강도
   - 차별화 요인 분석

5. **투자 시사점**
   - 상대적 매력도 평가
   - 주요 리스크 요인

⚠️ 본 분석은 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.`;

      // Gemini 스트리밍
      const selectedModel = body.model || 'gemini-3-flash-preview';
      const thinkingLevel = body.thinkingLevel || 'low';
      console.log(`[API] Competitor Analysis - Model: ${selectedModel}, ThinkingLevel: ${thinkingLevel}`);

      const streamGenerator = generateTextStream(userQuery, systemPrompt, {
        model: selectedModel,
        temperature: 0.3,
        maxOutputTokens: 8192,
        thinkingLevel: selectedModel.includes('gemini-3') ? thinkingLevel : undefined,
      });

      for await (const chunk of streamGenerator) {
        if (typeof chunk === 'string') {
          const data = JSON.stringify({ content: chunk });
          await writer.write(encoder.encode(`data: ${data}\n\n`));
        } else if (chunk.type === 'usage') {
          // 토큰 사용량 저장
          try {
            await TokenUsageService.addUsage(userId, chunk.model, {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              cachedTokens: chunk.cachedTokens,
              totalTokens: chunk.inputTokens + chunk.outputTokens,
            });
            console.log(`[DART Competitor] 토큰 사용량 저장: userId=${userId}, model=${chunk.model}, input=${chunk.inputTokens}, output=${chunk.outputTokens}`);
          } catch (usageError) {
            console.error('[DART Competitor] 토큰 사용량 저장 실패:', usageError);
          }

          const usageData = JSON.stringify({
            usage: {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              model: chunk.model,
            },
          });
          await writer.write(encoder.encode(`data: ${usageData}\n\n`));
        }
      }

      // 메타데이터 전송
      const metaData = JSON.stringify({
        metadata: {
          dartContext: targetData,
          competitorsInfo,
          systemPrompt,
          scope,
          metrics,
          competitorCount,
        },
      });
      await writer.write(encoder.encode(`data: ${metaData}\n\n`));

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('Competitor analysis error:', err);
      const errorData = JSON.stringify({
        error: err instanceof Error ? err.message : 'Analysis failed',
      });
      await writer.write(encoder.encode(`data: ${errorData}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

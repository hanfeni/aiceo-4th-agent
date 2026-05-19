import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// Gemini API 클라이언트 싱글톤
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

// Thinking 레벨 타입 (Gemini 3 모델용)
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

// 모델 설정
export interface ModelConfig {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  // Thinking 설정 (Gemini 2.5/3 모델용)
  thinkingLevel?: ThinkingLevel;  // Gemini 3용: 'minimal' | 'low' | 'medium' | 'high'
  thinkingBudget?: number;        // Gemini 2.5용: 토큰 수 (0: 비활성화, -1: 동적)
  includeThoughts?: boolean;      // 응답에 thinking 포함 여부
}

const DEFAULT_CONFIG: ModelConfig = {
  model: 'gemini-2.0-flash',
  temperature: 0.3,
  maxOutputTokens: 4096,
};

// 모델 인스턴스 가져오기
export function getModel(config?: ModelConfig): GenerativeModel {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // 기본 모델 설정
  const modelConfig: Parameters<GoogleGenerativeAI['getGenerativeModel']>[0] = {
    model: mergedConfig.model!,
    generationConfig: {
      temperature: mergedConfig.temperature,
      maxOutputTokens: mergedConfig.maxOutputTokens,
      topP: mergedConfig.topP,
      topK: mergedConfig.topK,
    },
  };

  // Gemini 3 모델인 경우 thinkingConfig 추가 (thinkingLevel 사용)
  if (mergedConfig.model?.includes('gemini-3')) {
    (modelConfig as unknown as Record<string, unknown>).thinkingConfig = {
      thinkingLevel: mergedConfig.thinkingLevel || 'low',
      includeThoughts: mergedConfig.includeThoughts ?? false,
    };
    console.log(`[Gemini] Gemini 3 모델 thinking 설정: level=${mergedConfig.thinkingLevel || 'low'}`);
  }
  // Gemini 2.5 모델인 경우 thinkingBudget 사용
  else if (mergedConfig.model?.includes('gemini-2.5') && mergedConfig.thinkingBudget !== undefined) {
    (modelConfig as unknown as Record<string, unknown>).thinkingConfig = {
      thinkingBudget: mergedConfig.thinkingBudget,
      includeThoughts: mergedConfig.includeThoughts ?? false,
    };
    console.log(`[Gemini] Gemini 2.5 모델 thinking 설정: budget=${mergedConfig.thinkingBudget}`);
  }

  return getGenAI().getGenerativeModel(modelConfig);
}

// LLM 호출 - 단순 텍스트 생성
export async function generateText(
  prompt: string,
  config?: ModelConfig
): Promise<string> {
  const model = getModel(config);
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// 토큰 사용량 정보
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string;
}

// LLM 호출 응답 (토큰 포함)
export interface ChatResponse {
  text: string;
  usage: TokenUsage;
}

// LLM 호출 - 시스템 프롬프트 + 사용자 프롬프트
export async function chat(
  systemPrompt: string,
  userPrompt: string,
  config?: ModelConfig
): Promise<string> {
  const response = await chatWithUsage(systemPrompt, userPrompt, config);
  return response.text;
}

// LLM 호출 - 토큰 사용량 포함 응답
export async function chatWithUsage(
  systemPrompt: string,
  userPrompt: string,
  config?: ModelConfig
): Promise<ChatResponse> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const model = getModel(config);
  const chatSession = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: `시스템 지시사항: ${systemPrompt}` }],
      },
      {
        role: 'model',
        parts: [{ text: '네, 이해했습니다. 지시사항에 따라 응답하겠습니다.' }],
      },
    ],
  });
  const result = await chatSession.sendMessage(userPrompt);

  // 토큰 사용량 추출
  const usageMetadata = result.response.usageMetadata;
  const usage: TokenUsage = {
    inputTokens: usageMetadata?.promptTokenCount || 0,
    outputTokens: usageMetadata?.candidatesTokenCount || 0,
    cachedTokens: (usageMetadata as { cachedContentTokenCount?: number })?.cachedContentTokenCount || 0,
    model: mergedConfig.model!,
  };

  console.log(`[Gemini] chat 완료 - Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Model: ${usage.model}`);

  return {
    text: result.response.text(),
    usage,
  };
}

// JSON 응답 파싱 유틸리티
export function parseJsonResponse<T>(response: string): T {
  // 1. 코드 블록 추출 (```json ... ```)
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim()) as T;
  }

  // 2. JSON 배열 패턴 추출
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]) as T;
  }

  // 3. JSON 객체 패턴 추출
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]) as T;
  }

  // 4. 전체 텍스트를 JSON으로 시도
  return JSON.parse(response.trim()) as T;
}

// 안전한 JSON 파싱 (에러 시 null 반환)
export function safeParseJson<T>(response: string): T | null {
  try {
    return parseJsonResponse<T>(response);
  } catch {
    console.error('JSON 파싱 실패:', response.substring(0, 200));
    return null;
  }
}

// 안전한 문자열 필드 추출
export function getStringSafe(obj: Record<string, unknown>, key: string, defaultValue = ''): string {
  const value = obj[key];
  return typeof value === 'string' ? value : defaultValue;
}

// 안전한 숫자 필드 추출
export function getNumberSafe(obj: Record<string, unknown>, key: string, defaultValue = 0): number {
  const value = obj[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

// 안전한 배열 필드 추출
export function getArraySafe<T>(obj: Record<string, unknown>, key: string, defaultValue: T[] = []): T[] {
  const value = obj[key];
  return Array.isArray(value) ? value as T[] : defaultValue;
}

// 재시도 로직이 포함된 LLM 호출
export async function chatWithRetry(
  systemPrompt: string,
  userPrompt: string,
  config?: ModelConfig,
  maxRetries = 3
): Promise<string> {
  const response = await chatWithRetryAndUsage(systemPrompt, userPrompt, config, maxRetries);
  return response.text;
}

// 재시도 로직이 포함된 LLM 호출 - 토큰 사용량 포함
export async function chatWithRetryAndUsage(
  systemPrompt: string,
  userPrompt: string,
  config?: ModelConfig,
  maxRetries = 3
): Promise<ChatResponse> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chatWithUsage(systemPrompt, userPrompt, config);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`LLM 호출 실패 (${i + 1}/${maxRetries}):`, lastError.message);

      // 마지막 시도가 아니면 잠시 대기
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  throw lastError || new Error('LLM 호출 실패');
}

/**
 * 임베딩 모델 타입
 * - gemini-embedding-001: 최신 모델, 3072차원 (768/1536 지원), MTEB 1위, 100+ 언어
 * - text-embedding-004: 레거시, 768차원 (2026-01 폐기 예정)
 * - embedding-001: 레거시, 768차원 (2025-08 폐기 예정)
 */
export type EmbeddingModel = 'gemini-embedding-001' | 'text-embedding-004' | 'embedding-001';

/**
 * 임베딩 TaskType (Gemini Embedding API)
 * - RETRIEVAL_QUERY: 검색 쿼리용 (질문)
 * - RETRIEVAL_DOCUMENT: 문서 인덱싱용 (본문)
 * - SEMANTIC_SIMILARITY: 의미적 유사도
 * - CLASSIFICATION: 분류
 * - CLUSTERING: 클러스터링
 */
export type EmbeddingTaskType =
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING';

/**
 * 임베딩 생성
 * @param text 임베딩할 텍스트
 * @param embeddingModel 사용할 모델 (기본값: gemini-embedding-001)
 * @param outputDimensionality 출력 차원 수 (768, 1536, 3072 중 선택, 기본값: 3072)
 * @param taskType 태스크 타입 (선택, 쿼리: RETRIEVAL_QUERY, 문서: RETRIEVAL_DOCUMENT)
 */
export async function generateEmbedding(
  text: string,
  embeddingModel: EmbeddingModel = 'gemini-embedding-001',
  outputDimensionality: number = 3072,
  taskType?: EmbeddingTaskType
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: embeddingModel });

  // gemini-embedding-001은 outputDimensionality와 taskType 지원
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let request: any;
  if (embeddingModel === 'gemini-embedding-001') {
    request = {
      content: { role: 'user' as const, parts: [{ text }] },
      outputDimensionality,
    };
    if (taskType) {
      request.taskType = taskType;
    }
  } else {
    request = text;
  }

  const result = await model.embedContent(request);
  return result.embedding.values;
}

/**
 * 쿼리 임베딩 생성 (검색용)
 * - taskType: RETRIEVAL_QUERY 사용
 * - MCP 도구(searchLectures)와 동일한 방식
 */
export async function generateQueryEmbedding(
  query: string,
  outputDimensionality: number = 3072
): Promise<number[]> {
  return generateEmbedding(
    query,
    'gemini-embedding-001',
    outputDimensionality,
    'RETRIEVAL_QUERY'
  );
}

/**
 * 여러 텍스트 임베딩 생성 (Rate limit 고려)
 * @param texts 임베딩할 텍스트 배열
 * @param embeddingModel 사용할 모델 (기본값: gemini-embedding-001)
 * @param outputDimensionality 출력 차원 수 (기본값: 3072)
 * @param delayMs 각 요청 사이 지연 시간 (기본값: 100ms)
 */
export async function generateEmbeddings(
  texts: string[],
  embeddingModel: EmbeddingModel = 'gemini-embedding-001',
  outputDimensionality: number = 3072,
  delayMs: number = 100
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await generateEmbedding(text, embeddingModel, outputDimensionality);
    embeddings.push(embedding);

    // Rate limit 방지
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return embeddings;
}

/**
 * 스트리밍 메타데이터 타입
 */
export interface StreamUsageMetadata {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string;
}

/**
 * 스트리밍 청크 타입
 */
export type GeminiStreamChunk = string | StreamUsageMetadata;

/**
 * 텍스트 생성 (스트리밍) - 토큰 사용량 포함
 */
export async function* generateTextStream(
  prompt: string,
  systemPrompt?: string,
  config?: ModelConfig
): AsyncGenerator<GeminiStreamChunk> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const model = getModel(config);

  const chatSession = systemPrompt
    ? model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: `시스템 지시사항: ${systemPrompt}` }],
          },
          {
            role: 'model',
            parts: [{ text: '네, 이해했습니다. 지시사항에 따라 응답하겠습니다.' }],
          },
        ],
      })
    : model.startChat();

  const result = await chatSession.sendMessageStream(prompt);

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      // Gemini가 마크다운 테이블에서 과도한 공백을 생성하는 버그 수정
      // 공백만 있는 청크는 건너뛰기 (실제 내용이 없음)
      if (text.trim().length === 0 && text.length > 10) {
        // 10개 이상의 공백만 있는 청크는 무시
        continue;
      }
      // 연속 공백 4개 이상은 단일 공백으로 압축
      const normalizedText = text.replace(/ {4,}/g, ' ');
      yield normalizedText;
    }

    // 토큰 사용량 추출
    if (chunk.usageMetadata) {
      inputTokens = chunk.usageMetadata.promptTokenCount || 0;
      outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
      cachedTokens = (chunk.usageMetadata as { cachedContentTokenCount?: number }).cachedContentTokenCount || 0;
    }
  }

  // 마지막에 토큰 사용량 메타데이터 전송
  console.log(`[Gemini] 스트리밍 완료 - Input: ${inputTokens}, Output: ${outputTokens}, Cached: ${cachedTokens}, Model: ${mergedConfig.model}`);
  yield {
    type: 'usage',
    inputTokens,
    outputTokens,
    cachedTokens,
    model: mergedConfig.model!,
  };
}

export { GoogleGenerativeAI };

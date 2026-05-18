import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/**
 * LLM 프로바이더 추상화 (FR-10).
 *
 * provider 는 trim + lowercase 정규화한다 (TC-17.3: 'Anthropic ' 수용).
 * 미지정/빈 값 → 기본 anthropic (정상 — TC-9.3/17.2, 에러 아님).
 * 미지원 값 → 명확한 에러 throw (TC-17.1/25.17: 무음 폴백 금지, AC-4).
 *
 * API 키 참조는 이 파일에만 국한된다 (AD-5(c)/NFR-4). 키는 ChatModel
 * 내부로만 전달되고 어떤 응답에도 직렬화되지 않는다.
 */

export type ModelEnv = {
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
};

export type SupportedProvider = "anthropic" | "openai";

const DEFAULT_PROVIDER: SupportedProvider = "anthropic";
const SUPPORTED: readonly SupportedProvider[] = ["anthropic", "openai"];

/**
 * env.LLM_PROVIDER 를 정규화·검증해 지원 provider 로 해석한다.
 * 순수 함수 — LLM 호출 없음 (TC-17.4: AC-10/NFR-11, 과금 0).
 */
export function resolveProvider(env: ModelEnv): SupportedProvider {
  const raw = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "") return DEFAULT_PROVIDER; // 미지정 = 기본 (에러 아님)
  if ((SUPPORTED as readonly string[]).includes(raw)) {
    return raw as SupportedProvider;
  }
  // 무음 폴백 금지 — 잘못된 설정을 은폐하지 않는다 (AC-4).
  throw new Error(
    `Unsupported LLM_PROVIDER: "${env.LLM_PROVIDER}". ` +
      `Supported: ${SUPPORTED.join(", ")} (default: ${DEFAULT_PROVIDER}).`,
  );
}

/**
 * provider 에 맞는 ChatModel 인스턴스를 생성한다.
 * provider 검증이 생성자 호출보다 먼저 일어난다 (TC-17.4: 잘못된 값이면
 * 어떤 provider 생성자도 호출되지 않음).
 */
export function createModel(env: ModelEnv): BaseChatModel {
  const provider = resolveProvider(env); // 잘못된 값이면 여기서 throw
  const model = env.LLM_MODEL?.trim();
  if (!model) {
    throw new Error("LLM_MODEL is required (no hardcoded default).");
  }

  if (provider === "openai") {
    // GPT-5 계열의 max_completion_tokens 차이는 @langchain/openai 가
    // 내부에서 흡수한다 (maxTokens 를 명시하지 않음 — TC-9.8).
    //
    // 실측(scripts/reasoning-probe.mts): GPT-5 계열은 reasoning 을
    // 수행하나, Chat Completions API 는 reasoning 텍스트를 반환하지
    // 않고 카운트만 한다. **Responses API + reasoning.summary:"auto"**
    // 일 때만 reasoning summary 가 content 배열의 {type:"reasoning",
    // reasoning:"..."} 블록으로 토큰 스트리밍된다(사고 패널 데이터원).
    // FR-09 는 유지된다: reasoning 은 별도 블록 → extractThinking 이
    // 분리 수집, 본문 token 엔 안 섞임.
    return new ChatOpenAI({
      model,
      apiKey: env.OPENAI_API_KEY,
      streaming: true,
      useResponsesApi: true,
      reasoning: { effort: "medium", summary: "auto" },
    } as ConstructorParameters<typeof ChatOpenAI>[0]) as unknown as BaseChatModel;
  }

  return new ChatAnthropic({
    model,
    apiKey: env.ANTHROPIC_API_KEY,
    streaming: true,
  }) as unknown as BaseChatModel;
}

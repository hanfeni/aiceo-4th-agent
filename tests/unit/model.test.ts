import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// model.ts 단위 테스트 (LLM 비의존 — AC-9,10 / FR-10 / AD-2).
// 매핑: TC-9.2, TC-9.3/TC-17.2, TC-9.8, TC-17.1/TC-25.17, TC-17.3, TC-17.4
//
// @langchain/openai · @langchain/anthropic 생성자는 vi.mock 으로 가로채
// 실 API 호출/과금 0 (CLAUDE.md R — no real LLM calls).
// vi.mock 의 경로는 model.ts 가 import 할 경로와 정확히 동일해야 한다.
//
// model.ts 계약(Slice 4 구현 예정):
//   createModel(env): BaseChatModel
//   - provider=openai    → ChatOpenAI (from @langchain/openai)
//   - provider=anthropic → ChatAnthropic (from @langchain/anthropic)
//   - LLM_MODEL 주입(모델 ID 하드코딩 금지)
//   - provider 정규화: trim + lowercase
//   - 미설정/빈 문자열 → 기본 anthropic (에러 아님)
//   - 미지원 provider(gemini 등) → 명확한 Error throw(무음 폴백 0)
//   - GPT-5 계열 토큰 파라미터 차이(max_completion_tokens)는 model.ts 내부 흡수

// --- 생성자 모킹 (vi.mock factory 는 호이스팅됨 — vi.hoisted 로 spy 공유) ---
const { chatOpenAISpy, chatAnthropicSpy } = vi.hoisted(() => ({
  chatOpenAISpy: vi.fn(),
  chatAnthropicSpy: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor(opts: unknown) {
      chatOpenAISpy(opts);
    }
  },
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    constructor(opts: unknown) {
      chatAnthropicSpy(opts);
    }
  },
}));

// 소스 모듈은 Slice 4 구현 전이라 부재 — TDD red 단계에서 import 실패가 정상.
import { createModel } from "@/lib/agent/harness/model";

// 모킹된 생성자에 넘어간 옵션에서 모델 ID 후보를 안전하게 추출.
function modelIdOf(opts: unknown): unknown {
  const o = (opts ?? {}) as Record<string, unknown>;
  return o.model ?? o.modelName ?? o.model_name;
}

describe("createModel — LLM 프로바이더 추상화 (FR-10 / AC-9,10)", () => {
  beforeEach(() => {
    chatOpenAISpy.mockClear();
    chatAnthropicSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // TC-9.2 — provider=anthropic → ChatAnthropic 선택, LLM_MODEL 주입
  it("TC-9.2: provider=anthropic → ChatAnthropic 생성, LLM_MODEL 주입(하드코딩 없음)", () => {
    createModel({
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test-model-id",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(chatAnthropicSpy).toHaveBeenCalledTimes(1);
    expect(chatOpenAISpy).not.toHaveBeenCalled();
    expect(modelIdOf(chatAnthropicSpy.mock.calls[0]?.[0])).toBe("claude-test-model-id");
  });

  // TC-9.2 — provider=openai → ChatOpenAI 선택, LLM_MODEL 주입
  it("TC-9.2: provider=openai → ChatOpenAI 생성, LLM_MODEL 주입(하드코딩 없음)", () => {
    createModel({
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-test-model-id",
      OPENAI_API_KEY: "sk-openai-test",
    });
    expect(chatOpenAISpy).toHaveBeenCalledTimes(1);
    expect(chatAnthropicSpy).not.toHaveBeenCalled();
    expect(modelIdOf(chatOpenAISpy.mock.calls[0]?.[0])).toBe("gpt-test-model-id");
  });

  // TC-9.3 / TC-17.2 — LLM_PROVIDER 미설정 → 기본 anthropic (에러 아님)
  it("TC-9.3/TC-17.2: LLM_PROVIDER 미설정 → 기본 anthropic 적용(에러 아님)", () => {
    expect(() =>
      createModel({ LLM_MODEL: "claude-default", ANTHROPIC_API_KEY: "sk-ant-test" }),
    ).not.toThrow();
    expect(chatAnthropicSpy).toHaveBeenCalledTimes(1);
    expect(chatOpenAISpy).not.toHaveBeenCalled();
  });

  // TC-17.2 — LLM_PROVIDER 빈 문자열 → 기본 anthropic (미지정 = 정상 기본)
  it("TC-17.2: LLM_PROVIDER 빈 문자열('') → 기본 anthropic(잘못된 값 아님)", () => {
    expect(() =>
      createModel({
        LLM_PROVIDER: "",
        LLM_MODEL: "claude-default",
        ANTHROPIC_API_KEY: "sk-ant-test",
      }),
    ).not.toThrow();
    expect(chatAnthropicSpy).toHaveBeenCalledTimes(1);
    expect(chatOpenAISpy).not.toHaveBeenCalled();
  });

  // TC-9.8 — provider=openai + GPT-5 계열 → max_completion_tokens 형상 흡수
  it("TC-9.8: provider=openai GPT-5 계열 → max_tokens 가 아닌 max_completion_tokens 형상으로 흡수", () => {
    createModel({
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.4-mini",
      OPENAI_API_KEY: "sk-openai-test",
    });
    expect(chatOpenAISpy).toHaveBeenCalledTimes(1);
    const opts = (chatOpenAISpy.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    // GPT-5 계열은 max_completion_tokens 를 사용 — 구식 max_tokens 직접 전달 금지.
    // (토큰 한도를 전혀 안 넘기는 구현도 허용되나, 넘긴다면 GPT-5 계열 키 형상이어야 함.)
    const hasLegacyMaxTokens =
      "max_tokens" in opts || "maxTokens" in opts;
    const hasCompletionTokens =
      "max_completion_tokens" in opts ||
      "maxCompletionTokens" in opts ||
      "modelKwargs" in opts;
    expect(hasLegacyMaxTokens && !hasCompletionTokens).toBe(false);
    expect(modelIdOf(opts)).toBe("gpt-5.4-mini");
  });

  // TC-17.1 / TC-25.17 — 미지원 provider(gemini) → 명확한 Error, 무음 폴백 0
  it("TC-17.1/TC-25.17: LLM_PROVIDER='gemini'(미지원) → 명확한 Error throw, 어떤 생성자도 호출 안 됨", () => {
    let thrown: unknown;
    try {
      createModel({
        LLM_PROVIDER: "gemini",
        LLM_MODEL: "gemini-pro",
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    // 에러 메시지에 잘못된 provider 값이 포함되어야 함(원인 식별 가능).
    expect(String((thrown as Error).message)).toContain("gemini");
    // 무음 기본값 폴백 금지 — anthropic/openai 어느 쪽도 생성하면 안 됨.
    expect(chatAnthropicSpy).not.toHaveBeenCalled();
    expect(chatOpenAISpy).not.toHaveBeenCalled();
  });

  // TC-17.3 — 'Anthropic '(대소문자 + 후행 공백) → 정규화 후 anthropic 수용
  it("TC-17.3: LLM_PROVIDER='Anthropic '(대소문자/공백 변형) → trim+lowercase 정규화로 anthropic 수용(에러 아님)", () => {
    expect(() =>
      createModel({
        LLM_PROVIDER: "Anthropic ",
        LLM_MODEL: "claude-test",
        ANTHROPIC_API_KEY: "sk-ant-test",
      }),
    ).not.toThrow();
    expect(chatAnthropicSpy).toHaveBeenCalledTimes(1);
    expect(chatOpenAISpy).not.toHaveBeenCalled();
  });

  it("TC-17.3: LLM_PROVIDER=' OpenAI '(대소문자/양쪽 공백) → 정규화로 openai 수용", () => {
    expect(() =>
      createModel({
        LLM_PROVIDER: " OpenAI ",
        LLM_MODEL: "gpt-test",
        OPENAI_API_KEY: "sk-openai-test",
      }),
    ).not.toThrow();
    expect(chatOpenAISpy).toHaveBeenCalledTimes(1);
    expect(chatAnthropicSpy).not.toHaveBeenCalled();
  });

  // TC-17.4 — 잘못된 provider → 에러를 LLM 호출 0 인 순수 함수로 검증(AC-10 registry-class)
  it("TC-17.4: 잘못된 provider → 에러 케이스가 LLM 호출 0(과금 0)으로 검증됨 (AC-10 / NFR-11)", () => {
    expect(() =>
      createModel({ LLM_PROVIDER: "not-a-real-provider", LLM_MODEL: "x" }),
    ).toThrow();
    // 생성자(=네트워크/과금 경로) 미진입 — 순수 함수 어설션.
    expect(chatAnthropicSpy).not.toHaveBeenCalled();
    expect(chatOpenAISpy).not.toHaveBeenCalled();
  });
});

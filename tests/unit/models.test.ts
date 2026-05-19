import { describe, it, expect } from "vitest";
import {
  ALLOWED_MODELS,
  MODEL_PROVIDER,
  isAllowedModel,
  resolveInitialModel,
  FALLBACK_MODEL,
  type AllowedModel,
} from "@/lib/agent/harness/models";

// models.ts 단위 테스트 — 모델 화이트리스트 SSOT (LLM 비의존, 순수 함수).
// Plan Critic C1(provider 역산) / C5(검증 SSOT) / C9(폴백 정책) 해소 검증.
//
// 계약:
//   ALLOWED_MODELS: readonly ["gpt-5.5","gpt-5.4","gpt-5.4-mini"]
//   MODEL_PROVIDER: 각 모델 → provider("openai") 매핑 (C1: provider 역산 근거)
//   isAllowedModel(s): s 가 화이트리스트 멤버인지 (타입 가드)
//   FALLBACK_MODEL: 화이트리스트 외 env 값일 때의 명시적 초기 UI 폴백
//   resolveInitialModel(envModel?): env LLM_MODEL 이 화이트리스트면 그 값,
//     아니면 FALLBACK_MODEL (초기 표시값 결정 — 런타임 검증과 별개)

describe("models.ts — 화이트리스트 SSOT", () => {
  it("ALLOWED_MODELS 는 실측 확정된 OpenAI 3종이다", () => {
    expect(ALLOWED_MODELS).toEqual(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]);
  });

  it("3종 모두 provider 가 openai 로 매핑된다 (C1: provider 역산 근거)", () => {
    for (const m of ALLOWED_MODELS) {
      expect(MODEL_PROVIDER[m]).toBe("openai");
    }
  });

  it("MODEL_PROVIDER 키는 ALLOWED_MODELS 와 정확히 일치한다 (누락/잉여 0)", () => {
    expect(Object.keys(MODEL_PROVIDER).sort()).toEqual(
      [...ALLOWED_MODELS].sort(),
    );
  });
});

describe("isAllowedModel — 입력 검증 (C5)", () => {
  it.each(ALLOWED_MODELS)("화이트리스트 멤버 '%s' → true", (m) => {
    expect(isAllowedModel(m)).toBe(true);
  });

  it.each([
    "gpt-4o",
    "claude-opus-4-7",
    "gpt-5.4-nano",
    "GPT-5.5",
    "gpt-5.5 ",
    "",
    "../../etc/passwd",
  ])("화이트리스트 밖 '%s' → false (임의 모델 주입 차단)", (s) => {
    expect(isAllowedModel(s)).toBe(false);
  });

  it("undefined/null 류 비문자열 → false (방어)", () => {
    expect(isAllowedModel(undefined as unknown as string)).toBe(false);
    expect(isAllowedModel(null as unknown as string)).toBe(false);
    expect(isAllowedModel(123 as unknown as string)).toBe(false);
  });
});

describe("resolveInitialModel — 초기 표시 모델 (C9: 명시적 폴백)", () => {
  it("env 값이 화이트리스트면 그 값을 그대로 쓴다", () => {
    expect(resolveInitialModel("gpt-5.5")).toBe("gpt-5.5");
    expect(resolveInitialModel("gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });

  it("env 값이 화이트리스트 밖(claude-*)이면 FALLBACK_MODEL", () => {
    expect(resolveInitialModel("claude-opus-4-7")).toBe(FALLBACK_MODEL);
  });

  it("env 미지정/빈 문자열 → FALLBACK_MODEL (무음 throw 아님 — 초기 표시 전용)", () => {
    expect(resolveInitialModel(undefined)).toBe(FALLBACK_MODEL);
    expect(resolveInitialModel("")).toBe(FALLBACK_MODEL);
    expect(resolveInitialModel("   ")).toBe(FALLBACK_MODEL);
  });

  it("FALLBACK_MODEL 은 화이트리스트 멤버다 (정합)", () => {
    expect(isAllowedModel(FALLBACK_MODEL)).toBe(true);
  });

  it("env 값 앞뒤 공백은 trim 후 판정한다", () => {
    expect(resolveInitialModel("  gpt-5.4  ")).toBe("gpt-5.4");
  });
});

describe("AllowedModel 타입 — 컴파일 계약", () => {
  it("isAllowedModel 통과 시 AllowedModel 로 좁혀진다", () => {
    const s: string = "gpt-5.5";
    if (isAllowedModel(s)) {
      const narrowed: AllowedModel = s; // 컴파일되면 타입 가드 동작
      expect(narrowed).toBe("gpt-5.5");
    }
  });
});

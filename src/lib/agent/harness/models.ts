/**
 * 모델 화이트리스트 SSOT (Single Source of Truth) — FR-13~19 / AD-12·AD-14.
 *
 * 런타임 모델 선택의 단일 진실 원천. 다음 세 가지가 이 파일 한 곳에서만
 * 정의된다:
 *  1) 사용자가 고를 수 있는 모델 목록(ALLOWED_MODELS)
 *  2) 각 모델 → provider 매핑(MODEL_PROVIDER) — Plan Critic C1 해소.
 *     createModel 은 model 이 지정되면 .env LLM_PROVIDER 가 아니라
 *     이 매핑으로 provider 를 역산한다(OpenAI 보장, env 무관).
 *  3) 입력 검증 함수(isAllowedModel) — Plan Critic C5: route zod enum 과
 *     createModel defense-in-depth 가 모두 이 함수/배열을 참조.
 *
 * R8 실측 확정(2026-05-19, docs/notes 별도 기록):
 *   gpt-5.5 / gpt-5.4 / gpt-5.4-mini 3종 모두 v1/responses + reasoning
 *   지원 → model.ts 의 useResponsesApi:true + reasoning 와 호환.
 *
 * 모델 추가/교체 = 이 파일의 배열·매핑 1줄 수정뿐(코드 상수 정책 — 사용자
 * 결정). 임의 모델 ID 주입은 화이트리스트가 차단한다(보안).
 */

/** 사용자가 런타임에 선택 가능한 모델(실측 확정 — 가장 최신순). */
export const ALLOWED_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/**
 * 모델 → provider 역산 매핑(Plan Critic C1).
 * 현재 3종 전부 OpenAI. 키 집합은 ALLOWED_MODELS 와 정확히 일치한다
 * (models.test.ts 가 누락/잉여 0 을 강제).
 */
export const MODEL_PROVIDER: Record<AllowedModel, "openai" | "anthropic"> = {
  "gpt-5.5": "openai",
  "gpt-5.4": "openai",
  "gpt-5.4-mini": "openai",
};

/**
 * 화이트리스트 외 env LLM_MODEL 일 때의 초기 UI 표시 폴백.
 * 현재 .env 기본값과 일치(gpt-5.4-mini). 이는 "초기 드롭다운 표시값"
 * 결정이며, 런타임 모델 검증(model.ts throw 철학)과는 분리된다 — C9.
 */
export const FALLBACK_MODEL: AllowedModel = "gpt-5.4-mini";

/**
 * s 가 화이트리스트 멤버인지 판정하는 타입 가드.
 * 비문자열·공백 포함·대소문자 변형은 전부 false(임의 주입 차단).
 */
export function isAllowedModel(s: unknown): s is AllowedModel {
  return (
    typeof s === "string" &&
    (ALLOWED_MODELS as readonly string[]).includes(s)
  );
}

/**
 * 초기 표시 모델 해석 — env LLM_MODEL 이 화이트리스트면 그 값(trim 후),
 * 아니면 FALLBACK_MODEL. 무음 throw 하지 않는다(초기 표시 전용 — 런타임
 * 검증은 route zod + createModel 이 별도로 강제).
 */
export function resolveInitialModel(envModel?: string): AllowedModel {
  const m = envModel?.trim();
  return m && isAllowedModel(m) ? m : FALLBACK_MODEL;
}

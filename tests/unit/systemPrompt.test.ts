import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, getSystemPrompt } from "@/lib/agent/prompts/systemPrompt";

// systemPrompt 단위 테스트 (LLM 비의존 — AC-10).
// 매핑: TC-25.19~25.22 / AC-10
// 검증: 챗봇 역할 정의 / 한국어 응답 규칙 / 레퍼런스 잔재 0 / 비공백 sanity.

describe("systemPrompt — 한국어 챗봇 시스템 프롬프트 (AC-10)", () => {
  // TC-25.22 — 비공백/길이 sanity
  it("TC-25.22: SYSTEM_PROMPT 는 비어있지 않은 문자열이다", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.trim().length).toBeGreaterThan(20);
  });

  it("TC-25.22: getSystemPrompt() 가 SYSTEM_PROMPT 와 동일한 문자열을 반환한다", () => {
    expect(getSystemPrompt()).toBe(SYSTEM_PROMPT);
    expect(typeof getSystemPrompt()).toBe("string");
  });

  // TC-25.19 — 챗봇 역할 정의 존재
  it("TC-25.19: 챗봇/어시스턴트 역할 정의가 존재한다", () => {
    expect(SYSTEM_PROMPT).toMatch(/(어시스턴트|챗봇|assistant)/i);
  });

  // TC-25.20 — 한국어 응답 규칙 명시
  it("TC-25.20: 한국어로 응답하라는 규칙이 명시되어 있다", () => {
    expect(SYSTEM_PROMPT).toMatch(/한국어/);
  });

  // TC-25.21 — 레퍼런스(OpenCode 등) 잔재 0
  it("TC-25.21: OpenCode/레퍼런스 소스 잔재 문자열이 없다", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("opencode");
    expect(lower).not.toContain("createopencode");
    expect(lower).not.toContain("opencode.ai");
    // 템플릿 cruft 가드
    expect(lower).not.toContain("todo");
    expect(lower).not.toContain("lorem ipsum");
    expect(lower).not.toContain("placeholder");
  });

  it("TC-25.21: 코딩 에이전트/도구 스폰 관련 잔재 표현이 없다(순수 챗봇)", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("opencode sdk");
  });
});

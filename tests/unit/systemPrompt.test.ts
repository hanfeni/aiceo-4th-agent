import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, getSystemPrompt } from "@/lib/agent/prompts/systemPrompt";

// systemPrompt 단위 테스트 (LLM 비의존 — AC-10).
// 매핑: TC-25.19~25.23 / AC-10
// 스펙 §9 리플레이스(2026-05-19): "순수 챗봇" → 범용 에이전트 인스트럭션.
// 검증: 에이전트 정체성 / 한국어 출력 계약 / R5 추론 정책 / cruft 0 /
//       deepagents 중복 금지(도구명 미포함) / 비공백 sanity.

describe("systemPrompt — 범용 에이전트 시스템 인스트럭션 (AC-10)", () => {
  // TC-25.22 — 비공백/길이 sanity
  it("TC-25.22: SYSTEM_PROMPT 는 비어있지 않은 문자열이다", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.trim().length).toBeGreaterThan(20);
  });

  it("TC-25.22: getSystemPrompt() 가 SYSTEM_PROMPT 와 동일한 문자열을 반환한다", () => {
    expect(getSystemPrompt()).toBe(SYSTEM_PROMPT);
    expect(typeof getSystemPrompt()).toBe("string");
  });

  // TC-25.19 — 에이전트 정체성 정의 존재
  it("TC-25.19: 에이전트 정체성 정의가 존재한다", () => {
    expect(SYSTEM_PROMPT).toMatch(/(에이전트|agent)/i);
  });

  // TC-25.20 — 한국어 출력 계약 명시
  it("TC-25.20: 기본 응답 언어가 한국어임이 명시되어 있다", () => {
    expect(SYSTEM_PROMPT).toMatch(/한국어/);
  });

  // TC-25.21 — 레퍼런스(OpenCode 등) 잔재 0 / 템플릿 cruft 0
  it("TC-25.21: OpenCode/레퍼런스 소스 잔재 문자열이 없다", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("opencode");
    expect(lower).not.toContain("createopencode");
    expect(lower).not.toContain("opencode.ai");
    expect(lower).not.toContain("opencode sdk");
    expect(lower).not.toContain("lorem ipsum");
    expect(lower).not.toContain("placeholder");
  });

  // TC-25.22b — R5 추론 누출 차단 정책이 프롬프트에 박혀 있다(회귀 방지)
  it("TC-25.22: 내부 추론을 최종 답변에 섞지 않는다는 R5 정책이 명시되어 있다", () => {
    expect(SYSTEM_PROMPT).toMatch(/내부 추론/);
  });

  // TC-25.23 — deepagents 중복 금지: 구체 도구명을 직접 적지 않는다
  // (filesystem/task/skills 사용법은 deepagents 미들웨어가 APPEND).
  it("TC-25.23: 개별 도구 사용법·도구 이름을 직접 나열하지 않는다", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("read_file");
    expect(lower).not.toContain("write_file");
    expect(lower).not.toContain("edit_file");
    expect(lower).not.toContain("write_todos");
  });
});

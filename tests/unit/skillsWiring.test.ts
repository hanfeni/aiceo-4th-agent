import { describe, it, expect } from "vitest";
import { buildHarnessConfig, type HarnessEnv } from "@/lib/agent/harness/registry";

/**
 * deep-web-research SKILL 배선 검증 (LLM 호출 0 — 순수 조립 경로).
 *
 * R2/AD-1: skill·subagent 토글 결정은 registry 단일 지점. 이 테스트는
 * buildHarnessConfig 출력이 토글 조합별로 올바른 skills/subagents 계약을
 * 만드는지 검증한다. createDeepAgent 실행·LLM 호출은 하지 않는다.
 */
function env(over: Partial<HarnessEnv> = {}): HarnessEnv {
  return {
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-5.4-mini",
    OPENAI_API_KEY: "sk-test",
    ...over,
  } as HarnessEnv;
}

describe("deep-web-research SKILL — registry 배선", () => {
  it("skills on + filesystem on → 루트 소스(['/']) 활성 + backend", () => {
    const cfg = buildHarnessConfig(
      env({ HARNESS_SKILLS: "true", HARNESS_FILESYSTEM: "true" }),
    );
    expect(cfg.skills.enabled).toBe(true);
    // deepagents 는 sourcePath("/") 아래 서브디렉토리를 스캔하므로 루트 "/" 반환.
    // 개별 스킬 경로("/deep-web-research/")가 아닌 skills/ 루트 경로를 소스로 사용.
    expect(cfg.skills.sources).toEqual(["/"]);
    expect(
      (cfg.skills.backend as { constructor: { name: string } }).constructor
        .name,
    ).toBe("FilesystemBackend");
  });

  it("skills on + filesystem OFF → 비활성 (progressive disclosure 의존)", () => {
    const cfg = buildHarnessConfig(
      env({ HARNESS_SKILLS: "true", HARNESS_FILESYSTEM: "false" }),
    );
    expect(cfg.skills.enabled).toBe(false);
    expect(cfg.skills.sources).toEqual([]);
    expect(cfg.skills.backend).toBeNull();
  });

  it("SKILL + 서브에이전트 동시 활성 → 스킬이 task 위임할 일꾼 존재", () => {
    const cfg = buildHarnessConfig(
      env({ HARNESS_SKILLS: "true", HARNESS_SUBAGENTS: "true" }),
    );
    // deepagents 루트 소스 방식 — 스킬이 존재하면 ["/"] 반환.
    expect(cfg.skills.sources).toEqual(["/"]);
    expect(cfg.subagents.some((s) => s.name === "web-searcher")).toBe(true);
  });
});

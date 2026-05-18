import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarnessConfig } from "@/types";

// buildAgentOptions.ts 단위 테스트 — AD-1 / AD-6 토글 매핑 격리 검증.
// 매핑: TC-6.3, TC-15.1(checkpointer 주입), AC-4/NFR-6(토글 격리)
//
// 핵심 계약 (Slice 5 / AD-1·AD-6-3):
//   buildAgentOptions(config, model, systemPrompt) →
//     ① createDeepAgent 의 완전한 단일 인자 객체 반환
//        (model / systemPrompt / tools / subagents / checkpointer)
//     ② registerHarnessProfile(modelSpec, HarnessProfileOptions) 부수효과
//   토글 → 프로파일 매핑 (probe note §3/§4 + AD-6):
//     - planning.enabled=false   → excludedMiddleware 에 "TodoListMiddleware"
//     - filesystem.enabled=false → excludedTools 에 6개 파일 도구,
//                                   FilesystemMiddleware 는 excludedMiddleware 에 없음(REQUIRED — throw)
//     - subagents [] + GP off    → subagents:[] + generalPurposeSubagent.enabled:false
//   모든 if(하네스상태) 분기는 이 파일에만 존재 (agent.ts diff 0 — AD-1).

const { registerHarnessProfileSpy } = vi.hoisted(() => ({
  registerHarnessProfileSpy: vi.fn(),
}));

vi.mock("deepagents", () => ({
  registerHarnessProfile: (key: string, profile: unknown) =>
    registerHarnessProfileSpy(key, profile),
}));

import { buildAgentOptions } from "@/lib/agent/harness/buildAgentOptions";

const FILE_TOOLS = ["ls", "read_file", "write_file", "edit_file", "glob", "grep"];

// 테스트용 가짜 모델 인스턴스 — deepagents 의 getModelProvider/getModelIdentifier
// 가 보는 형상(getName()/model_name)과 동일하게 흉내낸다(실측: index.js 7991~8009).
function fakeModel(className = "ChatAnthropic", modelName = "claude-test") {
  return {
    getName: () => className,
    model_name: modelName,
    modelName,
  } as unknown as Parameters<typeof buildAgentOptions>[1];
}

function makeConfig(overrides: Partial<HarnessConfig> = {}): HarnessConfig {
  return {
    planning: { enabled: true },
    filesystem: { enabled: true },
    subagents: [],
    tools: [{ name: "currentTime" }],
    checkpointer: { __saver: true },
    ...overrides,
  };
}

// registerHarnessProfile 에 넘어간 마지막 프로파일 옵션을 안전하게 추출.
function lastProfile(): Record<string, unknown> {
  const calls = registerHarnessProfileSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return (calls[calls.length - 1]?.[1] ?? {}) as Record<string, unknown>;
}

describe("buildAgentOptions — HarnessConfig → createDeepAgent 인자 어댑터 (AD-1/AD-6)", () => {
  beforeEach(() => {
    registerHarnessProfileSpy.mockClear();
  });

  // TC-6.3 — planning off → excludedMiddleware 에 TodoListMiddleware
  it("TC-6.3: planning.enabled=false → registerHarnessProfile.excludedMiddleware 에 'TodoListMiddleware'", () => {
    buildAgentOptions(
      makeConfig({ planning: { enabled: false } }),
      fakeModel(),
      "SYS",
    );
    const profile = lastProfile();
    expect(profile.excludedMiddleware).toContain("TodoListMiddleware");
  });

  it("planning.enabled=true → excludedMiddleware 에 'TodoListMiddleware' 없음(기본 활성)", () => {
    buildAgentOptions(makeConfig({ planning: { enabled: true } }), fakeModel(), "SYS");
    const profile = lastProfile();
    const excluded = (profile.excludedMiddleware ?? []) as string[];
    expect(excluded).not.toContain("TodoListMiddleware");
  });

  // filesystem off → excludedTools 에 6개 파일 도구, excludedMiddleware 에 FilesystemMiddleware 없음
  it("filesystem.enabled=false → excludedTools 에 6개 파일 도구 + FilesystemMiddleware 는 excludedMiddleware 에 없음(REQUIRED — throw 회피, AD-6-2)", () => {
    buildAgentOptions(
      makeConfig({ filesystem: { enabled: false } }),
      fakeModel(),
      "SYS",
    );
    const profile = lastProfile();
    const excludedTools = (profile.excludedTools ?? []) as string[];
    for (const t of FILE_TOOLS) {
      expect(excludedTools).toContain(t);
    }
    const excludedMw = (profile.excludedMiddleware ?? []) as string[];
    // REQUIRED 미들웨어를 excludedMiddleware 에 넣으면 construction-time throw.
    expect(excludedMw).not.toContain("FilesystemMiddleware");
  });

  it("filesystem.enabled=true → excludedTools 에 파일 도구 없음(기본 노출)", () => {
    buildAgentOptions(makeConfig({ filesystem: { enabled: true } }), fakeModel(), "SYS");
    const profile = lastProfile();
    const excludedTools = (profile.excludedTools ?? []) as string[];
    for (const t of FILE_TOOLS) {
      expect(excludedTools).not.toContain(t);
    }
  });

  // subagents off → subagents:[] + generalPurposeSubagent.enabled:false
  it("subagents [] (HARNESS_SUBAGENTS off) → createDeepAgent.subagents===[] + generalPurposeSubagent.enabled:false", () => {
    const opts = buildAgentOptions(
      makeConfig({ subagents: [] }),
      fakeModel(),
      "SYS",
    );
    expect(opts.subagents).toEqual([]);
    const profile = lastProfile();
    const gp = (profile.generalPurposeSubagent ?? {}) as { enabled?: boolean };
    expect(gp.enabled).toBe(false);
  });

  it("subagents 비어있지 않으면 → createDeepAgent.subagents 에 합성 + GP enabled:false 아님", () => {
    const spec = {
      name: "researcher",
      description: "조사 담당",
      systemPrompt: "조사하라",
    };
    const opts = buildAgentOptions(
      makeConfig({ subagents: [spec] }),
      fakeModel(),
      "SYS",
    );
    expect(Array.isArray(opts.subagents)).toBe(true);
    expect((opts.subagents as unknown[]).length).toBe(1);
    const profile = lastProfile();
    const gp = (profile.generalPurposeSubagent ?? {}) as { enabled?: boolean };
    expect(gp.enabled).not.toBe(false);
  });

  // model/systemPrompt/checkpointer/tools 패스스루
  it("TC-15.1: model/systemPrompt/tools/checkpointer 가 createDeepAgent 인자로 패스스루(checkpointer 반드시 주입)", () => {
    const model = fakeModel();
    const cfg = makeConfig();
    const opts = buildAgentOptions(cfg, model, "MY_SYSTEM_PROMPT");
    expect(opts.model).toBe(model);
    expect(opts.systemPrompt).toBe("MY_SYSTEM_PROMPT");
    expect(opts.tools).toBe(cfg.tools);
    // checkpointer 미주입이면 멀티턴 무상태 퇴화 — 반드시 truthy.
    expect(opts.checkpointer).toBe(cfg.checkpointer);
    expect(opts.checkpointer).toBeTruthy();
  });

  // registerHarnessProfile 의 key 는 모델 인스턴스에서 해석 가능한 spec 이어야 함.
  it("registerHarnessProfile 의 key 가 모델 provider 와 매칭(인스턴스 해석: provider 또는 provider:model)", () => {
    buildAgentOptions(
      makeConfig({ planning: { enabled: false } }),
      fakeModel("ChatOpenAI", "gpt-test"),
      "SYS",
    );
    const calls = registerHarnessProfileSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const keys = calls.map((c) => String(c[0]));
    // bare provider 키는 resolveHarnessProfile 의 최종 fallback — 항상 매칭.
    expect(keys.some((k) => k === "openai" || k.startsWith("openai:"))).toBe(true);
  });

  // AD-1 격리: 토글 분기는 이 함수가 전부 흡수 — 동일 입력 → 결정적 출력.
  it("AD-1: 동일 config 두 번 호출 시 동일 형상의 createDeepAgent 인자(결정적, 분기 격리)", () => {
    const cfg = makeConfig({ planning: { enabled: false } });
    const a = buildAgentOptions(cfg, fakeModel(), "SYS");
    const b = buildAgentOptions(cfg, fakeModel(), "SYS");
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.subagents).toEqual(b.subagents);
  });
});

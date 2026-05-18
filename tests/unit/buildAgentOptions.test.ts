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

// buildAgentOptions 의 프로세스-전역 멱등 가드 키(architect AI-1, option b).
// 테스트 간 격리를 위해 매 테스트 전에 비운다.
const REGISTERED_KEYS_GLOBAL = "__deepagentsProfilesRegistered";

import { buildAgentOptions } from "@/lib/agent/harness/buildAgentOptions";

const FILE_TOOLS = ["ls", "read_file", "write_file", "edit_file", "glob", "grep"];

// 테스트용 가짜 모델 인스턴스 — deepagents 의 getModelProvider/getModelIdentifier
// 가 보는 형상(getName()/model id)을 **실제 인스턴스와 동일하게** 흉내낸다.
// (architect 실측: 실 ChatAnthropic 은 modelName + .model 노출, model_name 없음.
//  실 ChatOpenAI 은 .model 만 노출, modelName/model_name 둘 다 없음.
//  deepagents getModelIdentifier 실측: index.js ~8009
//    _defaultConfig?.model ?? model.model_name ?? model.modelName)
function fakeModel(className = "ChatAnthropic", modelId = "claude-test") {
  if (className === "ChatOpenAI") {
    // 실 ChatOpenAI: .model 만 존재 (modelName/model_name 없음).
    return {
      getName: () => className,
      model: modelId,
    } as unknown as Parameters<typeof buildAgentOptions>[1];
  }
  // 실 ChatAnthropic: modelName + .model 존재 (model_name 없음).
  return {
    getName: () => className,
    modelName: modelId,
    model: modelId,
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
    // 멱등 가드는 프로세스 전역 — 테스트 간 누수 방지를 위해 매번 초기화.
    (globalThis as unknown as Record<string, unknown>)[REGISTERED_KEYS_GLOBAL] =
      undefined;
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

  // AI-2 — modelIdentifierHint 추출 순서가 deepagents getModelIdentifier 와 정합.
  // 실측(index.js ~8009): _defaultConfig?.model ?? model_name ?? modelName
  // (+ 본 프로젝트는 실 ChatOpenAI 가 .model 만 노출하므로 .model 최종 fallback 추가)
  describe("AI-2: modelIdentifierHint 추출이 실 인스턴스 형상과 정합", () => {
    it("실 ChatAnthropic 형상(modelName + .model, model_name 없음) → provider:model 키 등록", () => {
      buildAgentOptions(
        makeConfig({ planning: { enabled: false } }),
        fakeModel("ChatAnthropic", "claude-opus-4-7"),
        "SYS",
      );
      const keys = registerHarnessProfileSpy.mock.calls.map((c) => String(c[0]));
      expect(keys).toContain("anthropic");
      expect(keys).toContain("anthropic:claude-opus-4-7");
    });

    it("실 ChatOpenAI 형상(.model 만, modelName/model_name 없음) → provider:model 키 등록 (.model fallback 동작)", () => {
      buildAgentOptions(
        makeConfig({ planning: { enabled: false } }),
        fakeModel("ChatOpenAI", "gpt-5.4"),
        "SYS",
      );
      const keys = registerHarnessProfileSpy.mock.calls.map((c) => String(c[0]));
      expect(keys).toContain("openai");
      // .model fallback 이 없으면 이 키는 등록되지 않아 실패한다(drift 잠금).
      expect(keys).toContain("openai:gpt-5.4");
    });

    it("_defaultConfig.model 이 model_name/modelName 보다 우선(deepagents 해석 순서 일치)", () => {
      const model = {
        getName: () => "ChatAnthropic",
        _defaultConfig: { model: "from-default-config" },
        model_name: "from-model-name",
        modelName: "from-model-name-camel",
        model: "from-model",
      } as unknown as Parameters<typeof buildAgentOptions>[1];
      buildAgentOptions(makeConfig({ planning: { enabled: false } }), model, "SYS");
      const keys = registerHarnessProfileSpy.mock.calls.map((c) => String(c[0]));
      expect(keys).toContain("anthropic:from-default-config");
    });
  });

  // AI-1/AI-3 — profile 등록 idempotent (Slice 9 harness-toggle E2E 가 graph 를
  // rebuild 해도 deepagents mergeProfiles 의 무-dedup concat 누적이 일어나면 안 됨).
  describe("AI-1/AI-3: profile 등록 idempotency (재호출 시 누적 금지)", () => {
    it("동일 model spec 으로 buildAgentOptions 두 번 → 두 번째는 registerHarnessProfile 재호출하지 않음", () => {
      const cfg = makeConfig({ planning: { enabled: false }, filesystem: { enabled: false } });

      buildAgentOptions(cfg, fakeModel("ChatAnthropic", "claude-x"), "SYS");
      const firstCallCount = registerHarnessProfileSpy.mock.calls.length;
      expect(firstCallCount).toBeGreaterThan(0);

      // 두 번째 호출(같은 프로세스, 같은 spec): first-call 가드가 재등록 차단.
      // Slice 9 harness-toggle E2E 의 graph rebuild 누적 결함을 잠근다.
      buildAgentOptions(cfg, fakeModel("ChatAnthropic", "claude-x"), "SYS");

      // 누적 방어: 두 번째 호출에서 추가 registerHarnessProfile 호출이 없어야 함.
      expect(registerHarnessProfileSpy.mock.calls.length).toBe(firstCallCount);
    });

    it("토글이 바뀐 재호출이어도 같은 key 는 재등록하지 않음(stale merge 누적 차단)", () => {
      // run1: planning off → run2: planning on. 가드가 없으면 deepagents
      // mergeProfiles 가 run1 의 excludedMiddleware 를 stale 하게 잔존시킨다.
      buildAgentOptions(
        makeConfig({ planning: { enabled: false } }),
        fakeModel("ChatAnthropic", "claude-y"),
        "SYS",
      );
      const after1 = registerHarnessProfileSpy.mock.calls.length;
      buildAgentOptions(
        makeConfig({ planning: { enabled: true } }),
        fakeModel("ChatAnthropic", "claude-y"),
        "SYS",
      );
      expect(registerHarnessProfileSpy.mock.calls.length).toBe(after1);
    });

    it("실 deepagents 레지스트리 대상 — 반복 호출해도 resolved profile 의 excludedMiddleware/excludedTools 가 누적되지 않음", async () => {
      // vi.importActual 로 실제 deepagents API 를 직접 구동(모킹 우회).
      const real = await vi.importActual<typeof import("deepagents")>("deepagents");
      const { registerHarnessProfile: realRegister, getHarnessProfile: realGet } = real;

      // 본 테스트 전용 고유 키(빌트인/타 테스트와 충돌 회피).
      const key = `anthropic:slice5-idem-${Date.now()}`;
      const profileOpts = {
        excludedMiddleware: ["TodoListMiddleware"],
        excludedTools: [...FILE_TOOLS],
      };

      // buildAgentOptions 의 가드 로직과 동일한 패턴: 이미 있으면 skip.
      function registerOnce() {
        if (realGet(key) !== undefined) return;
        realRegister(key, profileOpts);
      }

      registerOnce();
      registerOnce();
      registerOnce();

      const resolved = realGet(key);
      expect(resolved).toBeDefined();
      const mw = [...(resolved!.excludedMiddleware as Set<string>)];
      const tools = [...(resolved!.excludedTools as Set<string>)];

      // 누적되었다면 길이가 1/6 을 초과하거나 중복이 생긴다.
      expect(mw).toEqual(["TodoListMiddleware"]);
      expect(mw.filter((m) => m === "TodoListMiddleware").length).toBe(1);
      expect(tools.length).toBe(FILE_TOOLS.length);
      expect(new Set(tools).size).toBe(tools.length);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// registry.ts 단위 테스트 — buildHarnessConfig(env) 순수성 검증.
// 매핑: TC-6.2, TC-6.7, TC-6.8, TC-7.2, TC-8.2, TC-25.13~25.18
//
// 핵심 계약 (Slice 5):
//   buildHarnessConfig(env): HarnessConfig
//   - 진짜 순수 함수 (AD-2): fs side effect 0, LLM 호출 0.
//   - HARNESS_PLANNING=false   → planning.enabled === false (기본 true)
//   - HARNESS_FILESYSTEM=false → filesystem.enabled === false (기본 true)
//   - HARNESS_SUBAGENTS=false  → subagents === []  (기본 [])
//   - tools 는 HARNESS_TOOLS (등록 없으면 빈 배열 허용 계약)
//   - checkpointer 는 lazy 핸들 — 호출만으로 ./.data/ 미생성 (AD-2)
//   - 잘못된 provider 는 명확한 에러로 표면화 (model.ts 위임 — registry-class)
//
// @langchain/* 런타임 생성자는 가로채 실 API 호출/과금 0 (CLAUDE.md R).

import { vi } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor() {}
  },
  // webSearchTool.ts 가 import 시점에 tools.webSearch() 를 평가한다.
  // 실측 런타임 형태({type:"web_search"})를 모사 — probe note §6-A.
  tools: { webSearch: () => ({ type: "web_search" }) },
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    constructor() {}
  },
}));

import { buildHarnessConfig } from "@/lib/agent/harness/registry";
import { HARNESS_TOOLS } from "@/lib/agent/harness/tools";

// 기본 경로(./.data/checkpoints.sqlite)의 부모 디렉토리 — AD-2 미생성 검증용.
const DATA_DIR = resolve(process.cwd(), ".data");

function dataDirExists(): boolean {
  return existsSync(DATA_DIR);
}

describe("buildHarnessConfig — 하네스 조립 레지스트리 (AD-2 순수성 / FR-08,11)", () => {
  beforeEach(() => {
    // AD-2 검증의 신뢰성을 위해 사전 ./.data/ 잔재 제거.
    if (dataDirExists()) rmSync(DATA_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    if (dataDirExists()) rmSync(DATA_DIR, { recursive: true, force: true });
  });

  // TC-6.2 / TC-25.13 — HARNESS_PLANNING=false → planning.enabled false + fs side effect 0
  it("TC-6.2/25.13: HARNESS_PLANNING=false → planning.enabled === false, 호출 후 ./.data/ 미생성", () => {
    const cfg = buildHarnessConfig({
      HARNESS_PLANNING: "false",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.planning.enabled).toBe(false);
    // AD-2: 순수 함수 — 호출만으로 디렉토리 생성 금지.
    expect(dataDirExists()).toBe(false);
  });

  // TC-6.7 — HARNESS_PLANNING 미설정 → 기본 planning.enabled true
  it("TC-6.7: HARNESS_PLANNING 미설정(undefined) → 기본 planning.enabled === true", () => {
    const cfg = buildHarnessConfig({
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.planning.enabled).toBe(true);
  });

  // TC-6.8 — HARNESS_PLANNING 변형값(False/0/FALSE/' false ') 일관 처리
  it("TC-6.8: HARNESS_PLANNING 변형값 일관 처리 (False/0/FALSE/' false ' → false; true/1 → true)", () => {
    const baseEnv = {
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    };
    for (const falsy of ["false", "False", "FALSE", " false ", "0"]) {
      expect(
        buildHarnessConfig({ ...baseEnv, HARNESS_PLANNING: falsy }).planning.enabled,
      ).toBe(false);
    }
    for (const truthy of ["true", "TRUE", " true ", "1"]) {
      expect(
        buildHarnessConfig({ ...baseEnv, HARNESS_PLANNING: truthy }).planning.enabled,
      ).toBe(true);
    }
  });

  // HARNESS_FILESYSTEM=false → filesystem.enabled false (soft toggle 입력)
  it("HARNESS_FILESYSTEM=false → filesystem.enabled === false (soft toggle 입력, AD-6)", () => {
    const cfg = buildHarnessConfig({
      HARNESS_FILESYSTEM: "false",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.filesystem.enabled).toBe(false);
    expect(dataDirExists()).toBe(false);
  });

  it("HARNESS_FILESYSTEM 미설정 → 기본 filesystem.enabled === true", () => {
    const cfg = buildHarnessConfig({
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.filesystem.enabled).toBe(true);
  });

  // TC-7.2 / TC-25.14 — tools 는 HARNESS_TOOLS 그대로 (빈 배열 허용 계약) + fs 0
  it("TC-7.2/25.14: tools 는 HARNESS_TOOLS 와 동일(빈 배열 허용 계약), 호출 후 ./.data/ 미생성", () => {
    const cfg = buildHarnessConfig({
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(Array.isArray(cfg.tools)).toBe(true);
    expect(cfg.tools).toEqual(HARNESS_TOOLS);
    expect(dataDirExists()).toBe(false);
  });

  // TC-8.2 / TC-25.15 — HARNESS_SUBAGENTS=false → subagents [] + fs 0
  it("TC-8.2/25.15: HARNESS_SUBAGENTS=false → subagents === [], 호출 후 ./.data/ 미생성", () => {
    const cfg = buildHarnessConfig({
      HARNESS_SUBAGENTS: "false",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.subagents).toEqual([]);
    expect(dataDirExists()).toBe(false);
  });

  // HARNESS_SUBAGENTS=true → web-searcher 1종 등록 (deep-web-research
  // SKILL 의 일꾼). false 면 [](TC-8.2) — 토글 양방향 회귀.
  // (D9 롤백: D7 의 dart-analyst 는 고정흐름 재설계로 폐기 — subagent
  // 자율위임 전제가 OPEN-3 실측에서 반증됨. DART 분석은 전용 라우트
  // /api/dart/analyze 로 이전. 하네스 subagent 는 web-searcher 단독.)
  it("HARNESS_SUBAGENTS=true → subagents 에 web-searcher 포함, tools 부여", () => {
    const cfg = buildHarnessConfig({
      HARNESS_SUBAGENTS: "true",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.subagents).toHaveLength(1);
    const ws = cfg.subagents.find((s) => s?.name === "web-searcher");
    expect(ws).toBeDefined();
    expect(ws?.systemPrompt.length).toBeGreaterThan(0);
    // 역할을 웹검색으로 좁히는 명시 tools 주입(메인 defaultTools 상속 아님).
    expect(Array.isArray(ws?.tools)).toBe(true);
    expect((ws?.tools ?? []).length).toBeGreaterThan(0);
    expect(dataDirExists()).toBe(false);
  });

  // TC-25.16 — HARNESS_CHECKPOINTER 분기: 호출만으로 ./.data/ 미생성(lazy, AD-2)
  it("TC-25.16: HARNESS_CHECKPOINTER=sqlite|memory 분기 — 호출만으로 ./.data/ 미생성(lazy)", () => {
    const sqliteCfg = buildHarnessConfig({
      HARNESS_CHECKPOINTER: "sqlite",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(sqliteCfg.checkpointer).toBeTruthy();
    expect(dataDirExists()).toBe(false);

    const memCfg = buildHarnessConfig({
      HARNESS_CHECKPOINTER: "memory",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(memCfg.checkpointer).toBeTruthy();
    expect(dataDirExists()).toBe(false);
  });

  // TC-25.18 — 어떤 분기든 호출만으로 디렉토리/파일 생성 0 (AD-2 문자 그대로)
  it("TC-25.18: 어떤 env 분기든 buildHarnessConfig 호출만으로 fs 생성 0 (AD-2)", () => {
    for (const env of [
      { HARNESS_PLANNING: "false" },
      { HARNESS_FILESYSTEM: "false" },
      { HARNESS_SUBAGENTS: "false" },
      { HARNESS_CHECKPOINTER: "sqlite" },
      { HARNESS_CHECKPOINTER: "memory" },
      {},
    ]) {
      buildHarnessConfig({
        ...env,
        LLM_PROVIDER: "anthropic",
        LLM_MODEL: "claude-test",
        ANTHROPIC_API_KEY: "sk-ant-test",
      });
    }
    expect(dataDirExists()).toBe(false);
  });

  // TC-25.17 류 (registry-class) — 잘못된 provider 는 명확한 에러로 표면화.
  // provider 검증은 model.ts 소관이나 registry 가 그것을 은폐하지 않아야 함.
  it("registry-class: 잘못된 LLM_PROVIDER 는 명확한 에러로 표면화(무음 폴백 0)", () => {
    let thrown: unknown;
    try {
      buildHarnessConfig({
        LLM_PROVIDER: "gemini",
        LLM_MODEL: "gemini-pro",
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toContain("gemini");
  });
});

// 워크스페이스 하네스 프로필 차단 레이어 — buildHarnessConfig(env, _, _, profile)
// 가 env 토글 위에 profile.blocked 요소를 강제 off 하는지(R2 단일 지점) 검증.
describe("buildHarnessConfig — 요청별 하네스 토글 오버라이드 (R2)", () => {
  const baseEnv = { LLM_PROVIDER: "anthropic", LLM_MODEL: "claude" } as const;

  it("overrides 미지정이면 env 토글 그대로(기존 /chat 회귀 0)", () => {
    const cfg = buildHarnessConfig({ ...baseEnv });
    // env 기본 true → subagents 비어있지 않고 skills 활성(기본 sources 존재).
    expect(cfg.subagents.length).toBeGreaterThan(0);
    expect(cfg.skills.enabled).toBe(true);
    expect(cfg.planning.enabled).toBe(true);
    expect(cfg.filesystem.enabled).toBe(true);
  });

  it("overrides {skills:false} → env 가 켜져 있어도 skills off, subagents 유지", () => {
    const cfg = buildHarnessConfig(
      { ...baseEnv, HARNESS_SKILLS: "true", HARNESS_SUBAGENTS: "true" },
      undefined,
      undefined,
      { skills: false },
    );
    expect(cfg.skills.enabled).toBe(false);
    expect(cfg.skills.sources).toEqual([]);
    expect(cfg.subagents.length).toBeGreaterThan(0); // 오버라이드 없음 — env 유지
  });

  it("overrides {skills:false,subagents:false} → 둘 다 off (env on 무시)", () => {
    const cfg = buildHarnessConfig(
      { ...baseEnv, HARNESS_SKILLS: "true", HARNESS_SUBAGENTS: "true" },
      undefined,
      undefined,
      { skills: false, subagents: false },
    );
    expect(cfg.skills.enabled).toBe(false);
    expect(cfg.subagents).toEqual([]);
    // planning/filesystem 은 오버라이드 없음 — env 기본(true) 유지.
    expect(cfg.planning.enabled).toBe(true);
    expect(cfg.filesystem.enabled).toBe(true);
  });

  it("overrides {planning:false,filesystem:false} → 4요소 전부 토글 가능 확인", () => {
    const cfg = buildHarnessConfig(
      { ...baseEnv },
      undefined,
      undefined,
      { planning: false, filesystem: false },
    );
    expect(cfg.planning.enabled).toBe(false);
    expect(cfg.filesystem.enabled).toBe(false);
    // subagents/skills 는 오버라이드 없음 — env 기본 유지.
    expect(cfg.subagents.length).toBeGreaterThan(0);
  });

  it("overrides {} (빈 객체) → env 토글 그대로(오버라이드 0)", () => {
    const cfg = buildHarnessConfig({ ...baseEnv }, undefined, undefined, {});
    expect(cfg.subagents.length).toBeGreaterThan(0);
    expect(cfg.skills.enabled).toBe(true);
  });

  it("override true 가 env off 를 덮어쓴다(끔→켬 가능)", () => {
    const cfg = buildHarnessConfig(
      { ...baseEnv, HARNESS_SKILLS: "false" },
      undefined,
      undefined,
      { skills: true },
    );
    // env 는 off 지만 override true → skills 활성(filesystem 기본 on 이라 sources 존재).
    expect(cfg.skills.enabled).toBe(true);
  });
});

// 워크스페이스(에이전트 A/B/C) 스킬·서브에이전트 멀티선택 필터 — 6번째
// 인자 selection. null=전체(회귀 0), 배열=그 name 만, []=전부 끔(R2 단일지점).
describe("buildHarnessConfig — 워크스페이스 멀티선택 필터(selection)", () => {
  const baseEnv = {
    LLM_PROVIDER: "anthropic",
    LLM_MODEL: "claude",
    HARNESS_SKILLS: "true",
    HARNESS_SUBAGENTS: "true",
  } as const;

  // selection 인자는 (env, idx, sql, overrides, graphDataset, selection) 6번째.
  const withSelection = (selection: {
    skills?: string[] | null;
    subagents?: string[] | null;
  }): ReturnType<typeof buildHarnessConfig> =>
    buildHarnessConfig(
      { ...baseEnv },
      undefined,
      undefined,
      undefined,
      undefined,
      selection,
    );

  it("selection 미지정 → 전체(기존 동작 — 회귀 0)", () => {
    const cfg = buildHarnessConfig({ ...baseEnv });
    expect(cfg.subagents.length).toBeGreaterThan(0);
    expect(cfg.skills.sources.length).toBeGreaterThan(0);
  });

  it("selection.subagents=[] → 서브에이전트 전부 제외(토글 ON 이어도)", () => {
    const cfg = withSelection({ subagents: [] });
    expect(cfg.subagents).toEqual([]);
    // skills 는 selection 미지정(undefined)이라 전체 유지.
    expect(cfg.skills.sources.length).toBeGreaterThan(0);
  });

  it("selection.subagents=['web-searcher'] → 그 서브에이전트만 통과", () => {
    const cfg = withSelection({ subagents: ["web-searcher"] });
    expect(cfg.subagents.every((s) => s.name === "web-searcher")).toBe(true);
    expect(cfg.subagents.find((s) => s.name === "web-searcher")).toBeTruthy();
  });

  it("selection.subagents=['nonexistent'] → 매칭 0 → 빈 배열", () => {
    const cfg = withSelection({ subagents: ["nonexistent-agent"] });
    expect(cfg.subagents).toEqual([]);
  });

  it("selection.subagents=null → 전체(명시적 null 도 전체)", () => {
    const cfg = withSelection({ subagents: null });
    expect(cfg.subagents.length).toBeGreaterThan(0);
  });

  it("selection.skills=[] → 스킬 sources 전부 제외(토글 ON 이어도)", () => {
    const cfg = withSelection({ skills: [] });
    expect(cfg.skills.sources).toEqual([]);
    expect(cfg.skills.enabled).toBe(false); // sources 0 → enabled false
  });

  it("selection.skills=['deep-web-research'] → 그 스킬 source 만", () => {
    const cfg = withSelection({ skills: ["deep-web-research"] });
    // 내장 스킬 source(/deep-web-research/)가 통과.
    expect(cfg.skills.sources).toContain("/deep-web-research/");
    expect(cfg.skills.enabled).toBe(true);
  });

  it("selection.skills=['nonexistent'] → 매칭 0 → sources 빈 배열", () => {
    const cfg = withSelection({ skills: ["no-such-skill"] });
    expect(cfg.skills.sources).toEqual([]);
  });

  it("skills 토글 OFF 면 selection 무관하게 sources [] (토글 우선)", () => {
    const cfg = buildHarnessConfig(
      { ...baseEnv, HARNESS_SKILLS: "false" },
      undefined,
      undefined,
      { skills: false },
      undefined,
      { skills: ["deep-web-research"] },
    );
    expect(cfg.skills.sources).toEqual([]);
  });

  it("subagents 토글 OFF 면 selection 무관하게 [] (토글 우선)", () => {
    const cfg = buildHarnessConfig(
      { ...baseEnv },
      undefined,
      undefined,
      { subagents: false },
      undefined,
      { subagents: ["web-searcher"] },
    );
    expect(cfg.subagents).toEqual([]);
  });
});

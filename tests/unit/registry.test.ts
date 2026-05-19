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

  // HARNESS_SUBAGENTS=true → web-searcher + dart-analyst 등록.
  // false 면 [](TC-8.2) — 토글 양방향 회귀. (D7: dart-analyst 추가로
  // 인덱스 의존 → find(name) 방식 갱신, 향후 subagent 추가에도 견고.)
  it("HARNESS_SUBAGENTS=true → subagents 에 web-searcher·dart-analyst 포함, tools 부여", () => {
    const cfg = buildHarnessConfig({
      HARNESS_SUBAGENTS: "true",
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(cfg.subagents).toHaveLength(2);
    const ws = cfg.subagents.find((s) => s?.name === "web-searcher");
    expect(ws).toBeDefined();
    expect(ws?.systemPrompt.length).toBeGreaterThan(0);
    // 역할을 웹검색으로 좁히는 명시 tools 주입(메인 defaultTools 상속 아님).
    expect(Array.isArray(ws?.tools)).toBe(true);
    expect((ws?.tools ?? []).length).toBeGreaterThan(0);
    // D7: dart-analyst 공존 — 8관점 펀더멘털 분석가(R2 동형 등록).
    const da = cfg.subagents.find((s) => s?.name === "dart-analyst");
    expect(da).toBeDefined();
    expect(da?.systemPrompt.length).toBeGreaterThan(0);
    expect((da?.tools ?? []).length).toBe(2); // dartTool + webSearchTool
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

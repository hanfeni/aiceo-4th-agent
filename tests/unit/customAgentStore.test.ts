/**
 * C1 — customAgentStore 단위 테스트 (TC-51.1~51.4, TC-52.1~52.3, TC-54.1~54.3, TC-SEC.1, TC-DI.1)
 *
 * LLM 비호출. 각 테스트마다 격리된 임시 디렉토리를 CUSTOM_AGENT_DATA_DIR
 * 환경변수로 지정해 실제 .data/ 를 건드리지 않는다.
 * subagentStore/skillStore 등록목록은 vi.mock 으로 제어.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

// ── 등록목록 모킹 (AI-4 대조 검증) ──────────────────────────────────────────
vi.mock("@/lib/agent/harness/subagents/subagentStore", () => ({
  listCustomSubagents: () => [{ name: "dart-analyst" }],
  listCustomSubagentSpecs: () => [{ name: "dart-analyst" }],
}));
vi.mock("@/lib/agent/harness/skills/skillStore", () => ({
  listSkills: () => [{ name: "deep-web-research" }, { name: "stock-analysis" }],
}));
vi.mock("@/lib/agent/harness/subagents/index", () => ({
  HARNESS_SUBAGENTS: [{ name: "web-searcher", description: "내장", systemPrompt: "s" }],
}));

// ── 테스트 격리 헬퍼 ────────────────────────────────────────────────────────
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(os.tmpdir(), `agents-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  process.env.CUSTOM_AGENT_DATA_DIR = tmpDir;
  // globalThis 캐시 리셋
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__harnessCustomAgents;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CUSTOM_AGENT_DATA_DIR;
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__harnessCustomAgents;
  vi.resetModules();
});

// 동적 import 로 환경변수 적용된 store 가져오기
async function loadStore() {
  const mod = await import("@/lib/agent/harness/agents/customAgentStore");
  return mod;
}

// ── TC-51.1: create → read 라운드트립 ──────────────────────────────────────
describe("customAgentStore — CRUD", () => {
  it("TC-51.1: 에이전트 생성 후 목록에서 조회된다", async () => {
    const { createCustomAgent, listCustomAgents } = await loadStore();

    const agent = createCustomAgent({
      name: "my-agent",
      description: "테스트 에이전트",
      instructionId: "default",
      subagentNames: ["web-searcher"],
      skillNames: [],
    });

    expect(agent.name).toBe("my-agent");
    expect(agent.id).toMatch(/^agent-/);
    const list = listCustomAgents();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("my-agent");
    expect(list[0].instructionId).toBe("default");
    expect(list[0].subagentNames).toEqual(["web-searcher"]);
  });

  it("TC-51.3: JSON 직렬화·역직렬화 — globalThis 캐시 비우고 재로드 후 동일 데이터", async () => {
    const { createCustomAgent } = await loadStore();

    createCustomAgent({
      name: "agent-a",
      description: "설명",
      instructionId: "default",
      subagentNames: ["dart-analyst"],
      skillNames: ["deep-web-research"],
    });

    // 캐시 비우고 재로드
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.__harnessCustomAgents;
    vi.resetModules();

    const { listCustomAgents } = await import("@/lib/agent/harness/agents/customAgentStore");
    const list = listCustomAgents();
    expect(list).toHaveLength(1);
    expect(list[0].skillNames).toEqual(["deep-web-research"]);
    expect(list[0].subagentNames).toEqual(["dart-analyst"]);
  });

  it("TC-51.4: 손상된 JSON 은 graceful 무시(빈 목록 반환)", async () => {
    writeFileSync(join(tmpDir, "agents.json"), "{ broken json !!!", "utf-8");

    const { listCustomAgents } = await loadStore();
    expect(listCustomAgents()).toEqual([]);
  });
});

// ── TC-51.2: name 검증 ──────────────────────────────────────────────────────
describe("customAgentStore — name 검증 (TC-51.2)", () => {
  it("빈 이름 거부", async () => {
    const { createCustomAgent } = await loadStore();
    expect(() =>
      createCustomAgent({ name: "", description: "", instructionId: "default", subagentNames: [], skillNames: [] }),
    ).toThrow(/이름/);
  });

  it("공백만 있는 이름 거부", async () => {
    const { createCustomAgent } = await loadStore();
    expect(() =>
      createCustomAgent({ name: "   ", description: "", instructionId: "default", subagentNames: [], skillNames: [] }),
    ).toThrow(/이름/);
  });

  it("최대 길이 초과 거부", async () => {
    const { createCustomAgent, MAX_NAME_LEN } = await loadStore();
    expect(() =>
      createCustomAgent({
        name: "a".repeat(MAX_NAME_LEN + 1),
        description: "",
        instructionId: "default",
        subagentNames: [],
        skillNames: [],
      }),
    ).toThrow(/너무 깁니다/);
  });

  it("한글·영문 혼합 이름 허용 (자유형식)", async () => {
    const { createCustomAgent, listCustomAgents } = await loadStore();
    createCustomAgent({ name: "나의 에이전트 v1", description: "", instructionId: "default", subagentNames: [], skillNames: [] });
    expect(listCustomAgents()[0].name).toBe("나의 에이전트 v1");
  });
});

// ── TC-SEC.1: path traversal 방어 ──────────────────────────────────────────
describe("customAgentStore — id path traversal (TC-SEC.1)", () => {
  it("삭제 시 traversal id 는 무시(미존재 처리)", async () => {
    const { deleteCustomAgent } = await loadStore();
    // 악의적 id 가 와도 filter 만 돌고 파일 시스템 접근 없음
    for (const bad of ["../evil", ".env", ""]) {
      expect(() => deleteCustomAgent(bad)).not.toThrow();
    }
  });
});

// ── TC-52.1/52.2: 미등록 subagent/skill 이름 거부 (AI-4) ──────────────────
describe("customAgentStore — 등록목록 대조 (AI-4 / TC-52.1~52.2)", () => {
  it("TC-52.1: 미등록 subagent 이름 포함 시 throw", async () => {
    const { createCustomAgent } = await loadStore();
    expect(() =>
      createCustomAgent({
        name: "test-agent",
        description: "",
        instructionId: "default",
        subagentNames: ["non-existent-sub"],
        skillNames: [],
      }),
    ).toThrow(/서브에이전트.*등록/);
  });

  it("TC-52.2: 미등록 skill 이름 포함 시 throw", async () => {
    const { createCustomAgent } = await loadStore();
    expect(() =>
      createCustomAgent({
        name: "test-agent",
        description: "",
        instructionId: "default",
        subagentNames: [],
        skillNames: ["non-existent-skill"],
      }),
    ).toThrow(/스킬.*등록/);
  });

  it("TC-52.3: 중복 이름은 dedup 처리", async () => {
    const { createCustomAgent, listCustomAgents } = await loadStore();
    createCustomAgent({
      name: "dedup-agent",
      description: "",
      instructionId: "default",
      subagentNames: ["web-searcher", "web-searcher"],
      skillNames: [],
    });
    expect(listCustomAgents()[0].subagentNames).toEqual(["web-searcher"]);
  });
});

// ── TC-54.x: 삭제 ─────────────────────────────────────────────────────────
describe("customAgentStore — 삭제 (TC-54.1~54.3)", () => {
  it("TC-54.1: 존재하는 id 삭제 후 목록에서 제거", async () => {
    const { createCustomAgent, deleteCustomAgent, listCustomAgents } = await loadStore();
    const agent = createCustomAgent({
      name: "to-delete",
      description: "",
      instructionId: "default",
      subagentNames: [],
      skillNames: [],
    });

    deleteCustomAgent(agent.id);
    expect(listCustomAgents()).toHaveLength(0);
  });

  it("TC-54.2: 미존재 id 삭제는 idempotent(에러 없음)", async () => {
    const { deleteCustomAgent } = await loadStore();
    expect(() => deleteCustomAgent("non-existent-id")).not.toThrow();
  });

  it("TC-54.3: 빈 id 는 무시", async () => {
    const { deleteCustomAgent } = await loadStore();
    expect(() => deleteCustomAgent("")).not.toThrow();
  });
});

// ── TC-DI.1: .data/agents.json 과 타 store 파일 분리 ──────────────────────
describe("customAgentStore — 파일 분리 (TC-DI.1)", () => {
  it("agents.json 생성이 subagents.json / instructions.json 을 건드리지 않는다", async () => {
    const { createCustomAgent } = await loadStore();
    createCustomAgent({
      name: "isolation-test",
      description: "",
      instructionId: "default",
      subagentNames: [],
      skillNames: [],
    });

    expect(existsSync(join(tmpDir, "agents.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "subagents.json"))).toBe(false);
    expect(existsSync(join(tmpDir, "instructions.json"))).toBe(false);
  });
});

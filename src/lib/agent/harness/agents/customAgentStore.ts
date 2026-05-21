/**
 * 커스텀 에이전트 CRUD 스토어 (하네스 "에이전트 생성" 탭 백엔드).
 *
 * subagentStore.ts 패턴 동형:
 *  - R6(globalThis 싱글톤): dev HMR 시 캐시 재생성 방지.
 *  - .data/agents.json 영속(checkpointer·subagents·instructions 와 분리 — NFR-23).
 *  - 손상 JSON graceful 무시(빈 목록 취급).
 *
 * 등록목록 대조(AI-4): POST 시 subagentNames/skillNames 를 실제 등록된
 * 서브에이전트·스킬과 교차 검증해 미등록 이름은 throw (TC-52.1/52.2).
 *
 * 보안(AI-5): id 는 내부 생성(nanoid 유사 — timestamp+random, URL-safe).
 *   slug 형식 강제로 path traversal 원천 차단(TC-SEC.1).
 *
 * R7 — fs 의존이라 이 모듈을 import 하는 라우트는 runtime=nodejs.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { HARNESS_SUBAGENTS } from "../subagents";
import { listCustomSubagents } from "../subagents/subagentStore";
import { listSkills } from "../skills/skillStore";

const DATA_DIR = process.env.CUSTOM_AGENT_DATA_DIR ?? join(process.cwd(), ".data");
const STORE_FILE = join(DATA_DIR, "agents.json");

/** id 최대 길이. */
const MAX_ID_LEN = 64;
/** name 최대 길이. */
export const MAX_NAME_LEN = 80;
/** description 최대 길이. */
export const MAX_DESC_LEN = 500;

/** 커스텀 에이전트 직렬화형. */
export interface CustomAgent {
  /** URL-safe 고유 식별자 (영문소문자·숫자·하이픈). */
  id: string;
  /** 표시 이름 (자유형식, 최대 80자). */
  name: string;
  /** 한 줄 설명 (최대 500자). */
  description: string;
  /**
   * 시스템 인스트럭션 id (instructionStore 참조).
   * "default" 면 기본 프롬프트.
   */
  instructionId: string;
  /** 활성화할 서브에이전트 name 목록 (dedup, 등록목록 대조). */
  subagentNames: string[];
  /** 활성화할 스킬 name 목록 (dedup, 등록목록 대조). */
  skillNames: string[];
  /** ISO 8601 생성 시각. */
  createdAt: string;
}

/** createCustomAgent 입력. */
export interface CustomAgentInput {
  name: string;
  description: string;
  instructionId: string;
  subagentNames: string[];
  skillNames: string[];
}

interface AgentGlobal {
  custom?: CustomAgent[];
}
const g = globalThis as unknown as { __harnessCustomAgents?: AgentGlobal };

function getGlobal(): AgentGlobal {
  if (!g.__harnessCustomAgents) g.__harnessCustomAgents = {};
  return g.__harnessCustomAgents;
}

/** 내부 id 발급 — timestamp + 4바이트 hex (충돌 극히 낮음, URL-safe). */
function generateId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `agent-${ts}-${rnd}`;
}

/** id 형식 검증 (AI-5 — path traversal 차단). */
function isValidId(id: unknown): boolean {
  if (typeof id !== "string" || id.length > MAX_ID_LEN) return false;
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(id) || id === "";
}

/** 손상·미존재에 강한 단일 항목 검증(로드 시 필터링용). */
function isValidEntry(v: unknown): v is CustomAgent {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    o.name.length > 0 &&
    typeof o.description === "string" &&
    typeof o.instructionId === "string" &&
    Array.isArray(o.subagentNames) &&
    Array.isArray(o.skillNames) &&
    typeof o.createdAt === "string"
  );
}

/** JSON 에서 1회 lazy 로드. */
function ensureLoaded(): void {
  if (getGlobal().custom !== undefined) return;
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        getGlobal().custom = parsed.filter(isValidEntry);
        return;
      }
    }
  } catch {
    // 손상 JSON graceful 무시.
  }
  getGlobal().custom = [];
}

/** 캐시 + JSON 파일에 함께 기록. */
function persist(list: CustomAgent[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(list, null, 2), "utf-8");
  getGlobal().custom = list;
}

/** 현재 등록된 모든 서브에이전트 name 집합 (내장 + 커스텀). */
function registeredSubagentNames(): Set<string> {
  const builtin = HARNESS_SUBAGENTS.map((s) => s.name);
  const custom = listCustomSubagents().map((s) => s.name);
  return new Set([...builtin, ...custom]);
}

/** 현재 등록된 모든 스킬 name 집합. */
function registeredSkillNames(): Set<string> {
  return new Set(listSkills().map((s) => s.name));
}

/** 커스텀 에이전트 목록. */
export function listCustomAgents(): CustomAgent[] {
  ensureLoaded();
  return [...getGlobal().custom!];
}

/** id로 단건 조회. 미존재면 undefined. */
export function getCustomAgent(id: string): CustomAgent | undefined {
  ensureLoaded();
  return getGlobal().custom!.find((a) => a.id === id);
}

/**
 * 커스텀 에이전트 생성.
 *
 * - name: 비어있으면 throw, 최대 MAX_NAME_LEN
 * - subagentNames/skillNames: 등록목록 대조 후 dedup
 */
export function createCustomAgent(input: CustomAgentInput): CustomAgent {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("에이전트 이름을 입력해 주세요.");
  if (name.length > MAX_NAME_LEN) {
    throw new Error(`이름이 너무 깁니다(최대 ${MAX_NAME_LEN}자).`);
  }

  const description = (input.description ?? "").slice(0, MAX_DESC_LEN);
  const instructionId = (input.instructionId ?? "default").trim() || "default";

  // dedup
  const subagentNames = [...new Set(input.subagentNames ?? [])];
  const skillNames = [...new Set(input.skillNames ?? [])];

  // 등록목록 대조 (AI-4)
  const validSubs = registeredSubagentNames();
  for (const sn of subagentNames) {
    if (!validSubs.has(sn)) {
      throw new Error(`서브에이전트 '${sn}'는 등록되지 않은 이름입니다.`);
    }
  }
  const validSkills = registeredSkillNames();
  for (const sk of skillNames) {
    if (!validSkills.has(sk)) {
      throw new Error(`스킬 '${sk}'는 등록되지 않은 이름입니다.`);
    }
  }

  ensureLoaded();
  const agent: CustomAgent = {
    id: generateId(),
    name,
    description,
    instructionId,
    subagentNames,
    skillNames,
    createdAt: new Date().toISOString(),
  };
  const list = [...getGlobal().custom!, agent];
  persist(list);
  return agent;
}

/**
 * 커스텀 에이전트 삭제. 미존재 id 는 조용히 통과(idempotent).
 * 빈 문자열·null 도 에러 없이 무시.
 */
export function deleteCustomAgent(id: string): void {
  if (!id || typeof id !== "string") return;
  ensureLoaded();
  const next = getGlobal().custom!.filter((a) => a.id !== id);
  persist(next);
}

/** getCustomAgent 의 selection·instructionId 매핑 (resolveCustomAgentSelection 용). */
export function resolveAgentComposition(id: string): {
  subagentNames: string[] | null;
  skillNames: string[] | null;
  instructionId: string;
} | null {
  const agent = getCustomAgent(id);
  if (!agent) return null;
  return {
    subagentNames: agent.subagentNames.length > 0 ? agent.subagentNames : null,
    skillNames: agent.skillNames.length > 0 ? agent.skillNames : null,
    instructionId: agent.instructionId,
  };
}

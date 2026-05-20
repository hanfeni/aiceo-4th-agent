/**
 * 커스텀 서브에이전트 CRUD 스토어 (/harness 관리 메뉴 백엔드).
 *
 * 코드 모듈(webSearcher.ts)인 내장 서브에이전트와 달리, 사용자가 UI 에서
 * 만든 서브에이전트는 코드 생성 없이 **선언형 정의**({name, description,
 * systemPrompt})로 .data/subagents.json 에 영속한다(sqllab/dynamicDomains
 * 의 globalThis 캐시 + .data/ JSON 패턴 동형). deepagents 가 받는
 * subagents[] 슬롯에는 메인 작업자(buildHarnessConfig/buildAgentOptions)가
 * HARNESS_SUBAGENTS 와 listCustomSubagents() 를 합성해 주입한다 — 이 파일은
 * store + 검증만 담당한다(충돌 방지).
 *
 * tools 는 의도적으로 받지 않는다 — 선언형 JSON 으로는 실제 StructuredTool
 * 인스턴스를 직렬화할 수 없고, 임의 도구 부여는 보안 위험. 커스텀
 * 서브에이전트는 메인 defaultTools 를 상속한다(SubagentSpec.tools 미지정).
 *
 * 보안:
 *  - name 은 안전한 slug(영문 소문자/숫자/하이픈)만 → 식별자 위조 차단.
 *  - 내장 서브에이전트(web-searcher)와 동명 등록 거부(레지스트리 충돌 방지).
 *  - description/systemPrompt 길이 상한으로 프롬프트 폭주 방어.
 *
 * R6(globalThis 싱글톤): dev HMR 시 캐시 재생성 방지. 캐시 미스 시 JSON
 * 에서 lazy 복원(dynamicDomains.ensureLoaded 동형).
 * R7 — fs 의존이라 이 모듈을 import 하는 라우트는 runtime=nodejs.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { SubagentSpec } from "@/types";

const DATA_DIR = join(process.cwd(), ".data");
const STORE_FILE = join(DATA_DIR, "subagents.json");

/** 내장 서브에이전트 slug(동명 커스텀 등록 거부 — HARNESS_SUBAGENTS 정합). */
const RESERVED_NAMES = new Set<string>(["web-searcher"]);

/** 안전한 slug — 영문 소문자/숫자/하이픈. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** description 최대 길이(문자). */
export const MAX_SUBAGENT_DESC_LEN = 2_000;
/** systemPrompt 최대 길이(문자) — 프롬프트 폭주 방어. */
export const MAX_SUBAGENT_PROMPT_LEN = 20_000;

/** 커스텀 서브에이전트(영속 직렬화형 — tools 없음). */
export interface CustomSubagent {
  name: string;
  description: string;
  systemPrompt: string;
}

interface SubagentGlobal {
  /** undefined = 아직 JSON 미로드. 배열 = 로드 완료. */
  custom?: CustomSubagent[];
}
const g = globalThis as unknown as { __harnessSubagents?: SubagentGlobal };
g.__harnessSubagents ??= {};

/** slug 유효성 검증 — 실패 시 throw. */
function assertValidSlug(name: string): void {
  if (typeof name !== "string" || !SLUG_RE.test(name)) {
    throw new Error(
      "서브에이전트 이름은 영문 소문자·숫자·하이픈만(2~64자) 사용할 수 있습니다.",
    );
  }
  if (RESERVED_NAMES.has(name)) {
    throw new Error(`'${name}' 은(는) 내장 서브에이전트 이름이라 사용할 수 없습니다.`);
  }
}

/** 손상·미존재에 강한 단일 항목 검증(로드 시 필터링용). */
function isValidEntry(v: unknown): v is CustomSubagent {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    SLUG_RE.test(o.name) &&
    !RESERVED_NAMES.has(o.name) &&
    typeof o.description === "string" &&
    typeof o.systemPrompt === "string"
  );
}

/** JSON 에서 1회 lazy 로드(없으면 빈 배열 캐시 — dynamicDomains 동형). */
function ensureLoaded(): void {
  if (g.__harnessSubagents!.custom !== undefined) return;
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        g.__harnessSubagents!.custom = parsed.filter(isValidEntry);
        return;
      }
    }
  } catch {
    // 손상된 JSON 은 무시(빈 목록 취급 — graceful).
  }
  g.__harnessSubagents!.custom = [];
}

/** 캐시 + JSON 파일에 함께 기록. */
function persist(list: CustomSubagent[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(list, null, 2), "utf-8");
  g.__harnessSubagents!.custom = list;
}

/**
 * 등록된 커스텀 서브에이전트 목록(미등록이면 빈 배열).
 * 메인 작업자가 SubagentSpec[] 합성에 쓸 수 있도록 형태가 호환된다
 * (CustomSubagent ⊂ SubagentSpec — tools 옵션만 미지정).
 */
export function listCustomSubagents(): CustomSubagent[] {
  ensureLoaded();
  // 방어 복사(호출자가 캐시 배열을 직접 변형하지 못하게).
  return [...g.__harnessSubagents!.custom!];
}

/**
 * 메인 합성 편의용 — SubagentSpec[] 로 그대로 캐스팅해 반환한다.
 * (CustomSubagent 는 tools 없이 SubagentSpec 과 구조 호환.)
 */
export function listCustomSubagentSpecs(): SubagentSpec[] {
  return listCustomSubagents();
}

/** upsert 입력. */
export interface SubagentUpsertInput {
  name: string;
  description: string;
  systemPrompt: string;
}

/**
 * 커스텀 서브에이전트 생성/갱신. slug·예약어 검증 + 길이 상한.
 * 같은 name 이 있으면 덮어쓰고, 없으면 추가한다.
 */
export function upsertCustomSubagent(
  input: SubagentUpsertInput,
): CustomSubagent {
  assertValidSlug(input.name);
  const description = (input.description ?? "").toString();
  const systemPrompt = (input.systemPrompt ?? "").toString();
  if (description.length > MAX_SUBAGENT_DESC_LEN) {
    throw new Error(`설명이 너무 깁니다(최대 ${MAX_SUBAGENT_DESC_LEN}자).`);
  }
  if (!systemPrompt.trim()) {
    throw new Error("systemPrompt 는 비어 있을 수 없습니다.");
  }
  if (systemPrompt.length > MAX_SUBAGENT_PROMPT_LEN) {
    throw new Error(
      `systemPrompt 가 너무 깁니다(최대 ${MAX_SUBAGENT_PROMPT_LEN}자).`,
    );
  }

  ensureLoaded();
  const entry: CustomSubagent = { name: input.name, description, systemPrompt };
  const list = g.__harnessSubagents!.custom!.filter(
    (s) => s.name !== input.name,
  );
  list.push(entry);
  list.sort((a, b) => a.name.localeCompare(b.name));
  persist(list);
  return entry;
}

/**
 * 커스텀 서브에이전트 삭제. 미존재 name 은 조용히 통과(idempotent).
 * 내장 서브에이전트 이름은 store 에 존재할 수 없으므로 별도 보호 불필요.
 */
export function deleteCustomSubagent(name: string): void {
  assertValidSlug(name);
  ensureLoaded();
  const next = g.__harnessSubagents!.custom!.filter((s) => s.name !== name);
  persist(next);
}

/**
 * 시스템 인스트럭션 레지스트리 — 복수 인스트럭션 관리(내장 + 사용자 정의).
 *
 * 단일 SYSTEM_PROMPT 상수 하나만 쓰던 구조를 "여러 개 만들고 골라 쓰는"
 * 구조로 확장한다. 내장(builtin) 인스트럭션 1개("default" = 기존
 * SYSTEM_PROMPT)는 항상 존재하며 삭제할 수 없다. 사용자 정의 인스트럭션은
 * .data/instructions.json 에 영속되어 서버 재시작 후에도 복원된다.
 *
 * 영속·캐시 패턴은 sqllab/dynamicDomains.ts 를 그대로 본떴다:
 *  - R6(globalThis 싱글톤): dev HMR 시 메모리 캐시 재생성 방지. 캐시 미스
 *    시 .data/instructions.json 에서 lazy 복원.
 *  - 영속 파일 깨짐은 graceful 무시(빈 사용자 목록 취급).
 *
 * 보안: 내장 인스트럭션은 삭제 거부. 식별자(id)는 안전한 슬러그로만 생성
 * (사용자 입력이 파일 경로 등 식별자에 끼지 않음 — 단일 JSON 파일에 한정).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_PROMPT } from "./systemPrompt";

const DATA_DIR = join(process.cwd(), ".data");
const STORE_FILE = join(DATA_DIR, "instructions.json");

/** 내장 default 인스트럭션 id(삭제 불가, 미지정 시 fallback). */
export const DEFAULT_INSTRUCTION_ID = "default";

/** 입력 길이 상한(라우트의 zod 검증과 동일 사상으로 여기서도 방어). */
export const MAX_LABEL_LEN = 100;
export const MAX_BODY_LEN = 20000;

/** 인스트럭션 1개. builtin 은 삭제 불가하며 사용자 정의는 false/undefined. */
export interface Instruction {
  id: string;
  label: string;
  body: string;
  builtin?: boolean;
}

/** 사용자 정의 인스트럭션 영속 직렬화형(builtin 은 코드 상수라 저장 안 함). */
type StoredInstruction = Pick<Instruction, "id" | "label" | "body">;

interface InstructionsGlobal {
  /** undefined = 아직 미로드, 배열 = 로드 완료된 사용자 정의 목록. */
  custom?: StoredInstruction[];
}
const g = globalThis as unknown as { __agentInstructions?: InstructionsGlobal };
g.__agentInstructions ??= {};

/** 내장 인스트럭션(코드 상수 — 항상 존재, 삭제 불가). */
function builtinInstruction(): Instruction {
  return {
    id: DEFAULT_INSTRUCTION_ID,
    label: "기본 (내장)",
    body: SYSTEM_PROMPT,
    builtin: true,
  };
}

/** .data/instructions.json 에서 1회 lazy 로드(없으면 빈 배열 캐시). */
function ensureLoaded(): void {
  if (g.__agentInstructions!.custom !== undefined) return;
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        // 형태가 맞는 항목만 받아들임(깨진 항목은 graceful drop).
        g.__agentInstructions!.custom = parsed.filter(
          (x): x is StoredInstruction =>
            !!x &&
            typeof (x as StoredInstruction).id === "string" &&
            typeof (x as StoredInstruction).label === "string" &&
            typeof (x as StoredInstruction).body === "string" &&
            (x as StoredInstruction).id !== DEFAULT_INSTRUCTION_ID,
        );
        return;
      }
    }
  } catch {
    // 손상된 파일은 무시(사용자 정의 없음 취급 — graceful).
  }
  g.__agentInstructions!.custom = [];
}

/** 현재 사용자 정의 목록(캐시). */
function getCustom(): StoredInstruction[] {
  ensureLoaded();
  return g.__agentInstructions!.custom!;
}

/** 캐시 + 파일을 함께 갱신(재시작 후 복원되게). */
function persist(list: StoredInstruction[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(list, null, 2), "utf-8");
  g.__agentInstructions!.custom = list;
}

/** label 에서 안전한 slug id 를 만든다(사용자 입력이 식별자에 직접 안 끼게). */
function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "instruction";
}

/** custom 목록에서 고유한 id 생성(slug 충돌 시 -n 접미). */
function uniqueId(label: string, taken: Set<string>): string {
  const base = slugify(label);
  if (base !== DEFAULT_INSTRUCTION_ID && !taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`) || `${base}-${n}` === DEFAULT_INSTRUCTION_ID) {
    n += 1;
  }
  return `${base}-${n}`;
}

/** 내장 + 사용자 정의 전체 목록(내장이 항상 맨 앞). */
export function listInstructions(): Instruction[] {
  const custom = getCustom().map((c) => ({ ...c, builtin: false }));
  return [builtinInstruction(), ...custom];
}

/** id 로 단건 조회. 없으면(또는 미지정) 내장 default 를 반환한다. */
export function getInstruction(id?: string): Instruction {
  if (!id || id === DEFAULT_INSTRUCTION_ID) return builtinInstruction();
  const found = getCustom().find((c) => c.id === id);
  if (!found) return builtinInstruction();
  return { ...found, builtin: false };
}

/**
 * 사용자 정의 인스트럭션 생성/수정. id 가 없으면 label 기반 slug 로 신규
 * 생성, 있으면 해당 항목을 갱신한다. 내장 default 는 수정 거부.
 * label/body 는 상한으로 잘라 방어(라우트 zod 와 이중 가드).
 */
export function upsertInstruction(input: {
  id?: string;
  label: string;
  body: string;
}): Instruction {
  const label = input.label.trim().slice(0, MAX_LABEL_LEN) || "이름 없는 인스트럭션";
  const body = input.body.slice(0, MAX_BODY_LEN);

  if (input.id === DEFAULT_INSTRUCTION_ID) {
    throw new Error("내장 기본 인스트럭션은 수정할 수 없습니다.");
  }

  const list = [...getCustom()];

  // 수정: 기존 id 가 사용자 정의 목록에 있으면 갱신.
  if (input.id) {
    const idx = list.findIndex((c) => c.id === input.id);
    if (idx >= 0) {
      const updated: StoredInstruction = { id: input.id, label, body };
      list[idx] = updated;
      persist(list);
      return { ...updated, builtin: false };
    }
    // id 가 지정됐지만 미존재 → 그 id 로 신규 생성(default 제외 보장).
    if (input.id !== DEFAULT_INSTRUCTION_ID) {
      const created: StoredInstruction = { id: input.id, label, body };
      list.push(created);
      persist(list);
      return { ...created, builtin: false };
    }
  }

  // 신규: 고유 slug id 생성.
  const taken = new Set(list.map((c) => c.id));
  const id = uniqueId(label, taken);
  const created: StoredInstruction = { id, label, body };
  list.push(created);
  persist(list);
  return { ...created, builtin: false };
}

/** 사용자 정의 인스트럭션 삭제. 내장(builtin)·미존재는 거부(throw). */
export function deleteInstruction(id: string): void {
  if (id === DEFAULT_INSTRUCTION_ID) {
    throw new Error("내장 기본 인스트럭션은 삭제할 수 없습니다.");
  }
  const list = getCustom();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) {
    throw new Error("해당 인스트럭션을 찾을 수 없습니다.");
  }
  persist(next);
}

/**
 * id 로 인스트럭션 본문(body)을 반환한다. 미지정·미존재면 내장 default
 * body. agent.ts 가 createDeepAgent({ systemPrompt }) 주입에 사용한다.
 */
export function getSystemPromptBody(id?: string): string {
  return getInstruction(id).body;
}

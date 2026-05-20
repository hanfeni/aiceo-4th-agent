/**
 * 스킬 파일 CRUD 스토어 (/harness 관리 메뉴 백엔드).
 *
 * 스킬 1개 = skills/<name>/SKILL.md 파일. frontmatter(name/description) +
 * 본문. skills/index.ts 의 FilesystemBackend(rootDir=<repo>/skills) 와 동일한
 * 디스크 레이아웃을 직접 fs 로 읽고 쓴다(SKILL_SOURCES 배열은 별도 작업자가
 * 합성하므로 이 파일은 디렉토리 스캔만 한다 — 충돌 방지).
 *
 * 보안:
 *  - name 은 안전한 slug(영문/숫자/하이픈)만 허용 → path traversal 차단.
 *    ".." / "/" / "~" 등은 SLUG_RE 에서 전부 거부된다.
 *  - description/body 길이 상한(MAX_SKILL_DESC_LEN / MAX_SKILL_BODY_LEN)으로
 *    디스크·프롬프트 폭주 방어.
 *  - 내장 스킬(deep-web-research)은 삭제 거부(BUILTIN_SKILLS).
 *
 * R7 — fs 네이티브 의존이라 이 모듈을 import 하는 라우트는 runtime=nodejs.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

/** 레포 내 skills/ 디렉토리 절대경로 (skills/index.ts SKILLS_ROOT 와 동일). */
const SKILLS_ROOT = join(process.cwd(), "skills");

/** 삭제 보호 대상 내장 스킬(slug). */
const BUILTIN_SKILLS = new Set<string>(["deep-web-research"]);

/** 안전한 slug — 영문 소문자/숫자/하이픈. path traversal 원천 차단. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** description 최대 길이(문자) — frontmatter 한 줄 폭주 방어. */
export const MAX_SKILL_DESC_LEN = 2_000;
/** SKILL.md 본문 최대 길이(문자) — 디스크·프롬프트 폭주 방어. */
export const MAX_SKILL_BODY_LEN = 100_000;

/** 스킬 목록 항목(직렬화형). */
export interface SkillEntry {
  /** slug = 디렉토리명. */
  name: string;
  /** frontmatter description(없으면 빈 문자열). */
  description: string;
  /** frontmatter 를 제외한 본문. */
  body: string;
  /** SKILL.md 상대경로(표시·추적용 — skills/<name>/SKILL.md). */
  sourcePath: string;
  /** 내장 스킬 여부(UI 가 삭제 버튼을 비활성화하도록). */
  builtin: boolean;
}

/** upsert 입력. */
export interface SkillUpsertInput {
  name: string;
  description: string;
  body: string;
}

/** slug 유효성 검증 — 실패 시 throw. */
function assertValidSlug(name: string): void {
  if (typeof name !== "string" || !SLUG_RE.test(name)) {
    throw new Error(
      "스킬 이름은 영문 소문자·숫자·하이픈만(2~64자) 사용할 수 있습니다.",
    );
  }
}

/** SKILL.md 절대경로. slug 검증을 전제로 한다(호출 전 assertValidSlug). */
function skillFilePath(name: string): string {
  return join(SKILLS_ROOT, name, "SKILL.md");
}

/**
 * frontmatter(--- ... ---) 를 파싱해 description 과 본문을 분리한다.
 * 단순 라인 파서(YAML 의존 회피) — name/description 키만 본다.
 */
function parseSkillMarkdown(raw: string): {
  description: string;
  body: string;
} {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    // frontmatter 없으면 전체를 본문으로 취급(graceful).
    return { description: "", body: raw };
  }
  const [, fmBlock, body] = fmMatch;
  let description = "";
  for (const line of fmBlock.split(/\r?\n/)) {
    const m = line.match(/^description:\s*(.*)$/);
    if (m) {
      description = m[1].trim();
      break;
    }
  }
  return { description, body: body.replace(/^\r?\n/, "") };
}

/**
 * SKILL.md 직렬화 — frontmatter(name/description) + 본문.
 * description 의 콜론·줄바꿈을 안전하게 다루기 위해 큰따옴표로 감싸고
 * 내부 따옴표를 이스케이프한다(단순 YAML 스칼라).
 */
function serializeSkillMarkdown(input: SkillUpsertInput): string {
  const safeDesc = input.description.replace(/\r?\n/g, " ").replace(/"/g, '\\"');
  const body = input.body.replace(/^\r?\n+/, "");
  return `---\nname: ${input.name}\ndescription: "${safeDesc}"\n---\n\n${body}\n`;
}

/**
 * skills/ 디렉토리를 스캔해 모든 스킬을 반환한다(디렉토리 부재 시 빈 배열).
 * SKILL.md 가 없는 디렉토리는 건너뛴다.
 */
export function listSkills(): SkillEntry[] {
  if (!existsSync(SKILLS_ROOT)) return [];
  let dirents: string[];
  try {
    dirents = readdirSync(SKILLS_ROOT);
  } catch {
    return [];
  }
  const out: SkillEntry[] = [];
  for (const name of dirents) {
    // slug 형식이 아닌 디렉토리·파일은 무시(보안 — 비정상 항목 노출 방지).
    if (!SLUG_RE.test(name)) continue;
    const file = skillFilePath(name);
    try {
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      const raw = readFileSync(file, "utf-8");
      const { description, body } = parseSkillMarkdown(raw);
      out.push({
        name,
        description,
        body,
        sourcePath: `skills/${name}/SKILL.md`,
        builtin: BUILTIN_SKILLS.has(name),
      });
    } catch {
      // 개별 항목 읽기 실패는 무시(다른 스킬 목록은 계속 제공 — graceful).
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** 단일 스킬 SKILL.md 전문(원본 markdown). 미존재 시 null. */
export function readSkill(name: string): string | null {
  assertValidSlug(name);
  const file = skillFilePath(name);
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

/**
 * 스킬 생성/갱신 — skills/<name>/SKILL.md 작성. slug 검증 + 길이 상한.
 * 디렉토리는 recursive 로 생성한다. 내장 스킬도 본문 수정은 허용한다
 * (삭제만 보호 — 강사가 내장 스킬을 다듬을 수 있어야 함).
 */
export function upsertSkill(input: SkillUpsertInput): SkillEntry {
  assertValidSlug(input.name);
  const description = (input.description ?? "").toString();
  const body = (input.body ?? "").toString();
  if (description.length > MAX_SKILL_DESC_LEN) {
    throw new Error(
      `설명이 너무 깁니다(최대 ${MAX_SKILL_DESC_LEN}자).`,
    );
  }
  if (body.length > MAX_SKILL_BODY_LEN) {
    throw new Error(`본문이 너무 깁니다(최대 ${MAX_SKILL_BODY_LEN}자).`);
  }

  const dir = join(SKILLS_ROOT, input.name);
  mkdirSync(dir, { recursive: true });
  const md = serializeSkillMarkdown({ name: input.name, description, body });
  writeFileSync(skillFilePath(input.name), md, "utf-8");

  return {
    name: input.name,
    description,
    body,
    sourcePath: `skills/${input.name}/SKILL.md`,
    builtin: BUILTIN_SKILLS.has(input.name),
  };
}

/**
 * 스킬 삭제 — skills/<name>/ 디렉토리 제거. 내장 스킬은 거부(throw).
 * 미존재 디렉토리는 조용히 통과(idempotent).
 */
export function deleteSkill(name: string): void {
  assertValidSlug(name);
  if (BUILTIN_SKILLS.has(name)) {
    throw new Error("내장 스킬은 삭제할 수 없습니다.");
  }
  const dir = join(SKILLS_ROOT, name);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 삭제 실패는 무시(이미 없거나 권한 — 호출자 관점에선 결과 동일).
  }
}

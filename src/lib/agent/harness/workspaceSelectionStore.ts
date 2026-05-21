/**
 * 워크스페이스(에이전트 A/B/C)별 스킬·서브에이전트 선택 영속 스토어.
 *
 * 워크스페이스 패널에서 사용자가 어떤 스킬·서브에이전트를 켤지 멀티선택한
 * 결과를 .data/workspace-selections.json 에 프로필별로 영속한다(subagentStore /
 * skillStore 와 동일한 globalThis 캐시 + .data/ JSON 패턴).
 *
 * 의미론(사용자 결정 2026-05-21):
 *  - 저장값 null = "전체 선택"(기본값). 새 워크스페이스나 미저장 프로필은
 *    모든 스킬·서브에이전트가 켜진 상태로 시작(기존 동작과 동일 — 회귀 0).
 *  - 배열 = 그 name 들만 활성(나머지 제외). 빈 배열 = 전부 끔.
 *
 * 식별자: 스킬 = 디렉토리 slug(skillStore listSkills().name), 서브에이전트 =
 *  name(HARNESS_SUBAGENTS + 커스텀). 둘 다 안전 slug 라 위조 위험 낮음.
 *
 * 필터 적용은 buildHarnessConfig(registry.ts)에서만(R2 단일 지점). 이 파일은
 * store + 검증만 담당한다. 선택은 "차단"이 아니라 사용자가 런타임에 바꾸는
 * 값이므로 instructionId/harnessOverrides 와 동급(요청에 실려 그래프 캐시 키).
 *
 * R6(globalThis 싱글톤): dev HMR 캐시 재생성 방지. R7: fs 의존 → import 하는
 * 라우트는 runtime=nodejs.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_IDS, isWorkspaceId, type WorkspaceId } from "./profiles";

const DATA_DIR = join(process.cwd(), ".data");
const STORE_FILE = join(DATA_DIR, "workspace-selections.json");

/** 안전한 slug — 영문 소문자/숫자/하이픈(skill·subagent 식별자 공통). */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** 워크스페이스 1개의 선택 상태. null = 전체 선택(기본). */
export interface WorkspaceSelection {
  /** 활성 스킬 slug 목록. null = 전체. */
  skills: string[] | null;
  /** 활성 서브에이전트 name 목록. null = 전체. */
  subagents: string[] | null;
}

type SelectionMap = Partial<Record<WorkspaceId, WorkspaceSelection>>;

interface SelectionGlobal {
  /** undefined = 아직 JSON 미로드. 객체 = 로드 완료. */
  map?: SelectionMap;
}
const g = globalThis as unknown as {
  __harnessWorkspaceSelections?: SelectionGlobal;
};
g.__harnessWorkspaceSelections ??= {};

/** null(전체) 또는 안전 slug 배열만 통과시키는 정규화(손상·위조 방어). */
function sanitizeList(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const out = v.filter(
    (s): s is string => typeof s === "string" && SLUG_RE.test(s),
  );
  // 중복 제거(안정적 순서 보존).
  return [...new Set(out)];
}

/** 단일 선택 항목 정규화. */
function sanitizeSelection(v: unknown): WorkspaceSelection {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<
    string,
    unknown
  >;
  return { skills: sanitizeList(o.skills), subagents: sanitizeList(o.subagents) };
}

/** JSON 에서 1회 lazy 로드(없으면 빈 맵 캐시 — subagentStore 동형). */
function ensureLoaded(): void {
  if (g.__harnessWorkspaceSelections!.map !== undefined) return;
  const map: SelectionMap = {};
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        for (const id of WORKSPACE_IDS) {
          if (id in (parsed as Record<string, unknown>)) {
            map[id] = sanitizeSelection((parsed as Record<string, unknown>)[id]);
          }
        }
      }
    }
  } catch {
    // 손상된 JSON 은 무시(빈 맵 = 전체 선택 폴백 — graceful).
  }
  g.__harnessWorkspaceSelections!.map = map;
}

/** 캐시 + JSON 파일에 함께 기록. */
function persist(map: SelectionMap): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(map, null, 2), "utf-8");
  g.__harnessWorkspaceSelections!.map = map;
}

/**
 * 프로필의 선택 상태를 조회한다. 미저장이면 {skills:null, subagents:null}
 * (= 전체 선택, 기본값). 잘못된 id 면 동일 기본값.
 */
export function getWorkspaceSelection(id: string): WorkspaceSelection {
  if (!isWorkspaceId(id)) return { skills: null, subagents: null };
  ensureLoaded();
  return (
    g.__harnessWorkspaceSelections!.map![id] ?? {
      skills: null,
      subagents: null,
    }
  );
}

/**
 * 프로필의 선택 상태를 저장한다. skills/subagents 각각 null=전체, 배열=선택.
 * 정규화(안전 slug·중복 제거) 후 영속. 잘못된 id 면 throw.
 */
export function setWorkspaceSelection(
  id: string,
  selection: { skills?: unknown; subagents?: unknown },
): WorkspaceSelection {
  if (!isWorkspaceId(id)) {
    throw new Error(`알 수 없는 워크스페이스 id: ${id}`);
  }
  ensureLoaded();
  const next = sanitizeSelection(selection);
  const map: SelectionMap = { ...g.__harnessWorkspaceSelections!.map, [id]: next };
  persist(map);
  return next;
}

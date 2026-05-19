import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import type { HarnessConfig } from "@/types";
import { parseToggle } from "@/lib/agent/harness/registry";
import { HARNESS_SUBAGENTS } from "@/lib/agent/harness/subagents";
import {
  HARNESS_TOOLS,
  HARNESS_TOOL_DISPLAY_NAMES,
} from "@/lib/agent/harness/tools";
import { SKILL_SOURCES } from "@/lib/agent/harness/skills";
import { getSystemPrompt } from "@/lib/agent/prompts/systemPrompt";
import {
  toHarnessView,
  parseSkillDetail,
  type SkillDetail,
} from "@/lib/harness-introspect/view";
import { HarnessView } from "./HarnessView";

/**
 * /harness 페이지 (Server Component) — 현재 챗에 설정된 하네스 요소
 * (SKILL / AGENT / 도구 / 시스템 인스트럭션 / 토글)를 사용자가 직접
 * 확인하는 화면.
 *
 * 설계 (Plan Critic C1·C2 / chat/page.tsx 선례):
 *  - buildHarnessConfig 를 **호출하지 않는다**. 호출 시 createCheckpointer
 *    (globalThis Map 변이) + createSkillsBackend(FilesystemBackend 즉시
 *    생성) side-effect 발생, checkpointer Proxy 직렬화 시 SQLite 파일
 *    생성(AD-2 위반). 대신:
 *      · 토글: process.env + parseToggle(registry 와 동일 순수 파서)
 *      · subagents/tools/skills sources: 정적 export 직접 import
 *        (HARNESS_SUBAGENTS/HARNESS_TOOLS/SKILL_SOURCES — 그래프 비주입
 *        정적 배열 → 항목 추가 시 introspect 가 자동 순회·표시, FR-08)
 *      · 도구 한글명: HARNESS_TOOL_DISPLAY_NAMES(등록 지점 export) —
 *        page 하드코딩 제거, 새 도구 추가 시 tools/index.ts 1줄만
 *      · 스킬 상세: SKILL.md 를 읽어 parseSkillDetail(상세 노출 — 사용자
 *        요구). 경로는 SKILL_SOURCES 상수에서만(요청 입력 비유입 —
 *        path traversal 0, AD-5b). 읽기 실패는 graceful(null→빈 상세).
 *      · checkpointer/backend 는 조립하지 않는다(null). toHarnessView 가
 *        이 필드를 읽지 않으므로(타입 레벨 배제) 무해.
 *  - server 에서 조립 → 직렬화 안전 HarnessView 만 client props 로 전달.
 *
 * C2 안전: SKILL.md 파일 읽기는 idempotent read(SQLite 생성 같은 부작용
 * 0 — checkpointer Proxy touch 와 본질적으로 다름). 경로 상수 한정.
 * 보안: process.env 는 토글 문자열만(HARNESS_* — 키 아님). systemPrompt
 * 정적 상수(process.env 미참조). API 키 누출 경로 0.
 */

// registry 의 resolveSkillSources (a)정책 미러: skills+filesystem 둘 다
// 켜져야 sources. registry PLACEHOLDER 정책 변경 시 동기화 필요(주석).
function resolveSkillSourcesForView(
  skillsOn: boolean,
  filesystemOn: boolean,
): string[] {
  if (!skillsOn || !filesystemOn) return [];
  return [...SKILL_SOURCES];
}

// skills/index.ts SKILLS_ROOT 와 동일 규칙(레포 skills/ 디렉토리).
const SKILLS_ROOT = path.join(process.cwd(), "skills");

/**
 * SKILL_SOURCES 경로(/deep-web-research/) → SKILL.md 읽어 상세 파싱.
 * source 는 상수 배열에서만 오므로 path traversal 0. 읽기 실패는
 * parseSkillDetail(source, null) 로 graceful(빈 상세 — 크래시 0).
 */
function readSkillDetails(sources: string[]): SkillDetail[] {
  return sources.map((source) => {
    // "/deep-web-research/" → skills/deep-web-research/SKILL.md
    const rel = source.replace(/^\/+|\/+$/g, "");
    const file = path.join(SKILLS_ROOT, rel, "SKILL.md");
    let content: string | null = null;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      content = null; // 미존재/권한 → graceful
    }
    return parseSkillDetail(source, content);
  });
}

export default function HarnessPage(): ReactNode {
  const env = process.env;

  const planning = parseToggle(env.HARNESS_PLANNING, true);
  const filesystem = parseToggle(env.HARNESS_FILESYSTEM, true);
  const subagentsOn = parseToggle(env.HARNESS_SUBAGENTS, true);
  const skillsOn = parseToggle(env.HARNESS_SKILLS, true);
  const skillSources = resolveSkillSourcesForView(skillsOn, filesystem);

  // HarnessConfig 형태로 조립하되 checkpointer/backend 는 null(toHarnessView
  // 가 안 읽음 — C2). subagents 는 토글 off 면 [](registry 동작 미러).
  const config: HarnessConfig = {
    planning: { enabled: planning },
    filesystem: { enabled: filesystem },
    subagents: subagentsOn ? HARNESS_SUBAGENTS : [],
    tools: HARNESS_TOOLS,
    checkpointer: null,
    skills: {
      enabled: skillSources.length > 0,
      sources: skillSources,
      backend: null,
    },
  };

  const skillDetails = readSkillDetails(skillSources);

  const view = toHarnessView(
    config,
    getSystemPrompt(),
    HARNESS_TOOL_DISPLAY_NAMES, // 등록 지점 동적 매핑(FR-08 — page 하드코딩 0)
    skillDetails,
  );

  return <HarnessView view={view} />;
}

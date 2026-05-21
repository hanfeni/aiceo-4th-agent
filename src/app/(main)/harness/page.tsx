import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import type { HarnessConfig } from "@/types";
import { parseToggle } from "@/lib/agent/harness/registry";
import { HARNESS_SUBAGENTS } from "@/lib/agent/harness/subagents";
import {
  HARNESS_TOOLS,
  HARNESS_TOOL_DISPLAY_NAMES,
  HARNESS_TOOL_CATALOG,
} from "@/lib/agent/harness/tools";
import { listSkillSources } from "@/lib/agent/harness/skills";
import { listSkills } from "@/lib/agent/harness/skills/skillStore";
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
// 켜져야 sources. registry 정책 변경 시 동기화 필요(주석).
function resolveSkillSourcesForView(
  skillsOn: boolean,
  filesystemOn: boolean,
): string[] {
  if (!skillsOn || !filesystemOn) return [];
  return listSkillSources();
}

// skills/index.ts SKILLS_ROOT 와 동일 규칙(레포 skills/ 디렉토리).
const SKILLS_ROOT = path.join(process.cwd(), "skills");

/**
 * listSkills() 로 스캔한 스킬 목록 → SKILL.md 내용을 읽어 SkillDetail 로 변환.
 * skillStore 가 이미 SKILL.md 를 파싱해 description/body 를 제공하므로
 * parseSkillDetail 에 넘길 content 는 파일 원본(frontmatter 포함)으로 재조립한다.
 * 읽기 실패는 graceful(null → 빈 상세).
 */
function readSkillDetails(): SkillDetail[] {
  const skills = listSkills();
  return skills.map((skill) => {
    const source = `/${skill.name}/`;
    const file = path.join(SKILLS_ROOT, skill.name, "SKILL.md");
    let content: string | null = null;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      content = null;
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
    // 정적 도구(current_time·web_search) + 팩토리 도구 카탈로그
    // (index_search·sql_query·graph_query — 도메인 무관 표시용 메타).
    // 카탈로그는 실행 함수 없는 순수 표시 객체라 그래프 비주입(page 는
    // 어차피 introspect 표시 전용 — buildHarnessConfig 미호출, AD-2).
    tools: [...HARNESS_TOOLS, ...HARNESS_TOOL_CATALOG],
    checkpointer: null,
    skills: {
      enabled: skillSources.length > 0,
      sources: skillSources,
      backend: null,
    },
  };

  const skillDetails = readSkillDetails();

  const view = toHarnessView(
    config,
    getSystemPrompt(),
    HARNESS_TOOL_DISPLAY_NAMES, // 등록 지점 동적 매핑(FR-08 — page 하드코딩 0)
    skillDetails,
  );

  return <HarnessView view={view} />;
}

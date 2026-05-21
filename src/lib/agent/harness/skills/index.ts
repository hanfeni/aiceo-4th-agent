import { FilesystemBackend } from "deepagents";
import path from "node:path";
import { listSkills } from "./skillStore";

/**
 * 하네스 요소: SKILL (deepagents SkillsMiddleware).
 *
 * R2 불변식: skill on/off 결정은 registry.ts(buildHarnessConfig)에서만,
 * deepagents 인자 변환은 buildAgentOptions.ts 에서만. 이 파일은 "skill 소스
 * 경로 + backend 인스턴스"라는 재료만 제공한다(요소 1개 = 파일 1개).
 *
 * 실측(node_modules/deepagents/dist/index.d.ts):
 *  - createDeepAgent({ skills: string[], backend? }) 최상위 옵션.
 *  - backend 기본값 = StateBackend. FilesystemBackend({rootDir}) 를 주면
 *    skills + 모든 파일 도구(read_file/write_file/...)가 그 rootDir 를 본다.
 *  - skills 경로는 backend root 기준 POSIX 절대경로(/foo/). progressive
 *    disclosure: SKILL.md frontmatter(name/description)만 프롬프트에 주입,
 *    본문은 에이전트가 read_file 로 필요 시 읽음.
 *
 * 보안: rootDir 를 프로젝트 루트로 주면 .env.local·소스 전체가 파일 도구에
 * 노출된다. rootDir 를 skills/ 디렉토리로 격리해 노출면을 스킬로만 한정한다.
 * skill 소스 경로는 그 root 기준 상대(/deep-web-research/).
 */

/** 레포 내 skills/ 디렉토리 절대경로 (FilesystemBackend rootDir). */
const SKILLS_ROOT = path.join(process.cwd(), "skills");

/**
 * deepagents SkillsMiddleware 에 넘길 소스 경로 목록.
 *
 * deepagents 의 listSkillsFromBackend 는 sourcePath(예: "/")를 ls 해서
 * 그 안의 서브디렉토리들을 스캔하고 각 서브디렉토리 안의 SKILL.md 를 읽는다.
 * 즉 개별 스킬 경로("/deep-web-research/")가 아니라 스킬들이 모여있는
 * 부모 디렉토리("/")를 넘겨야 모든 스킬이 인식된다.
 *
 * skills/ 디렉토리에 스킬이 하나라도 있으면 ["/"] 를 반환하고, 없으면
 * 빈 배열을 반환해 SkillsMiddleware 를 비활성화한다.
 */
export function listSkillSources(): string[] {
  const skills = listSkills();
  return skills.length > 0 ? ["/"] : [];
}

/**
 * SkillsMiddleware 가 쓸 backend. rootDir 를 skills/ 로 격리한다(보안).
 * virtualMode:true — 들어오는 경로를 rootDir 하위 가상 절대경로로 취급하고
 * 상위 탈출(.. / ~)을 차단한다(실측 d.ts resolvePath 주석).
 */
export function createSkillsBackend(): FilesystemBackend {
  return new FilesystemBackend({ rootDir: SKILLS_ROOT, virtualMode: true });
}

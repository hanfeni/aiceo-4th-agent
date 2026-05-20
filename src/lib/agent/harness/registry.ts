import type { HarnessConfig } from "@/types";
import {
  createCheckpointer,
  type CheckpointerEnv,
} from "./checkpointer";
import { resolveProvider, type ModelEnv } from "./model";
import { HARNESS_TOOLS } from "./tools";
import { makeIndexSearchTool } from "./tools/indexSearchTool";
import type { SearchDomain } from "@/lib/searchlab/domains";
import { makeSqlQueryTool } from "./tools/sqlQueryTool";
import type { SqlDomain } from "@/lib/sqllab/domains";
import { makeGraphQueryTool } from "./tools/graphQueryTool";
import { HARNESS_SUBAGENTS } from "./subagents";
import { SKILL_SOURCES, createSkillsBackend } from "./skills";
import type { HarnessProfile } from "./profiles";

/**
 * 하네스 요소 토글의 단일 지점 (CLAUDE.md R2 / FR-08,11 / AD-2).
 *
 * `buildHarnessConfig(env)` 는 진짜 순수 함수다:
 *  - 파일시스템 side effect 0 — checkpointer 핸들은 lazy(AD-2). 호출만으로는
 *    `./.data/` 디렉토리·SQLite 파일이 생기지 않는다(checkpointer.ts 가 보장).
 *  - LLM 호출 0 — model 인스턴스는 만들지 않고 provider 검증만 수행한다.
 *
 * 따라서 NFR-11/AC-10 의 "순수 함수 단위 테스트" 가 문자 그대로 성립한다.
 * 하네스 요소의 on/off 결정은 전부 여기서만 일어나고, agent.ts/route.ts 에는
 * `if(toggleEnabled)` 분기가 흩뿌려지지 않는다(R2 — 토글 diff 0).
 *
 * 새 요소 추가 절차: 모듈 파일 1개 + 해당 등록 지점(HARNESS_TOOLS/
 * HARNESS_SUBAGENTS) 1줄 + (필요 시) 이 함수의 조립 1줄. 그 외 변경 0.
 */

export type HarnessEnv = ModelEnv &
  CheckpointerEnv & {
    HARNESS_PLANNING?: string;
    HARNESS_FILESYSTEM?: string;
    HARNESS_SUBAGENTS?: string;
    HARNESS_SKILLS?: string;
  };

const FALSY = new Set(["false", "0", "no", "off"]);
const TRUTHY = new Set(["true", "1", "yes", "on"]);

/**
 * 토글 env 값을 일관 규칙으로 boolean 해석한다 (TC-6.8).
 * trim + lowercase 후 false/0/no/off → false, true/1/yes/on → true.
 * 미설정(undefined)·인식 불가 값 → 기본값(defaultValue) 적용.
 *
 * export 사유: /harness introspect 가 토글 표시값을 동일 규칙으로
 * 재계산하려면 이 순수 파서를 재사용해야 한다(규칙 2중화 시 드리프트).
 * 이 함수는 토글 *결정 분기* 가 아니라 순수 파서다 — export 추가는
 * 기존 호출 경로/동작 불변이라 R2(토글 결정은 buildHarnessConfig 한곳)
 * 불변식에 영향 0.
 */
export function parseToggle(
  raw: string | undefined,
  defaultValue: boolean,
): boolean {
  if (raw === undefined) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (FALSY.has(v)) return false;
  if (TRUTHY.has(v)) return true;
  return defaultValue;
}

/**
 * SKILL 요소의 활성 sources 를 결정한다 (요소 간 의존성 해소 규칙).
 *
 * 배경: SKILL 은 progressive disclosure 로 동작한다 — frontmatter
 * (name/description)만 시스템 프롬프트에 주입되고, 에이전트가 실제 본문이
 * 필요할 때 `read_file` 로 SKILL.md 를 읽는다. 그 read_file 도구는
 * filesystem 미들웨어가 제공한다.
 *
 * 따라서 `skills on + filesystem off` 는 모순 상태다: 스킬 이름은
 * 프롬프트에 노출되는데 본문을 읽을 도구가 없어 에이전트가 "스킬이
 * 보이는데 못 연다"는 혼란에 빠진다(FR-09 본문 누출과는 별개 — UX/정합성
 * 문제). 이 의존성을 어떻게 해소할지는 여러 유효한 정책이 있다:
 *
 *   (a) filesystem off 면 skills 도 강제 off  → sources=[]
 *       · 가장 안전·일관. 단 "스킬만 켜고 일반 파일도구는 끄고 싶다"는
 *         요구를 표현 못 함.
 *   (b) skills on 이면 filesystem off 여도 sources 유지(스킬 backend 가
 *       자체 read 제공한다고 가정)  → sources 그대로
 *       · 유연하지만 실측 미확인 가정에 의존(R8 위반 위험).
 *   (c) 경고 로깅 후 (a) 로 폴백  → 무음 폴백 0(AC-4) 정신과 정합.
 *
 * @param skillsToggle  HARNESS_SKILLS 파싱 결과
 * @param filesystemEnabled  filesystem 토글 결과(의존 대상)
 * @returns 활성화할 skill 소스 경로 배열(빈 배열이면 SKILL 비활성)
 *
 * TODO(learning): 위 (a)/(b)/(c) 중 이 프로젝트의 무음 폴백 0(AC-4) ·
 * R2 단일지점 원칙에 가장 맞는 정책을 골라 구현하라. 5~10줄.
 * 기본 골격만 두었다 — 정책을 확정해 교체할 것.
 */
function resolveSkillSources(
  skillsToggle: boolean,
  filesystemEnabled: boolean,
): string[] {
  // PLACEHOLDER — 사용자가 의존성 해소 정책을 구현할 지점.
  // 현재는 가장 보수적인 (a) 골격: 둘 다 켜져야만 sources 반환.
  if (!skillsToggle || !filesystemEnabled) return [];
  return [...SKILL_SOURCES];
}

/**
 * env 를 읽어 하네스 조립 계약(HarnessConfig)을 만든다. 부수효과 없음(AD-2).
 *
 * - planning   : HARNESS_PLANNING (기본 true)
 * - filesystem : HARNESS_FILESYSTEM (기본 true — soft toggle 입력, AD-6-2)
 * - subagents  : HARNESS_SUBAGENTS=false → []  / 그 외 HARNESS_SUBAGENTS
 * - tools      : HARNESS_TOOLS (등록 없으면 빈 배열 — 빈 배열 허용 계약)
 * - checkpointer: createCheckpointer(env) — lazy 핸들(호출만으로 fs 미접촉)
 *
 * provider 검증은 model.ts(resolveProvider)에 위임한다. 잘못된 LLM_PROVIDER
 * 는 여기서 명확한 에러로 표면화되며 무음 폴백하지 않는다(AC-4).
 */
export function buildHarnessConfig(
  env: HarnessEnv,
  // 인덱스 검색 도구 세션 도메인(우측 드롭다운 선택). 미지정이면
  // 도구 미포함 → tools=HARNESS_TOOLS 그대로(기존 챗 100% 불변).
  idxDomain?: SearchDomain,
  // 데이터 조회(SQL) 도구 세션 도메인. idxDomain 과 독립 — 둘 다
  // 선택하면 두 도구 모두 부여. 미지정이면 미포함(회귀 0).
  sqlDomain?: SqlDomain,
  // 워크스페이스 하네스 프로필(메뉴별 차단 레이어). 미지정이면 차단
  // 없음 → 기존 /chat 과 100% 동일 경로(회귀 0). 지정 시 profile.blocked
  // 에 든 요소만 env 토글 결과 위에 강제 off 한다(R2 — 차단 분기는 이
  // 함수 안에만 격리, 하류는 토글 off 와 동일 경로).
  profile?: HarnessProfile,
  // 온톨로지 조회(graph) 도구 세션 데이터셋(챗 그래프 드롭다운).
  // idx/sqlDomain 과 독립 — 지정 시 그 데이터셋 바인딩 graph_query
  // 도구 포함(수업1·3 연결: GRAPH_DATASETS SSOT 가 드롭다운·도구
  // 단일 소스). 미지정=도구 없음(회귀 0). 변경 시 캐시 키 변경=리프레시.
  graphDataset?: string,
): HarnessConfig {
  // 잘못된 provider 를 은폐하지 않는다(무음 폴백 0 — AC-4). LLM 호출 아님.
  resolveProvider(env);

  // 프로필 차단 집합 — 빠른 조회. 미지정이면 빈 집합(차단 0 = 회귀 0).
  const blocked = new Set(profile?.blocked ?? []);

  // env 토글 위에 프로필 차단을 AND 로 합성한다. blocked 에 든 요소는
  // env 가 켜져 있어도 강제 off(메뉴별 필터). env 자체는 미변형 —
  // 다른 경로(/chat·다른 워크스페이스)는 영향 0.
  const subagentsEnabled =
    parseToggle(env.HARNESS_SUBAGENTS, true) && !blocked.has("subagents");
  const filesystemEnabled = parseToggle(env.HARNESS_FILESYSTEM, true);
  const skillsToggle =
    parseToggle(env.HARNESS_SKILLS, true) && !blocked.has("skills");
  const skillSources = resolveSkillSources(skillsToggle, filesystemEnabled);

  return {
    planning: { enabled: parseToggle(env.HARNESS_PLANNING, true) },
    filesystem: { enabled: filesystemEnabled },
    subagents: subagentsEnabled ? HARNESS_SUBAGENTS : [],
    // idx/sql 도메인 있으면 그 도메인 바인딩 도구를 합성(도메인은
    // 세션 정체성 — 변경 시 agent.ts 가 그래프 재빌드). 둘 다
    // 미지정이면 정적 HARNESS_TOOLS 그대로(기존 챗 회귀 0). 둘
    // 독립 — 동시 선택 시 두 도구 모두 부여.
    tools: ((): unknown[] => {
      if (!idxDomain && !sqlDomain && !graphDataset) return HARNESS_TOOLS;
      const t: unknown[] = [...HARNESS_TOOLS];
      if (idxDomain) t.push(makeIndexSearchTool(idxDomain));
      if (sqlDomain) t.push(makeSqlQueryTool(sqlDomain));
      if (graphDataset) t.push(makeGraphQueryTool(graphDataset));
      return t;
    })(),
    // AD-2: lazy 핸들. 호출만으로는 ./.data/ 생성·saver 오픈 0.
    checkpointer: createCheckpointer(env),
    // SKILL — sources 가 비면 createDeepAgent 에 skills/backend 미주입
    // (buildAgentOptions 가 결정). backend 는 lazy 생성하지 않고 인스턴스를
    // 넘기되, sources=[] 면 buildAgentOptions 에서 통째로 누락시킨다.
    skills: {
      enabled: skillSources.length > 0,
      sources: skillSources,
      backend: skillSources.length > 0 ? createSkillsBackend() : null,
    },
  };
}

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
import { listCustomSubagentSpecs } from "./subagents/subagentStore";
import { listSkillSources, createSkillsBackend } from "./skills";
import type { HarnessOverrides } from "./profiles";

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
  // listSkillSources() 반환값 — ["/"] 또는 [].
  // deepagents 는 sourcePath("/")를 ls 해서 그 안의 서브디렉토리를 스캔하므로
  // 개별 스킬 경로("/name/")가 아니라 루트("/")를 넘겨야 모든 스킬이 인식된다.
  allSources: string[],
  // 워크스페이스 멀티선택(name 목록). null/undefined = 전체(기존 동작).
  // 빈 배열이면 skills 토글이 켜져도 빈 배열 반환(전부 끔).
  selectedSkills?: string[] | null,
): string[] {
  // (a) 정책: skills·filesystem 둘 다 켜져야 sources 반환(의존성 해소).
  if (!skillsToggle || !filesystemEnabled) return [];
  // 스킬 자체가 없으면(skills/ 디렉토리가 비어있으면) 비활성.
  if (allSources.length === 0) return [];
  // 워크스페이스가 스킬을 명시적으로 전부 끈 경우(빈 배열).
  if (Array.isArray(selectedSkills) && selectedSkills.length === 0) return [];
  // 그 외(null/undefined/비어있지 않은 배열) = 전체 소스(["/"])를 그대로 반환.
  // deepagents 레벨에서 스킬별 필터링은 지원하지 않으므로 루트 소스를 통째로 넘긴다.
  return allSources;
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
  // 요청별 하네스 토글 오버라이드(에이전트 패널의 4요소 토글 상태).
  // 미지정이면 오버라이드 0 → env 디폴트 그대로(기존 /chat 100% 동일,
  // 회귀 0). 키가 있으면 그 boolean 을 env 토글 위에 강제 적용한다.
  // 사용자 결정 2026-05-20: blocked 고정차단 → 요청별 자유 토글로 전환.
  // env 자체는 미변형 — 다른 경로(/chat·다른 에이전트)는 영향 0.
  overrides?: HarnessOverrides,
  // 온톨로지 조회(graph) 도구 세션 데이터셋(챗 그래프 드롭다운).
  // idx/sqlDomain 과 독립 — 지정 시 그 데이터셋 바인딩 graph_query
  // 도구 포함(수업1·3 연결: GRAPH_DATASETS SSOT 가 드롭다운·도구
  // 단일 소스). 미지정=도구 없음(회귀 0). 변경 시 캐시 키 변경=리프레시.
  graphDataset?: string,
  // 워크스페이스(에이전트 A/B/C) 스킬·서브에이전트 멀티선택. 각 필드
  // null/미지정 = 전체(기존 동작 — 회귀 0), 배열 = 그 name 만 활성.
  // subagents 토글이 켜진 전제에서 어떤 서브에이전트를, skills 토글이
  // 켜진 전제에서 어떤 스킬을 부여할지 추가 필터(토글 OFF 면 무관 — []).
  selection?: { skills?: string[] | null; subagents?: string[] | null },
): HarnessConfig {
  // 잘못된 provider 를 은폐하지 않는다(무음 폴백 0 — AC-4). LLM 호출 아님.
  resolveProvider(env);

  // env 토글 → 오버라이드 순으로 최종 enabled 결정(단일 지점 — R2).
  // override 키가 명시되면(boolean) 그 값을 쓰고, 없으면(undefined)
  // env 디폴트(parseToggle)를 따른다. 4요소 전부 동일 규칙.
  const resolve = (
    raw: string | undefined,
    override: boolean | undefined,
  ): boolean =>
    override !== undefined ? override : parseToggle(raw, true);

  const planningEnabled = resolve(env.HARNESS_PLANNING, overrides?.planning);
  const subagentsEnabled = resolve(env.HARNESS_SUBAGENTS, overrides?.subagents);
  const filesystemEnabled = resolve(
    env.HARNESS_FILESYSTEM,
    overrides?.filesystem,
  );
  const skillsToggle = resolve(env.HARNESS_SKILLS, overrides?.skills);
  const skillSources = resolveSkillSources(
    skillsToggle,
    filesystemEnabled,
    listSkillSources(), // ["/"] 또는 []
    selection?.skills,
  );

  // 서브에이전트 = 내장(HARNESS_SUBAGENTS) + 사용자가 하네스 관리에서
  // 만든 커스텀(.data/subagents.json, subagentStore 캐시). subagents
  // 토글이 켜졌을 때만 합성(꺼지면 []). listCustomSubagentSpecs 는
  // globalThis 캐시 우선이라 매 호출 디스크 접근 0(SQL/graph 도구가
  // getSchema/getDataset 로 메모리 조회하는 것과 동일 사상).
  //
  // 워크스페이스 멀티선택(selection.subagents): null=전체(회귀 0), 배열이면
  // 그 name 만 통과(내장·커스텀 공통). 빈 배열 = 전부 제외(토글 ON 이어도
  // 부여 0 — 사용자가 명시적으로 다 끈 상태).
  const composed = subagentsEnabled
    ? [...HARNESS_SUBAGENTS, ...listCustomSubagentSpecs()]
    : [];
  const allSubagents =
    selection?.subagents == null
      ? composed
      : composed.filter((s) => selection.subagents!.includes(s.name));

  return {
    planning: { enabled: planningEnabled },
    filesystem: { enabled: filesystemEnabled },
    subagents: allSubagents,
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

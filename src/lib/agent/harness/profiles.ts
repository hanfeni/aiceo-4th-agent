/**
 * 하네스 프로필 SSOT — 워크스페이스(챗 에이전트 복제본)별 "차단(blocklist)"
 * 정의.
 *
 * 배경: 기존 /chat 은 env 토글(HARNESS_PLANNING/FILESYSTEM/SUBAGENTS/SKILLS)
 * 로 하네스 요소를 켜고 끈다. 워크스페이스 메뉴는 그 위에 "메뉴별로 특정
 * 요소를 강제 차단" 하는 레이어를 얹는다. env 로 켜져 있어도 워크스페이스의
 * blocked 에 든 요소는 그 워크스페이스에서만 off 가 된다(env 미오염 — 다른
 * 경로는 영향 0).
 *
 * 차단 결정은 buildHarnessConfig 안에서만 HarnessConfig 를 변형해 적용한다
 * (CLAUDE.md R2 — 토글/필터 분기는 registry 단일 지점. route.ts/agent.ts /
 * buildAgentOptions 에는 if(blocked) 분기 0줄). 그래서 차단도 결국
 * "HarnessConfig.subagents=[]" "HarnessConfig.skills.enabled=false" 라는
 * 기존 표현으로 환원되어, 하류(buildAgentOptions)는 토글 off 와 동일 경로를
 * 탄다(새 분기 0 — 회귀 0).
 *
 * 확장: 우선 SKILL·SUBAGENT 두 요소만 차단 대상이다. planning/filesystem/
 * tools 로 넓히려면 HarnessElement union 에 멤버 추가 + buildHarnessConfig
 * 의 적용 스위치 1줄이면 된다(구조는 그대로).
 */

/** 차단 가능한 하네스 요소. 우선 skills·subagents 만(추후 확장). */
export type HarnessElement = "skills" | "subagents";

/** 워크스페이스 식별자(동적 라우트 [id] 값과 1:1). */
export const WORKSPACE_IDS = ["workspace1", "workspace2", "workspace3"] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export interface HarnessProfile {
  /** 라우트 [id] 와 동일한 식별자(그래프 캐시 키·thread 접두에 사용). */
  id: WorkspaceId;
  /** UI 표시 라벨(한글). */
  label: string;
  /** 한 줄 설명(워크스페이스 상단 안내). */
  description: string;
  /** 이 워크스페이스에서 강제 차단할 하네스 요소들. */
  blocked: HarnessElement[];
}

/**
 * 워크스페이스 → 프로필 매핑(SSOT). 세 워크스페이스 모두 "하네스 전체
 * 사용 가능"이 기본이고, blocked 에 든 요소만 강제 차단한다. 현재는
 * 데모/실습 변별을 위해 서로 다른 차단 조합을 둔다(추후 자유 조정).
 */
export const HARNESS_PROFILES: Record<WorkspaceId, HarnessProfile> = {
  workspace1: {
    id: "workspace1",
    label: "워크스페이스 1 (전체 하네스)",
    description: "모든 하네스 요소를 사용합니다. 차단된 요소가 없습니다.",
    blocked: [],
  },
  workspace2: {
    id: "workspace2",
    label: "워크스페이스 2 (스킬 차단)",
    description: "SKILL 요소를 차단합니다. 서브에이전트·플래닝 등 나머지는 사용합니다.",
    blocked: ["skills"],
  },
  workspace3: {
    id: "workspace3",
    label: "워크스페이스 3 (스킬·서브에이전트 차단)",
    description: "SKILL·SUBAGENT 두 요소를 차단합니다. 단일 에이전트로 동작합니다.",
    blocked: ["skills", "subagents"],
  },
};

/** 차단 요소의 한글 표시명(UI 칩 라벨). */
export const HARNESS_ELEMENT_LABEL: Record<HarnessElement, string> = {
  skills: "SKILL (스킬)",
  subagents: "SUBAGENT (서브에이전트)",
};

/** 문자열이 유효한 워크스페이스 id 인지 좁힌다(라우트 검증·zod 보조). */
export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return (
    typeof value === "string" &&
    (WORKSPACE_IDS as readonly string[]).includes(value)
  );
}

/** id 로 프로필을 안전 조회. 미존재면 undefined(라우트가 notFound 처리). */
export function getProfile(id: string): HarnessProfile | undefined {
  return isWorkspaceId(id) ? HARNESS_PROFILES[id] : undefined;
}

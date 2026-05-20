/**
 * 하네스 프로필 SSOT — 챗 에이전트 복제본(에이전트 A/B/C)별 정의.
 *
 * 설계 전환(사용자 결정 2026-05-20):
 *   (이전) 워크스페이스별 blocked[] 고정 차단
 *   (현재) 세 에이전트 모두 하네스 4요소 전부를 사용자가 토글로 켜고
 *          끌 수 있고(요청마다 클라이언트가 토글 상태 전송), 에이전트별로
 *          다른 것은 "기본 토글 구성(defaults)" 뿐이다. 차단은 고정이
 *          아니라 사용자가 런타임에 바꾸는 값(harnessOverrides)이다.
 *
 * 토글 결정의 단일 지점은 여전히 buildHarnessConfig(registry.ts) 다
 * (CLAUDE.md R2). 클라이언트가 보낸 harnessOverrides 를 그 함수가 env
 * 토글 위에 덮어써 최종 HarnessConfig 를 만든다. agent.ts/route.ts/
 * buildAgentOptions 에는 if(toggle) 분기가 없다(하류는 토글 off 와 동일
 * 경로 — 회귀 0).
 */

/** 토글 가능한 하네스 요소 4종(전부 사용자 제어). */
export const HARNESS_ELEMENTS = [
  "planning",
  "filesystem",
  "subagents",
  "skills",
] as const;

export type HarnessElement = (typeof HARNESS_ELEMENTS)[number];

/**
 * 요청별 하네스 토글 오버라이드. 키가 있으면 그 값(true=켬/false=끔)을
 * env 토글 위에 강제 적용한다. 키가 없으면(undefined) env 디폴트 유지.
 * 클라이언트(에이전트 패널 토글)가 현재 상태를 채워 보낸다.
 */
export type HarnessOverrides = Partial<Record<HarnessElement, boolean>>;

/** 에이전트 식별자(동적 라우트 [id] 값과 1:1). 라벨은 A/B/C. */
export const WORKSPACE_IDS = ["workspace1", "workspace2", "workspace3"] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export interface HarnessProfile {
  /** 라우트 [id] 와 동일한 식별자(그래프 캐시 키·thread 접두에 사용). */
  id: WorkspaceId;
  /** UI 표시 라벨(에이전트 A/B/C). */
  label: string;
  /** 한 줄 설명(에이전트 상단 안내). */
  description: string;
  /**
   * 이 에이전트의 기본 하네스 토글 구성. 사용자가 패널에서 바꾸기 전
   * 초기값. 키가 없으면 env 디폴트를 따른다(클라이언트가 마운트 시
   * 이 defaults 로 토글 UI 를 시드).
   *
   * 사용자 결정 2026-05-20: "일단 시작은 어느 것도 선택하지 않게" →
   * 세 에이전트 모두 defaults 비움(빈 객체 = env 디폴트 그대로, 차단 0).
   * 추후 에이전트별 변별이 필요하면 여기에 { skills:false } 식으로 채운다.
   */
  defaults: HarnessOverrides;
  /**
   * 기본 시스템 인스트럭션 id(없으면 default). 인스트럭션 레지스트리
   * (prompts/instructions.ts)의 id 를 참조한다. 사용자가 에이전트
   * 패널에서 다른 인스트럭션을 고르면 그 값이 요청에 실린다.
   */
  defaultInstructionId?: string;
}

/**
 * 에이전트 → 프로필 매핑(SSOT). 세 에이전트 모두 기능 동일(4요소 전부
 * 토글 가능)이고, 현재는 defaults 도 모두 비움(차단 0 — 사용자 결정).
 * 에이전트별 변별이 필요해지면 defaults/defaultInstructionId 만 다르게.
 */
export const HARNESS_PROFILES: Record<WorkspaceId, HarnessProfile> = {
  workspace1: {
    id: "workspace1",
    label: "에이전트 A",
    description:
      "하네스 4요소(플래닝·파일시스템·서브에이전트·스킬)를 자유롭게 켜고 끌 수 있는 챗 에이전트입니다.",
    defaults: {},
  },
  workspace2: {
    id: "workspace2",
    label: "에이전트 B",
    description:
      "하네스 4요소를 자유롭게 토글할 수 있는 챗 에이전트입니다. 기본 구성을 자유롭게 바꿔 실습하세요.",
    defaults: {},
  },
  workspace3: {
    id: "workspace3",
    label: "에이전트 C",
    description:
      "하네스 4요소를 자유롭게 토글할 수 있는 챗 에이전트입니다. 기본 구성을 자유롭게 바꿔 실습하세요.",
    defaults: {},
  },
};

/** 하네스 요소의 한글 표시명(UI 토글 라벨). */
export const HARNESS_ELEMENT_LABEL: Record<HarnessElement, string> = {
  planning: "플래닝 (write_todos)",
  filesystem: "파일시스템",
  subagents: "서브에이전트",
  skills: "스킬",
};

/** 문자열이 유효한 에이전트 id 인지 좁힌다(라우트 검증·zod 보조). */
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

/** 문자열이 유효한 하네스 요소인지 좁힌다(zod 보조). */
export function isHarnessElement(value: unknown): value is HarnessElement {
  return (
    typeof value === "string" &&
    (HARNESS_ELEMENTS as readonly string[]).includes(value)
  );
}

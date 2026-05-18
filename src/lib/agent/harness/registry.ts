import type { HarnessConfig } from "@/types";
import {
  createCheckpointer,
  type CheckpointerEnv,
} from "./checkpointer";
import { resolveProvider, type ModelEnv } from "./model";
import { HARNESS_TOOLS } from "./tools";
import { HARNESS_SUBAGENTS } from "./subagents";

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
  };

const FALSY = new Set(["false", "0", "no", "off"]);
const TRUTHY = new Set(["true", "1", "yes", "on"]);

/**
 * 토글 env 값을 일관 규칙으로 boolean 해석한다 (TC-6.8).
 * trim + lowercase 후 false/0/no/off → false, true/1/yes/on → true.
 * 미설정(undefined)·인식 불가 값 → 기본값(defaultValue) 적용.
 */
function parseToggle(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (FALSY.has(v)) return false;
  if (TRUTHY.has(v)) return true;
  return defaultValue;
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
export function buildHarnessConfig(env: HarnessEnv): HarnessConfig {
  // 잘못된 provider 를 은폐하지 않는다(무음 폴백 0 — AC-4). LLM 호출 아님.
  resolveProvider(env);

  const subagentsEnabled = parseToggle(env.HARNESS_SUBAGENTS, true);

  return {
    planning: { enabled: parseToggle(env.HARNESS_PLANNING, true) },
    filesystem: { enabled: parseToggle(env.HARNESS_FILESYSTEM, true) },
    subagents: subagentsEnabled ? HARNESS_SUBAGENTS : [],
    tools: HARNESS_TOOLS,
    // AD-2: lazy 핸들. 호출만으로는 ./.data/ 생성·saver 오픈 0.
    checkpointer: createCheckpointer(env),
  };
}

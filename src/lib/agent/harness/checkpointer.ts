import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

/**
 * Checkpointer 백엔드 팩토리 (H3 멀티턴 영속화, FR-12).
 *
 * AD-2 (lazy): 팩토리 호출만으로는 `./.data/` 디렉토리 생성·SQLite 파일
 * 핸들 오픈을 하지 않는다. 따라서 `buildHarnessConfig(env)` 가 파일시스템
 * side effect 없는 순수 함수로 유지되어 NFR-11/AC-10 의 "순수 함수 단위
 * 테스트" 가 문자 그대로 성립한다. 실제 `SqliteSaver.fromConnString` 은
 * LangGraph 가 saver 메서드를 처음 호출하는 시점에 1회만 일어난다.
 *
 * U5 실측:
 *  - sqlite → SqliteSaver.fromConnString(CHECKPOINTER_SQLITE_PATH)
 *  - memory → SqliteSaver.fromConnString(":memory:")  (별도 MemorySaver
 *    import 은 pnpm strict 에서 불가하므로 in-memory sqlite 로 통일)
 *
 * AD-5(b): conn 경로는 환경변수/상수에서만 온다. 요청 입력이 경로에
 * 영향을 주지 않는다 (path traversal 0).
 */

export type CheckpointerEnv = {
  HARNESS_CHECKPOINTER?: string;
  CHECKPOINTER_SQLITE_PATH?: string;
};

const DEFAULT_SQLITE_PATH = "./.data/checkpoints.sqlite";

function resolveConnString(env: CheckpointerEnv): string {
  const backend = (env.HARNESS_CHECKPOINTER ?? "sqlite").trim().toLowerCase();
  if (backend === "memory") return ":memory:";
  // sqlite (기본). 경로는 env/상수만 — 요청 입력 비유입 (AD-5(b)).
  return env.CHECKPOINTER_SQLITE_PATH?.trim() || DEFAULT_SQLITE_PATH;
}

/**
 * 최초 사용 시점에 실제 SqliteSaver 를 1회 생성하고 캐시한다.
 * 파일 기반 경로면 부모 디렉토리를 보장한다 (TC-11.6: `.data/` 생성
 * 보장 — better-sqlite3 는 부모 디렉토리 부재 시 실패).
 */
function makeLazySaver(connString: string): SqliteSaver {
  let real: SqliteSaver | null = null;

  const ensure = (): SqliteSaver => {
    if (real) return real;
    if (connString !== ":memory:") {
      mkdirSync(dirname(connString), { recursive: true });
    }
    real = SqliteSaver.fromConnString(connString);
    return real;
  };

  // BaseCheckpointSaver 는 duck-typed 로 호출된다(getTuple/put/list/...).
  // Proxy get-trap 에서 첫 멤버 접근 시 실제 saver 를 생성·위임한다.
  return new Proxy({} as SqliteSaver, {
    get(_t, prop, receiver) {
      const saver = ensure();
      const value = Reflect.get(saver as object, prop, receiver);
      return typeof value === "function" ? value.bind(saver) : value;
    },
    has(_t, prop) {
      return prop in ensure();
    },
  });
}

/**
 * globalThis 싱글톤 (R6 / Plan Critic C2). registry(그래프 주입)와 대화
 * 히스토리 API 가 각각 createCheckpointer/getCheckpointer 를 호출해도 같은
 * env 면 **동일 lazy 핸들**을 공유해야 한다. 공유가 깨지면 :memory: 모드에서
 * API 가 채팅과 별개의 빈 in-memory DB 를 읽고(목록 항상 빔), 파일 모드에선
 * "같은 경로" 우연 결합에 의존하는 fragile 설계가 된다.
 *
 * 캐시 단위는 lazy 핸들(Proxy) 자체다. Proxy 를 캐시해도 내부 real saver 는
 * 여전히 첫 멤버 접근 시점에 1회 생성되므로 AD-2 lazy 불변식이 유지된다
 * (인스턴스 획득만으로 fs side effect 0). 키는 backend|connString 으로
 * env 조합을 구분(테스트가 여러 env 로 호출해도 오염 0). agent.ts 의
 * globalThis.__agent 패턴을 그대로 미러링한다.
 */
type CheckpointerGlobal = { byKey?: Map<string, SqliteSaver> };
const cg = globalThis as typeof globalThis & {
  __checkpointer?: CheckpointerGlobal;
};

function singletonKey(env: CheckpointerEnv): string {
  const backend = (env.HARNESS_CHECKPOINTER ?? "sqlite").trim().toLowerCase();
  return `${backend}|${resolveConnString(env)}`;
}

function getOrCreateSingleton(env: CheckpointerEnv): SqliteSaver {
  if (!cg.__checkpointer) cg.__checkpointer = {};
  if (!cg.__checkpointer.byKey) cg.__checkpointer.byKey = new Map();
  const key = singletonKey(env);
  const cached = cg.__checkpointer.byKey.get(key);
  if (cached) return cached;
  const handle = makeLazySaver(resolveConnString(env));
  cg.__checkpointer.byKey.set(key, handle);
  return handle;
}

/**
 * env 분기로 lazy checkpointer 핸들을 만든다(env 당 1회, 이후 메모이즈).
 * 호출만으로는 fs side effect/saver 생성이 없다 (AD-2). 반환값은
 * BaseCheckpointSaver 로 createDeepAgent 의 checkpointer 옵션에 그대로 주입
 * 가능. registry.ts 의 유일한 호출처 — 시그니처 불변이라 R2(토글 diff 0줄)
 * 유지.
 */
export function createCheckpointer(env: CheckpointerEnv): SqliteSaver {
  return getOrCreateSingleton(env);
}

/**
 * 대화 히스토리 API 진입점 (Plan Critic C2). registry 가 그래프에 주입한
 * 것과 **동일한** saver 인스턴스를 돌려준다. createCheckpointer 와 같은
 * 싱글톤을 공유하므로 호출 순서에 무관하게 1 인스턴스다.
 */
export function getCheckpointer(env: CheckpointerEnv): SqliteSaver {
  return getOrCreateSingleton(env);
}

/**
 * 테스트 전용 — globalThis 싱글톤 캐시를 비운다. vitest 의 모듈 격리는
 * globalThis 까지 리셋하지 않으므로 테스트 간 핸들이 누수된다(다른 env
 * 케이스가 이전 핸들을 재사용). prod 코드에서 호출 금지.
 */
export function __resetCheckpointerSingletonForTest(): void {
  if (cg.__checkpointer) cg.__checkpointer.byKey = new Map();
}

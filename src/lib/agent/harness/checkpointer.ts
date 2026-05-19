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
 * env 분기로 lazy checkpointer 핸들을 만든다. 호출만으로는 fs side
 * effect/saver 생성이 없다 (AD-2). 반환값은 BaseCheckpointSaver 로
 * createDeepAgent 의 checkpointer 옵션에 그대로 주입 가능.
 */
export function createCheckpointer(env: CheckpointerEnv): SqliteSaver {
  const connString = resolveConnString(env);
  return makeLazySaver(connString);
}

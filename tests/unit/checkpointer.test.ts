import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";

// checkpointer.ts 단위 테스트 (LLM 비의존 — FR-12 / AC-10 / AD-2).
// 매핑: TC-11.3 / TC-25.16 (분기), TC-11.3 AD-2 (lazy — fs side effect 0)
//
// @langchain/langgraph-checkpoint-sqlite 의 SqliteSaver.fromConnString 은
// vi.mock 으로 가로채 better-sqlite3 네이티브 바인딩/파일 핸들 0 (LLM·DB 미접촉).
// vi.mock 의 경로는 checkpointer.ts 가 import 할 경로와 정확히 동일해야 한다.
//
// checkpointer.ts 계약(Slice 4 구현 예정):
//   createCheckpointer(env): <lazy SqliteSaver wrapper | thunk>
//   - HARNESS_CHECKPOINTER=sqlite → SqliteSaver.fromConnString(CHECKPOINTER_SQLITE_PATH)
//   - HARNESS_CHECKPOINTER=memory → SqliteSaver.fromConnString(":memory:")
//   - AD-2 lazy: 팩토리 호출만으로 ./.data/ 디렉토리 생성·파일 핸들 오픈 금지.
//     fromConnString 은 "최초 실제 사용" 시점까지 지연 호출되어야 한다.

const { fromConnStringSpy } = vi.hoisted(() => ({
  fromConnStringSpy: vi.fn((connString: string) => ({
    __sqliteSaver: true,
    __connString: connString,
    // SqliteSaver 형상 근사(메서드 존재만으로 saver-shaped 판정).
    getTuple: vi.fn(),
    put: vi.fn(),
    list: vi.fn(),
  })),
}));

vi.mock("@langchain/langgraph-checkpoint-sqlite", () => ({
  SqliteSaver: {
    fromConnString: fromConnStringSpy,
  },
}));

// 소스 모듈은 Slice 4 구현 전이라 부재 — TDD red 단계에서 import 실패가 정상.
import { createCheckpointer } from "@/lib/agent/harness/checkpointer";

const DATA_DIR = "./.data";
const TEST_SQLITE_PATH = "./.data/test-x.sqlite";

function rmDataDir() {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* noop — 디렉토리 없으면 무시 */
  }
}

// lazy 래퍼/thunk 의 "최초 실제 사용" 을 트리거한다.
// 구현 형태가 (a) 함수 thunk, (b) 메서드 위임 프록시 객체 어느 쪽이든
// 첫 saver 접근을 유발하도록 방어적으로 처리.
function triggerFirstUse(handle: unknown): void {
  if (typeof handle === "function") {
    (handle as () => unknown)();
    return;
  }
  const h = handle as Record<string, unknown>;
  // 흔한 명시적 초기화 진입점들.
  for (const key of ["resolve", "get", "getSaver", "init", "value"]) {
    if (typeof h?.[key] === "function") {
      (h[key] as () => unknown)();
      return;
    }
  }
  // 위임 프록시라면 saver 메서드 1회 접근으로 내부 초기화 유발.
  if (typeof h?.getTuple === "function") {
    try {
      (h.getTuple as (...a: unknown[]) => unknown)({
        configurable: { thread_id: "t" },
      });
    } catch {
      /* 모킹 saver — 호출 자체로 lazy init 트리거 목적 */
    }
  }
}

describe("createCheckpointer — checkpointer 백엔드 분기 + AD-2 lazy (FR-12 / AC-10)", () => {
  beforeEach(() => {
    fromConnStringSpy.mockClear();
    rmDataDir();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 테스트가 만들었을 수 있는 ./.data/ 정리(AD-2 회귀 격리).
    rmDataDir();
  });

  // TC-11.3 / TC-25.16 — sqlite 분기: 최초 사용 시 CHECKPOINTER_SQLITE_PATH 로 fromConnString
  it("TC-11.3/TC-25.16: HARNESS_CHECKPOINTER=sqlite → 최초 사용 시 fromConnString(path) 호출, saver 형상 반환", () => {
    const handle = createCheckpointer({
      HARNESS_CHECKPOINTER: "sqlite",
      CHECKPOINTER_SQLITE_PATH: TEST_SQLITE_PATH,
    });
    // 팩토리 호출 시점엔 아직 fromConnString 미호출(lazy).
    expect(fromConnStringSpy).not.toHaveBeenCalled();

    triggerFirstUse(handle);

    expect(fromConnStringSpy).toHaveBeenCalledTimes(1);
    expect(fromConnStringSpy).toHaveBeenCalledWith(TEST_SQLITE_PATH);
    const saver = fromConnStringSpy.mock.results[0]?.value as Record<string, unknown>;
    expect(saver?.__sqliteSaver).toBe(true);
    expect(typeof saver?.getTuple).toBe("function");
  });

  // TC-11.3 / TC-25.16 — memory 분기: ":memory:" 로 fromConnString
  it("TC-11.3/TC-25.16: HARNESS_CHECKPOINTER=memory → 최초 사용 시 fromConnString(':memory:') 호출", () => {
    const handle = createCheckpointer({ HARNESS_CHECKPOINTER: "memory" });
    expect(fromConnStringSpy).not.toHaveBeenCalled();

    triggerFirstUse(handle);

    expect(fromConnStringSpy).toHaveBeenCalledTimes(1);
    expect(fromConnStringSpy).toHaveBeenCalledWith(":memory:");
  });

  // TC-11.3 AD-2 (critical) — 팩토리 호출만으로 ./.data/ 미생성 & fromConnString 미호출
  it("TC-11.3 AD-2: sqlite 팩토리 호출만으로 ./.data/ 미생성 & fromConnString 지연(최초 사용 전 호출 0)", () => {
    expect(fs.existsSync(DATA_DIR)).toBe(false);

    const handle = createCheckpointer({
      HARNESS_CHECKPOINTER: "sqlite",
      CHECKPOINTER_SQLITE_PATH: TEST_SQLITE_PATH,
    });

    // 핵심 AD-2 어설션: 팩토리 호출 직후 fs side effect 0, fromConnString 미호출.
    expect(fs.existsSync(DATA_DIR)).toBe(false);
    expect(fromConnStringSpy).not.toHaveBeenCalled();

    // 최초 사용 시점에 비로소 fromConnString 이 호출되어야 함.
    triggerFirstUse(handle);
    expect(fromConnStringSpy).toHaveBeenCalledTimes(1);
    expect(fromConnStringSpy).toHaveBeenCalledWith(TEST_SQLITE_PATH);
  });

  // TC-11.3 AD-2 — memory 분기도 팩토리 호출 단계에서 fs side effect/호출 0
  it("TC-11.3 AD-2: memory 팩토리 호출만으로 fromConnString 미호출(lazy 순수성)", () => {
    const handle = createCheckpointer({ HARNESS_CHECKPOINTER: "memory" });
    expect(fromConnStringSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(DATA_DIR)).toBe(false);

    triggerFirstUse(handle);
    expect(fromConnStringSpy).toHaveBeenCalledTimes(1);
    expect(fromConnStringSpy).toHaveBeenCalledWith(":memory:");
  });

  // AD-2 lazy 결과 캐싱 회귀: 최초 사용 후 재사용해도 fromConnString 은 1회만(saver 싱글톤)
  it("TC-11.3 AD-2: 최초 사용 후 재사용 시 fromConnString 추가 호출 없음(saver 1회 생성)", () => {
    const handle = createCheckpointer({
      HARNESS_CHECKPOINTER: "sqlite",
      CHECKPOINTER_SQLITE_PATH: TEST_SQLITE_PATH,
    });
    triggerFirstUse(handle);
    triggerFirstUse(handle);
    expect(fromConnStringSpy).toHaveBeenCalledTimes(1);
  });
});

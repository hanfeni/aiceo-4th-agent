/**
 * DART rate-limit 인메모리 store (OPEN-1 (c) 확정 — PRD §3.10).
 *
 * 원본 medigate `rate-limiter-store.ts`(sql.js WASM, 330줄)를 **복사하지
 * 않고 재작성**(STRUCTURAL #1). rate-limit 상태(롤링 윈도우 타임스탬프
 * + block 플래그)는 본질적으로 ephemeral — 단일 프로세스·요청당 수~수십
 * 호출·DART 분당한도 1,000 대비 영속 불요. sql.js 의존 0, `data/*.db` 0
 * (보안 표면 축소 부수효과).
 *
 * R6: globalThis 싱글톤. HMR 이 모듈을 재평가해도 globalThis 는 유지되어
 * dev 에서 카운터가 증발하지 않는다(checkpointer.ts 와 동일 패턴).
 * 프로세스 재시작 시에는 리셋된다(OPEN-1 (c) — 영속 안 함이 정상, TC-48.7).
 *
 * 원본의 정적 메서드 8종 인터페이스를 `RateLimiterStore` 객체로 동일
 * 호출 형태(`RateLimiterStore.getBlockState()`) 보존 → `limiter.ts`
 * 호출부 diff 0(STRUCTURAL #1 "시그니처 불변").
 */

/** 차단 상태 레코드 (원본 BlockStateRecord 의 인메모리 등가) */
export interface BlockStateRecord {
  id: number;
  isBlocked: boolean;
  blockedAt: number | null;
  reason: string | null;
  createdAt: string;
}

/** API 호출 로그 레코드 (원본 ApiCallLogRecord 의 인메모리 등가) */
export interface ApiCallLogRecord {
  id: number;
  timestamp: number;
  endpoint: string;
  createdAt: string;
}

interface RateStoreState {
  /** 호출 타임스탬프 롤링 윈도우 (ms epoch, 1시간 초과분 자동 정리) */
  callTimestamps: number[];
  /** 차단 상태 (항상 최신 1개) */
  blockState: {
    isBlocked: boolean;
    blockedAt: number | null;
    reason: string | null;
  };
}

/** 1시간(ms) — 롤링 윈도우 보존 한계 (원본 SQLite DELETE 조건과 동일) */
const RETENTION_MS = 60 * 60 * 1000;

/**
 * R6: globalThis 싱글톤. dev HMR 재평가 시에도 동일 state 보존.
 * (checkpointer.ts 의 globalThis 고정 패턴과 동형 — Prisma 공식 패턴.)
 */
const GLOBAL_KEY = "__dartRateStore" as const;
type GlobalWithStore = typeof globalThis & {
  [GLOBAL_KEY]?: RateStoreState;
};

function getState(): RateStoreState {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      callTimestamps: [],
      blockState: { isBlocked: false, blockedAt: null, reason: null },
    };
  }
  return g[GLOBAL_KEY];
}

/** 1시간 초과 타임스탬프 제거 (메모리 누수 방지 — 원본 DELETE 등가) */
function pruneOld(state: RateStoreState, now: number): void {
  const cutoff = now - RETENTION_MS;
  if (state.callTimestamps.length === 0) return;
  // 오름차순 가정 — 앞에서부터 cutoff 미만 제거
  let i = 0;
  while (i < state.callTimestamps.length && state.callTimestamps[i] < cutoff) {
    i++;
  }
  if (i > 0) state.callTimestamps.splice(0, i);
}

/**
 * 원본 RateLimiterStore 정적 메서드 8종의 인메모리 등가.
 * 시그니처(인자/반환·Promise)는 원본과 동일 — `limiter.ts` 무수정.
 * `endpoint` 인자는 원본도 로깅용일 뿐 계산에 미사용(조회는 타임스탬프만).
 */
export const RateLimiterStore = {
  async recordApiCall(_endpoint: string = ""): Promise<void> {
    const state = getState();
    const now = Date.now();
    state.callTimestamps.push(now);
    pruneOld(state, now);
  },

  async getRecentCallCount(minutes: number = 1): Promise<number> {
    const state = getState();
    const since = Date.now() - minutes * 60 * 1000;
    return state.callTimestamps.filter((t) => t >= since).length;
  },

  async getRecentCallTimestamps(minutes: number = 1): Promise<number[]> {
    const state = getState();
    const since = Date.now() - minutes * 60 * 1000;
    // 원본은 DESC 정렬 반환
    return state.callTimestamps.filter((t) => t >= since).sort((a, b) => b - a);
  },

  async saveBlockState(
    isBlocked: boolean,
    blockedAt: number | null,
    reason: string | null,
  ): Promise<void> {
    getState().blockState = { isBlocked, blockedAt, reason };
  },

  async getBlockState(): Promise<{
    isBlocked: boolean;
    blockedAt: number | null;
    reason: string | null;
  }> {
    const { blockState } = getState();
    return { ...blockState };
  },

  async clearBlockState(): Promise<void> {
    getState().blockState = {
      isBlocked: false,
      blockedAt: null,
      reason: null,
    };
  },

  async cleanupOldLogs(): Promise<number> {
    const state = getState();
    const before = state.callTimestamps.length;
    pruneOld(state, Date.now());
    return before - state.callTimestamps.length;
  },

  async getStats(): Promise<{
    totalLogs: number;
    lastMinuteCalls: number;
    lastHourCalls: number;
    blockState: {
      isBlocked: boolean;
      blockedAt: number | null;
      reason: string | null;
    };
  }> {
    const state = getState();
    const now = Date.now();
    const lastMinute = now - 60 * 1000;
    const lastHour = now - 60 * 60 * 1000;
    return {
      totalLogs: state.callTimestamps.length,
      lastMinuteCalls: state.callTimestamps.filter((t) => t >= lastMinute).length,
      lastHourCalls: state.callTimestamps.filter((t) => t >= lastHour).length,
      blockState: { ...state.blockState },
    };
  },

  /** 테스트 전용 — 프로세스 재시작 시뮬레이션(globalThis state 제거) */
  __resetForTest(): void {
    const g = globalThis as GlobalWithStore;
    delete g[GLOBAL_KEY];
  },
};

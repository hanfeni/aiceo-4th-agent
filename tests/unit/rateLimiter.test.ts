import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// DART rate-limit Slice D3 단위 테스트 — 인메모리 store(globalThis 싱글톤,
// R6) + limiter(임계값/throttle/상태). LLM/DART API/네트워크 호출 0
// (전부 순수 함수·인메모리). Date 의존은 store 직접 타임스탬프 주입 또는
// fake timers 로 결정화.
//
// 매핑:
//   TC-48.7 (UC-48 / OPEN-1·R6) — store 인메모리 재시작 리셋 + globalThis HMR 보존
//   TC-48.9 (UC-48-EC1 / OPEN-1) — sql.js 의존 0 (인메모리 비-SQLite 확정)
// 정답지: store.ts/limiter.ts 실측 상수(MAX=1000, CAUTION 0.5 / WARNING 0.7
//   / DANGER 0.9, throttle 0/200/1000/5000/-1, BLOCK 1h).

import {
  RateLimiterStore,
  recordApiCallSync,
  getRateLimitStateSync,
  getRateLimitState,
  canMakeRequest,
  getThrottleDelay,
  recordApiCall,
  reportConnectionError,
  reportConnectionErrorSync,
  resetRateLimiter,
} from "@/lib/dart/ratelimit";

describe("DART rate-limit — store 인메모리 (TC-48.7 / TC-48.9)", () => {
  beforeEach(() => {
    RateLimiterStore.__resetForTest();
  });

  afterEach(() => {
    RateLimiterStore.__resetForTest();
  });

  // TC-48.7 (1) — recordApiCall N회 후 카운트 관찰, __resetForTest 로
  // 프로세스 재시작 시뮬레이션 → 카운트 0 리셋(영속 안 함이 정상).
  it("recordApiCall N회 → getRecentCallCount 반영, __resetForTest 후 0 리셋", async () => {
    for (let i = 0; i < 7; i++) {
      await RateLimiterStore.recordApiCall("/api/test");
    }
    expect(await RateLimiterStore.getRecentCallCount(1)).toBe(7);

    // 프로세스 재시작 시뮬레이션 (globalThis state 제거)
    RateLimiterStore.__resetForTest();

    // 영속 안 함이 정상 — 재시작 후 0
    expect(await RateLimiterStore.getRecentCallCount(1)).toBe(0);
  });

  // TC-48.7 (2) — globalThis 싱글톤: 모듈 재import(vi.resetModules)해도
  // globalThis.__dartRateStore 가 보존돼 카운트 유지(R6 — HMR 모사).
  it("globalThis 싱글톤: 모듈 재평가(HMR 모사)해도 카운트 보존(R6)", async () => {
    await RateLimiterStore.recordApiCall();
    await RateLimiterStore.recordApiCall();
    await RateLimiterStore.recordApiCall();
    expect(await RateLimiterStore.getRecentCallCount(1)).toBe(3);

    // HMR 재평가 모사 — 모듈 캐시 무효화 후 store 재import.
    vi.resetModules();
    const reimported = await import("@/lib/dart/ratelimit/store");

    // globalThis 핸들이 유지되므로 카운트 증발 0 (R6 — checkpointer.ts 동형).
    expect(await reimported.RateLimiterStore.getRecentCallCount(1)).toBe(3);
    await reimported.RateLimiterStore.recordApiCall();
    expect(await reimported.RateLimiterStore.getRecentCallCount(1)).toBe(4);

    // 원본 핸들에서도 동일 state(같은 globalThis 싱글톤)
    expect(await RateLimiterStore.getRecentCallCount(1)).toBe(4);
  });

  // TC-48.7 — __resetForTest 후엔 새 state(이전 잔여 0)
  it("__resetForTest 후엔 새 state — blockState/timestamps 전부 초기화", async () => {
    await RateLimiterStore.recordApiCall();
    await RateLimiterStore.saveBlockState(true, Date.now(), "차단");
    expect((await RateLimiterStore.getBlockState()).isBlocked).toBe(true);

    RateLimiterStore.__resetForTest();

    expect(await RateLimiterStore.getRecentCallCount(1)).toBe(0);
    const bs = await RateLimiterStore.getBlockState();
    expect(bs.isBlocked).toBe(false);
    expect(bs.blockedAt).toBeNull();
    expect(bs.reason).toBeNull();
  });

  // store 보조 API 의 결정성 (LLM/네트워크 0 — 순수 인메모리)
  it("getStats / getRecentCallTimestamps 결정적 반환", async () => {
    await RateLimiterStore.recordApiCall();
    await RateLimiterStore.recordApiCall();
    const stats = await RateLimiterStore.getStats();
    expect(stats.totalLogs).toBe(2);
    expect(stats.lastMinuteCalls).toBe(2);
    expect(stats.lastHourCalls).toBe(2);
    expect(stats.blockState.isBlocked).toBe(false);

    const ts = await RateLimiterStore.getRecentCallTimestamps(1);
    expect(ts).toHaveLength(2);
    // 원본은 DESC 정렬 반환 (내림차순 보장)
    expect(ts[0]).toBeGreaterThanOrEqual(ts[1]);
  });

  it("clearBlockState: 차단 해제 결정적", async () => {
    await RateLimiterStore.saveBlockState(true, 123, "x");
    await RateLimiterStore.clearBlockState();
    const bs = await RateLimiterStore.getBlockState();
    expect(bs).toEqual({ isBlocked: false, blockedAt: null, reason: null });
  });

  // TC-48.9 — sql.js 의존 0 (인메모리 비-SQLite 확정 검증).
  // store 소스에 SQLite 계열 import/require 문이 0 이어야 한다.
  // (주석의 "sql.js 의존 0" 설명 문구는 허용 — import/require 문에서
  //  모듈 경로만 추출해 실제 의존만 판정.)
  it("TC-48.9: store.ts 소스에 sql.js / SQLite import/require 0", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      resolve(here, "../../src/lib/dart/ratelimit/store.ts"),
      "utf8",
    );

    const modulePaths: string[] = [];
    const importRe = /import[^"']*["']([^"']+)["']/g;
    const requireRe = /require\(\s*["']([^"']+)["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) modulePaths.push(m[1]);
    while ((m = requireRe.exec(src)) !== null) modulePaths.push(m[1]);

    const sqliteish = modulePaths.filter((p) =>
      /sql\.js|better-sqlite3|sqlite/.test(p),
    );
    expect(sqliteish).toEqual([]);
    // 외부 의존 없는 순수 인메모리(globalThis 싱글톤만)
    expect(src).toMatch(/globalThis/);
  });
});

describe("DART rate-limit — limiter 임계값/throttle/상태", () => {
  beforeEach(async () => {
    RateLimiterStore.__resetForTest();
    await resetRateLimiter();
  });

  afterEach(async () => {
    RateLimiterStore.__resetForTest();
    await resetRateLimiter();
    vi.restoreAllMocks();
  });

  it("recordApiCallSync 후 getRateLimitStateSync.currentMinuteCalls 증가, normal", async () => {
    // recordApiCallSync 는 fire-and-forget(recordApiCall().catch()) — 내부
    // cachedCallCount++ 가 마이크로태스크 후 반영되므로 sync 조회 전 await.
    recordApiCallSync();
    recordApiCallSync();
    recordApiCallSync();
    // recordApiCall 체인(store + checkAndNotifyStatus)이 풀릴 때까지 양보
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const state = getRateLimitStateSync();
    expect(state.currentMinuteCalls).toBe(3);
    expect(state.status).toBe("normal");
    expect(state.maxCallsPerMinute).toBe(1000);
    expect(state.isBlocked).toBe(false);
  });

  it("호출량 0 → normal, canMakeRequest()=true, throttle 0", () => {
    const state = getRateLimitStateSync();
    expect(state.status).toBe("normal");
    expect(canMakeRequest()).toBe(true);
    expect(getThrottleDelay()).toBe(0);
  });

  // 임계값 경계: getRateLimitStateSync 는 cachedCallCount(buildState)로
  // status 를 산출한다. recordApiCall(awaited)은 line "cachedCallCount++"
  // 로 캐시를 직접 증가시킨다(CACHE_TTL 무관 — getRateLimitState 의
  // store 재조회 경로를 안 탐). 따라서 await recordApiCall N회면
  // cachedCallCount 가 결정적으로 N 이 된다(resetRateLimiter 가 0 으로
  // 선리셋). store 직접 주입 불요 — 모듈 캐시를 공개 API 로만 결정화.
  async function setCallCount(n: number): Promise<void> {
    RateLimiterStore.__resetForTest();
    await resetRateLimiter(); // cachedCallCount=0, blockState clear
    for (let i = 0; i < n; i++) {
      await recordApiCall();
    }
  }

  it("50% 경계(500/1000) → caution, throttle 200", async () => {
    await setCallCount(500);
    const state = getRateLimitStateSync();
    expect(state.currentMinuteCalls).toBe(500);
    expect(state.usagePercent).toBe(50);
    expect(state.status).toBe("caution");
    expect(getThrottleDelay()).toBe(200);
    expect(canMakeRequest()).toBe(true);
  });

  it("49.9%(499/1000) → 아직 normal (경계 미만)", async () => {
    await setCallCount(499);
    const state = getRateLimitStateSync();
    expect(state.status).toBe("normal");
    expect(getThrottleDelay()).toBe(0);
  });

  it("70% 경계(700/1000) → warning, throttle 1000", async () => {
    await setCallCount(700);
    const state = getRateLimitStateSync();
    expect(state.usagePercent).toBe(70);
    expect(state.status).toBe("warning");
    expect(getThrottleDelay()).toBe(1000);
    expect(canMakeRequest()).toBe(true);
  });

  it("90% 경계(900/1000) → danger, throttle 5000, canMakeRequest=false", async () => {
    await setCallCount(900);
    const state = getRateLimitStateSync();
    expect(state.usagePercent).toBe(90);
    expect(state.status).toBe("danger");
    expect(getThrottleDelay()).toBe(5000);
    expect(canMakeRequest()).toBe(false);
  });

  // reportConnectionErrorSync(ECONNRESET) → 차단 상태 전환.
  // Sync 는 내부 비동기를 catch 만 하므로 await 가능한 async 버전으로
  // 결정화(시그니처 동일, Sync 는 fire-and-forget 래퍼).
  it("reportConnectionError(ECONNRESET) 후 isBlocked=true, throttle -1, canMakeRequest=false", async () => {
    const err = new Error("ECONNRESET") as NodeJS.ErrnoException;
    err.code = "ECONNRESET";
    await reportConnectionError(err);

    const state = getRateLimitStateSync();
    expect(state.isBlocked).toBe(true);
    expect(state.status).toBe("blocked");
    expect(getThrottleDelay()).toBe(-1);
    expect(canMakeRequest()).toBe(false);
  });

  it("reportConnectionErrorSync 도 동일 시그니처로 호출 가능(차단 전환)", async () => {
    const err = new Error("Connection reset by peer");
    reportConnectionErrorSync(err);
    // Sync 는 fire-and-forget — 비동기 완료를 마이크로태스크 후 관찰
    await Promise.resolve();
    await Promise.resolve();
    const state = await getRateLimitState();
    expect(state.isBlocked).toBe(true);
  });

  it("일반 에러(ECONNRESET 아님)는 차단 전환 안 함", async () => {
    await reportConnectionError(new Error("timeout"));
    const state = getRateLimitStateSync();
    expect(state.isBlocked).toBe(false);
    expect(state.status).toBe("normal");
  });

  // 차단 상태에서 blocked 가 danger 보다 우선(status 결정 순서)
  it("차단 중이면 호출량 무관하게 status=blocked, remainingMinutes 산출", async () => {
    const err = new Error("ECONNRESET") as NodeJS.ErrnoException;
    err.code = "ECONNRESET";
    await reportConnectionError(err);
    const state = await getRateLimitState();
    expect(state.status).toBe("blocked");
    expect(state.isBlocked).toBe(true);
    expect(state.remainingMinutes).not.toBeNull();
    expect(state.remainingMinutes!).toBeGreaterThan(0);
    expect(state.remainingMinutes!).toBeLessThanOrEqual(60);
  });
});

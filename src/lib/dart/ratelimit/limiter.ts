/**
 * DART API Rate Limiter — 임계값 판정·throttle·상태 알고리즘.
 *
 * 이식 출처: medigate `rate-limiter.ts`(10fb7f4, 431줄). 알고리즘 본문은
 * 자기완결적이라 그대로 이식(STRUCTURAL #1 "public 시그니처 불변 →
 * 호출부 diff 0"). 변경점은 단 2가지:
 *   1. store import 경로 → `./store`(인메모리, OPEN-1 (c)). sql.js 0.
 *   2. 모듈 로드 시 `loadStateFromStore()` 즉시 호출 제거 — 인메모리
 *      store 는 빈 상태에서 시작하므로 복원 불요. 첫 조회 시 lazy 로
 *      충분(원본의 sql.js 파일 로드 목적이 사라짐). 동작 동등.
 *
 * DART OpenAPI 제한: 분당 1,000회, 초과 시 IP 약 1시간 차단.
 * public export 15종 시그니처는 원본과 1:1 동일(D2 무수정 소비).
 */

import { RateLimiterStore } from "./store";

// ==================== 상수 ====================

/** DART API 분당 최대 호출 수 */
const MAX_CALLS_PER_MINUTE = 1000;

/** 경고 임계치 (%) */
const WARNING_THRESHOLDS = {
  CAUTION: 0.5, // 50% - 주의
  WARNING: 0.7, // 70% - 경고
  DANGER: 0.9, // 90% - 위험
};

/** 차단 지속 시간 (1시간) */
const BLOCK_DURATION_MS = 60 * 60 * 1000;

// ==================== 타입 ====================

export type DartApiStatus =
  | "normal"
  | "caution"
  | "warning"
  | "danger"
  | "blocked";

export interface RateLimitState {
  /** 현재 상태 */
  status: DartApiStatus;
  /** 현재 분 내 호출 수 */
  currentMinuteCalls: number;
  /** 분당 최대 호출 수 */
  maxCallsPerMinute: number;
  /** 사용률 (0-100) */
  usagePercent: number;
  /** 차단 여부 */
  isBlocked: boolean;
  /** 차단 시작 시간 (차단된 경우) */
  blockedAt: number | null;
  /** 차단 해제 예상 시간 (차단된 경우) */
  unblockAt: number | null;
  /** 차단 해제까지 남은 시간 (분) */
  remainingMinutes: number | null;
  /** 마지막 업데이트 시간 */
  lastUpdated: number;
  /** 상태 메시지 */
  message: string;
}

// ==================== 메모리 캐시 (빠른 조회용) ====================

let cachedBlockState: {
  isBlocked: boolean;
  blockedAt: number | null;
  reason: string | null;
} | null = null;

let cachedCallCount: number = 0;
let cacheLastUpdated: number = 0;
const CACHE_TTL = 1000; // 1초 캐시

/** 상태 변경 리스너 */
type StatusChangeListener = (state: RateLimitState) => void;
const statusListeners: StatusChangeListener[] = [];

// ==================== 초기화 ====================

/**
 * store 에서 상태 로드 (인메모리라 빈 상태에서 시작 — lazy).
 * 원본은 모듈 로드 시 즉시 호출했으나(sql.js 파일 로드 목적), 인메모리
 * store 는 복원할 영속분이 없어 첫 조회 직전 lazy 호출로 충분.
 */
async function loadStateFromStore(): Promise<void> {
  try {
    cachedBlockState = await RateLimiterStore.getBlockState();
    cachedCallCount = await RateLimiterStore.getRecentCallCount(1);
    cacheLastUpdated = Date.now();

    // 차단 상태 자동 해제 체크
    if (cachedBlockState.isBlocked && cachedBlockState.blockedAt) {
      const elapsed = Date.now() - cachedBlockState.blockedAt;
      if (elapsed >= BLOCK_DURATION_MS) {
        await clearBlockedState();
      }
    }
  } catch (error) {
    console.error("[DART Rate Limiter] Failed to load state:", error);
    cachedBlockState = { isBlocked: false, blockedAt: null, reason: null };
    cachedCallCount = 0;
  }
}

// ==================== 핵심 함수 ====================

/**
 * API 호출 기록. 모든 DART API 호출 전에 호출해야 한다.
 */
export async function recordApiCall(endpoint: string = ""): Promise<void> {
  try {
    await RateLimiterStore.recordApiCall(endpoint);
    cachedCallCount++;
    cacheLastUpdated = Date.now();
    await checkAndNotifyStatus();
  } catch (error) {
    console.error("[DART Rate Limiter] Failed to record API call:", error);
  }
}

/** 동기 버전 (호출부 호환용 — 결과 대기 안 함) */
export function recordApiCallSync(endpoint: string = ""): void {
  recordApiCall(endpoint).catch(console.error);
}

/**
 * ECONNRESET 또는 연결 오류 감지 시 호출 → 차단 상태 전환.
 */
export async function reportConnectionError(error: Error): Promise<void> {
  const errorMessage = error.message || "";
  const errorCode = (error as NodeJS.ErrnoException).code;

  if (
    errorCode === "ECONNRESET" ||
    errorMessage.includes("ECONNRESET") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("Connection reset")
  ) {
    console.error(
      "[DART Rate Limiter] Connection error detected, marking as blocked:",
      errorMessage,
    );

    const blockedAt = Date.now();
    const reason =
      "DART API 연결이 차단되었습니다. 과다한 API 호출로 인해 약 1시간 동안 접속이 제한됩니다.";

    await RateLimiterStore.saveBlockState(true, blockedAt, reason);
    cachedBlockState = { isBlocked: true, blockedAt, reason };
    await notifyStatusChange();
  }
}

/** 동기 버전 (호출부 호환용) */
export function reportConnectionErrorSync(error: Error): void {
  reportConnectionError(error).catch(console.error);
}

/**
 * 차단 상태 해제 (수동 해제용).
 */
export async function clearBlockedState(): Promise<void> {
  await RateLimiterStore.clearBlockState();
  cachedBlockState = { isBlocked: false, blockedAt: null, reason: null };
  await notifyStatusChange();
}

/** 동기 버전 (호출부 호환용) */
export function clearBlockedStateSync(): void {
  clearBlockedState().catch(console.error);
}

/**
 * 현재 Rate Limit 상태 조회 (캐시 갱신 포함).
 */
export async function getRateLimitState(): Promise<RateLimitState> {
  const now = Date.now();

  if (now - cacheLastUpdated > CACHE_TTL) {
    try {
      cachedBlockState = await RateLimiterStore.getBlockState();
      cachedCallCount = await RateLimiterStore.getRecentCallCount(1);
      cacheLastUpdated = now;
    } catch (error) {
      console.error("[DART Rate Limiter] Failed to refresh cache:", error);
    }
  }

  if (cachedBlockState?.isBlocked && cachedBlockState.blockedAt) {
    const elapsedSinceBlock = now - cachedBlockState.blockedAt;
    if (elapsedSinceBlock >= BLOCK_DURATION_MS) {
      await clearBlockedState();
    }
  }

  return buildState(now);
}

/**
 * 동기 버전 (캐시된 값 사용 — 조회만, store 미접근).
 */
export function getRateLimitStateSync(): RateLimitState {
  return buildState(Date.now());
}

/**
 * cachedBlockState/cachedCallCount 로부터 RateLimitState 산출 (순수).
 * 원본의 동기/비동기 두 곳에 중복됐던 상태 결정 로직을 단일화 —
 * 외부 시그니처(반환 형태)는 원본과 1:1 동일(STRUCTURAL #1 불변).
 */
function buildState(now: number): RateLimitState {
  const currentMinuteCalls = cachedCallCount;
  const usagePercent = (currentMinuteCalls / MAX_CALLS_PER_MINUTE) * 100;

  let status: DartApiStatus;
  let message: string;

  if (cachedBlockState?.isBlocked) {
    status = "blocked";
    const remainingMs = cachedBlockState.blockedAt
      ? BLOCK_DURATION_MS - (now - cachedBlockState.blockedAt)
      : BLOCK_DURATION_MS;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    message = `DART API 차단됨. 약 ${remainingMinutes}분 후 복구 예정`;
  } else if (usagePercent >= WARNING_THRESHOLDS.DANGER * 100) {
    status = "danger";
    message = `API 호출량 위험 수준 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else if (usagePercent >= WARNING_THRESHOLDS.WARNING * 100) {
    status = "warning";
    message = `API 호출량 경고 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else if (usagePercent >= WARNING_THRESHOLDS.CAUTION * 100) {
    status = "caution";
    message = `API 호출량 주의 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else {
    status = "normal";
    message = "DART API 정상";
  }

  let unblockAt: number | null = null;
  let remainingMinutes: number | null = null;

  if (cachedBlockState?.isBlocked && cachedBlockState.blockedAt) {
    unblockAt = cachedBlockState.blockedAt + BLOCK_DURATION_MS;
    remainingMinutes = Math.ceil((unblockAt - now) / 60000);
    if (remainingMinutes < 0) remainingMinutes = 0;
  }

  return {
    status,
    currentMinuteCalls,
    maxCallsPerMinute: MAX_CALLS_PER_MINUTE,
    usagePercent: Math.round(usagePercent * 10) / 10,
    isBlocked: cachedBlockState?.isBlocked || false,
    blockedAt: cachedBlockState?.blockedAt || null,
    unblockAt,
    remainingMinutes,
    lastUpdated: now,
    message,
  };
}

/**
 * 요청 허용 여부 (차단/위험이면 false).
 */
export function canMakeRequest(): boolean {
  const state = getRateLimitStateSync();
  return !state.isBlocked && state.status !== "danger";
}

/**
 * 요청 전 대기 시간(ms) 반환. -1=차단(불가).
 */
export function getThrottleDelay(): number {
  const state = getRateLimitStateSync();
  if (state.isBlocked) return -1;
  if (state.status === "danger") return 5000;
  if (state.status === "warning") return 1000;
  if (state.status === "caution") return 200;
  return 0;
}

// ==================== 리스너 ====================

/** 상태 변경 리스너 등록 (해제 함수 반환) */
export function onStatusChange(listener: StatusChangeListener): () => void {
  statusListeners.push(listener);
  return () => {
    const index = statusListeners.indexOf(listener);
    if (index > -1) statusListeners.splice(index, 1);
  };
}

async function notifyStatusChange(): Promise<void> {
  const state = await getRateLimitState();
  statusListeners.forEach((listener) => {
    try {
      listener(state);
    } catch (e) {
      console.error("[DART Rate Limiter] Listener error:", e);
    }
  });
}

let lastNotifiedStatus: DartApiStatus | null = null;

async function checkAndNotifyStatus(): Promise<void> {
  const state = await getRateLimitState();
  if (state.status !== lastNotifiedStatus) {
    lastNotifiedStatus = state.status;
    if (state.status !== "normal") {
      console.warn(
        `[DART Rate Limiter] Status changed: ${state.status} - ${state.message}`,
      );
    }
    await notifyStatusChange();
  }
}

// ==================== 유틸리티 ====================

/** Rate Limiter 상태 초기화 */
export async function resetRateLimiter(): Promise<void> {
  await RateLimiterStore.clearBlockState();
  cachedBlockState = { isBlocked: false, blockedAt: null, reason: null };
  cachedCallCount = 0;
  lastNotifiedStatus = null;
}

/** 디버그용 현재 상태 로그 */
export async function logRateLimitStatus(): Promise<void> {
  const state = await getRateLimitState();
  const stats = await RateLimiterStore.getStats();
  console.log("[DART Rate Limiter]", {
    status: state.status,
    calls: `${state.currentMinuteCalls}/${state.maxCallsPerMinute}`,
    usage: `${state.usagePercent}%`,
    blocked: state.isBlocked,
    message: state.message,
    storeStats: stats,
  });
}

/** 첫 조회 전 상태 복원 (인메모리 — 거의 no-op, 원본 동작 동등) */
export { loadStateFromStore };

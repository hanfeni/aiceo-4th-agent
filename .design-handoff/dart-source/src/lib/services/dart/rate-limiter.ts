/**
 * DART API Rate Limiter
 *
 * DART OpenAPI 제한사항:
 * - 분당 1,000회 호출 제한
 * - 초과 시 IP 차단 (약 1시간)
 *
 * 이 서비스는 호출 수를 추적하고 제한에 근접하면 경고를 발생시킵니다.
 * SQLite에 호출 기록과 차단 상태를 영구 저장합니다.
 */

import { RateLimiterStore } from './rate-limiter-store';

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

export type DartApiStatus = 'normal' | 'caution' | 'warning' | 'danger' | 'blocked';

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
 * 서버 시작 시 SQLite에서 상태 로드
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

    console.log('[DART Rate Limiter] State loaded from store:', {
      isBlocked: cachedBlockState.isBlocked,
      callCount: cachedCallCount,
    });
  } catch (error) {
    console.error('[DART Rate Limiter] Failed to load state:', error);
    cachedBlockState = { isBlocked: false, blockedAt: null, reason: null };
    cachedCallCount = 0;
  }
}

// 모듈 로드 시 상태 복원 (비동기)
loadStateFromStore();

// ==================== 핵심 함수 ====================

/**
 * API 호출 기록
 * 모든 DART API 호출 전에 이 함수를 호출해야 합니다.
 */
export async function recordApiCall(endpoint: string = ''): Promise<void> {
  try {
    await RateLimiterStore.recordApiCall(endpoint);
    cachedCallCount++;
    cacheLastUpdated = Date.now();

    // 상태 체크 및 알림
    await checkAndNotifyStatus();
  } catch (error) {
    console.error('[DART Rate Limiter] Failed to record API call:', error);
  }
}

/**
 * 동기 버전 (기존 코드 호환용)
 */
export function recordApiCallSync(endpoint: string = ''): void {
  // 비동기로 기록 (결과 대기 안함)
  recordApiCall(endpoint).catch(console.error);
}

/**
 * ECONNRESET 또는 연결 오류 감지 시 호출
 * 차단 상태로 전환합니다.
 */
export async function reportConnectionError(error: Error): Promise<void> {
  const errorMessage = error.message || '';
  const errorCode = (error as NodeJS.ErrnoException).code;

  // ECONNRESET 또는 연결 관련 오류 감지
  if (
    errorCode === 'ECONNRESET' ||
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('Connection reset')
  ) {
    console.error('[DART Rate Limiter] Connection error detected, marking as blocked:', errorMessage);

    const blockedAt = Date.now();
    const reason = 'DART API 연결이 차단되었습니다. 과다한 API 호출로 인해 약 1시간 동안 접속이 제한됩니다.';

    // SQLite에 저장
    await RateLimiterStore.saveBlockState(true, blockedAt, reason);

    // 캐시 업데이트
    cachedBlockState = { isBlocked: true, blockedAt, reason };

    // 상태 변경 알림
    await notifyStatusChange();
  }
}

/**
 * 동기 버전 (기존 코드 호환용)
 */
export function reportConnectionErrorSync(error: Error): void {
  reportConnectionError(error).catch(console.error);
}

/**
 * 차단 상태 해제
 * 수동으로 차단 해제할 때 사용합니다.
 */
export async function clearBlockedState(): Promise<void> {
  await RateLimiterStore.clearBlockState();
  cachedBlockState = { isBlocked: false, blockedAt: null, reason: null };
  console.log('[DART Rate Limiter] Block state cleared');
  await notifyStatusChange();
}

/**
 * 동기 버전 (기존 코드 호환용)
 */
export function clearBlockedStateSync(): void {
  clearBlockedState().catch(console.error);
}

/**
 * 현재 Rate Limit 상태 조회
 */
export async function getRateLimitState(): Promise<RateLimitState> {
  const now = Date.now();

  // 캐시 갱신 필요 여부 확인
  if (now - cacheLastUpdated > CACHE_TTL) {
    try {
      cachedBlockState = await RateLimiterStore.getBlockState();
      cachedCallCount = await RateLimiterStore.getRecentCallCount(1);
      cacheLastUpdated = now;
    } catch (error) {
      console.error('[DART Rate Limiter] Failed to refresh cache:', error);
    }
  }

  // 차단 상태 자동 해제 체크
  if (cachedBlockState?.isBlocked && cachedBlockState.blockedAt) {
    const elapsedSinceBlock = now - cachedBlockState.blockedAt;
    if (elapsedSinceBlock >= BLOCK_DURATION_MS) {
      await clearBlockedState();
    }
  }

  const currentMinuteCalls = cachedCallCount;
  const usagePercent = (currentMinuteCalls / MAX_CALLS_PER_MINUTE) * 100;

  // 상태 결정
  let status: DartApiStatus;
  let message: string;

  if (cachedBlockState?.isBlocked) {
    status = 'blocked';
    const remainingMs = cachedBlockState.blockedAt
      ? BLOCK_DURATION_MS - (now - cachedBlockState.blockedAt)
      : BLOCK_DURATION_MS;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    message = `DART API 차단됨. 약 ${remainingMinutes}분 후 복구 예정`;
  } else if (usagePercent >= WARNING_THRESHOLDS.DANGER * 100) {
    status = 'danger';
    message = `API 호출량 위험 수준 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else if (usagePercent >= WARNING_THRESHOLDS.WARNING * 100) {
    status = 'warning';
    message = `API 호출량 경고 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else if (usagePercent >= WARNING_THRESHOLDS.CAUTION * 100) {
    status = 'caution';
    message = `API 호출량 주의 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else {
    status = 'normal';
    message = 'DART API 정상';
  }

  // 차단 관련 시간 계산
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
 * 동기 버전 (캐시된 값 사용)
 */
export function getRateLimitStateSync(): RateLimitState {
  const now = Date.now();
  const currentMinuteCalls = cachedCallCount;
  const usagePercent = (currentMinuteCalls / MAX_CALLS_PER_MINUTE) * 100;

  let status: DartApiStatus;
  let message: string;

  if (cachedBlockState?.isBlocked) {
    status = 'blocked';
    const remainingMs = cachedBlockState.blockedAt
      ? BLOCK_DURATION_MS - (now - cachedBlockState.blockedAt)
      : BLOCK_DURATION_MS;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    message = `DART API 차단됨. 약 ${remainingMinutes}분 후 복구 예정`;
  } else if (usagePercent >= WARNING_THRESHOLDS.DANGER * 100) {
    status = 'danger';
    message = `API 호출량 위험 수준 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else if (usagePercent >= WARNING_THRESHOLDS.WARNING * 100) {
    status = 'warning';
    message = `API 호출량 경고 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else if (usagePercent >= WARNING_THRESHOLDS.CAUTION * 100) {
    status = 'caution';
    message = `API 호출량 주의 (${currentMinuteCalls}/${MAX_CALLS_PER_MINUTE})`;
  } else {
    status = 'normal';
    message = 'DART API 정상';
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
 * 요청 허용 여부 확인
 * 차단 상태이거나 위험 수준이면 false 반환
 */
export function canMakeRequest(): boolean {
  const state = getRateLimitStateSync();
  return !state.isBlocked && state.status !== 'danger';
}

/**
 * 요청 전 대기 필요 여부 및 대기 시간 반환
 */
export function getThrottleDelay(): number {
  const state = getRateLimitStateSync();

  if (state.isBlocked) {
    return -1; // 차단됨, 요청 불가
  }

  if (state.status === 'danger') {
    return 5000; // 5초 대기
  }

  if (state.status === 'warning') {
    return 1000; // 1초 대기
  }

  if (state.status === 'caution') {
    return 200; // 200ms 대기
  }

  return 0; // 대기 불필요
}

// ==================== 리스너 ====================

/**
 * 상태 변경 리스너 등록
 */
export function onStatusChange(listener: StatusChangeListener): () => void {
  statusListeners.push(listener);
  return () => {
    const index = statusListeners.indexOf(listener);
    if (index > -1) {
      statusListeners.splice(index, 1);
    }
  };
}

/**
 * 상태 변경 알림
 */
async function notifyStatusChange(): Promise<void> {
  const state = await getRateLimitState();
  statusListeners.forEach((listener) => {
    try {
      listener(state);
    } catch (e) {
      console.error('[DART Rate Limiter] Listener error:', e);
    }
  });
}

/**
 * 상태 체크 및 필요시 알림
 */
let lastNotifiedStatus: DartApiStatus | null = null;

async function checkAndNotifyStatus(): Promise<void> {
  const state = await getRateLimitState();

  // 상태가 변경되었거나 위험 수준 이상이면 알림
  if (state.status !== lastNotifiedStatus) {
    lastNotifiedStatus = state.status;

    // 콘솔 로그 (개발용)
    if (state.status !== 'normal') {
      console.warn(`[DART Rate Limiter] Status changed: ${state.status} - ${state.message}`);
    }

    await notifyStatusChange();
  }
}

// ==================== 유틸리티 ====================

/**
 * Rate Limiter 상태 초기화
 */
export async function resetRateLimiter(): Promise<void> {
  await RateLimiterStore.clearBlockState();
  cachedBlockState = { isBlocked: false, blockedAt: null, reason: null };
  cachedCallCount = 0;
  lastNotifiedStatus = null;
  console.log('[DART Rate Limiter] Reset complete');
}

/**
 * 디버그용 현재 상태 로그
 */
export async function logRateLimitStatus(): Promise<void> {
  const state = await getRateLimitState();
  const stats = await RateLimiterStore.getStats();
  console.log('[DART Rate Limiter]', {
    status: state.status,
    calls: `${state.currentMinuteCalls}/${state.maxCallsPerMinute}`,
    usage: `${state.usagePercent}%`,
    blocked: state.isBlocked,
    message: state.message,
    storeStats: stats,
  });
}

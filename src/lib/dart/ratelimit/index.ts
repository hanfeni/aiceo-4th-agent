/**
 * DART rate-limit 배럴 (re-export 허용 예외 — 등록 지점).
 *
 *  - store  : 인메모리 RateLimiterStore (OPEN-1 (c), R6 globalThis 싱글톤)
 *  - limiter: 임계값 판정·throttle·상태 (원본 시그니처 불변)
 *
 * D2 `api/client.ts` 는 limiter 의 recordApiCallSync/canMakeRequest/
 * getThrottleDelay/reportConnectionErrorSync/getRateLimitStateSync 를
 * 원본과 동일 시그니처로 소비(STRUCTURAL #1 — 호출부 diff 0).
 */
export * from "./store";
export * from "./limiter";

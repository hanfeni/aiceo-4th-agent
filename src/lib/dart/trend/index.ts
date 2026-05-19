/**
 * DART 트렌드 배럴 (re-export 허용 예외 — 등록 지점).
 *
 * 원본 medigate `trend.service.ts`(1114줄, 단일) → 기능축 5분리
 * (STRUCTURAL #2). 소비처(D5 context-formatter / D6 dartTool)는
 * `@/lib/dart/trend` 단일 진입점만 import.
 *
 *  - cache      : 요청 레벨 재무제표 캐시 + preload
 *  - financial  : 재무 트렌드(annual/quarterly/cumulative) + 디스패처 + 성장률
 *  - points     : 데이터포인트 생성 (financial.ts 예산 분리 — STRUCTURAL #2)
 *  - workforce  : 인력 트렌드 (연간·반기 가용성)
 *  - governance : 지배구조 트렌드 (연간·반기 가용성)
 *  - dividend   : 배당 트렌드 (연간만 가용)
 *
 * gemini 의존 0 (원본도 0 — FR-27).
 */
export * from "./cache";
export * from "./financial";
export * from "./points";
export * from "./workforce";
export * from "./governance";
export * from "./dividend";

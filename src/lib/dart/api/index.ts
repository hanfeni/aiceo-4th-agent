/**
 * DART OpenAPI 클라이언트 배럴 (re-export 허용 예외 — 등록 지점).
 *
 * 원본 medigate `dart-api.ts`(1234줄, 단일) → 기능축 4분리
 * (STRUCTURAL #2). 소비처(dart-api.service / D4 trend·disclosure)는
 * `@/lib/dart/api` 단일 진입점만 import.
 *
 *  - client     : 키 격리·SSRF 방어 fetch 코어 + 캐시 + corpCode ZIP
 *  - company    : 기업 검색 + 개황(corpCode 해석)
 *  - financial  : 재무제표·직원·주주·임원·배당 (snake→camel)
 *  - disclosure : 공시목록·자회사·감사·가용기간
 *  - securities : 증권발행 5종(유상증자·CB·EB·BW) — 자본거래 축
 *
 * gemini/perplexity/auth/next-server 의존 0 (FR-27 — 원본도 0).
 */
export * from "./client";
export * from "./company";
export * from "./financial";
export * from "./disclosure";
export * from "./securities";

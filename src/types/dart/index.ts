/**
 * DART 타입 배럴 — 4 기능축 모듈 re-export (스펙 디렉토리 원칙의
 * re-export 허용 예외, webSearcher subagents/index.ts 와 동일 패턴).
 *
 * 원본 medigate `types/dart.ts`(1374줄, 단일) → 기능축 4분리
 * (STRUCTURAL #2). 소비처는 `@/types/dart` 단일 진입점만 import.
 *
 *  - entities   : 회사/재무/인력/지배구조/배당/공시 + API 봉투 + 보고서코드
 *  - securities : 자회사/감사의견/증권발행 5종 + 공시 문서 파싱 구조
 *  - indicators : 지표 그룹/정의/가용성/표시설정 + getIndicatorDeltaConfig
 *  - trend      : 시계열 데이터 포인트 + 가용 기간
 */
export * from "./entities";
export * from "./securities";
export * from "./indicators";
export * from "./trend";

/**
 * DART 재무지표 계산기 배럴 (re-export 허용 예외 — 등록 지점).
 *
 * 원본 medigate `indicator-calculator.ts`(1386줄, 단일) → 기능축 6분리
 * (STRUCTURAL #2). 소비처(D5 context-formatter / D4 trend)는
 * `@/lib/dart/indicators` 단일 진입점만 import.
 *
 *  - definitions: 지표 카탈로그 + 분류 Set + 계정과목 매핑(순수 상수)
 *  - extract    : 통화 정규화 + 계정 매칭 + 당기/전기/누적 추출
 *  - classify   : 지표 종류 판정 + 계정과목명 조회
 *  - ratio      : 당기/전기 비율·금액 지표 계산
 *  - efficiency : 분기 회전율 연환산 + 4Q 단위금액(특수 로직)
 *  - groups     : 전체/그룹/인력/지배구조/배당 종합 조립
 */
export * from "./definitions";
export * from "./extract";
export * from "./classify";
export * from "./ratio";
export * from "./efficiency";
export * from "./groups";

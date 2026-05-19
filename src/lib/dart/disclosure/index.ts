/**
 * DART 공시 원문 파서 배럴 (re-export 허용 예외 — 등록 지점).
 *
 * 원본 medigate `disclosure-parser.service.ts`(877줄) 중 분석에
 * 실제 쓰이는 전문 모드만 이식(STRUCTURAL #4 — gemini 0). 소비처
 * (D6 dartTool)는 `@/lib/dart/disclosure` 단일 진입점만 import.
 *
 *  - types  : parser 전용 로컬 타입(securities.ts 와 이름 격리)
 *  - parser : ZIP/XML 원문 추출 (zip-slip·XML폭탄 방어, gemini 0)
 *  - context: 비상장사 공시 맥락 (전문 모드 전용)
 */
export * from "./types";
export * from "./parser";
export * from "./context";

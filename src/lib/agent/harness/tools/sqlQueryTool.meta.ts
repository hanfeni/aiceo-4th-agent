/**
 * sqlQueryTool 표시 메타 (경량 모듈 — 의존 0).
 *
 * indexSearchTool.meta.ts 와 동일 분리 이유(보안): sqlQueryTool.ts
 * 는 runText2Sql → getDb(better-sqlite3 네이티브)·createModel 을
 * import(서버 전용·무거움). 클라이언트(thinkingLabels)는 표시명만
 * 필요 → 네이티브 SDK 가 클라 번들로 누출되지 않도록 분리.
 *
 * 도구는 도메인별 팩토리(makeSqlQueryTool)로 생성되나 .name 은
 * 단일("sql_query") — 사고패널/introspect 매핑 키 1개로 충분
 * (도메인은 세션 정체성이라 도구명에 안 박음).
 */

import { z } from "zod";

/** 사고 패널 한글 표시명 (FR-08 — 도구가 선언). ClientTool .name 키. */
export const sqlQueryToolDisplayName = "데이터 조회 (SQL)";

/**
 * 카탈로그용 LLM 명세 schema — 팩토리(makeSqlQueryTool) 내부 schema 와
 * 동일(도메인 무관). /harness introspect 가 파라미터 표·명세를 표시한다.
 * 팩토리 schema 와 단일 출처(정합).
 */
export const sqlQueryToolSchema = z.object({
  sql: z
    .string()
    .describe(
      "실행할 SELECT(또는 WITH) SQL 한 문장. 도구 설명의 스키마(테이블·" +
        "컬럼·샘플)를 보고 직접 작성. 세미콜론·여러 문장·쓰기 구문 금지" +
        "(읽기 전용).",
    ),
});

/**
 * ClientTool 설명 (introspect 가 .description 우선). 순수 실행기:
 * LLM 이 아래 동적 주입 스키마를 보고 **직접 SELECT SQL 을 작성**해
 * sql 인자로 넘긴다. 도구는 읽기 전용 가드 후 실행해 결과만 반환
 * (도구 내부 LLM 없음 — 사용자 결정 2026-05-19).
 * makeSqlQueryTool 이 뒤에 세션 도메인 스키마 텍스트를 이어붙인다.
 */
export const sqlQueryToolDescription =
  "선택된 도메인의 적재된 SQLite 테이블에 SELECT 쿼리를 실행해 결과 " +
  "표를 반환하는 읽기 전용 실행기다. 집계·정렬·필터 등 구조화 " +
  "데이터(상권·의료·금융·법률·정책 중 세션에서 고른 하나) 조회에 " +
  "사용. 아래 스키마를 보고 SQL 을 직접 작성해 sql 인자로 넘겨라.";

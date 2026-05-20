import { tool } from "langchain";
import { z } from "zod";
import { getDb } from "@/lib/sqllab/db";
import { getSchema } from "@/lib/sqllab/load";
import { assertReadOnly } from "@/lib/sqllab/text2sql";
import { type SqlDomain } from "@/lib/sqllab/domains";
import { getSqlDomainSpec } from "@/lib/sqllab/dynamicDomains";

/**
 * 데이터 조회(SQL) ClientTool — **순수 쿼리 실행기**.
 *
 * 사용자 결정 2026-05-19(2회 강조): 도구 내부에서 자연어→SQL 변환
 * (LLM)을 하지 않는다. 메인 챗 LLM 이 **도구 사전 정보(description)
 * 의 스키마를 보고 직접 SQL 을 작성**해 인자로 넘기면, 도구는 읽기
 * 전용 가드 후 실행해 **결과만 반환**한다. 도구 내부 LLM 0(이중
 * 비용·블랙박스 제거 — text2sql.ts 의 runText2Sql 미사용).
 *
 * 스키마 주입: makeSqlQueryTool(domain) 호출 시점(그래프 빌드=세션
 * 시작)에 getSchema(domain) 로 테이블·컬럼·샘플행을 1회 읽어
 * description 텍스트에 박는다. 세션 동안 스키마 고정 — LLM 은 도구
 * 설명만 보고 SQL 작성(호출 1회). 적재 후 선택했으면 세션 리프레시
 * (드롭다운 재선택)로 재빌드 → 스키마 갱신.
 *
 * 안전: assertReadOnly(text2sql.ts 재사용 — SELECT/WITH 만, 다중문
 * ·DDL·DML·PRAGMA 차단) + better-sqlite3 stmt.reader 이중 가드.
 * graceful(throw 0 — NFR-18). domain 클로저 바인딩(세션 정체성).
 */

export {
  sqlQueryToolDisplayName,
  sqlQueryToolDescription,
} from "./sqlQueryTool.meta";
import { sqlQueryToolDescription } from "./sqlQueryTool.meta";

const TOOL_MAX_ROWS = 30; // 결과 행 상한(LLM 컨텍스트·폭주 방지)

/** 결과 행을 LLM 가독 텍스트로(컬럼 헤더 + 행, 상한). */
function formatRows(columns: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "(결과 0행)";
  const head = columns.join(" | ");
  const body = rows
    .slice(0, TOOL_MAX_ROWS)
    .map((r) => r.map((c) => String(c ?? "")).join(" | "))
    .join("\n");
  const more =
    rows.length > TOOL_MAX_ROWS
      ? `\n… 외 ${rows.length - TOOL_MAX_ROWS}행(상한 ${TOOL_MAX_ROWS})`
      : "";
  return `${head}\n${body}${more}`;
}

/**
 * 도구 사전 정보(description)에 박을 스키마 텍스트 생성.
 * 미적재면 안내 문구(도구는 그래도 등록 — 실행 시 graceful).
 */
function schemaText(domain: SqlDomain): string {
  const label = getSqlDomainSpec(domain).label;
  let schema: ReturnType<typeof getSchema> = null;
  try {
    schema = getSchema(domain);
  } catch {
    schema = null;
  }
  if (!schema) {
    return (
      `\n\n[세션 도메인: ${label}] ⚠ 이 도메인 테이블이 아직 ` +
      `적재되지 않았습니다. "데이터 적재" 메뉴에서 적재 후 우측 ` +
      `드롭다운을 다시 선택(세션 리프레시)하면 스키마가 채워집니다.`
    );
  }
  const sample = schema.sampleRow
    ? JSON.stringify(schema.sampleRow).slice(0, 600)
    : "(샘플 없음)";
  return (
    `\n\n[세션 도메인: ${label}] 아래 스키마로 SELECT 쿼리를 직접 ` +
    `작성해 sql 인자로 넘기세요(읽기 전용).\n` +
    `테이블: "${schema.table}"\n` +
    `컬럼(${schema.columns.length}개, 전부 TEXT — 숫자 비교·정렬·` +
    `합계는 CAST(컬럼 AS INTEGER/REAL) 사용):\n` +
    schema.columns.map((c) => `  - "${c}"`).join("\n") +
    `\n샘플 1행: ${sample}\n` +
    `규칙: SELECT/WITH 만, 단일문(세미콜론 금지), 한글·괄호 컬럼은 ` +
    `"큰따옴표". 결과는 ${TOOL_MAX_ROWS}행으로 제한해 표시됩니다.`
  );
}

/**
 * 도메인 바인딩 SQL 실행기 도구 생성. 스키마는 생성 시점 1회
 * 조회해 description 에 박는다(세션 동안 고정).
 * @param domain 세션에서 고른 적재 테이블 도메인(클로저 바인딩).
 */
export function makeSqlQueryTool(domain: SqlDomain) {
  const label = getSqlDomainSpec(domain).label;
  // 도구 사전 정보(description)에 스키마 텍스트 박기 — LLM 이
  // 이것만 보고 SQL 작성(도구 내부 LLM 없음).
  const description =
    sqlQueryToolDescription + schemaText(domain);

  return tool(
    async ({ sql }: { sql: string }): Promise<string> => {
      const q = sql?.trim();
      if (!q) {
        return "SQL 이 비어 있어 조회를 건너뜁니다.";
      }
      // ── 읽기 전용 가드 (text2sql.ts 재사용) ──
      try {
        assertReadOnly(q);
      } catch (e) {
        return (
          `[${label}] 안전 검증 실패: ` +
          `${e instanceof Error ? e.message : String(e)} ` +
          `(SELECT/WITH 단일문만 허용 — 쿼리를 수정해 다시 호출).`
        );
      }
      // ── 실행 (better-sqlite3 stmt.reader 이중 가드) ──
      try {
        const db = getDb(domain);
        const stmt = db.prepare(q);
        if (!stmt.reader) {
          return `[${label}] 실행 거부: 읽기(SELECT) 구문이 아닙니다.`;
        }
        const result = stmt.all() as Record<string, unknown>[];
        const columns =
          result.length > 0
            ? Object.keys(result[0])
            : stmt.columns().map((c) => c.name);
        const rows = result.map((r) => columns.map((c) => r[c]));
        return (
          `[${label}] 실행한 SQL:\n${q}\n\n결과:\n` +
          formatRows(columns, rows)
        );
      } catch (e) {
        // 미적재·스키마 불일치·문법 오류 등 — graceful 안내(NFR-18).
        return (
          `[${label}] SQL 실행 오류: ` +
          `${e instanceof Error ? e.message : String(e)}\n` +
          `→ 스키마(도구 설명)와 안 맞거나 미적재일 수 있습니다. ` +
          `컬럼명·따옴표를 확인해 쿼리를 고쳐 다시 호출하세요.`
        );
      }
    },
    {
      name: "sql_query",
      description,
      schema: z.object({
        sql: z
          .string()
          .describe(
            "실행할 SELECT(또는 WITH) SQL 한 문장. 도구 설명의 " +
              "스키마(테이블·컬럼·샘플)를 보고 직접 작성. 세미콜론·" +
              "여러 문장·쓰기 구문 금지(읽기 전용).",
          ),
      }),
    },
  );
}

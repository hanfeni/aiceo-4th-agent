/**
 * Text-to-SQL 실습 — 자연어 → SQL 생성 → SELECT 실행 (스트리밍).
 *
 * 검색 실습 RAG(searchlab/rag.ts)의 SQL 버전. 같은 SSE/stage 패턴,
 * 같은 모델 클라이언트(createModel). 단계만 다름:
 *   schema(스키마 조회) → generate(LLM SQL 생성) → execute(SELECT
 *   실행) → done. 학생이 "에이전트가 만든 SQL"을 단계 IO 로 본다.
 *
 * 안전 (사용자 결정: 읽기전용 + 스키마 노출):
 *  1) 프롬프트로 SELECT 만 지시 + 스키마/샘플행 주입
 *  2) 정규식 가드 — SELECT/WITH 로만 시작, 세미콜론 다중문·DDL·
 *     DML·PRAGMA·ATTACH 차단
 *  3) 실행 시 LIMIT 강제(결과 폭주 방지) + better-sqlite3
 *     statement.reader 검증(쓰기 구문 거부)
 * RAG 의 "프롬프트+코드 이중 가드" 사상과 동일.
 */

import { createModel, type ModelEnv } from "@/lib/agent/harness/model";
import { extractContentText } from "@/lib/agent/utils/chunkFilter";
import { getDb } from "./db";
import { getSchema } from "./load";
import { SQL_DOMAIN_SPEC, type SqlDomain } from "./domains";

export interface Text2SqlParams {
  domain: SqlDomain;
  question: string;
  /** 결과 행 상한(폭주 방지, 기본 50·최대 200) */
  maxRows?: number;
}

export type Text2SqlEvent =
  | { type: "system"; text: string }
  | { type: "stage_start"; step: string }
  | { type: "stage_io"; step: string; input: string; output: string }
  // 생성된 SQL(UI 가 코드블록으로 강조) — 그래프와 별개로 즉시 표시
  | { type: "sql"; sql: string }
  // 실행 결과 표 (컬럼 + 행)
  | { type: "rows"; columns: string[]; rows: unknown[][] }
  | { type: "done" }
  | { type: "error"; message: string };

/** sql.ts stage step → 노드 stage 번호 (text2sqlStageNodes 와 1:1) */
export const T2S_SYSTEM = `당신은 자연어 질문을 SQLite SQL 로 변환하는 전문가입니다.
아래 규칙을 반드시 지키세요.

1. 읽기 전용: SELECT 문 하나만 생성합니다. INSERT/UPDATE/DELETE/
   DROP/CREATE/ALTER/PRAGMA/ATTACH 는 절대 쓰지 마세요.
2. 스키마 한정: 제공된 테이블과 컬럼만 사용합니다. 없는 컬럼을
   지어내지 마세요. 컬럼명에 한글·괄호가 있으면 "큰따옴표"로 감쌉니다.
3. 타입 처리: 모든 컬럼은 TEXT 로 저장돼 있습니다. 숫자 비교·정렬·
   합계가 필요하면 CAST(컬럼 AS INTEGER) 또는 CAST(컬럼 AS REAL)
   을 사용하세요.
4. 출력 형식: SQL 한 문장만 출력합니다. 설명·주석·코드펜스·세미콜론
   없이 SELECT(또는 WITH) 로 시작하는 쿼리 본문만 작성하세요.`;

function modelEnv(): ModelEnv {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

/** LLM 출력에서 SQL 본문만 추출(코드펜스·접두 라벨 제거). */
function cleanSql(raw: string): string {
  let s = raw.trim();
  // ```sql ... ``` 펜스 제거
  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 끝 세미콜론 제거(다중문 가드와 별개 — 단문 정리)
  s = s.replace(/;\s*$/, "").trim();
  return s;
}

/**
 * 생성 SQL 안전 검증. 통과 못 하면 throw(학생이 사유를 본다).
 * 화이트리스트 방식 — SELECT/WITH 로 시작 + 금지 토큰 부재 +
 * 단일문(세미콜론으로 두 문장 차단).
 */
export function assertReadOnly(sql: string): void {
  const s = sql.trim();
  if (!/^(select|with)\b/i.test(s)) {
    throw new Error(
      "생성된 쿼리가 SELECT/WITH 로 시작하지 않습니다(읽기 전용만 허용).",
    );
  }
  // 세미콜론으로 끝나는 단일문은 cleanSql 이 이미 제거 → 남은
  // 세미콜론은 다중문 시도 → 차단.
  if (s.includes(";")) {
    throw new Error("여러 문장(세미콜론)은 허용되지 않습니다.");
  }
  // 위험 키워드(단어 경계) — 주석 우회 대비 소문자 단순 매칭.
  const banned =
    /\b(insert|update|delete|drop|create|alter|replace|truncate|pragma|attach|detach|vacuum|reindex)\b/i;
  if (banned.test(s)) {
    throw new Error("쓰기·DDL·PRAGMA 구문이 포함돼 거부했습니다(읽기 전용).");
  }
}

/** 결과에 LIMIT 이 없으면 강제로 덧붙임(폭주 방지). */
function withLimit(sql: string, maxRows: number): string {
  return /\blimit\b/i.test(sql) ? sql : `${sql}\nLIMIT ${maxRows}`;
}

export async function* runText2Sql(
  params: Text2SqlParams,
): AsyncGenerator<Text2SqlEvent> {
  const maxRows = Math.min(Math.max(params.maxRows ?? 50, 1), 200);
  yield { type: "system", text: T2S_SYSTEM };

  // ── ① 스키마 조회 ───────────────────────────────────
  yield { type: "stage_start", step: "schema" };
  const schema = getSchema(params.domain);
  if (!schema) {
    yield {
      type: "error",
      message:
        `[${params.domain}] 테이블이 아직 적재되지 않았습니다. ` +
        `"데이터 적재" 메뉴에서 먼저 적재하세요.`,
    };
    return;
  }
  const sampleStr = schema.sampleRow
    ? JSON.stringify(schema.sampleRow, null, 0).slice(0, 800)
    : "(샘플 없음)";
  const schemaPrompt =
    `테이블: "${schema.table}"\n` +
    `컬럼(${schema.columns.length}개, 전부 TEXT):\n` +
    schema.columns.map((c) => `  - "${c}"`).join("\n") +
    `\n샘플 1행: ${sampleStr}`;
  yield {
    type: "stage_io",
    step: "schema",
    input: `[도메인] ${SQL_DOMAIN_SPEC[params.domain].label}`,
    output: schemaPrompt,
  };

  // ── ② LLM SQL 생성 ─────────────────────────────────
  yield { type: "stage_start", step: "generate" };
  let model;
  try {
    model = createModel(modelEnv());
  } catch (e) {
    yield {
      type: "error",
      message:
        (e instanceof Error ? e.message : String(e)) +
        " — Text-to-SQL 은 LLM 키가 필요합니다(.env.local).",
    };
    return;
  }
  const userMsg =
    `${schemaPrompt}\n\n질문: ${params.question}\n\n` +
    `위 스키마로 답할 SELECT 쿼리 하나만 작성하세요.`;
  let rawSql = "";
  try {
    const stream = await model.stream([
      { role: "system", content: T2S_SYSTEM },
      { role: "user", content: userMsg },
    ]);
    for await (const chunk of stream) {
      const t = extractContentText(chunk.content);
      if (t) rawSql += t;
    }
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  const sql = cleanSql(rawSql);
  yield { type: "sql", sql };
  yield {
    type: "stage_io",
    step: "generate",
    input: `[SYSTEM]\n${T2S_SYSTEM}\n\n[USER]\n${userMsg}`,
    output: sql,
  };

  // ── ③ SELECT 실행 (안전 가드) ──────────────────────
  yield { type: "stage_start", step: "execute" };
  try {
    assertReadOnly(sql);
  } catch (e) {
    yield {
      type: "error",
      message: `안전 검증 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }
  const finalSql = withLimit(sql, maxRows);
  try {
    const db = getDb(params.domain);
    const stmt = db.prepare(finalSql);
    // better-sqlite3: 읽기 구문이 아니면 .reader=false → 이중 방어.
    if (!stmt.reader) {
      yield {
        type: "error",
        message: "실행 거부: 읽기(SELECT) 구문이 아닙니다.",
      };
      return;
    }
    const result = stmt.all() as Record<string, unknown>[];
    const columns =
      result.length > 0
        ? Object.keys(result[0])
        : // 결과 0행이면 stmt.columns() 로 컬럼만 추출
          stmt.columns().map((c) => c.name);
    const rows = result.map((r) => columns.map((c) => r[c]));
    yield { type: "rows", columns, rows };
    yield {
      type: "stage_io",
      step: "execute",
      input: finalSql,
      output: `${rows.length}행 반환 (상한 ${maxRows})`,
    };
  } catch (e) {
    yield {
      type: "error",
      message:
        `SQL 실행 오류: ${e instanceof Error ? e.message : String(e)}\n` +
        `→ 생성된 SQL 이 스키마와 안 맞을 수 있습니다. 질문을 더 구체적으로.`,
    };
    return;
  }

  // ── ④ 완료 ──────────────────────────────────────────
  yield { type: "stage_start", step: "done" };
  yield {
    type: "stage_io",
    step: "done",
    input: `질문 → SQL → 실행 완료`,
    output: "자연어→SQL→결과 파이프라인 완료. 생성된 SQL 을 확인하세요.",
  };
  yield { type: "done" };
}

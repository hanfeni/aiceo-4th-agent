/**
 * Text-to-SQL with Chart 실습 — 자연어 → SQL → 실행 → LLM 차트화.
 *
 * 기존 Text-to-SQL(text2sql.ts)은 무변경(사용자 정정 — DB 표만).
 * 이건 별도 모드: SQL 실행 결과를 LLM 에 **다시 넣어** 적절한
 * 차트 타입 + 차트 메타(축·시리즈)를 구조화 출력 → 프론트가 그
 * 스펙대로 Recharts 렌더. RAG 가 검색결과를 LLM 에 넣는 것과 동형.
 *
 * 파이프라인: schema → generate(SQL) → execute → **chart(LLM
 * chartSpec 생성)** → done. 기존 4단계에 chart 단계 1개 추가.
 *
 * 안전 (사용자 결정: 화이트리스트 + 스키마 검증):
 *  - SQL 은 text2sql 의 assertReadOnly 재사용(읽기 전용)
 *  - chartType 은 허용 목록(bar/line/pie/area/scatter)만
 *  - x/y/series 키는 실제 결과 컬럼명과 대조 — 안 맞으면 에러
 *  assertReadOnly·assertChartSpec 모두 LLM/DB 없이 순수 검증.
 */

import { createModel, type ModelEnv } from "@/lib/agent/harness/model";
import { extractContentText } from "@/lib/agent/utils/chunkFilter";
import { getDb } from "./db";
import { getSchema } from "./load";
import { assertReadOnly } from "./text2sql";
import { SQL_DOMAIN_SPEC, type SqlDomain } from "./domains";

export interface Text2SqlChartParams {
  domain: SqlDomain;
  question: string;
  /** 결과 행 상한(차트는 폭주 시 가독성↓ — 기본 50·최대 200) */
  maxRows?: number;
}

/** 허용 차트 타입 (화이트리스트 — 이 외 값은 거부) */
export const CHART_TYPES = [
  "bar",
  "line",
  "pie",
  "area",
  "scatter",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/**
 * LLM 이 출력해야 하는 차트 스펙. 프론트(Recharts)가 이 스펙만
 * 보고 렌더한다 — LLM 자유 텍스트가 아니라 구조화 JSON 이어야
 * 우리가 안전하게 그릴 수 있다(사용자 핵심 요구).
 */
export interface ChartSpec {
  chartType: ChartType;
  /** X축(범주축) 컬럼명 — 결과 컬럼 중 하나. pie 는 라벨 컬럼. */
  x: string;
  /** Y축(값축) 컬럼명들 — 1개 이상. pie 는 값 1개. */
  y: string[];
  /** 차트 제목 */
  title: string;
  /** 한 줄 해석(왜 이 차트인가 — 교육용) */
  rationale: string;
}

export type Text2SqlChartEvent =
  | { type: "system"; text: string }
  | { type: "stage_start"; step: string }
  | { type: "stage_io"; step: string; input: string; output: string }
  | { type: "sql"; sql: string }
  | { type: "rows"; columns: string[]; rows: unknown[][] }
  // 검증 통과한 차트 스펙 — 프론트가 Recharts 로 렌더
  | { type: "chart"; spec: ChartSpec }
  | { type: "done" }
  | { type: "error"; message: string };

export const T2SC_SYSTEM = `당신은 SQL 실행 결과를 가장 적절한 차트로 시각화하는 데이터 시각화 전문가입니다.
아래 규칙을 반드시 지키세요.

1. 입력: 사용자 질문, 실행된 SQL, 결과 컬럼 목록과 샘플 행을 받습니다.
2. 차트 선택: 데이터 성격에 맞는 차트 타입을 고릅니다.
   - bar: 범주별 크기 비교 (가장 흔함)
   - line: 시간·순서에 따른 추세
   - area: 추세 + 누적 강조
   - pie: 전체 대비 구성비 (범주 6개 이하일 때만)
   - scatter: 두 수치 간 상관/분포
3. 축 지정: x 는 범주(또는 시간)축 컬럼 1개, y 는 수치값 컬럼
   1개 이상을 결과 컬럼명에서 **정확히** 고릅니다. 없는 컬럼명을
   지어내지 마세요. 수치가 아닌 컬럼을 y 로 쓰지 마세요.
4. 출력 형식: 아래 JSON 한 개만 출력합니다. 코드펜스·설명·앞뒤
   텍스트 없이 JSON 객체만:
{"chartType":"bar","x":"컬럼명","y":["수치컬럼명"],"title":"제목","rationale":"이 차트를 고른 한 줄 이유"}`;

function modelEnv(): ModelEnv {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

/** LLM 출력에서 SQL 본문만(코드펜스·세미콜론 제거) — text2sql 동형 */
function cleanSql(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  return s.replace(/;\s*$/, "").trim();
}

function withLimit(sql: string, maxRows: number): string {
  return /\blimit\b/i.test(sql) ? sql : `${sql}\nLIMIT ${maxRows}`;
}

/** LLM 출력에서 첫 JSON 객체만 추출(코드펜스·앞뒤 텍스트 제거). */
function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 펜스가 없으면 첫 { … 마지막 } 범위
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

/**
 * 차트 스펙 안전 검증(화이트리스트 + 스키마 대조). 통과 못 하면
 * throw — 학생이 사유를 보고, 프론트는 표로 폴백한다.
 * assertReadOnly 와 같은 사상(LLM 출력 불신).
 */
export function assertChartSpec(
  raw: unknown,
  resultColumns: string[],
): ChartSpec {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("차트 스펙이 JSON 객체가 아닙니다.");
  }
  const o = raw as Record<string, unknown>;
  const chartType = o.chartType;
  if (
    typeof chartType !== "string" ||
    !(CHART_TYPES as readonly string[]).includes(chartType)
  ) {
    throw new Error(
      `허용되지 않은 chartType: ${String(chartType)} ` +
        `(허용: ${CHART_TYPES.join("/")})`,
    );
  }
  const x = o.x;
  if (typeof x !== "string" || !resultColumns.includes(x)) {
    throw new Error(
      `x 축 컬럼 "${String(x)}" 이 결과 컬럼에 없습니다 ` +
        `(결과 컬럼: ${resultColumns.join(", ")}).`,
    );
  }
  const yRaw = o.y;
  const y = Array.isArray(yRaw) ? yRaw : [yRaw];
  if (y.length === 0) {
    throw new Error("y 축 컬럼이 비어 있습니다.");
  }
  for (const col of y) {
    if (typeof col !== "string" || !resultColumns.includes(col)) {
      throw new Error(
        `y 축 컬럼 "${String(col)}" 이 결과 컬럼에 없습니다.`,
      );
    }
  }
  return {
    chartType: chartType as ChartType,
    x,
    y: y as string[],
    title: typeof o.title === "string" ? o.title : "차트",
    rationale:
      typeof o.rationale === "string" ? o.rationale : "",
  };
}

export async function* runText2SqlChart(
  params: Text2SqlChartParams,
): AsyncGenerator<Text2SqlChartEvent> {
  const maxRows = Math.min(Math.max(params.maxRows ?? 50, 1), 200);
  yield { type: "system", text: T2SC_SYSTEM };

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
  // SQL 생성은 기존 Text-to-SQL 과 동일 지시(읽기 전용·스키마 한정).
  const sqlSystem = `당신은 자연어 질문을 SQLite SELECT 로 변환하는 전문가입니다.
읽기 전용(SELECT/WITH 만), 제공된 컬럼만 사용, 숫자 비교·정렬은
CAST(컬럼 AS INTEGER/REAL). SQL 한 문장만, 코드펜스·설명 없이 출력.`;
  const sqlUser =
    `${schemaPrompt}\n\n질문: ${params.question}\n\n` +
    `위 스키마로 답할 SELECT 쿼리 하나만 작성하세요. ` +
    `차트로 그릴 것이므로 범주 컬럼과 수치 컬럼이 함께 나오게 하세요.`;
  let rawSql = "";
  try {
    const stream = await model.stream([
      { role: "system", content: sqlSystem },
      { role: "user", content: sqlUser },
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
    input: `[SYSTEM]\n${sqlSystem}\n\n[USER]\n${sqlUser}`,
    output: sql,
  };

  // ── ③ SELECT 실행 (안전 가드 — text2sql 재사용) ────
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
  let columns: string[] = [];
  let rows: unknown[][] = [];
  let resultObjs: Record<string, unknown>[] = [];
  try {
    const db = getDb(params.domain);
    const stmt = db.prepare(finalSql);
    if (!stmt.reader) {
      yield {
        type: "error",
        message: "실행 거부: 읽기(SELECT) 구문이 아닙니다.",
      };
      return;
    }
    resultObjs = stmt.all() as Record<string, unknown>[];
    columns =
      resultObjs.length > 0
        ? Object.keys(resultObjs[0])
        : stmt.columns().map((c) => c.name);
    rows = resultObjs.map((r) => columns.map((c) => r[c]));
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
  if (rows.length === 0) {
    yield {
      type: "error",
      message: "결과가 0행이라 차트를 그릴 수 없습니다. 질문을 바꿔 보세요.",
    };
    return;
  }

  // ── ④ LLM 차트화 (실행 결과를 LLM 에 재투입) ────────
  yield { type: "stage_start", step: "chart" };
  const sampleForChart = resultObjs
    .slice(0, 12)
    .map((r) => JSON.stringify(r))
    .join("\n");
  const chartUser =
    `질문: ${params.question}\n\n` +
    `실행된 SQL:\n${finalSql}\n\n` +
    `결과 컬럼: ${columns.join(", ")}\n` +
    `결과 샘플(앞 ${Math.min(12, rows.length)}행):\n${sampleForChart}\n\n` +
    `이 결과를 가장 잘 보여줄 차트 스펙 JSON 을 출력하세요.`;
  let rawChart = "";
  try {
    const stream = await model.stream([
      { role: "system", content: T2SC_SYSTEM },
      { role: "user", content: chartUser },
    ]);
    for await (const chunk of stream) {
      const t = extractContentText(chunk.content);
      if (t) rawChart += t;
    }
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }

  let spec: ChartSpec;
  try {
    const parsed = extractJson(rawChart);
    spec = assertChartSpec(parsed, columns);
  } catch (e) {
    yield {
      type: "error",
      message:
        `차트 스펙 검증 실패: ${e instanceof Error ? e.message : String(e)}\n` +
        `→ 결과 표는 위에 있습니다(차트 없이 표로 확인하세요).`,
    };
    return;
  }
  yield { type: "chart", spec };
  yield {
    type: "stage_io",
    step: "chart",
    input: `[SYSTEM]\n${T2SC_SYSTEM}\n\n[USER]\n${chartUser}`,
    output: JSON.stringify(spec, null, 2),
  };

  // ── ⑤ 완료 ──────────────────────────────────────────
  yield { type: "stage_start", step: "done" };
  yield {
    type: "stage_io",
    step: "done",
    input: `질문 → SQL → 실행 → 차트 스펙 완료`,
    output:
      `${spec.chartType} 차트로 시각화 완료. ` +
      `LLM 이 데이터를 보고 차트 타입을 스스로 골랐습니다.`,
  };
  yield { type: "done" };
}

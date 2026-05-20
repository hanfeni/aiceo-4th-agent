/**
 * 온톨로지 실습의 심장 — 같은 질문을 RAG / Text-to-SQL / GraphRAG
 * 3방식으로 돌려 결과를 나란히 비교한다.
 *
 * 강의 핵심 메시지(사용자 결정): "GraphRAG 이 RAG·Text-to-SQL
 * 보다 우월함을 설명하기 좋은 케이스". SEC EDGAR 기관-종목 보유는
 * 멀티홉 추론이라 —
 *   RAG       : 텍스트(기관/종목 설명)만 봄 → 보유 "관계"를 못 잇음
 *   Text-to-SQL: 보유는 풀리나 가변 깊이 연쇄는 다중 self-JOIN 지옥
 *   GraphRAG  : (m)-[:OWNS]->(c)<-[:OWNS]-(m2) 경로 한 줄
 *
 * 각 방식은 "LLM 이 도구 호출 코드를 생성 → 실행 → 해석"하는 동일
 * 골격. 학생은 LLM 이 짠 Cypher/SQL 을 화면에서 직접 본다(2회차
 * "제작" 메시지의 실물 = 코딩에이전트가 코드를 써준다).
 *
 * R7: Neo4j/child 의존 → API route runtime=nodejs.
 */

import { createModel, type ModelEnv } from "@/lib/agent/harness/model";
import { extractContentText } from "@/lib/agent/utils/chunkFilter";
import { runCypher } from "./client";
import { getMemStore, type HoldingRow } from "./load";
import { getDataset, DEFAULT_DATASET_ID } from "./config";

export type CompareMethod = "rag" | "sql" | "graphrag";

export type CompareEvent =
  | { type: "method_start"; method: CompareMethod }
  // LLM 이 생성한 쿼리/코드 (학생이 보는 핵심 — "에이전트가 짠 코드")
  | { type: "generated"; method: CompareMethod; lang: string; code: string }
  // 실행 결과 요약(행수·샘플)
  | { type: "result"; method: CompareMethod; rows: number; preview: string }
  // LLM 의 자연어 해석 토큰 스트리밍
  | { type: "token"; method: CompareMethod; text: string }
  | { type: "method_done"; method: CompareMethod }
  | { type: "method_error"; method: CompareMethod; message: string }
  | { type: "all_done" };

function modelEnv(): ModelEnv {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

/** LLM 1콜 — 비스트리밍 텍스트 (코드 생성용) */
async function llmText(
  system: string,
  user: string,
): Promise<string> {
  const model = createModel(modelEnv());
  const stream = await model.stream([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  let out = "";
  for await (const ch of stream) out += extractContentText(ch.content);
  return out.trim();
}

/** ```fence``` 안의 코드만 추출(LLM 이 설명을 붙여도 코드만). */
function stripFence(s: string): string {
  const m = s.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

// ── ① RAG 패널 ──────────────────────────────────────────
// 의도적으로 "텍스트만 보는" 한계를 드러낸다. 인메모리 holdings 의
// issuer/기관명 텍스트를 키워드 매칭(임베딩 없이 — 강의 목적은 RAG
// 품질 자랑이 아니라 "관계를 못 잇는다"를 보이는 것. 최속·무과금).
async function* runRagPanel(
  query: string,
  datasetId: string,
): AsyncGenerator<CompareEvent> {
  const ds = getDataset(datasetId);
  yield { type: "method_start", method: "rag" };
  const store = getMemStore();
  if (!store) {
    yield { type: "method_error", method: "rag", message: "그래프 미구축 — 먼저 '그래프 구축'을 실행하세요." };
    return;
  }
  // 질의에서 키워드 뽑아 issuer/기관명 텍스트 매칭(평면 검색)
  const kws = query
    .toLowerCase()
    .replace(/[^a-z0-9가-힣 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const scored = new Map<string, number>();
  for (const h of store.holdings) {
    const hay = (h.issuer + " " + h.cusip).toLowerCase();
    let s = 0;
    for (const k of kws) if (hay.includes(k)) s++;
    if (s > 0) scored.set(h.issuer, (scored.get(h.issuer) ?? 0) + s);
  }
  const top = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  yield {
    type: "generated",
    method: "rag",
    lang: "text",
    code:
      `# RAG: 종목/기관 텍스트만 키워드 매칭 (관계 정보 없음)\n` +
      `keywords = ${JSON.stringify(kws)}`,
  };
  yield {
    type: "result",
    method: "rag",
    rows: top.length,
    preview: top.map(([n, s]) => `${n} (match=${s})`).join("\n") || "(매칭 없음)",
  };
  const sys =
    "당신은 검색 근거만으로 답하는 RAG 어시스턴트입니다. 근거에 " +
    `'어느 ${ds.slots.subject}이(가) 무엇을 ${ds.slots.relation}'하는 관계 정보가 없으면 그 한계를 ` +
    "솔직히 밝히세요. 3~5문장 한국어.";
  const usr =
    `질문: ${query}\n\n근거(텍스트 매칭된 종목명 목록):\n` +
    (top.map(([n]) => `- ${n}`).join("\n") || "(없음)") +
    `\n\n이 텍스트 목록만으로 질문에 답하고, 답할 수 없는 부분은 명시하세요.`;
  try {
    const model = createModel(modelEnv());
    const st = await model.stream([
      { role: "system", content: sys },
      { role: "user", content: usr },
    ]);
    for await (const ch of st) {
      const t = extractContentText(ch.content);
      if (t) yield { type: "token", method: "rag", text: t };
    }
  } catch (e) {
    yield { type: "method_error", method: "rag", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  yield { type: "method_done", method: "rag" };
}

// ── ② Text-to-SQL 패널 (대조군) ─────────────────────────
// Text-to-SQL 본체는 타 에이전트 작업 → 여기선 "SQL 로는 여기까지"
// 를 보여주는 대조군. holdings 단일 테이블에 LLM 이 SQL 생성 →
// 인메모리 실행(의존성 0, sql.js 불요 — 단순 셀렉트 평가기).
function evalSimpleSql(
  rows: HoldingRow[],
  sql: string,
): { rows: number; preview: string } {
  // 강의 대조군이므로 풀 SQL 엔진 대신, 가장 흔한 패턴만 안내.
  // "다중 self-JOIN 이 필요해 단일 테이블론 표현 곤란"을 의도적으로
  // 드러내는 게 교육 포인트(SQL 의 한계 시연).
  const low = sql.toLowerCase();
  const joinCount = (low.match(/join/g) ?? []).length;
  if (joinCount >= 2) {
    return {
      rows: 0,
      preview:
        `⚠ 이 질문은 ${joinCount}개 이상의 self-JOIN 이 필요합니다.\n` +
        `holdings 단일 테이블에서 기관→종목→기관→종목 연쇄를 풀려면\n` +
        `JOIN 이 중첩될수록 쿼리가 폭발합니다 (관계 추론의 한계).\n` +
        `→ 같은 질문을 GraphRAG 패널과 비교해 보세요.`,
    };
  }
  // 단순 집계만 흉내(top issuer 류) — 정확한 SQL 엔진 아님(대조군).
  const byIssuer = new Map<string, number>();
  for (const r of rows) byIssuer.set(r.issuer, (byIssuer.get(r.issuer) ?? 0) + 1);
  const top = [...byIssuer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    rows: top.length,
    preview: top.map(([n, c]) => `${n}: ${c} 기관 보유`).join("\n"),
  };
}

async function* runSqlPanel(
  query: string,
  datasetId: string,
): AsyncGenerator<CompareEvent> {
  const ds = getDataset(datasetId);
  yield { type: "method_start", method: "sql" };
  const store = getMemStore();
  if (!store) {
    yield { type: "method_error", method: "sql", message: "그래프 미구축 — 먼저 '그래프 구축'을 실행하세요." };
    return;
  }
  // 공정 비교(사용자 결정): SQL 도 '제대로 했을 때'의 결과를 내게
  // 한다. 오답·식별 누락은 SQL 의 본질 한계가 아니라 프롬프트 부실
  // 탓 → 가이드를 명시해 SQL 의 최선을 끌어낸 뒤 GraphRAG 와
  // 비교해야 "구조적으로 멀티홉이 SQL 에 안 맞는다"가 설득력을
  // 가진다. 데이터셋별 규칙은 config.sqlPrompt SSOT.
  const sys =
    "당신은 숙련된 Text-to-SQL 어시스턴트입니다. " +
    ds.sqlPrompt +
    "\n- 가능한 한 정확한 SQL 을 작성하되, 단일 테이블로 표현이 불가능한 " +
    "부분이 있으면 주석(-- )으로 한 줄 남기세요.\n" +
    "질문을 풀 SQL 을 ```sql``` 코드펜스로만 출력하세요. 설명 금지.";
  let sql = "";
  try {
    sql = stripFence(await llmText(sys, `질문: ${query}`));
  } catch (e) {
    yield { type: "method_error", method: "sql", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  yield { type: "generated", method: "sql", lang: "sql", code: sql };
  const r = evalSimpleSql(store.holdings, sql);
  yield { type: "result", method: "sql", rows: r.rows, preview: r.preview };

  const sys2 =
    "위 SQL 실행 결과로 질문에 답하세요. SQL 로 잘 풀린 부분은 그대로 " +
    "제시하고, 단일 테이블에서 다중 self-JOIN 이 필요해 표현이 " +
    "곤란했던 부분이 있으면 그 구조적 이유만 한 줄로 짚으세요(억지 " +
    "한계 고백 금지 — 잘 됐으면 잘 됐다고). 3~5문장 한국어.";
  try {
    const model = createModel(modelEnv());
    const st = await model.stream([
      { role: "system", content: sys2 },
      { role: "user", content: `질문: ${query}\n\nSQL:\n${sql}\n\n결과:\n${r.preview}` },
    ]);
    for await (const ch of st) {
      const t = extractContentText(ch.content);
      if (t) yield { type: "token", method: "sql", text: t };
    }
  } catch (e) {
    yield { type: "method_error", method: "sql", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  yield { type: "method_done", method: "sql" };
}

// ── ③ GraphRAG 패널 (우월성 시연 핵심) ──────────────────
// LLM 이 Cypher 생성 → Neo4j 실행 → 결과 해석. 멀티홉 경로가
// 한 줄 MATCH 로 풀린다 = GraphRAG 우월성의 실물 증거.
async function* runGraphRagPanel(
  query: string,
  datasetId: string,
): AsyncGenerator<CompareEvent> {
  const ds = getDataset(datasetId);
  yield { type: "method_start", method: "graphrag" };
  // 스키마 설명은 LLM 이 노드/속성/관계 의미를 알아야 활용함(누락
  // 시 죽은 스키마). 노드 골격은 데이터셋 공통(Manager/Company/
  // Position)이지만 의미·라벨은 데이터셋별 → config.schemaPrompt
  // SSOT 가 데이터셋별 의미를 LLM 에 서술한다.
  const sys =
    "당신은 Cypher 생성 어시스턴트입니다. Neo4j 그래프 스키마:\n" +
    ds.schemaPrompt +
    "\n질문을 푸는 읽기 전용 Cypher 를 ```cypher``` 코드펜스로만 " +
    "출력하세요. 멀티홉 경로를 적극 활용하고 LIMIT 25 이하로 " +
    "제한하세요. 설명 금지.";
  let cy = "";
  try {
    cy = stripFence(await llmText(sys, `질문: ${query}`));
  } catch (e) {
    yield { type: "method_error", method: "graphrag", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  yield { type: "generated", method: "graphrag", lang: "cypher", code: cy };

  let rows: Record<string, unknown>[];
  try {
    // 안전: 쓰기 키워드 차단(읽기 전용 강제 — 학생 입력 LLM 생성물)
    if (/\b(CREATE|DELETE|MERGE|SET|REMOVE|DROP|DETACH)\b/i.test(cy)) {
      throw new Error("읽기 전용 Cypher 만 허용됩니다(쓰기 키워드 감지).");
    }
    rows = await runCypher(cy);
  } catch (e) {
    yield { type: "method_error", method: "graphrag", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  const preview = rows
    .slice(0, 10)
    .map((r) => JSON.stringify(r))
    .join("\n");
  yield { type: "result", method: "graphrag", rows: rows.length, preview: preview || "(결과 없음)" };

  const sys2 =
    "그래프 질의 결과로 질문에 답하세요. 멀티홉 관계가 어떻게 " +
    "한 번의 경로 탐색으로 풀렸는지 한 문장 덧붙이세요. 3~5문장 한국어.";
  try {
    const model = createModel(modelEnv());
    const st = await model.stream([
      { role: "system", content: sys2 },
      { role: "user", content: `질문: ${query}\n\nCypher:\n${cy}\n\n결과(JSON):\n${preview}` },
    ]);
    for await (const ch of st) {
      const t = extractContentText(ch.content);
      if (t) yield { type: "token", method: "graphrag", text: t };
    }
  } catch (e) {
    yield { type: "method_error", method: "graphrag", message: e instanceof Error ? e.message : String(e) };
    return;
  }
  yield { type: "method_done", method: "graphrag" };
}

/**
 * 여러 async generator 를 병렬로 머지 — 어느 것이든 다음 이벤트가
 * 준비되는 즉시 yield(가장 빠른 것부터). 모든 이벤트에 method 태그가
 * 있어 UI 가 패널별로 분배하므로 순서가 섞여도 정상(렌더 안전).
 */
async function* mergeParallel<T>(
  gens: AsyncGenerator<T>[],
): AsyncGenerator<T> {
  // 각 제너레이터의 "다음 결과"를 자기 인덱스와 함께 경주시킨다.
  const next = (g: AsyncGenerator<T>, i: number) =>
    g.next().then((r) => ({ i, r }));
  const pending = new Map(gens.map((g, i) => [i, next(g, i)]));
  while (pending.size > 0) {
    const { i, r } = await Promise.race(pending.values());
    if (r.done) {
      pending.delete(i);
    } else {
      yield r.value;
      pending.set(i, next(gens[i], i));
    }
  }
}

/**
 * 3패널 병렬 실행 (사용자 결정 2026-05-19: 순차 → 병렬).
 * RAG·SQL·GraphRAG 가 동시에 흐른다 — 체감 3배 빠름. 단일 SSE
 * 스트림에 섞여 나가도 각 이벤트의 method 로 UI 가 패널 분배.
 */
export async function* runCompare(
  query: string,
  datasetId: string = DEFAULT_DATASET_ID,
): AsyncGenerator<CompareEvent> {
  yield* mergeParallel<CompareEvent>([
    runRagPanel(query, datasetId),
    runSqlPanel(query, datasetId),
    runGraphRagPanel(query, datasetId),
  ]);
  yield { type: "all_done" };
}

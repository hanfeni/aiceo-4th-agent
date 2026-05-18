/**
 * WebSearch 도구 실호출 검증 probe (1회용 실측 도구 — tests 아님).
 *
 * 사용자 요청: "웹검색 해서 ~~확인" 프롬프트를 줄 때 웹검색 도구가
 * 실제로 호출되는지 체크. deepagents 그래프 경유(실제 앱 경로).
 *
 * 대조 설계: 검색유도 프롬프트(도구 호출 기대) vs 일반 프롬프트
 * (도구 미호출 기대). 둘을 비교해야 "등록만 됨"이 아닌 "필요 시
 * 실제 호출"이 증명된다.
 *
 * 실 OpenAI 호출 2턴 — 소액 과금. 실행: npx tsx scripts/ws-call-probe.mts
 */
import { readFileSync } from "node:fs";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { HARNESS_TOOLS } from "../src/lib/agent/harness/tools/index.ts";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const model = new ChatOpenAI({
  model: process.env.LLM_MODEL!,
  apiKey: process.env.OPENAI_API_KEY!,
  streaming: true,
  useResponsesApi: true,
} as ConstructorParameters<typeof ChatOpenAI>[0]);

console.log("등록 도구:", JSON.stringify(HARNESS_TOOLS));

const graph = createDeepAgent({
  model,
  tools: HARNESS_TOOLS,
  subagents: [],
  checkpointer: SqliteSaver.fromConnString(":memory:"),
} as Parameters<typeof createDeepAgent>[0]) as unknown as {
  stream: (i: unknown, c: unknown) => Promise<AsyncIterable<unknown>>;
};

/** 한 턴 실행하며 web_search_call 발동 여부 + 본문을 관측한다. */
async function runTurn(label: string, prompt: string, thread: string) {
  console.log(`\n=== ${label} ===\n프롬프트: ${prompt}`);
  const stream = await graph.stream(
    { messages: [{ role: "user", content: prompt }] },
    { configurable: { thread_id: thread }, streamMode: "messages" },
  );
  let sawSearch = false;
  const queries: string[] = [];
  let parts = 0;
  for await (const part of stream) {
    parts++;
    const j = JSON.stringify(part ?? "");
    if (j.includes("web_search_call")) {
      sawSearch = true;
      // 검색 쿼리 추출 (관측용 — 실제 검색어 확인).
      for (const q of j.match(/"queries":\[[^\]]*\]/g) ?? []) {
        if (!queries.includes(q)) queries.push(q);
      }
    }
  }
  console.log(`stream parts: ${parts}`);
  console.log(`▶ web_search 도구 호출: ${sawSearch ? "✅ YES" : "❌ NO"}`);
  if (queries.length) console.log(`▶ 검색 쿼리: ${queries.join(" | ").slice(0, 200)}`);
  return sawSearch;
}

const a = await runTurn(
  "TURN 1 — 검색유도 (도구 호출 기대)",
  "2026년 5월 현재 대한민국 대통령이 누구인지 웹검색해서 확인해줘",
  "ws-call-1",
);
const b = await runTurn(
  "TURN 2 — 일반질문 대조군 (도구 미호출 기대)",
  "3 곱하기 7은 얼마야? 암산으로만 답해.",
  "ws-call-2",
);

console.log("\n=== 판정 ===");
console.log(`검색유도 → 호출: ${a ? "✅" : "❌"} (기대: ✅)`);
console.log(`일반질문 → 미호출: ${!b ? "✅" : "❌"} (기대: ✅ 미호출)`);
console.log(
  a && !b
    ? "결론: WebSearch 도구가 필요 시 정확히 호출됨 (PASS)"
    : "결론: 예상과 다름 — 출력 확인 필요 (REVIEW)",
);

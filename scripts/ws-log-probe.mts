/**
 * WebSearch(ServerTool) 호출이 앱의 도구 이벤트 채널에 잡히는지 실측.
 *
 * 질문: agent.ts 가 extractToolCalls/extractToolResult 로 방출하는
 * tool_call/tool_result SSE 이벤트에 web_search 호출이 나타나는가?
 * 가설: ServerTool 은 tool_call_chunks 가 아니라 web_search_call
 * 메타로 와서 extractToolCalls 가 못 잡는다 → "도구 호출 로그" 부재.
 *
 * 실 OpenAI 1턴 — 소액 과금. 실행: npx tsx scripts/ws-log-probe.mts
 */
import { readFileSync } from "node:fs";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { HARNESS_TOOLS } from "../src/lib/agent/harness/tools/index.ts";
import {
  extractToolCalls,
  extractToolResult,
  filterChunk,
} from "../src/lib/agent/utils/chunkFilter.ts";

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

const graph = createDeepAgent({
  model,
  tools: HARNESS_TOOLS,
  subagents: [],
  checkpointer: SqliteSaver.fromConnString(":memory:"),
} as Parameters<typeof createDeepAgent>[0]) as unknown as {
  stream: (i: unknown, c: unknown) => Promise<AsyncIterable<unknown>>;
};

const stream = await graph.stream(
  {
    messages: [
      { role: "user", content: "2026년 5월 현재 대한민국 대통령이 누구인지 웹검색해서 확인해줘" },
    ],
  },
  { configurable: { thread_id: "ws-log" }, streamMode: "messages" },
);

let toolCallEvents = 0;
let toolResultEvents = 0;
let tokenChars = 0;
let rawWebSearchParts = 0;
const nodeKinds = new Set<string>();
const webSearchSamples: string[] = [];

for await (const part of stream) {
  const [msg, meta] = part as [unknown, unknown];
  const node = (meta as { langgraph_node?: string })?.langgraph_node;
  if (node) nodeKinds.add(node);

  const raw = JSON.stringify(msg ?? "");
  if (raw.includes("web_search")) {
    rawWebSearchParts++;
    // 정밀 실측: web_search 포함 청크 raw 를 가정 없이 통째 덤프.
    if (webSearchSamples.length < 4) {
      webSearchSamples.push(`[node=${node}] ${raw.slice(0, 900)}`);
    }
  }

  // 앱이 실제로 방출하는 도구 이벤트 채널 (agent.ts 와 동일 호출).
  const tc = extractToolCalls(msg, meta);
  if (tc) toolCallEvents += tc.length;
  const tr = extractToolResult(msg, meta);
  if (tr) toolResultEvents++;
  const t = filterChunk(msg, meta);
  if (t !== null) tokenChars += t.length;
}

console.log("=== 앱 도구 이벤트 채널 (agent.ts extractToolCalls/Result) ===");
console.log(`tool_call  이벤트 수: ${toolCallEvents}`);
console.log(`tool_result 이벤트 수: ${toolResultEvents}`);
console.log(`본문 token 누적 글자수: ${tokenChars}`);
console.log(`\n=== raw 스트림 관측 ===`);
console.log(`web_search 포함 part 수: ${rawWebSearchParts}`);
console.log(`langgraph_node 종류: ${[...nodeKinds].join(", ")}`);
console.log(`\n=== web_search 청크 샘플 (형태 확인) ===`);
for (const s of webSearchSamples) console.log(s);

console.log(`\n=== 판정 ===`);
console.log(
  toolCallEvents > 0
    ? "extractToolCalls 가 web_search 를 잡음 → 도구호출 로그 있음"
    : "extractToolCalls 가 web_search 를 못 잡음 (ServerTool 은 tool_call_chunks 아님)\n" +
        "→ 현재 앱엔 web_search '도구 호출 로그' 가 없다. 별도 채널 필요.",
);

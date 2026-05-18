/**
 * U2~U5 실측 probe (Slice 1 pre-work). tests 아님 — 1회용 실측 도구.
 * deepagents + ChatOpenAI(gpt-5.4-mini) 실제 그래프 2턴 실행.
 * 출력은 docs/notes/live-stream-events.md 로 사람이 정리.
 *
 * 실행: pnpm dlx tsx scripts/probe.mts  (또는 node --import tsx)
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
// U5 실측 확정:
//  - @langchain/langgraph 직접 import → ERR_MODULE_NOT_FOUND (pnpm strict).
//  - checkpointer:true → "cannot be used for root graphs" (subagent 전용).
//  - root graph 멀티턴엔 실제 saver 인스턴스 필요. SqliteSaver 는
//    @langchain/langgraph-checkpoint-sqlite (package.json 직접 의존 → 해석 OK).
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

// .env.local 수동 로드 (Next 런타임 밖이라 자동 주입 없음)
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const OUT = "/tmp/probe-out.jsonl";
writeFileSync(OUT, "");
const log = (tag: string, obj: unknown) =>
  appendFileSync(OUT, JSON.stringify({ tag, obj }) + "\n");

const model = new ChatOpenAI({
  model: process.env.LLM_MODEL!,
  apiKey: process.env.OPENAI_API_KEY!,
  streaming: true,
});

// U5: SqliteSaver.fromConnString(path). probe 는 :memory: (영속 불필요).
const checkpointer = SqliteSaver.fromConnString(":memory:");
const agent = createDeepAgent({
  model,
  systemPrompt: "You are a concise Korean assistant. 한국어로 짧게 답하라.",
  checkpointer,
});

const thread = { configurable: { thread_id: "probe-thread-1" } };

async function turn(label: string, text: string) {
  log(`TURN_START:${label}`, { text });
  // U2: streamMode "messages" 실측
  const stream = await agent.stream(
    { messages: [{ role: "user", content: text }] },
    { ...thread, streamMode: "messages" as const },
  );
  let chunkCount = 0;
  for await (const part of stream) {
    chunkCount++;
    if (chunkCount <= 8) {
      // U3: AIMessageChunk content 형태 (string vs 블록 배열, thinking type)
      // U4: 출처 노드 식별 메타데이터 키
      log(`CHUNK:${label}:${chunkCount}`, part);
    }
  }
  log(`TURN_END:${label}`, { chunkCount });
}

try {
  // 1턴: 짧은 인사 (reasoning 미발생 예상)
  await turn("greeting", "안녕");
  // 2턴: 추론 유발 입력 (함정 4 재현 시도) — 같은 thread (멀티턴 + checkpointer)
  await turn(
    "reasoning",
    "다음을 머릿속으로 단계적으로 계산해서 최종 숫자만 답해라: 17 곱하기 24 더하기 89.",
  );
  log("DONE", { ok: true });
  console.log("PROBE OK →", OUT);
} catch (e) {
  log("ERROR", { message: (e as Error).message, stack: (e as Error).stack });
  console.error("PROBE ERROR:", (e as Error).message);
  process.exit(1);
}

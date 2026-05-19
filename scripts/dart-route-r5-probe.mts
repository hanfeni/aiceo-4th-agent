/**
 * D11 R8 실측 probe — R5 책임 이전 검증(고정흐름 재설계).
 * tests 아님, 1회용. OPEN-3(subagent 사고채널) 무효화 후 R5 는
 * "전용 라우트가 model.stream() AIMessageChunk 에서 reasoning 을
 * 본문 token 에 보간하지 않음"으로 책임 이전됨(architect 확정).
 *
 * 실측 2가지:
 *  ① createModel().stream() 의 실제 AIMessageChunk content 형태
 *     (string vs 블록배열, reasoning 블록 type 문자열) 덤프
 *  ② route.ts 의 chunkText 동등 로직이 reasoning 을 거르고 text 만
 *     남기는지 — raw chunk 와 chunkText 결과 대조
 *
 * 실 OpenAI + 실 DART API 과금 (D8 사용자 승인 범위).
 * 실행: pnpm dlx tsx scripts/dart-route-r5-probe.mts
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createModel } from "../src/lib/agent/harness/model.ts";
import {
  collectDartContext,
  buildDartAnalysisQuery,
} from "../src/lib/dart/analyze-pipeline.ts";
import { getFullSystemPrompt, getTaskInstruction } from "../src/lib/dart/prompts.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const OUT = "/tmp/dart-route-r5-probe.jsonl";
writeFileSync(OUT, "");
const log = (tag: string, obj: unknown) =>
  appendFileSync(OUT, JSON.stringify({ tag, obj }) + "\n");

// route.ts 의 chunkText 와 동등(검증 대상 — 같은 로직 복제해 대조).
const NON_BODY = new Set(["thinking", "reasoning", "redacted_thinking"]);
function chunkText(msg: unknown): string {
  const m = msg as { content?: unknown; kwargs?: { content?: unknown } };
  const content = m?.content ?? m?.kwargs?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: unknown; text?: unknown };
    const type = typeof b.type === "string" ? b.type : "";
    if (NON_BODY.has(type)) continue;
    if (type === "text" && typeof b.text === "string") out += b.text;
  }
  return out;
}

try {
  log("STEP", "collectDartContext 삼성전자/financial_health");
  const ctx = await collectDartContext("삼성전자", "financial_health");
  log("CTX", { ok: ctx.ok, corpCode: ctx.corpCode, textHead: ctx.text.slice(0, 200) });
  if (!ctx.ok) {
    console.error("collectDartContext 실패:", ctx.text);
    process.exit(1);
  }

  const model = createModel(process.env, undefined);
  const system = getFullSystemPrompt("financial_health");
  const human = buildDartAnalysisQuery(
    ctx.corpName,
    "financial_health",
    ctx.text,
    getTaskInstruction("financial_health"),
  );

  let body = "";
  const contentShapes = new Set<string>();
  const blockTypes = new Set<string>();
  let reasoningSeen = 0;
  let chunkN = 0;

  const s = await model.stream([
    new SystemMessage(system),
    new HumanMessage(human),
  ]);
  for await (const chunk of s) {
    chunkN++;
    const m = chunk as { content?: unknown };
    const c = m?.content;
    contentShapes.add(typeof c === "string" ? "string" : Array.isArray(c) ? "array" : typeof c);
    if (Array.isArray(c)) {
      for (const b of c) {
        const t = (b as { type?: unknown })?.type;
        if (typeof t === "string") {
          blockTypes.add(t);
          if (NON_BODY.has(t)) reasoningSeen++;
        }
      }
    }
    body += chunkText(chunk);
    // 첫 3개 청크 raw 구조 덤프(형태 실측)
    if (chunkN <= 3) log("CHUNK_RAW", { n: chunkN, content: c });
  }

  // R5 누출 휴리스틱: reasoning 텍스트 특징이 body 에 섞이면 누출.
  // (chunkText 가 reasoning 블록을 걸렀으면 body 엔 text 만.)
  log("VERDICT", {
    chunks: chunkN,
    contentShapes: [...contentShapes],
    blockTypes: [...blockTypes],
    reasoningBlocksSeen: reasoningSeen,
    bodyLen: body.length,
    bodyHead: body.slice(0, 400),
    note:
      "blockTypes 에 reasoning/thinking 이 있어도 body 엔 text 만이면 " +
      "chunkText R5 정상(reasoning 보간 0). contentShapes 가 실제 " +
      "AIMessageChunk 형태(model.ts 주석 검증). bodyHead 로 최종 확인.",
  });
  console.log("DART ROUTE R5 PROBE OK →", OUT);
} catch (e) {
  log("ERROR", { message: (e as Error).message });
  console.error("PROBE ERROR:", (e as Error).message);
  process.exit(1);
}

/**
 * web_search RAW 청크 덤프 probe — 사용자 질문 직접 답:
 * "OpenAI 가 N번 결과를 써머라이즈해서 단순 답변만 주는가,
 *  아니면 RAW 단을 받을 수 있는가?"
 *
 * tests 아님 — 1회용 실측(R8). 우리 하네스가 아니라 그래프
 * .stream() 의 **원시 청크**를 직접 떠서, web_search_call 의
 * action 에 sources(검색 참조 URL) 가 실제 오는지, annotations
 * 외 결과 raw(snippet/content)가 있는지 확인한다.
 *
 * SDK 타입(openai@6.38.0): action.Search.sources?: {type:'url',
 * url}[] — 타입엔 있으나 실제 OpenAI 가 보내는지 실측 필요.
 *
 * 실행: pnpm dlx tsx scripts/ws-raw-dump-probe.mts
 * 출력: /tmp/ws-raw-dump.jsonl
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createDeepAgent } from "deepagents";
import { buildHarnessConfig } from "../src/lib/agent/harness/registry.ts";
import { buildAgentOptions } from "../src/lib/agent/harness/buildAgentOptions.ts";
import { createModel } from "../src/lib/agent/harness/model.ts";
import { getSystemPrompt } from "../src/lib/agent/prompts/systemPrompt.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
process.env.HARNESS_CHECKPOINTER = "memory";

const OUT = "/tmp/ws-raw-dump.jsonl";
writeFileSync(OUT, "");
const log = (obj: unknown) =>
  appendFileSync(OUT, JSON.stringify(obj) + "\n");

const env = process.env as Record<string, string | undefined>;
const options = buildAgentOptions(
  buildHarnessConfig(env as never),
  createModel(env as never),
  getSystemPrompt(),
);
const agent = createDeepAgent(options as never);

try {
  log({ tag: "TURN_START", q: "웹검색 삼성전자 주가" });
  const stream = await agent.stream(
    {
      messages: [
        { role: "user", content: "웹검색해서 삼성전자 최근 주가 확인" },
      ],
    },
    {
      configurable: { thread_id: "ws-raw-dump-1" },
      streamMode: "messages",
    },
  );

  let part = 0;
  for await (const p of stream) {
    part++;
    const [msg, meta] = p as [unknown, unknown];
    const m = msg as Record<string, unknown>;
    const ak =
      (m.additional_kwargs as Record<string, unknown> | undefined) ??
      ((m.kwargs as Record<string, unknown> | undefined)
        ?.additional_kwargs as Record<string, unknown> | undefined);
    const toolOutputs = ak?.tool_outputs;

    // web_search_call 청크면 action 통째 덤프(sources 유무 핵심).
    if (Array.isArray(toolOutputs)) {
      for (const o of toolOutputs) {
        if (
          typeof o === "object" &&
          o !== null &&
          (o as { type?: string }).type === "web_search_call"
        ) {
          log({
            tag: "WS_CALL_RAW",
            part,
            // action 전체 + 키 목록(sources 있는지 즉시 판별).
            action: (o as { action?: unknown }).action,
            actionKeys:
              typeof (o as { action?: unknown }).action === "object" &&
              (o as { action?: unknown }).action !== null
                ? Object.keys(
                    (o as { action: object }).action as object,
                  )
                : [],
            status: (o as { status?: unknown }).status,
          });
        }
      }
    }

    // content 블록의 annotations 도 덤프(결과 raw/snippet 유무).
    const content =
      (m.content as unknown) ??
      (m.kwargs as Record<string, unknown> | undefined)?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (
          typeof b === "object" &&
          b !== null &&
          Array.isArray((b as { annotations?: unknown }).annotations)
        ) {
          const anns = (b as { annotations: unknown[] }).annotations;
          log({
            tag: "ANNOTATION_RAW",
            part,
            count: anns.length,
            // 첫 annotation 키 목록(snippet/content 있는지).
            firstKeys:
              anns.length > 0 &&
              typeof anns[0] === "object" &&
              anns[0] !== null
                ? Object.keys(anns[0] as object)
                : [],
            sample: anns.slice(0, 2),
          });
        }
      }
    }
  }
  log({ tag: "DONE", parts: part });
  console.log("PROBE OK → /tmp/ws-raw-dump.jsonl");
} catch (e) {
  log({ tag: "FATAL", error: e instanceof Error ? e.message : String(e) });
  console.log("PROBE FATAL:", e);
  process.exitCode = 1;
}

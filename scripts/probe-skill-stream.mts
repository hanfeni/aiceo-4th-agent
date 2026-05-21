import { readFileSync } from "node:fs";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import * as path from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
) as Record<string, string>;

const SKILLS_ROOT = path.join(process.cwd(), "skills");
const backend = new FilesystemBackend({ rootDir: SKILLS_ROOT, virtualMode: true });
const model = new ChatOpenAI({ apiKey: env.OPENAI_API_KEY, model: "gpt-4o-mini", maxTokens: 200 });
const agent = createDeepAgent({ model, systemPrompt: "You are a helpful assistant.", tools: [], skills: ["/"], backend });

const stream = await (agent as any).stream(
  { messages: [{ role: "user", content: "use read_file tool: path=/stock-websearch-report/SKILL.md, limit=5" }] },
  { configurable: { thread_id: "probe-003" }, streamMode: ["messages", "tools"], subgraphs: true }
);

for await (const rawPart of stream) {
  const parts = Array.isArray(rawPart) ? rawPart : [rawPart];
  for (const part of parts) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as Record<string, unknown>;
    if ("event" in p && p.event === "on_tool_end") {
      // output 구조 전체 출력
      console.log("=== on_tool_end output ===");
      console.log(JSON.stringify(p.output, null, 2).slice(0, 500));
    }
  }
}

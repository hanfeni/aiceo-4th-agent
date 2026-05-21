import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import * as path from "node:path";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SKILLS_ROOT = path.join(process.cwd(), "skills");
const backend = new FilesystemBackend({ rootDir: SKILLS_ROOT, virtualMode: true });

const model = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-haiku-4-5-20251001",
});

const agent = createDeepAgent({
  model,
  systemPrompt: "You are a helpful assistant.",
  tools: [],
  skills: ["/"],
  backend,
});

const stream = await agent.stream(
  { messages: [{ role: "user", content: "read the file /stock-websearch-report/SKILL.md and tell me the first line" }] },
  { configurable: { thread_id: "probe-001" }, streamMode: ["messages", "tools"], subgraphs: true }
);

let count = 0;
for await (const part of stream) {
  if (count++ > 30) break;
  const arr = Array.isArray(part) ? part : [part];
  for (const item of arr) {
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      // tools 채널
      if ("event" in obj) {
        console.log("[TOOLS]", JSON.stringify({ event: obj.event, name: obj.name }).slice(0, 120));
      }
      // messages 채널 — ToolMessage
      if ("type" in obj && obj.type === "tool") {
        console.log("[MSG-TOOL]", JSON.stringify({ name: obj.name, content: String(obj.content ?? "").slice(0, 80) }));
      }
    }
  }
}
console.log("done");

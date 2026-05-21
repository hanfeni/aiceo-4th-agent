/**
 * 하네스 요소 자동 생성 API — POST /api/harness/generate
 *
 * 단일 요소 생성:
 *   body { kind: 'skill'|'subagent'|'instruction'|'agent', prompt: string }
 *   → { result: {...} } | { error }
 *
 * 에이전트 번들 생성(일괄):
 *   body { kind: 'agent-bundle', prompt: string,
 *          existingSkills: string[], existingSubagents: string[] }
 *   → { result: GeneratedAgentBundle } | { error }
 *
 * R7 — OPENAI_API_KEY(서버 전용) fetch → runtime=nodejs.
 */

import {
  generateHarnessElement,
  generateAgentBundle,
  DEFAULT_GENERATE_MODE,
  type GenerateKind,
  type GenerateMode,
} from "@/lib/harness-introspect/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEMENT_KINDS: readonly GenerateKind[] = ["skill", "subagent", "instruction", "agent"];
const MODES: readonly GenerateMode[] = ["reference", "rewrite"];

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "JSON 본문이 아닙니다." }, 400);
  }
  const body = raw as {
    kind?: unknown;
    prompt?: unknown;
    mode?: unknown;
    existingSkills?: unknown;
    existingSubagents?: unknown;
  };
  const kind = body.kind;
  const prompt = body.prompt;

  if (typeof kind !== "string") {
    return json({ error: "kind 를 지정하세요." }, 400);
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return json({ error: "생성할 내용을 한 줄로 입력하세요." }, 400);
  }

  // ── agent-bundle: 일괄 생성 경로 ──────────────────────────────────────
  if (kind === "agent-bundle") {
    const existingSkills = Array.isArray(body.existingSkills)
      ? (body.existingSkills as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const existingSubagents = Array.isArray(body.existingSubagents)
      ? (body.existingSubagents as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    try {
      const result = await generateAgentBundle(prompt, existingSkills, existingSubagents);
      return json({ result }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.";
      const status = /OPENAI_API_KEY/.test(msg) ? 503 : 502;
      return json({ error: msg }, status);
    }
  }

  // ── 단일 요소 생성 경로 ────────────────────────────────────────────────
  if (!ELEMENT_KINDS.includes(kind as GenerateKind)) {
    return json({ error: "kind 는 skill·subagent·instruction·agent·agent-bundle 중 하나여야 합니다." }, 400);
  }
  const mode: GenerateMode =
    typeof body.mode === "string" && MODES.includes(body.mode as GenerateMode)
      ? (body.mode as GenerateMode)
      : DEFAULT_GENERATE_MODE;

  try {
    const result = await generateHarnessElement(kind as GenerateKind, prompt, mode);
    return json({ result }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.";
    const status = /OPENAI_API_KEY/.test(msg) ? 503 : 502;
    return json({ error: msg }, status);
  }
}

/**
 * 하네스 요소 자동 생성 API — POST /api/harness/generate
 *
 * body { kind: 'skill'|'subagent'|'instruction', prompt: string }
 *   → 생성된 필드 JSON(폼이 그대로 채움) | {error}(4xx/5xx)
 *
 * gpt-5.4-mini 로 한 줄 요청에서 SKILL/SUBAGENT/INSTRUCTION 필드를 만든다
 * (generateHarnessElement). 하네스 관리 폼의 "AI 생성" 버튼이 호출.
 *
 * R7 — OPENAI_API_KEY(서버 전용) fetch → runtime=nodejs.
 * 보안: 키는 서버에서만(NEXT_PUBLIC_ 금지). 생성 실패는 에러 JSON 으로
 *  표면화(폼이 안내) — 조용한 폴백 안 함.
 */

import {
  generateHarnessElement,
  DEFAULT_GENERATE_MODE,
  type GenerateKind,
  type GenerateMode,
} from "@/lib/harness-introspect/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: readonly GenerateKind[] = ["skill", "subagent", "instruction"];
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
  const body = raw as { kind?: unknown; prompt?: unknown; mode?: unknown };
  const kind = body.kind;
  const prompt = body.prompt;
  if (typeof kind !== "string" || !KINDS.includes(kind as GenerateKind)) {
    return json({ error: "kind 는 skill·subagent·instruction 중 하나여야 합니다." }, 400);
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return json({ error: "생성할 내용을 한 줄로 입력하세요." }, 400);
  }
  // mode 는 옵셔널 — 미지정·미상값은 기본(reference)으로 폴백(관대 검증).
  const mode: GenerateMode =
    typeof body.mode === "string" && MODES.includes(body.mode as GenerateMode)
      ? (body.mode as GenerateMode)
      : DEFAULT_GENERATE_MODE;

  try {
    const result = await generateHarnessElement(kind as GenerateKind, prompt, mode);
    return json({ result }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.";
    // 키 미설정은 503(서버 환경 안내), 그 외 502(상위 API 오류).
    const status = /OPENAI_API_KEY/.test(msg) ? 503 : 502;
    return json({ error: msg }, status);
  }
}

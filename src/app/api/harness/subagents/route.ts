/**
 * 커스텀 서브에이전트 CRUD API — /harness 관리 메뉴 백엔드.
 *
 *  - GET                                  → 커스텀 서브에이전트 목록
 *  - POST {name,description,systemPrompt}  → 생성/갱신(upsertCustomSubagent)
 *  - DELETE ?name=<slug>                   → 삭제(deleteCustomSubagent)
 *
 * 실제 그래프 주입(HARNESS_SUBAGENTS 와 합성)은 메인 작업자가
 * buildHarnessConfig/buildAgentOptions 에서 listCustomSubagents() 로 처리한다
 * — 이 라우트는 store 영속만 노출한다(충돌 방지).
 *
 * R7 — subagentStore 가 fs 의존 → runtime=nodejs.
 * 보안: slug·예약어·길이 검증은 전부 subagentStore 에서(SSOT).
 */

import {
  listCustomSubagents,
  upsertCustomSubagent,
  deleteCustomSubagent,
} from "@/lib/agent/harness/subagents/subagentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(): Promise<Response> {
  try {
    return Response.json({ subagents: listCustomSubagents() });
  } catch (err) {
    console.error("[/api/harness/subagents GET] error:", err);
    return jsonError("서브에이전트를 불러오지 못했습니다.", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON 본문이 아닙니다.", 400);
  }
  if (typeof body !== "object" || body === null) {
    return jsonError("요청 본문 형식이 올바르지 않습니다.", 400);
  }
  const { name, description, systemPrompt } = body as Record<string, unknown>;
  if (typeof name !== "string") {
    return jsonError("name(서브에이전트 이름)이 필요합니다.", 400);
  }
  try {
    const entry = upsertCustomSubagent({
      name,
      description: typeof description === "string" ? description : "",
      systemPrompt: typeof systemPrompt === "string" ? systemPrompt : "",
    });
    return Response.json({ subagent: entry });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/subagents POST] error:", err);
    return jsonError("서브에이전트를 저장하지 못했습니다.", 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return jsonError("name 쿼리 파라미터가 필요합니다.", 400);
  try {
    deleteCustomSubagent(name);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/subagents DELETE] error:", err);
    return jsonError("서브에이전트를 삭제하지 못했습니다.", 500);
  }
}

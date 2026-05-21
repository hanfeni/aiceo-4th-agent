/**
 * 커스텀 에이전트 CRUD API — /api/harness/agents
 *
 *  - GET                                       → 커스텀 에이전트 목록
 *  - POST { name, description?, instructionId?, subagentNames?, skillNames? }
 *                                              → 생성(createCustomAgent) → 201
 *  - DELETE ?id=<id>  또는  body { id }         → 삭제(deleteCustomAgent) → 200
 *
 * subagents/route.ts 패턴 동형:
 *  - R7: customAgentStore 가 fs 의존 → runtime=nodejs.
 *  - mock 분기(E2E_MOCK) 0(CLAUDE.md Mock 금지).
 *  - 검증 실패는 400 + { error }(AD-4 패턴 — SSE 아님).
 *
 * Zod 스키마:
 *  - name: required, max 80 (MAX_NAME_LEN)
 *  - description: optional, max 500 (MAX_DESC_LEN)
 *  - instructionId: optional, default "default"
 *  - subagentNames: string[] optional
 *  - skillNames: string[] optional
 *
 * createCustomAgent throw 는 두 경로로 매핑:
 *  - Error(미등록/검증 실패) → 400 + { error: message }
 *  - 기타 예기치 않은 에러 → 500(서버 로그 상세, 본문은 일반화)
 */

import { z } from "zod";
import {
  listCustomAgents,
  createCustomAgent,
  deleteCustomAgent,
  MAX_NAME_LEN,
  MAX_DESC_LEN,
} from "@/lib/agent/harness/agents/customAgentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

const postSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LEN),
  description: z.string().max(MAX_DESC_LEN).optional(),
  instructionId: z.string().max(128).optional(),
  subagentNames: z.array(z.string()).optional(),
  skillNames: z.array(z.string()).optional(),
});

export async function GET(): Promise<Response> {
  try {
    return Response.json({ agents: listCustomAgents() });
  } catch (err) {
    console.error("[/api/harness/agents GET] error:", err);
    return jsonError("에이전트 목록을 불러오지 못했습니다.", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON 본문이 아닙니다.", 400);
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("요청 본문이 올바르지 않습니다. name(최대 80자)이 필요합니다.", 400);
  }

  const { name, description, instructionId, subagentNames, skillNames } = parsed.data;

  try {
    const agent = createCustomAgent({
      name,
      description: description ?? "",
      instructionId: instructionId ?? "default",
      subagentNames: subagentNames ?? [],
      skillNames: skillNames ?? [],
    });
    return Response.json({ agent }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/agents POST] error:", err);
    return jsonError("에이전트를 저장하지 못했습니다.", 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  // id 는 쿼리 파라미터 또는 body {id} 양쪽 지원(TC-54.6)
  let id: string | null = new URL(req.url).searchParams.get("id");

  if (!id) {
    // body 방식 시도
    try {
      const body = await req.json() as Record<string, unknown>;
      if (typeof body.id === "string") id = body.id;
    } catch {
      // body 없음 — id 누락 처리
    }
  }

  if (!id) return jsonError("id 가 필요합니다.", 400);

  try {
    deleteCustomAgent(id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/agents DELETE] error:", err);
    return jsonError("에이전트를 삭제하지 못했습니다.", 500);
  }
}

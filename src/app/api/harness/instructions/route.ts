/**
 * 시스템 인스트럭션 CRUD API — /api/harness/instructions.
 *
 *  - GET    목록(내장 + 사용자 정의). id·label·builtin·body 포함.
 *  - POST   upsert({ id?, label, body }). zod 검증 + 길이 상한.
 *  - DELETE ?id=  단건 삭제(내장 거부 시 400).
 *
 * 영속·내장 보호는 instructions.ts 가 담당한다. 라우트는 입력 검증과
 * HTTP 매핑만. R7: SQLite/네이티브는 없지만 파일 영속(node:fs)을 쓰므로
 * runtime=nodejs / dynamic=force-dynamic 고정(edge 불가·캐시 금지).
 */

import { z } from "zod";
import {
  listInstructions,
  upsertInstruction,
  deleteInstruction,
  MAX_LABEL_LEN,
  MAX_BODY_LEN,
} from "@/lib/agent/prompts/instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  label: z.string().min(1).max(MAX_LABEL_LEN),
  body: z.string().min(1).max(MAX_BODY_LEN),
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 전체 목록(내장 + 사용자 정의). */
export function GET(): Response {
  return json({ instructions: listInstructions() });
}

/** 인스트럭션 생성/수정. */
export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "JSON 본문이 아닙니다." }, 400);
  }
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "요청 형식 오류", detail: parsed.error.issues }, 400);
  }
  try {
    const saved = upsertInstruction(parsed.data);
    return json({ instruction: saved });
  } catch (e) {
    // 내장 수정 거부 등 — 클라이언트 입력 문제로 400.
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

/** 단건 삭제(내장·미존재 거부). */
export function DELETE(req: Request): Response {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return json({ error: "id 쿼리 파라미터가 필요합니다." }, 400);
  }
  try {
    deleteInstruction(id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

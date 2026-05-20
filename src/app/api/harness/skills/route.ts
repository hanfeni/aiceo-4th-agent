/**
 * 스킬 파일 CRUD API — /harness 관리 메뉴 백엔드.
 *
 *  - GET                 → 스킬 목록(listSkills)
 *  - GET ?name=<slug>    → 단일 스킬 SKILL.md 전문(readSkill)
 *  - POST {name,description,body} → 생성/갱신(upsertSkill)
 *  - DELETE ?name=<slug> → 삭제(deleteSkill, 내장 보호)
 *
 * R7 — skillStore 가 fs 네이티브 의존 → edge 불가. runtime=nodejs.
 * 보안: slug·길이 검증은 전부 skillStore 에서(SSOT). 라우트는 입력
 * 형태 검증 + 에러 메시지 전달만. 상세 에러는 사용자에게 그대로 노출해도
 * 안전(검증 메시지 한국어 — 강의용). 예기치 못한 예외만 일반화한다.
 */

import {
  listSkills,
  readSkill,
  upsertSkill,
  deleteSkill,
} from "@/lib/agent/harness/skills/skillStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function GET(req: Request): Promise<Response> {
  const name = new URL(req.url).searchParams.get("name");
  try {
    if (name) {
      const content = readSkill(name);
      if (content === null) return jsonError("스킬을 찾을 수 없습니다.", 404);
      return Response.json({ name, content });
    }
    return Response.json({ skills: listSkills() });
  } catch (err) {
    // slug 검증 실패(readSkill 의 assertValidSlug)는 400 으로.
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/skills GET] error:", err);
    return jsonError("스킬을 불러오지 못했습니다.", 500);
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
  const { name, description, body: skillBody } = body as Record<string, unknown>;
  if (typeof name !== "string") {
    return jsonError("name(스킬 이름)이 필요합니다.", 400);
  }
  try {
    const entry = upsertSkill({
      name,
      description: typeof description === "string" ? description : "",
      body: typeof skillBody === "string" ? skillBody : "",
    });
    return Response.json({ skill: entry });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/skills POST] error:", err);
    return jsonError("스킬을 저장하지 못했습니다.", 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return jsonError("name 쿼리 파라미터가 필요합니다.", 400);
  try {
    deleteSkill(name);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/skills DELETE] error:", err);
    return jsonError("스킬을 삭제하지 못했습니다.", 500);
  }
}

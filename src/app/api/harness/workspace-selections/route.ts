/**
 * 워크스페이스(에이전트 A/B/C)별 스킬·서브에이전트 선택 API.
 *
 *  - GET ?id=workspace1  → { selection, skills[], subagents[] }
 *      selection: 저장된 선택(미저장이면 {skills:null, subagents:null}=전체).
 *      skills/subagents: 선택 UI 가 보여줄 전체 카탈로그(name+설명).
 *  - PUT ?id=workspace1 { skills, subagents } → { selection }
 *      skills/subagents 각각 null=전체, 배열=그 name 만. 정규화 후 영속.
 *
 * 실제 그래프 필터링은 buildHarnessConfig(registry.ts)에서 selection 을
 * 받아 처리한다(R2 단일 지점) — 이 라우트는 store 영속 + 카탈로그 노출만.
 *
 * R7 — store/skillStore/subagent 가 fs 의존 → runtime=nodejs.
 */

import {
  getWorkspaceSelection,
  setWorkspaceSelection,
} from "@/lib/agent/harness/workspaceSelectionStore";
import { listSkills } from "@/lib/agent/harness/skills/skillStore";
import { HARNESS_SUBAGENTS } from "@/lib/agent/harness/subagents";
import { listCustomSubagents } from "@/lib/agent/harness/subagents/subagentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** 선택 UI 카탈로그 항목(스킬·서브에이전트 공통 형태). */
interface CatalogItem {
  name: string;
  description: string;
  builtin: boolean;
}

/** 스킬·서브에이전트 전체 카탈로그(name+설명+builtin). */
function buildCatalog(): { skills: CatalogItem[]; subagents: CatalogItem[] } {
  const skills: CatalogItem[] = listSkills().map((s) => ({
    name: s.name,
    description: s.description,
    builtin: s.builtin,
  }));
  // 내장 서브에이전트(name 으로 builtin 표시) + 커스텀.
  const builtinNames = new Set(HARNESS_SUBAGENTS.map((s) => s.name));
  const subagents: CatalogItem[] = [
    ...HARNESS_SUBAGENTS.map((s) => ({
      name: s.name,
      description: s.description,
      builtin: true,
    })),
    ...listCustomSubagents().map((s) => ({
      name: s.name,
      description: s.description,
      builtin: builtinNames.has(s.name),
    })),
  ];
  return { skills, subagents };
}

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id 쿼리 파라미터가 필요합니다.", 400);
  try {
    const selection = getWorkspaceSelection(id);
    const catalog = buildCatalog();
    return Response.json({ selection, ...catalog });
  } catch (err) {
    console.error("[/api/harness/workspace-selections GET] error:", err);
    return jsonError("선택 정보를 불러오지 못했습니다.", 500);
  }
}

export async function PUT(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id 쿼리 파라미터가 필요합니다.", 400);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON 본문이 아닙니다.", 400);
  }
  if (typeof body !== "object" || body === null) {
    return jsonError("요청 본문 형식이 올바르지 않습니다.", 400);
  }
  const { skills, subagents } = body as Record<string, unknown>;
  try {
    const selection = setWorkspaceSelection(id, { skills, subagents });
    return Response.json({ selection });
  } catch (err) {
    if (err instanceof Error) return jsonError(err.message, 400);
    console.error("[/api/harness/workspace-selections PUT] error:", err);
    return jsonError("선택 정보를 저장하지 못했습니다.", 500);
  }
}

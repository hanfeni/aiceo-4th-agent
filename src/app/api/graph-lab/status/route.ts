/**
 * 온톨로지 실습 — 그래프 현황 API. GET /api/graph-lab/status.
 *
 * UI 진입 시 "그래프가 이미 구축됐는지" 표시용. Neo4j 미기동이면
 * null(=미구축)로 안전 반환(에러로 막지 않음). R7 runtime=nodejs.
 */

import { graphStats } from "@/lib/graphlab/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const stats = await graphStats();
  return new Response(JSON.stringify({ stats }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

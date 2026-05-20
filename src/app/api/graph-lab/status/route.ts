/**
 * 온톨로지 실습 — 그래프 현황 API. GET /api/graph-lab/status.
 *
 * UI 진입 시 "그래프가 이미 구축됐는지" 표시용. Neo4j 미기동이면
 * null(=미구축)로 안전 반환(에러로 막지 않음). R7 runtime=nodejs.
 */

import { graphStats, loadedDatasetIds } from "@/lib/graphlab/load";
import { GRAPH_DATASET_IDS, DEFAULT_DATASET_ID } from "@/lib/graphlab/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // datasetId 쿼리(미지정/형식오류=기본). 화이트리스트 검증.
  const url = new URL(req.url);
  const q = url.searchParams.get("datasetId");
  const datasetId =
    q && GRAPH_DATASET_IDS.includes(q) ? q : DEFAULT_DATASET_ID;
  // 선택 데이터셋의 stats + 현재 공존 적재된 데이터셋 id 목록.
  const [stats, loaded] = await Promise.all([
    graphStats(datasetId),
    loadedDatasetIds(),
  ]);
  return new Response(JSON.stringify({ stats, loaded }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

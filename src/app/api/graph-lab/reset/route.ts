/**
 * 온톨로지 실습 — 그래프 삭제 API. POST /api/graph-lab/reset.
 *
 * 데이터셋 공존(사용자 결정 2026-05-20): 여러 데이터셋이 라벨 분리로
 * 동시 적재되므로, 전체 삭제가 아니라 **선택 데이터셋 라벨 노드만**
 * DETACH DELETE 한다(다른 데이터셋 보존). body.datasetId 미지정이면
 * 기본 SEC EDGAR. MemStore 는 삭제 대상이 현재 적재분과 같을 때만 비움.
 * R7 runtime=nodejs.
 */

import { runCypher } from "@/lib/graphlab/client";
import { clearMemStore, getMemStore } from "@/lib/graphlab/load";
import {
  getDataset,
  GRAPH_DATASET_IDS,
  DEFAULT_DATASET_ID,
} from "@/lib/graphlab/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // datasetId 화이트리스트 검증(미지정/형식오류=기본).
  let datasetId = DEFAULT_DATASET_ID;
  try {
    const body = (await req.json()) as { datasetId?: unknown };
    if (
      typeof body?.datasetId === "string" &&
      GRAPH_DATASET_IDS.includes(body.datasetId)
    ) {
      datasetId = body.datasetId;
    }
  } catch {
    // 본문 없음 → 기본 데이터셋
  }
  const L = getDataset(datasetId).cypher;
  try {
    // 이 데이터셋 라벨 노드만 삭제(공존하는 다른 데이터셋 보존).
    await runCypher(
      `MATCH (n) WHERE n:${L.subjectLabel} OR n:${L.objectLabel} OR n:${L.positionLabel} DETACH DELETE n`,
    );
    // MemStore 는 마지막 적재 1개만 — 삭제 대상과 같을 때만 비움.
    if (getMemStore()?.datasetId === datasetId) clearMemStore();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error:
          (e instanceof Error ? e.message : String(e)) +
          " — Neo4j 가 떠 있는지 확인하세요.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

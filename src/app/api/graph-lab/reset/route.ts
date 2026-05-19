/**
 * 온톨로지 실습 — 그래프 삭제 API. POST /api/graph-lab/reset.
 *
 * index-lab 의 인덱스 삭제와 동형(실습용 데이터 초기화). Neo4j
 * 전체 노드/엣지 DETACH DELETE + 인메모리 보관소 비움. 강의
 * 실습이라 단일 그래프만 쓰므로 전체 삭제가 곧 "이 그래프 삭제".
 * R7 runtime=nodejs.
 */

import { runCypher } from "@/lib/graphlab/client";
import { clearMemStore } from "@/lib/graphlab/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    await runCypher("MATCH (n) DETACH DELETE n");
    clearMemStore();
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

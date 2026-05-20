/**
 * 온톨로지 실습 — 3방식 비교 API. POST /api/graph-lab/compare (SSE).
 *
 * 같은 질문을 RAG / Text-to-SQL / GraphRAG 으로 돌려 결과를 스트리밍.
 * runCompare 제너레이터를 SSE 직렬화 (rag/route.ts 동형). R7 nodejs.
 */

import { z } from "zod";
import { runCompare } from "@/lib/graphlab/compare";
import { GRAPH_DATASET_IDS } from "@/lib/graphlab/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(2).max(2000),
  // 데이터셋 선택(미지정=기본 SEC EDGAR). 화이트리스트 enum 검증.
  datasetId: z.enum(GRAPH_DATASET_IDS as [string, ...string[]]).optional(),
});

function encodeSse(ev: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON 본문이 아닙니다." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "요청 형식 오류", detail: parsed.error.issues }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of runCompare(parsed.data.query, parsed.data.datasetId)) {
          controller.enqueue(encodeSse(ev));
        }
      } catch (e) {
        controller.enqueue(
          encodeSse({
            type: "method_error",
            method: "graphrag",
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

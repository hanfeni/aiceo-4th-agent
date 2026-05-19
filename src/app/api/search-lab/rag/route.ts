/**
 * RAG 실습 API — POST /api/search-lab/rag (SSE).
 *
 * 검색 실습의 RAG 모드 전용 스트리밍 경로(사용자 결정 2026-05-19).
 * /api/search-lab(단발 JSON)은 무변경 — RAG 만 별도 SSE.
 * 메타랩 /api/meta-lab route 패턴 동형: zod → ReadableStream →
 * `data:<JSON>\n\n`. R7 runtime=nodejs(OpenSearch·모델 node 전용).
 */

import { z } from "zod";
import { runRag } from "@/lib/searchlab/rag";
import { SEARCH_DOMAINS } from "@/lib/searchlab/domains";

export const runtime = "nodejs";

const bodySchema = z.object({
  domain: z.enum(SEARCH_DOMAINS),
  query: z.string().min(1).max(500),
  mode: z.enum(["lexical", "vector", "hybrid"]),
  hybridMethod: z.enum(["default", "rrf"]).optional(),
  lexicalPreset: z.enum(["balanced", "title", "body"]).optional(),
  topK: z.number().int().min(1).max(50).optional(),
  ragTopK: z.number().int().min(1).max(10).optional(),
});

function encodeSse(ev: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "JSON 본문이 아닙니다." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "요청 형식 오류",
        detail: parsed.error.issues,
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of runRag(parsed.data)) {
          controller.enqueue(encodeSse(ev));
        }
      } catch (e) {
        controller.enqueue(
          encodeSse({
            type: "error",
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

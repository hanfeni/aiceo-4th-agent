/**
 * Text-to-SQL 실습 API — POST /api/search-lab/text2sql (SSE).
 *
 * 검색 실습의 Text-to-SQL 모드 전용 스트리밍 경로(RAG 옆 task).
 * search-lab/rag route 패턴 동형: zod → ReadableStream →
 * `data:<JSON>\n\n`. R7 runtime=nodejs (better-sqlite3·모델 node).
 *
 * 도메인은 SQL_DOMAINS(적재 도메인) — 검색 도메인과 같은 5개이나
 * 적재 대상은 *.csv 라 별도 enum 으로 검증한다.
 */

import { z } from "zod";
import { runText2Sql } from "@/lib/sqllab/text2sql";
import { SQL_DOMAINS } from "@/lib/sqllab/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domain: z.enum(SQL_DOMAINS),
  question: z.string().min(1).max(500),
  maxRows: z.number().int().min(1).max(200).optional(),
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
        for await (const ev of runText2Sql(parsed.data)) {
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

/**
 * Text-to-SQL with Chart API — POST /api/search-lab/text2sql-chart (SSE).
 *
 * 기존 text2sql route 와 별도(기존 무변경). search-lab/rag route
 * 패턴 동형: zod → ReadableStream → `data:<JSON>\n\n`.
 * R7 runtime=nodejs (better-sqlite3·모델 node 전용).
 */

import { z } from "zod";
import { runText2SqlChart } from "@/lib/sqllab/text2sqlChart";
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
        for await (const ev of runText2SqlChart(parsed.data)) {
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

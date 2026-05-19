/**
 * 데이터 적재 API — POST /api/sql-lab/load (SSE).
 *
 * "CSV → SQLite 적재" 버튼이 호출 → loadDomain 제너레이터를 SSE
 * 로 직렬화(search-lab/index route 와 동일 패턴). 학생이
 * fetch→파싱→트랜잭션 적재 진행을 실시간으로 본다.
 * R7 runtime=nodejs (better-sqlite3 네이티브).
 */

import { z } from "zod";
import { loadDomain } from "@/lib/sqllab/load";
import { SQL_DOMAINS } from "@/lib/sqllab/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domain: z.enum(SQL_DOMAINS),
  // 적재 행수 상한(강의장 메모리/시간 절약 — 검색 limit 패턴 동형).
  limit: z.number().int().min(1).max(50000).optional(),
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

  const { domain, limit } = parsed.data;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of loadDomain(domain, limit)) {
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

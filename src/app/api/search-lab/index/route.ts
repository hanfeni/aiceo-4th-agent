/**
 * 검색 실습 색인 API — POST /api/search-lab/index (SSE).
 *
 * 메뉴 "색인" 버튼이 호출 → runIndexing 제너레이터를 SSE 로 직렬화
 * (meta-lab route 와 동일 패턴). 학생이 fetch→임베딩→bulk 진행을
 * 실시간으로 본다. R7 runtime=nodejs (OpenSearch 클라이언트 node 전용).
 */

import { z } from "zod";
import { runIndexing } from "@/lib/searchlab/index-run";
import { SEARCH_DOMAINS } from "@/lib/searchlab/domains";
import { DECOMPOUND_MODES, EMBED_MODELS } from "@/lib/searchlab/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  domain: z.enum(SEARCH_DOMAINS),
  limit: z.number().int().min(1).max(2000).optional(),
  // 색인 파라미터(IndexLabView 선택). 미지정 = 기존 기본값.
  decompoundMode: z.enum(DECOMPOUND_MODES).optional(),
  embedModel: z
    .enum(Object.keys(EMBED_MODELS) as [string, ...string[]])
    .optional(),
  // 청크 옵션(토큰, cl100k). 0 = 청킹 OFF(디폴트 — 문서=1벡터).
  // 상한 5000: UI 최대 청크(5000토큰) 허용. text-embedding 입력
  // 한계(8191) 내라 임베딩 안전(여유 3191).
  chunkSize: z.number().int().min(0).max(5000).optional(),
  chunkOverlap: z.number().int().min(0).max(1000).optional(),
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
        // zod enum 이 런타임 값을 EMBED_MODELS 키/DECOMPOUND_MODES
        // 로 보장하나 출력 타입은 string → IndexRunParams 리터럴
        // 유니온으로 좁힘(검증된 안전 캐스팅, 동기화 위험 0).
        for await (const ev of runIndexing(
          parsed.data as Parameters<typeof runIndexing>[0],
        )) {
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

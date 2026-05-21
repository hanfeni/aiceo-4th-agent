/**
 * 메타라벨링 실습 API — POST /api/meta-lab (SSE).
 *
 * chat route 의 SSE 패턴 재사용: bodySchema(zod) → ReadableStream →
 * `data: <JSON>\n\n` 직렬화 → text/event-stream. R7 runtime=nodejs.
 * 학생이 LLM 이 실제 토큰을 뱉는 모습 + 시스템 인스트럭션을 본다.
 */

import { z } from "zod";
import { runMetaLab } from "@/lib/metalab/run";
import { SEARCH_DOMAINS } from "@/lib/searchlab/domains";

export const runtime = "nodejs";

const bodySchema = z.object({
  domain: z.enum(SEARCH_DOMAINS),
  task: z.enum(["label", "discover", "allinone", "allinone_index"]),
  // label/discover 문서 수 — 1~30 또는 "all"(전체 코퍼스). 옵션.
  count: z.union([z.number().int().min(1).max(30), z.literal("all")]).optional(),
  // discover 발굴 회수 — 1~10(1=단일 묶음, >1=비복원 분할 병렬). 옵션.
  discoverRounds: z.number().int().min(1).max(10).optional(),
  // 올인원 규모 파라미터(작업모드별 문서수 파라미터화 — 2026-05-21).
  // 미지정 시 run.ts 기본 상수(=기존값, 회귀 0). 상한은 run.ts clampInt
  // 와 정합(과도 입력 방어 — 강의 비용·시간 제어).
  discoverPerSet: z.number().int().min(5).max(50).optional(),
  discoverSets: z.number().int().min(1).max(20).optional(),
  classifyCount: z.number().int().min(1).max(30).optional(),
  metaLimit: z
    .union([z.number().int().min(1).max(500), z.literal("all")])
    .optional(),
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
        for await (const ev of runMetaLab(parsed.data)) {
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

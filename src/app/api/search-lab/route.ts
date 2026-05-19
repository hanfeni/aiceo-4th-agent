/**
 * 검색 실습 API — POST /api/search-lab
 *
 * 검색은 즉시 결과(스트리밍 불필요) → JSON 응답 (챗 SSE 패턴 아님).
 * R7: runtime="nodejs" (OpenSearch 클라이언트는 node 전용).
 * R8: 실측이 스펙과 충돌하면 임의 변경 말고 사용자 보고.
 *
 * 검증 실패 → 400 JSON. OpenSearch 미기동/인덱스 없음 → 503 JSON
 * (학생이 run-opensearch.sh 를 안 돌린 흔한 상황 → 명확한 안내).
 */

import { z } from "zod";
import { search } from "@/lib/searchlab/search";
import { SEARCH_DOMAINS } from "@/lib/searchlab/domains";

export const runtime = "nodejs";

const bodySchema = z.object({
  domain: z.enum(SEARCH_DOMAINS),
  query: z.string().min(1).max(500),
  mode: z.enum(["lexical", "vector", "hybrid"]),
  hybridMethod: z.enum(["default", "rrf"]).optional(),
  lexicalPreset: z.enum(["balanced", "title", "body"]).optional(),
  topK: z.number().int().min(1).max(50).optional(),
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "JSON 본문이 아닙니다." }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: "요청 형식 오류", detail: parsed.error.issues },
      400,
    );
  }

  try {
    const hits = await search(parsed.data);
    return json({ hits, count: hits.length }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // OpenSearch 미기동·인덱스 없음 → 학생 흔한 상황. 503 + 안내.
    if (
      /ECONNREFUSED|index_not_found|no such index|connect/i.test(msg)
    ) {
      return json(
        {
          error:
            "OpenSearch 미준비 — 먼저 ./run-opensearch.sh 를 실행해 " +
            "컨테이너 기동 + 5도메인 색인을 완료하세요.",
          detail: msg.slice(0, 300),
        },
        503,
      );
    }
    return json({ error: "검색 실패", detail: msg.slice(0, 300) }, 500);
  }
}

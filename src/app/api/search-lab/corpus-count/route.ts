/**
 * 도메인 원본 문서 총 개수 — GET /api/search-lab/corpus-count?domain=
 *
 * IndexLabView 가 "색인할 문서 수" 선택 전, 원본이 전부 몇 개인지
 * 안내하려고 호출. GitHub raw fetch → 라인 수(=문서 수). R7 nodejs.
 */

import { corpusCount, isSearchDomain } from "@/lib/searchlab/domains";

export const runtime = "nodejs";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  if (!isSearchDomain(domain)) {
    return json({ error: `알 수 없는 도메인: ${domain}` }, 400);
  }
  try {
    const total = await corpusCount(domain);
    return json({ domain, total }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "원본 개수 조회 실패", detail: msg.slice(0, 300) }, 502);
  }
}

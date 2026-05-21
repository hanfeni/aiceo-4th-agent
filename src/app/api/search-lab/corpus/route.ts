/**
 * 도메인 원본 문서 샘플 — GET /api/search-lab/corpus?domain=&limit=
 *
 * IndexLabView "문서 원본 보기" 모달이 호출. GitHub raw 원본을
 * 앞 N건(기본 50, 최대 100)만 fetch → 좌우 네비로 열람. 전체는
 * 무거우니 상한(클라이언트 메모리·응답 시간). R7 nodejs.
 */

import { fetchCorpus, isSearchDomain } from "@/lib/searchlab/domains";
import { countTokens } from "@/lib/searchlab/chunk";

export const runtime = "nodejs";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const domain = u.searchParams.get("domain") ?? "";
  if (!isSearchDomain(domain)) {
    return json({ error: `알 수 없는 도메인: ${domain}` }, 400);
  }
  const raw = Number(u.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), 1), 100)
    : 50;

  try {
    const docs = await fetchCorpus(domain, limit);
    // 모달 표시에 필요한 필드만(부가 필드 제외 — 페이로드 절감).
    const items = docs.map((d) => {
      const body = String(d.body ?? "");
      return {
        doc_id: String(d.doc_id ?? ""),
        title: String(d.title ?? ""),
        body,
        tokens: countTokens(body),
      };
    });
    return json({ domain, count: items.length, items }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "원본 문서 조회 실패", detail: msg.slice(0, 300) }, 502);
  }
}

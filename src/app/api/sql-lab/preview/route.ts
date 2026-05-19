/**
 * 데이터 미리보기 API — GET /api/sql-lab/preview?domain=&rows=
 *
 * DataLoadView 가 "데이터 보기" 버튼으로 호출 — 적재 전 GitHub raw
 * CSV 앞 N행을 표로 확인(index-lab corpus-count/corpus 의 SQL 판).
 * R7 nodejs (parseCsv 는 순수하나 라우트 일관성 위해 명시).
 */

import { previewCsv } from "@/lib/sqllab/load";
import { isSqlDomain } from "@/lib/sqllab/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const domain = sp.get("domain") ?? "";
  if (!isSqlDomain(domain)) {
    return json({ error: `알 수 없는 도메인: ${domain}` }, 400);
  }
  const rows = Math.min(
    Math.max(Number(sp.get("rows")) || 20, 1),
    100,
  );
  try {
    const preview = await previewCsv(domain, rows);
    return json({ domain, ...preview }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "미리보기 실패", detail: msg.slice(0, 300) }, 502);
  }
}

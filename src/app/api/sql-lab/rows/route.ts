/**
 * 적재 테이블 미리보기 API — GET /api/sql-lab/rows?domain=&rows=
 *
 * Text-to-SQL/Chart 모드의 "데이터 보기" — preview(GitHub raw CSV 원본)와
 * 달리 **실제 적재된 SQLite 테이블** 앞 N행을 조회한다(getDb().prepare().all()
 * — text2sql 실행 단계와 동일 경로). 미적재면 loaded:false.
 * R7 nodejs (better-sqlite3 네이티브).
 */

import { previewTable } from "@/lib/sqllab/db";
import { isSqlDomain } from "@/lib/sqllab/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function GET(req: Request): Response {
  const sp = new URL(req.url).searchParams;
  const domain = sp.get("domain") ?? "";
  if (!isSqlDomain(domain)) {
    return json({ error: `알 수 없는 도메인: ${domain}` }, 400);
  }
  const rows = Math.min(Math.max(Number(sp.get("rows")) || 20, 1), 100);
  try {
    const preview = previewTable(domain, rows);
    if (!preview) {
      return json({ domain, loaded: false }, 200);
    }
    return json({ domain, loaded: true, ...preview }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "테이블 조회 실패", detail: msg.slice(0, 300) }, 500);
  }
}

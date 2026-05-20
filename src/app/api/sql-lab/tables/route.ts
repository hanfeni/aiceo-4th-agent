/**
 * 적재 테이블 관리 — GET(전 도메인 적재 현황) / DELETE(도메인 초기화).
 *
 * 보안: 도메인은 SQL_DOMAINS enum 으로만 받는다(임의 테이블/파일
 * 접근 불가). dropTable 도 sqllab_ prefix 테이블만 다룬다(이중
 * 방어 — search-lab/indices 의 prefix 가드와 동일 사상).
 * R7 nodejs (better-sqlite3 네이티브).
 */

import { z } from "zod";
import { tableInfo, dropTable } from "@/lib/sqllab/db";
import {
  SQL_DOMAINS,
  CUSTOM_SQL_DOMAIN,
  isSqlDomain,
} from "@/lib/sqllab/domains";
import {
  getSqlDomainSpec,
  isCustomRegistered,
  unregisterCustomDomain,
} from "@/lib/sqllab/dynamicDomains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  try {
    // custom 슬롯은 등록(업로드 적재 완료)된 경우에만 목록에 노출
    // (미등록 placeholder 가 드롭다운/현황에 새지 않게).
    const domains = SQL_DOMAINS.filter(
      (d) => d !== CUSTOM_SQL_DOMAIN || isCustomRegistered(),
    );
    const tables = domains.map((d) => {
      const spec = getSqlDomainSpec(d);
      const info = tableInfo(d);
      return {
        domain: d,
        label: spec.label,
        table: spec.table,
        loaded: info !== null,
        rowCount: info?.rowCount ?? 0,
      };
    });
    return json({ tables }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "적재 현황 조회 실패", detail: msg.slice(0, 300) }, 500);
  }
}

const deleteSchema = z.object({ domain: z.string().min(1).max(40) });

export async function DELETE(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "JSON 본문이 아닙니다." }, 400);
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "요청 형식 오류" }, 400);
  }
  const { domain } = parsed.data;
  if (!isSqlDomain(domain)) {
    return json(
      { error: `초기화 거부: ${domain} 는 실습 도메인이 아닙니다.` },
      403,
    );
  }
  try {
    dropTable(domain);
    // custom 초기화는 동적 메타도 함께 해제(드롭다운에서 사라지게).
    if (domain === CUSTOM_SQL_DOMAIN) unregisterCustomDomain();
    return json({ domain, dropped: true }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "초기화 실패", detail: msg.slice(0, 300) }, 500);
  }
}

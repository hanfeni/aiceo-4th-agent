/**
 * 검색 도메인 색인 상태 — GET /api/search-lab/status
 *
 * SearchLabView 가 ① 도메인 선택 chip 에 "색인됨 N건 / 미색인"을
 * 표기하려고 호출. 5개 도메인 각 인덱스 존재 + 문서 수. admin.ts
 * indexDocCount(prefix 검증 포함) 재사용. R7 nodejs.
 */

import {
  SEARCH_DOMAINS,
  CUSTOM_SEARCH_DOMAIN,
} from "@/lib/searchlab/domains";
import { indexDocCount } from "@/lib/searchlab/admin";
import {
  getSearchDomainSpec,
  isCustomSearchRegistered,
} from "@/lib/searchlab/dynamicDomains";

export const runtime = "nodejs";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  try {
    // custom 슬롯은 등록(업로드 색인 완료)된 경우에만 상태 노출
    // (미등록 placeholder 가 UI 에 새지 않게 — SQL tables 와 동일 사상).
    const domains = SEARCH_DOMAINS.filter(
      (d) => d !== CUSTOM_SEARCH_DOMAIN || isCustomSearchRegistered(),
    );
    // 도메인별 병렬 조회. 인덱스 없으면 count=null(미색인).
    const entries = await Promise.all(
      domains.map(async (d) => {
        const count = await indexDocCount(getSearchDomainSpec(d).index);
        return [d, count] as const;
      }),
    );
    const status: Record<string, number | null> = {};
    for (const [d, c] of entries) status[d] = c;
    return json({ status }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ECONNREFUSED|connect|getaddrinfo/i.test(msg)) {
      return json(
        { error: "OpenSearch 미기동 — 색인 상태 확인 불가", status: {} },
        503,
      );
    }
    return json({ error: "상태 조회 실패", detail: msg.slice(0, 300) }, 500);
  }
}

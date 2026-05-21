/**
 * 색인된 문서 열람 — GET /api/search-lab/docs?domain=&from=&size=
 *
 * 검색 실습 "인덱스 보기" 모달이 호출. 원본 corpus(GitHub raw)가
 * 아니라 **실제 OpenSearch 에 색인된 도큐먼트**를 match_all 로
 * 그대로 반환 — 청킹 ON 이면 청크 단위(chunk_id)가 보여 학생이
 * "내가 256토큰으로 색인했더니 이렇게 쪼개졌다"를 확인(교육 핵심).
 *
 * 50개씩 페이지네이션(사용자 결정 2026-05-19): from/size 로 끊어
 * 로드 — 청킹 대량 색인(수백~수천 청크)도 메모리·응답 안정.
 * R7 nodejs (OpenSearch 클라이언트 node 전용).
 */

import { getSearchClient } from "@/lib/searchlab/client";
import { isSearchDomain } from "@/lib/searchlab/domains";
import { getSearchDomainSpec } from "@/lib/searchlab/dynamicDomains";

export const runtime = "nodejs";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// _source 전 필드를 동적으로 통과. 올인원 색인의 메타 라벨
// (main_category/mid_category/sub_category/keywords/meta_description
// 등)이 인덱스마다 다르므로 화이트리스트 금지 — 있는 그대로 노출.
interface OsDocHit {
  _source: Record<string, unknown>;
}

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const domain = u.searchParams.get("domain") ?? "";
  if (!isSearchDomain(domain)) {
    return json({ error: `알 수 없는 도메인: ${domain}` }, 400);
  }
  const rawFrom = Number(u.searchParams.get("from") ?? 0);
  const rawSize = Number(u.searchParams.get("size") ?? 50);
  const from = Number.isFinite(rawFrom)
    ? Math.max(Math.trunc(rawFrom), 0)
    : 0;
  // 페이지 크기 상한 50 (사용자 결정 — 50개씩 로드)
  const size = Number.isFinite(rawSize)
    ? Math.min(Math.max(Math.trunc(rawSize), 1), 50)
    : 50;
  // resolver 경유(custom index 는 searchlab-custom 고정).
  const index = getSearchDomainSpec(domain).index;

  try {
    const client = getSearchClient();
    // match_all + from/size. _source 최소 필드. chunk_id 정렬로
    // 청크 순서 안정(없으면 doc_id) — 페이지 간 순서 일관.
    const res = await client.search({
      index,
      body: {
        from,
        size,
        track_total_hits: true,
        // _source 전체 — 메타 라벨(올인원 색인) 포함 모든 색인
        // 필드를 그대로 노출. 학생이 "실제 색인된 전체 도큐먼트"
        // (벡터·라벨까지)를 확인(사용자 결정 2026-05-19/05-21).
        _source: true,
        sort: [{ doc_id: "asc" }, { chunk_id: "asc" }],
        query: { match_all: {} },
      },
    });
    // OpenSearch SDK 제네릭과 OsDocHit 직접 안 겹쳐 2단계 캐스팅
    // (search.ts 선례 동일 — 런타임 형태 _source 로 일치).
    const hitsRaw = (res.body.hits?.hits ?? []) as unknown as OsDocHit[];
    const items = hitsRaw.map((h) => {
      const src = h._source ?? {};
      const emb = Array.isArray(src.embedding)
        ? (src.embedding as number[])
        : undefined;
      // 표준 필드는 정형화하고, 그 외 _source 전 필드(메타 라벨
      // 등)만 fields 로 묶어 모달이 동적 렌더. embedding(별도
      // 압축·더보기)·표준 4필드는 fields 에서 제외(중복 방지).
      const {
        embedding: _omitEmb,
        doc_id: _omitId,
        chunk_id: _omitChunk,
        title: _omitTitle,
        body: _omitBody,
        ...rest
      } = src;
      void _omitEmb;
      void _omitId;
      void _omitChunk;
      void _omitTitle;
      void _omitBody;
      return {
        doc_id: String(src.doc_id ?? ""),
        chunk_id:
          typeof src.chunk_id === "number" ? src.chunk_id : undefined,
        title: String(src.title ?? ""),
        body: String(src.body ?? ""),
        // 전체 벡터 + 차원(모달이 압축·더보기 — raw 정보 손실 0)
        embedding: emb,
        embedding_dim: emb?.length,
        // doc_id/chunk_id/title/body 외 모든 _source 필드(동적).
        fields: rest as Record<string, unknown>,
      };
    });
    // total: 전체 hit 수 (페이지네이션 "N / total" 표기용)
    const totalRaw = res.body.hits?.total as
      | number
      | { value: number }
      | undefined;
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : (totalRaw?.value ?? items.length);
    return json({ domain, from, size, total, items }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ECONNREFUSED|index_not_found|no such index|connect/i.test(msg)) {
      return json(
        {
          error:
            "이 도메인은 아직 색인 전입니다 — 도메인 색인 메뉴에서 " +
            "먼저 색인하세요.",
          detail: msg.slice(0, 200),
        },
        503,
      );
    }
    return json({ error: "색인 문서 조회 실패", detail: msg.slice(0, 300) }, 500);
  }
}

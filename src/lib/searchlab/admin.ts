/**
 * 검색 실습 — OpenSearch 인덱스 관리 헬퍼 (목록·count·삭제).
 *
 * 보안 핵심: 실습 인덱스는 모두 "searchlab-" prefix(domains.ts
 * DOMAIN_SPEC.index 규칙). 목록·삭제는 이 prefix 로만 한정한다 —
 * OpenSearch 시스템/타 인덱스 절대 노출·삭제 금지(아키텍트 원칙).
 * prefix 외 인덱스명이 들어오면 거부한다.
 */

import { getSearchClient } from "./client";
import { DOMAIN_SPEC, SEARCH_DOMAINS, type SearchDomain } from "./domains";
import { getSearchDomainSpec } from "./dynamicDomains";

/** 실습 인덱스 공통 prefix — 이 외 인덱스는 절대 건드리지 않는다. */
export const SEARCHLAB_PREFIX = "searchlab-";

export function isSearchlabIndex(name: string): boolean {
  return name.startsWith(SEARCHLAB_PREFIX);
}

export interface IndexInfo {
  index: string;
  /** 매핑되는 도메인(있으면). 알 수 없으면 undefined. */
  domain?: SearchDomain;
  /** 도메인 한글 라벨(있으면 — custom 은 동적 라벨). 매핑 실패 시 undefined. */
  label?: string;
  docCount: number;
  /** 바이트 크기(가능 시). 없으면 undefined. */
  sizeBytes?: number;
}

/** index 명 → 도메인 역추적 (DOMAIN_SPEC.index 와 일치하는 것). */
function domainOf(indexName: string): SearchDomain | undefined {
  return SEARCH_DOMAINS.find((d) => DOMAIN_SPEC[d].index === indexName);
}

/**
 * searchlab-* 인덱스만 목록 + 문서 수. 다른 인덱스는 결과에서 배제.
 * OpenSearch 미기동 등은 호출부가 try/catch 로 처리.
 */
export async function listSearchlabIndices(): Promise<IndexInfo[]> {
  const client = getSearchClient();
  const res = await client.cat.indices({
    index: `${SEARCHLAB_PREFIX}*`,
    format: "json",
    bytes: "b",
  });
  const rows = (res.body ?? []) as Array<{
    index?: string;
    "docs.count"?: string;
    "store.size"?: string;
  }>;
  return rows
    .filter((r) => typeof r.index === "string" && isSearchlabIndex(r.index))
    .map((r) => {
      const dom = domainOf(r.index as string);
      return {
        index: r.index as string,
        domain: dom,
        // custom 은 동적 라벨, 정적 도메인은 고정 라벨(없으면 undefined).
        label: dom ? getSearchDomainSpec(dom).label : undefined,
        docCount: Number(r["docs.count"] ?? 0),
        sizeBytes: r["store.size"] ? Number(r["store.size"]) : undefined,
      };
    })
    .sort((a, b) => a.index.localeCompare(b.index));
}

/** 단일 인덱스 문서 수 (없으면 null — 미색인). prefix 검증 포함. */
export async function indexDocCount(
  indexName: string,
): Promise<number | null> {
  if (!isSearchlabIndex(indexName)) {
    throw new Error(
      `허용되지 않은 인덱스: ${indexName} (searchlab- prefix 만 가능)`,
    );
  }
  const client = getSearchClient();
  const exists = await client.indices.exists({ index: indexName });
  if (!exists.body) return null;
  const res = await client.count({ index: indexName });
  return Number((res.body as { count?: number }).count ?? 0);
}

/**
 * 인덱스 삭제 — 반드시 searchlab- prefix 인 것만. 그 외엔 거부(throw).
 * 미존재 인덱스 삭제는 no-op 으로 처리(idempotent).
 */
export async function deleteSearchlabIndex(
  indexName: string,
): Promise<{ deleted: boolean }> {
  if (!isSearchlabIndex(indexName)) {
    throw new Error(
      `삭제 거부: ${indexName} 는 실습 인덱스(searchlab-)가 아닙니다.`,
    );
  }
  const client = getSearchClient();
  const exists = await client.indices.exists({ index: indexName });
  if (!exists.body) return { deleted: false };
  await client.indices.delete({ index: indexName });
  return { deleted: true };
}

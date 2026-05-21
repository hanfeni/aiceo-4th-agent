/**
 * 검색 실습 — 3방식 검색 로직 (렉시컬 / 벡터 / 하이브리드).
 *
 * 하이브리드 2모드:
 *  - "default": OpenSearch 네이티브 hybrid 쿼리 + normalization-processor
 *    파이프라인. BM25·knn 점수를 엔진이 min_max 정규화 후 가중 산술평균
 *    (α=0.6)으로 결합 (앱단 점수 계산 0). 기존 bool.should 합산이 스케일
 *    불일치로 "BM25 그대로" 나오던 버그를 엔진 네이티브 결합으로 해결.
 *  - "rrf": 렉시컬·벡터를 각각 독립 실행 → Reciprocal Rank Fusion
 *    으로 순위 결합 (앱단 rank 기반, 점수 스케일 무관 — 유지).
 *
 * 학생이 세 방식의 결과 차이를 체감하는 게 목적.
 */

import {
  getSearchClient,
  ensureHybridPipeline,
  HYBRID_PIPELINE_ID,
} from "./client";
import { embedOne } from "./embed";
import { type SearchDomain } from "./domains";
import { getSearchDomainSpec } from "./dynamicDomains";

export type SearchMode = "lexical" | "vector" | "hybrid";
export type HybridMethod = "default" | "rrf";

/**
 * 렉시컬(BM25) 필드 가중치 프리셋 — 교육용.
 *
 * BM25 multi_match 는 필드별 boost(^N)로 "어느 필드 매칭을 더
 * 중요하게 볼지"를 조절한다. 같은 질의·같은 인덱스라도 타이틀
 * 가중을 키우면 제목에 키워드가 박힌 문서가, 본문 가중을 키우면
 * 본문에서 풍부히 언급된 문서가 상위로 온다 — 학생이 칩을 바꿔
 * 검색 순위가 뒤집히는 걸 직접 본다(하이브리드 default/rrf 칩과
 * 동일한 교육 메커니즘). ngram 필드는 부분일치 보조 가중.
 */
export type LexicalPreset = "balanced" | "title" | "body";

export const LEXICAL_PRESETS: Record<
  LexicalPreset,
  { label: string; desc: string; fields: string[] }
> = {
  balanced: {
    label: "균형 (타이틀 ×3)",
    desc: "타이틀 ×3 · 본문 ×1 — 기본값",
    fields: ["title^3", "title.ngram^1.5", "body", "body.ngram^0.5"],
  },
  title: {
    label: "타이틀 중심 (×6)",
    desc: "타이틀 ×6 · 본문 ×1 — 제목 키워드 강조",
    fields: ["title^6", "title.ngram^3", "body", "body.ngram^0.5"],
  },
  body: {
    label: "본문 중심 (×3)",
    desc: "타이틀 ×1 · 본문 ×3 — 본문 다빈도 강조",
    fields: ["title", "title.ngram^0.5", "body^3", "body.ngram^1.5"],
  },
};

export interface SearchHit {
  doc_id: string;
  /** 청크 순번(doc 내). 청킹 OFF 면 0. UI 가 "문서#청크" 표기. */
  chunk_id?: number;
  title: string;
  /** 본문 일부 (스니펫, UI 표시). 청킹 시 = 그 청크 텍스트 */
  snippet: string;
  /** 원문 본문 (모달 전체보기용 — 과대 전송 방지 4000자 컷). _source 가
   *  이미 body 를 가져오므로 추가 fetch 0. UI 클릭 시 모달에 표시. */
  body: string;
  score: number;
  /** 어느 경로로 잡혔는지 (하이브리드 디버그용) */
  via?: ("lexical" | "vector")[];
}

export interface SearchParams {
  domain: SearchDomain;
  query: string;
  mode: SearchMode;
  /** mode==="hybrid" 일 때만 */
  hybridMethod?: HybridMethod;
  /** mode==="lexical" 일 때만. 미지정 시 balanced(기존 기본값). */
  lexicalPreset?: LexicalPreset;
  topK?: number;
}

const RRF_K = 60; // RRF 표준 상수
const SNIPPET_LEN = 220;

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, SNIPPET_LEN).trim();
}

/** 렉시컬: Nori + ngram multi_match. preset 으로 필드 가중치 결정
 *  (미지정 = balanced = 기존 기본값, 하위호환). */
function lexicalQuery(
  query: string,
  size: number,
  preset: LexicalPreset = "balanced",
) {
  return {
    size,
    _source: ["doc_id", "chunk_id", "title", "body"],
    query: {
      multi_match: {
        query,
        fields: LEXICAL_PRESETS[preset].fields,
        type: "best_fields",
        tie_breaker: 0.3,
      },
    },
  };
}

/** 벡터: knn */
function vectorQuery(vector: number[], size: number) {
  return {
    size,
    _source: ["doc_id", "chunk_id", "title", "body"],
    query: { knn: { embedding: { vector, k: size } } },
  };
}

interface OsHit {
  _id: string;
  _score: number;
  _source: {
    doc_id: string;
    chunk_id?: number;
    title: string;
    body: string;
  };
}

async function runOs(
  index: string,
  body: object,
  searchPipeline?: string,
): Promise<OsHit[]> {
  const client = getSearchClient();
  // search_pipeline 파라미터 — hybrid 쿼리의 점수 정규화·결합을 엔진이
  // 수행하게 한다(앱단 계산 0). 미지정 시 일반 검색(렉시컬/벡터/rrf).
  const res = await client.search(
    searchPipeline
      ? { index, body, search_pipeline: searchPipeline }
      : { index, body },
  );
  // OpenSearch 클라이언트 hit 제네릭과 OsHit 가 구조상 직접 겹치지
  // 않아 2단계 캐스팅(런타임 형태는 _id/_score/_source 로 일치).
  return (res.body.hits?.hits ?? []) as unknown as OsHit[];
}

function toHit(h: OsHit, via?: ("lexical" | "vector")[]): SearchHit {
  const fullBody = h._source.body ?? "";
  return {
    doc_id: h._source.doc_id,
    chunk_id: h._source.chunk_id,
    title: h._source.title,
    snippet: snippet(fullBody),
    body: fullBody.slice(0, 4000), // 모달 전체보기 (과대 전송 방지)
    score: h._score,
    via,
  };
}

/** RRF: 두 순위 리스트를 rank 기반 결합 */
function rrfFuse(
  lex: OsHit[],
  vec: OsHit[],
  topK: number,
): SearchHit[] {
  const acc = new Map<
    string,
    { hit: OsHit; score: number; via: Set<"lexical" | "vector"> }
  >();
  const add = (
    list: OsHit[],
    tag: "lexical" | "vector",
  ): void => {
    list.forEach((h, rank) => {
      const cur = acc.get(h._id) ?? {
        hit: h,
        score: 0,
        via: new Set<"lexical" | "vector">(),
      };
      cur.score += 1 / (RRF_K + rank + 1);
      cur.via.add(tag);
      acc.set(h._id, cur);
    });
  };
  add(lex, "lexical");
  add(vec, "vector");
  return [...acc.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((e) => ({
      ...toHit(e.hit, [...e.via]),
      score: e.score,
    }));
}

export async function search(params: SearchParams): Promise<SearchHit[]> {
  const { domain, query, mode } = params;
  const topK = params.topK ?? 8;
  // 정적 5개 + 동적 custom resolver 경유(custom index 는 searchlab-custom 고정).
  const index = getSearchDomainSpec(domain).index;

  if (mode === "lexical") {
    const hits = await runOs(
      index,
      lexicalQuery(query, topK, params.lexicalPreset),
    );
    return hits.map((h) => toHit(h, ["lexical"]));
  }

  if (mode === "vector") {
    const v = await embedOne(query);
    const hits = await runOs(index, vectorQuery(v, topK));
    return hits.map((h) => toHit(h, ["vector"]));
  }

  // hybrid
  const method: HybridMethod = params.hybridMethod ?? "default";
  const v = await embedOne(query);

  if (method === "rrf") {
    // 독립 실행 → RRF (각자 넉넉히 뽑아 결합)
    const pool = Math.max(topK * 3, 30);
    const [lex, vec] = await Promise.all([
      runOs(index, lexicalQuery(query, pool)),
      runOs(index, vectorQuery(v, pool)),
    ]);
    return rrfFuse(lex, vec, topK);
  }

  // default: OpenSearch 네이티브 hybrid 쿼리(앱단 점수 계산 0).
  // bool.should 합산은 BM25·knn 스케일 불일치 + k-NN should 한계로 벡터
  // 기여가 ≈0 → 점수가 BM25 그대로(렉시컬과 동일) 나오던 버그. hybrid
  // 쿼리 + normalization-processor 파이프라인이 두 점수를 min_max 정규화
  // 후 가중 산술평균(α=0.6)으로 엔진이 결합한다. queries 배열 순서는
  // 파이프라인 weights[BM25, 벡터] 와 1:1(① multi_match ② knn).
  await ensureHybridPipeline();
  const hits = await runOs(
    index,
    {
      size: topK,
      _source: ["doc_id", "chunk_id", "title", "body"],
      query: {
        hybrid: {
          queries: [
            {
              multi_match: {
                query,
                fields: [
                  "title^3",
                  "title.ngram^1.5",
                  "body",
                  "body.ngram^0.5",
                ],
                type: "best_fields",
                tie_breaker: 0.3,
              },
            },
            { knn: { embedding: { vector: v, k: topK } } },
          ],
        },
      },
    },
    HYBRID_PIPELINE_ID,
  );
  return hits.map((h) => toHit(h, ["lexical", "vector"]));
}

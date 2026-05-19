/**
 * OpenSearch 클라이언트 + 인덱스 매핑 (검색 실습 전용).
 *
 * Nori(한국어 형태소, decompound_mode=mixed) + knn_vector(OpenAI 임베딩).
 * knn 차원은 인덱스 생성 시 비가역 고정 → 임베딩 모델 변경 시 인덱스
 * 재생성 필수(architect 차원 락인 경고). 임베딩 = text-embedding-3-small
 * (1536d)로 고정. 변경 금지.
 *
 * 보안 플러그인 비활성 로컬 OpenSearch(http, 인증 없음) — 실습 전용.
 */

import { Client } from "@opensearch-project/opensearch";

/** 임베딩 모델·차원 — 단일 출처. 변경 시 인덱스 전체 재생성 필요. */
export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIM = 1536;

/**
 * 색인 파라미터 선택지(IndexLabView 드롭다운 ↔ 색인 API). 임베딩
 * 모델별 차원은 knn dimension 에 박히므로(차원 락인) 모델→차원
 * 매핑을 단일 진실원으로 둔다. 모델 바꾸면 인덱스 재생성 필수.
 */
export const EMBED_MODELS = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
} as const;
export type EmbedModel = keyof typeof EMBED_MODELS;

/** Nori decompound_mode 선택지 (한국어 복합어 분해 정도). */
export const DECOMPOUND_MODES = ["mixed", "discrete", "none"] as const;
export type DecompoundMode = (typeof DECOMPOUND_MODES)[number];

export interface IndexBuildOpts {
  decompoundMode?: DecompoundMode;
  /** knn 벡터 차원(임베딩 모델 기본 차원). 미지정 시 EMBED_DIM. */
  embedDim?: number;
}

const OS_NODE = process.env.OPENSEARCH_URL ?? "http://localhost:9200";

let _client: Client | null = null;

export function getSearchClient(): Client {
  if (_client) return _client;
  _client = new Client({ node: OS_NODE });
  return _client;
}

/**
 * 인덱스 매핑 — 모든 도메인 공통.
 * - title/body: Nori analyzer (BM25 렉시컬)
 * - title/body ngram: 부분일치 보강 (사내 04 패턴: ngram 병용)
 * - embedding: knn_vector HNSW (벡터 검색)
 */
export function buildIndexBody(opts: IndexBuildOpts = {}) {
  // 기본값 = 기존 동작(무인자 호출 호환 — index-run 등 변경 0).
  const decompound = opts.decompoundMode ?? "mixed";
  const dim = opts.embedDim ?? EMBED_DIM;
  return {
    settings: {
      "index.knn": true,
      analysis: {
        tokenizer: {
          nori_user: {
            type: "nori_tokenizer",
            decompound_mode: decompound,
          },
          ngram_2_3: {
            type: "ngram",
            min_gram: 2,
            max_gram: 3,
          },
        },
        analyzer: {
          ko_nori: {
            type: "custom",
            tokenizer: "nori_user",
            filter: ["lowercase", "nori_part_of_speech"],
          },
          ko_ngram: {
            type: "custom",
            tokenizer: "ngram_2_3",
            filter: ["lowercase"],
          },
        },
      },
    },
    mappings: {
      properties: {
        doc_id: { type: "keyword" },
        // 청크 순번(doc 내 0-base). 청킹 OFF 면 전부 0(문서=1청크).
        // 한 문서가 N청크로 펼쳐져도 doc_id 로 원문 묶음 식별 가능.
        chunk_id: { type: "integer" },
        title: {
          type: "text",
          analyzer: "ko_nori",
          fields: { ngram: { type: "text", analyzer: "ko_ngram" } },
        },
        body: {
          type: "text",
          analyzer: "ko_nori",
          fields: { ngram: { type: "text", analyzer: "ko_ngram" } },
        },
        embedding: {
          type: "knn_vector",
          dimension: dim,
          method: {
            name: "hnsw",
            space_type: "cosinesimil",
            engine: "lucene",
            parameters: { m: 16, ef_construction: 256 },
          },
        },
      },
    },
  };
}

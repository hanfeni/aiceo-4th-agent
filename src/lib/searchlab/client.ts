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

// OpenSearch 3.x analysis-nori 는 "discrete" 대신 "discard" 를 실제 값으로 사용.
// UI/API 노출 값(discrete)과 OpenSearch 전송 값을 여기서 단일 매핑.
const NORI_MODE_MAP: Record<DecompoundMode, string> = {
  mixed: "mixed",
  discrete: "discard",
  none: "none",
};

export function toNoriMode(mode: DecompoundMode): string {
  return NORI_MODE_MAP[mode];
}

export interface IndexBuildOpts {
  decompoundMode?: DecompoundMode;
  /** knn 벡터 차원(임베딩 모델 기본 차원). 미지정 시 EMBED_DIM. */
  embedDim?: number;
  /**
   * 올인원 메타 색인용 동적 메타 필드(main/mid/sub_category,
   * keywords) 매핑 포함 여부. 기본 false(기존 색인 동작 불변 —
   * 일반 색인엔 메타 필드 없음). 올인원 ⑤ 메타색인만 true.
   */
  withMeta?: boolean;
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
            decompound_mode: toNoriMode(decompound),
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
        // 올인원 ⑤ 메타색인 — LLM 분류기 산출 메타. keyword 라
        // 검색 실습에서 정확 필터·집계 가능. sub_category 만
        // 자유 텍스트(15자 핵심주제)라 text+keyword 멀티필드.
        ...(opts.withMeta
          ? {
              main_category: { type: "keyword" },
              mid_category: { type: "keyword" },
              sub_category: {
                type: "text",
                analyzer: "ko_nori",
                fields: { kw: { type: "keyword" } },
              },
              keywords: { type: "keyword" },
              meta_description: { type: "text", analyzer: "ko_nori" },
            }
          : {}),
      },
    },
  };
}

/**
 * 하이브리드 default 검색 파이프라인 (OpenSearch 네이티브 — 앱단 점수 계산 0).
 *
 * neural-search 플러그인의 normalization-processor 가 BM25·knn 점수를
 * min_max 정규화 후 가중 산술평균으로 결합한다(엔진이 코디네이터 노드에서
 * 수행). 기존 bool.should 합산이 "BM25 그대로"(스케일·k-NN should 한계로
 * 벡터 기여 ≈0) 나오던 버그를 엔진 네이티브 결합으로 해결.
 *
 * weights[0]=BM25, weights[1]=벡터 — UI 라벨 "α=0.6 (BM25:벡터)" 와 일치.
 * search.ts hybrid 쿼리의 queries 배열 순서(① multi_match ② knn)와 1:1.
 */
export const HYBRID_PIPELINE_ID = "searchlab-hybrid-pipeline";
/** 하이브리드 가중치 — 단일 출처(UI α=0.6 = BM25 0.6 / 벡터 0.4). */
export const HYBRID_WEIGHTS: [number, number] = [0.6, 0.4];

/** 파이프라인 정의 본문(normalization-processor — min_max + 가중 산술평균). */
function hybridPipelineBody() {
  return {
    description: "Searchlab hybrid: min_max normalize + weighted arithmetic mean",
    phase_results_processors: [
      {
        "normalization-processor": {
          normalization: { technique: "min_max" },
          combination: {
            technique: "arithmetic_mean",
            parameters: { weights: HYBRID_WEIGHTS },
          },
        },
      },
    ],
  };
}

/**
 * 하이브리드 파이프라인 멱등 보장 — 없으면 생성. 검색 직전 1회 호출.
 * globalThis 플래그로 프로세스당 1회만 PUT(중복 PUT 무해하나 round-trip
 * 절약). PUT 자체가 upsert 라 동시성 안전.
 */
export async function ensureHybridPipeline(): Promise<void> {
  const g = globalThis as unknown as { __searchlabHybridPipe?: boolean };
  if (g.__searchlabHybridPipe) return;
  const client = getSearchClient();
  await client.transport.request({
    method: "PUT",
    path: `/_search/pipeline/${HYBRID_PIPELINE_ID}`,
    body: hybridPipelineBody(),
  });
  g.__searchlabHybridPipe = true;
}

/**
 * 검색 실습 — 색인 실행 (메뉴 버튼 트리거, SSE 진행표시).
 *
 * 2026-05-19 결정(사용자): 색인 = 스크립트 자동이 아니라 메뉴
 * "색인" 버튼 클릭 → 이 제너레이터가 GitHub raw 에서 문서 fetch
 * → 임베딩 → OpenSearch bulk. 진행을 SSE 로 흘려 학생이 작동하는
 * 모습을 본다. meta-lab runMetaLab 의 제너레이터+SSE 패턴 재활용.
 *
 * 데이터: domains.fetchCorpus (GitHub raw — 로컬 경로 비참조).
 * 인덱싱 로직(client·매핑·embed)은 기존 모듈 그대로 재사용.
 */

import {
  getSearchClient,
  buildIndexBody,
  EMBED_MODELS,
  EMBED_MODEL,
  type EmbedModel,
  type DecompoundMode,
} from "./client";
import { embedTexts } from "./embed";
import { chunkText } from "./chunk";
import { ensureOpenSearch, type InfraEvent } from "./ensure-infra";
import {
  fetchCorpus,
  corpusUrl,
  CUSTOM_SEARCH_DOMAIN,
  type SearchDomain,
  type CorpusDoc,
} from "./domains";
import { getSearchDomainSpec } from "./dynamicDomains";

const EMBED_BATCH = 64;

export interface IndexRunParams {
  domain: SearchDomain;
  /**
   * 업로드 문서 직접 주입(custom 전용). 지정 시 GitHub raw fetch
   * (fetchCorpus/corpusUrl)를 우회하고 이 배열을 그대로 색인한다.
   * 고정 5개 도메인은 미지정(원격 fetch). limit 은 여기에도 적용.
   */
  docs?: CorpusDoc[];
  /** 색인 문서 수 상한 (규모·비용 제어). 미지정=전체 */
  limit?: number;
  /** Nori 복합어 분해 정도. 미지정=mixed(기존 동작) */
  decompoundMode?: DecompoundMode;
  /** 임베딩 모델. 미지정=text-embedding-3-small. 모델 바꾸면
   *  차원도 바뀌어 인덱스 재생성(buildIndexBody 가 차원 반영). */
  embedModel?: EmbedModel;
  /** 청크 크기(토큰, cl100k). 0/미지정 = 청킹 OFF(디폴트 —
   *  문서=1벡터, 기존 동작). >0 이면 토큰 단위 청크 펼침 색인. */
  chunkSize?: number;
  /** 청크 간 겹침(토큰). chunkSize>0 일 때만 의미. 기본 0. */
  chunkOverlap?: number;
}

/**
 * SSE 이벤트 (색인 진행 — chat/meta 와 별개).
 * 사용자 명시 4단계: ①원격확인 ②Docker·OS확인 ③없으면 설치·실행
 * ④색인 — ②③ 는 InfraEvent(ensure-infra) 를 그대로 흘린다.
 */
export type IndexEvent =
  | { type: "start"; domain: SearchDomain; url: string }
  | InfraEvent
  | { type: "fetched"; total: number; chunks?: number }
  | { type: "progress"; indexed: number; total: number }
  | {
      type: "done";
      domain: SearchDomain;
      indexed: number;
      index: string;
      /** 색인된 청크 총수(청킹 OFF 면 = 문서 수) */
      chunks?: number;
    }
  | { type: "error"; message: string };

/** 메인 제너레이터 — API route 가 SSE 로 직렬화 */
export async function* runIndexing(
  params: IndexRunParams,
): AsyncGenerator<IndexEvent> {
  const { domain } = params;
  // 정적 5개 + 동적 custom 을 합친 resolver 경유(custom 의 index 는
  // searchlab-custom 고정, 라벨만 동적). 직접 DOMAIN_SPEC 인덱싱 금지.
  const spec = getSearchDomainSpec(domain);
  // 색인 파라미터 1회 해석(미지정 = 기존 동작). 임베딩 모델 →
  // knn 차원은 EMBED_MODELS 단일 진실원으로 변환(차원 락인 일치).
  const embedModel = params.embedModel ?? EMBED_MODEL;
  const decompoundMode = params.decompoundMode ?? "mixed";
  const embedDim = EMBED_MODELS[embedModel as EmbedModel];
  // 청킹 옵션(디폴트 OFF — 사용자 결정). chunkSize 0/미지정이면
  // chunkText 가 문서 전체 1청크 반환 → 기존 문서=1벡터 동작 동일.
  const chunkSize = params.chunkSize ?? 0;
  const chunkOverlap = params.chunkOverlap ?? 0;
  // custom(업로드)은 GitHub 원본이 없어 corpusUrl 이 throw → url 생략.
  const startUrl =
    domain === CUSTOM_SEARCH_DOMAIN ? "(업로드 문서)" : corpusUrl(domain);
  yield { type: "start", domain, url: startUrl };

  // ── #1 문서 확보 ──────────────────────────────────────
  // custom 은 업로드 문서(params.docs)를 직접 색인(fetch 우회), 고정
  // 5개는 GitHub raw fetch. 둘 다 limit 적용(앞 N건).
  let docs: CorpusDoc[];
  try {
    if (params.docs) {
      docs =
        typeof params.limit === "number"
          ? params.docs.slice(0, params.limit)
          : params.docs;
    } else {
      docs = await fetchCorpus(domain, params.limit);
    }
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    return;
  }
  // 문서 → 청크 펼침(디폴트 OFF 면 문서당 1청크 = 기존 동작).
  // 임베딩·bulk 는 청크 단위. _id 는 doc_id#chunk_id 로 유일화
  // (안 그러면 같은 _id 로 bulk 가 덮어써 마지막 청크만 남음).
  interface FlatChunk {
    docId: string;
    title: string;
    chunkId: number;
    text: string;
  }
  const flat: FlatChunk[] = [];
  for (const d of docs) {
    const parts = chunkText(d.body, {
      chunkSize,
      overlap: chunkOverlap,
    });
    for (const c of parts) {
      flat.push({
        docId: d.doc_id,
        title: d.title,
        chunkId: c.index,
        text: c.text,
      });
    }
  }
  yield { type: "fetched", total: docs.length, chunks: flat.length };

  // ── #2·#3 Docker·OpenSearch 확인 → 없으면 설치·실행 ───
  // ensureOpenSearch 가 헬스체크 + 미기동 시 run-opensearch.sh
  // (OS분기 Docker 보장·기동·Nori) spawn. 진행을 InfraEvent 로
  // 그대로 흘림(IndexEvent 에 InfraEvent 합산 — 타입 호환).
  const infraGen = ensureOpenSearch();
  let infraOk = false;
  while (true) {
    const r = await infraGen.next();
    if (r.done) {
      infraOk = r.value;
      break;
    }
    yield r.value;
  }
  if (!infraOk) {
    yield {
      type: "error",
      message:
        "OpenSearch 인프라 준비 실패 — 위 로그를 확인하세요. " +
        "Docker Desktop 첫 실행 권한 승인(GUI)이 필요하면 1회 클릭 후 재시도.",
    };
    return;
  }

  // ── #4 색인 ───────────────────────────────────────────
  const client = getSearchClient();

  // 인덱스 재생성 (멱등) — 실패 시 OpenSearch 미기동 안내
  try {
    const exists = await client.indices.exists({ index: spec.index });
    if (exists.body) {
      await client.indices.delete({ index: spec.index });
    }
    // OpenSearch SDK 타입 제네릭과 매핑 객체가 직접 안 겹쳐 캐스팅
    // (search.ts 선례 동일 — 런타임 형태는 유효).
    await client.indices.create({
      index: spec.index,
      body: buildIndexBody({
        decompoundMode,
        embedDim,
      }) as unknown as Record<string, unknown>,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    yield {
      type: "error",
      message: /ECONNREFUSED|connect/i.test(msg)
        ? "OpenSearch 미기동 — run-dev.sh(또는 run-opensearch.sh)로 컨테이너를 먼저 띄우세요."
        : `인덱스 생성 실패: ${msg.slice(0, 200)}`,
    };
    return;
  }

  // 임베딩 + bulk (청크 배치, 진행 emit). 청킹 OFF 면 청크=문서라
  // 동작·결과 동일. 임베딩 입력은 title + 청크 본문(8000자 가드는
  // 청크가 이미 토큰 제한이라 사실상 미적용이나 안전상 유지).
  let indexed = 0;
  for (let i = 0; i < flat.length; i += EMBED_BATCH) {
    const batch = flat.slice(i, i + EMBED_BATCH);
    let vectors: number[][];
    try {
      vectors = await embedTexts(
        batch.map((c) => `${c.title}\n${c.text}`.slice(0, 8000)),
        embedModel,
      );
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }
    const bulk: unknown[] = [];
    batch.forEach((c, j) => {
      bulk.push({
        index: {
          _index: spec.index,
          _id: `${c.docId}#${c.chunkId}`,
        },
      });
      bulk.push({
        doc_id: c.docId,
        chunk_id: c.chunkId,
        title: c.title,
        body: c.text,
        embedding: vectors[j],
      });
    });
    try {
      const res = await client.bulk({
        body: bulk as unknown as Record<string, unknown>[],
        refresh: false,
      });
      if (res.body.errors) {
        yield { type: "error", message: `[${domain}] bulk 색인 오류` };
        return;
      }
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }
    indexed += batch.length;
    yield { type: "progress", indexed, total: flat.length };
  }

  await client.indices.refresh({ index: spec.index });
  yield {
    type: "done",
    domain,
    indexed: docs.length,
    index: spec.index,
    chunks: flat.length,
  };
}

/**
 * OpenAI 임베딩 — 검색 실습 벡터/하이브리드용.
 *
 * 기존 OPENAI_API_KEY(서버 전용, NEXT_PUBLIC_ 금지) 재사용.
 * 모델·차원은 client.ts EMBED_MODEL/EMBED_DIM 단일 출처를 따른다
 * (차원 락인 — 변경 시 인덱스 재생성).
 *
 * 의존 최소화: openai SDK 추가 안 함. fetch 로 직접 호출
 * (CLAUDE.md "불필요한 패키지 추가 금지").
 */

import { EMBED_MODEL } from "./client";
import { chunkText, countTokens } from "./chunk";

const ENDPOINT = "https://api.openai.com/v1/embeddings";

// OpenAI 임베딩 입력 한계 8192 토큰(per item). tiktoken(cl100k)과 임베딩
// 토크나이저 미세 차이·결합 경계 대비 안전 마진 8000.
// (호출처의 글자 .slice(0,8000) 는 한국어에서 글자≈토큰이라
//  8192 토큰을 넘을 수 있음 — 단일 방어선으로 여기서 토큰 절단.)
const MAX_EMBED_TOKENS = 8000;

// OpenAI 임베딩 요청 1건당 합산 토큰 한계 300,000(per request, 배열 전체).
// 개별 항목 절단(MAX_EMBED_TOKENS)만으론 못 막는다 — 8000토큰 항목이 38개
// 이상 한 배치에 들어가면 합산이 300K 를 넘어 HTTP 400("maximum request
// size is 300000 tokens"). 안전 마진 250K 로 서브배치 분할(토크나이저
// 미세차·요청 메타 여유). 호출처(index-run EMBED_BATCH=64 등)의 건수
// 배치와 무관하게 여기서 토큰 합산 기준 재분할 → 모든 경로 단일 방어.
const MAX_REQUEST_TOKENS = 250_000;

/** 입력 1건을 토큰 기준 안전 절단 (한계 미만이면 원문 그대로) */
function truncateToTokens(text: string): string {
  if (countTokens(text) <= MAX_EMBED_TOKENS) return text;
  // chunkText 의 첫 청크 = 앞 MAX_EMBED_TOKENS 토큰 (검증된 절단)
  return (
    chunkText(text, { chunkSize: MAX_EMBED_TOKENS })[0]?.text ?? text
  );
}

/**
 * 토큰 합산이 MAX_REQUEST_TOKENS 를 넘지 않도록 입력을 서브배치로 나눈다.
 * 각 항목은 이미 truncateToTokens 로 ≤MAX_EMBED_TOKENS 보장된 상태로 들어온다.
 * 단일 항목이 한계보다 크면(이론상 없음 — 8000≪250000) 그 항목만 단독 배치로
 * 넣어 무한루프/누락을 막는다(방어).
 */
export function splitByTokenBudget(texts: string[]): string[][] {
  const batches: string[][] = [];
  let cur: string[] = [];
  let curTokens = 0;
  for (const t of texts) {
    const n = countTokens(t);
    // 현재 배치에 더하면 한계 초과 + 현재 배치가 비어있지 않으면 끊는다.
    if (cur.length > 0 && curTokens + n > MAX_REQUEST_TOKENS) {
      batches.push(cur);
      cur = [];
      curTokens = 0;
    }
    cur.push(t);
    curTokens += n;
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}

/** 한 요청(서브배치)을 실제 OpenAI 임베딩 API 로 전송. */
async function embedRequest(
  input: string[],
  model: string,
): Promise<number[][]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OpenAI 임베딩 실패 (HTTP ${res.status}): ${detail.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  // index 순서 보장 (API가 순서 섞을 수 있음)
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "OPENAI_API_KEY 미설정 — 벡터/하이브리드 검색에는 임베딩이 필요합니다. " +
        ".env.local 에 키를 넣으세요(렉시컬 검색은 키 없이 가능).",
    );
  }
  return k;
}

/**
 * 텍스트 배열 → 임베딩 배열 (배치). 빈 입력은 빈 배열.
 * model 미지정 시 기본(EMBED_MODEL) — 기존 호출 호환. 색인 시
 * IndexLabView 에서 고른 모델 전달(차원 일치 필수 — 차원 락인).
 */
export async function embedTexts(
  texts: string[],
  model: string = EMBED_MODEL,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  // 단일 방어선 ①: 모든 호출처(메타색인·일반색인) 입력을 토큰 기준
  // 안전 절단 (per-item 8192 토큰 한계 차단).
  const safe = texts.map(truncateToTokens);
  // 단일 방어선 ②: 요청 합산 300K 토큰 한계를 넘지 않도록 서브배치
  // 분할 후 순차 호출, 결과를 입력 순서대로 이어붙인다(호출처의 건수
  // 배치가 커도 여기서 토큰 합산 기준으로 재분할 — HTTP 400 차단).
  const batches = splitByTokenBudget(safe);
  const out: number[][] = [];
  for (const batch of batches) {
    const vectors = await embedRequest(batch, model);
    out.push(...vectors);
  }
  return out;
}

/** 단건 임베딩 (검색 질의용) */
export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

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

// OpenAI 임베딩 입력 한계 8192 토큰. tiktoken(cl100k)과 임베딩
// 토크나이저 미세 차이·결합 경계 대비 안전 마진 8000.
// (호출처의 글자 .slice(0,8000) 는 한국어에서 글자≈토큰이라
//  8192 토큰을 넘을 수 있음 — 단일 방어선으로 여기서 토큰 절단.)
const MAX_EMBED_TOKENS = 8000;

/** 입력 1건을 토큰 기준 안전 절단 (한계 미만이면 원문 그대로) */
function truncateToTokens(text: string): string {
  if (countTokens(text) <= MAX_EMBED_TOKENS) return text;
  // chunkText 의 첫 청크 = 앞 MAX_EMBED_TOKENS 토큰 (검증된 절단)
  return (
    chunkText(text, { chunkSize: MAX_EMBED_TOKENS })[0]?.text ?? text
  );
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
  // 단일 방어선: 모든 호출처(메타색인·일반색인) 입력을 토큰
  // 기준 안전 절단 후 전송 (HTTP 400 maximum input length 차단).
  const safe = texts.map(truncateToTokens);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model, input: safe }),
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

/** 단건 임베딩 (검색 질의용) */
export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

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

const ENDPOINT = "https://api.openai.com/v1/embeddings";

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
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model, input: texts }),
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

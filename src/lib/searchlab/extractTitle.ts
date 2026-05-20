/**
 * 업로드 문서 제목 추출 — gpt-5.4-nano (서버 전용).
 *
 * 로컬 파일 업로드 색인(PDF/DOCX/HWPX/txt)이나 title 이 빈 jsonl 은
 * "문서 진짜 제목" 이 없다 → title 필드가 파일명 또는 빈 값이 되어,
 * 검색 BM25 title 가중(^3~^6, search.ts)·임베딩 입력 앞부분이 무의미한
 * 토큰에 낭비된다. 본문 앞부분에서 제목 1줄을 추출해 채운다.
 *
 * 모델: gpt-5.4-nano (data extraction 특화·저렴 $0.20/1M — 2026-03-17
 * 스냅샷). data extraction 용도라 이 작업에 적합. 챗 ALLOWED_MODELS 와
 * 분리(내부 유틸리티 고정 모델 — embed.ts 가 EMBED_MODEL 을 격리하는 것과
 * 동일 철학). 사용자 드롭다운에 노출하지 않는다.
 *
 * 호출: openai SDK 추가 안 하고 fetch 직접(embed.ts 패턴 — CLAUDE.md
 * "불필요한 패키지 추가 금지"). 서버 전용 OPENAI_API_KEY(NEXT_PUBLIC_ 금지).
 *
 * 실패 철학(사용자 결정): 키 없음·HTTP 오류·빈 응답은 throw 하지 않고
 * null 반환 → 호출부가 파일명/기존 값으로 폴백해 색인을 계속한다(강의
 * 안정성 — 키 미설정이어도 업로드 자체는 막히지 않음).
 */

/** 제목 추출 전용 모델(고정). 챗 ALLOWED_MODELS 와 무관. */
export const TITLE_EXTRACT_MODEL = "gpt-5.4-nano";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** 본문 앞부분만 모델에 보낸다(제목은 문서 서두에 있음 — 비용·지연 절감). */
const HEAD_CHARS = 2000;

/** 추출 제목 길이 상한(과도하게 긴 응답 방어 — title 필드 안전). */
const MAX_TITLE_LEN = 120;

/**
 * 모델 응답 텍스트를 제목으로 정제한다(순수 — LLM 비의존, 단위 테스트 가능).
 *  - 앞뒤 공백·따옴표 제거(모델이 "제목" 형태로 감싸는 경우 대비).
 *  - 줄바꿈은 첫 줄만(여러 줄 응답 방어).
 *  - 길이 상한 적용.
 *  - 빈 결과는 null(폴백 신호).
 */
export function sanitizeTitle(raw: string): string | null {
  const firstLine = raw.split("\n")[0] ?? "";
  const stripped = firstLine
    .trim()
    .replace(/^["'「『]+/, "")
    .replace(/["'」』]+$/, "")
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, MAX_TITLE_LEN);
}

function apiKey(): string | null {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? k : null;
}

/**
 * 본문에서 제목 1줄을 추출한다. 실패(키 없음·API 오류·빈 응답)는 null.
 * 본문이 비어 있으면 호출 없이 null.
 */
export async function extractTitle(body: string): Promise<string | null> {
  const head = body.trim().slice(0, HEAD_CHARS);
  if (!head) return null;
  const key = apiKey();
  if (!key) return null;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: TITLE_EXTRACT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "너는 문서의 제목을 뽑는 도구다. 입력 문서의 핵심을 나타내는 " +
              "간결한 제목 한 줄만 출력하라. 따옴표·접두어·설명 없이 제목 " +
              "텍스트만. 본문에 명시적 제목이 있으면 그대로, 없으면 핵심을 " +
              "요약한 제목을 만들어라. 한국어 문서는 한국어 제목으로.",
          },
          { role: "user", content: head },
        ],
        max_completion_tokens: 64,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return sanitizeTitle(content);
  } catch {
    return null;
  }
}

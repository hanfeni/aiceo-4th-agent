/**
 * 세션 제목 생성 — gpt-5.4-nano (서버 전용).
 *
 * 새 세션의 **첫 질의** 텍스트만으로 그 대화의 짧은 제목을 만든다. 헤더
 * 왼쪽의 "새 대화" 고정 텍스트를 이 제목으로 교체하기 위함(메인 응답
 * 스트리밍과 완전 별도 — POST /api/chat/title 가 단독 호출).
 *
 * 모델: gpt-5.4-nano (저렴·저지연 — 제목처럼 가벼운 생성에 적합). 챗
 * ALLOWED_MODELS 와 분리된 내부 유틸 고정 모델(extractTitle.ts·embed.ts
 * 와 동일 철학 — 사용자 드롭다운에 노출 안 함).
 *
 * 호출: openai SDK 미추가, fetch 직접(extractTitle.ts 패턴 — CLAUDE.md
 * "불필요한 패키지 추가 금지"). 서버 전용 OPENAI_API_KEY(NEXT_PUBLIC_ 금지).
 *
 * 실패 철학(extractTitle 와 동일): 키 없음·HTTP 오류·빈 응답은 throw 하지
 * 않고 null 반환 → 호출부(라우트)가 제목 교체를 건너뛰어 "새 대화"를
 * 유지한다(강의 안정성 — 제목 생성 실패가 챗 자체를 막지 않음).
 */

/** 제목 생성 전용 모델(고정). 챗 ALLOWED_MODELS 와 무관. */
export const TITLE_MODEL = "gpt-5.4-nano";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** 질의 앞부분만 모델에 보낸다(긴 첨부 합본 방어 — 비용·지연 절감). */
const HEAD_CHARS = 1000;

/** 생성 제목 길이 상한(과도하게 긴 응답 방어). */
const MAX_TITLE_LEN = 40;

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
 * 첫 질의에서 세션 제목 1줄을 생성한다. 실패(키 없음·API 오류·빈
 * 응답)는 null. 질의가 비어 있으면 호출 없이 null.
 */
export async function generateTitle(query: string): Promise<string | null> {
  const head = query.trim().slice(0, HEAD_CHARS);
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
        model: TITLE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "첫 질문으로 대화 제목을 지어라. 16토큰 이내 한 줄, " +
              "따옴표·설명 없이 제목만. 질문 언어 그대로.",
          },
          { role: "user", content: head },
        ],
        max_completion_tokens: 24,
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

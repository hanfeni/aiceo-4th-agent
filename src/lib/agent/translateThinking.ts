/**
 * 사고 과정 번역 — gpt-5.4-nano (서버 전용).
 *
 * 사고 패널(히스토리 모드)의 reasoning step 은 모델 reasoning 텍스트라
 * 영어인 경우가 많다. 이를 한 번의 호출로 **일괄** 한국어 번역해 패널에
 * 표시하기 위함(IO 패널=tool step 은 대상 아님 — reasoning content/title 만).
 *
 * 일괄 전략(사용자 결정 "한번에 모든 사고"): 여러 텍스트를 번호 매겨 한
 * 프롬프트에 넣고, 같은 순서·개수의 JSON 문자열 배열로 받는다. 호출 1회로
 * 모든 step 번역(개별 호출 대비 비용·지연 절감).
 *
 * 모델: gpt-5.4-nano (저렴·저지연 — 번역에 충분). 챗 ALLOWED_MODELS 와
 * 분리된 내부 유틸 고정 모델(generateTitle.ts·extractTitle.ts 동일 철학).
 *
 * 호출: openai SDK 미추가, fetch 직접(CLAUDE.md "불필요한 패키지 추가
 * 금지"). 서버 전용 OPENAI_API_KEY(NEXT_PUBLIC_ 금지).
 *
 * 실패 철학: 키 없음·HTTP 오류·빈/형식불일치 응답은 throw 하지 않고 null
 * 반환 → 호출부(라우트)가 번역을 건너뛰어 원문을 유지한다.
 */

/** 번역 전용 모델(고정). 챗 ALLOWED_MODELS 와 무관. */
export const TRANSLATE_MODEL = "gpt-5.4-nano";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** 입력 텍스트 1건당 상한(과도하게 긴 사고 본문 방어 — 비용 절감). */
const MAX_ITEM_CHARS = 4000;

/** 일괄 입력 개수 상한(한 메시지의 step 수 — 방어적). */
const MAX_ITEMS = 50;

/**
 * 모델 응답 텍스트에서 JSON 문자열 배열을 파싱한다(순수 — LLM 비의존,
 * 단위 테스트 가능). 모델이 ```json 펜스로 감싸거나 앞뒤 잡음을 붙여도
 * 첫 '[' ~ 마지막 ']' 구간을 잘라 파싱한다. 형식 불일치·개수 불일치는
 * null(폴백 신호 — 호출부가 원문 유지).
 *
 * @param raw 모델 응답 전체
 * @param expectedLen 입력 텍스트 개수(같아야 매핑 안전)
 */
export function parseTranslations(
  raw: string,
  expectedLen: number,
): string[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (parsed.length !== expectedLen) return null;
    // 각 원소를 문자열로 강제(숫자/널 방어). 빈 문자열은 그대로 둔다.
    return parsed.map((v) => (typeof v === "string" ? v : String(v ?? "")));
  } catch {
    return null;
  }
}

function apiKey(): string | null {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? k : null;
}

/**
 * 텍스트 배열을 한국어로 일괄 번역한다. 입력과 같은 순서·개수의 배열
 * 반환. 실패(키 없음·API 오류·형식 불일치)는 null. 빈 배열이면 호출
 * 없이 [] 반환.
 */
export async function translateThinking(
  texts: string[],
): Promise<string[] | null> {
  if (texts.length === 0) return [];
  if (texts.length > MAX_ITEMS) return null;
  const key = apiKey();
  if (!key) return null;

  // 번호 매긴 입력 — 모델이 순서를 유지하도록. 각 항목 길이 상한.
  const clipped = texts.map((t) => t.slice(0, MAX_ITEM_CHARS));
  const numbered = clipped
    .map((t, i) => `[${i}]\n${t}`)
    .join("\n\n---\n\n");

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: TRANSLATE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "너는 번역기다. 입력은 [0],[1]… 로 번호 매긴 텍스트 묶음이다. " +
              "각 항목을 자연스러운 한국어로 번역하라. 마크다운 서식은 그대로 " +
              "유지하고, 이미 한국어인 항목은 그대로 둬라. 출력은 입력과 같은 " +
              "개수·순서의 JSON 문자열 배열만. 설명·코드펜스 없이 배열만.",
          },
          { role: "user", content: numbered },
        ],
        // 사고 본문이 길 수 있어 충분히. 입력 길이에 비례한 여유.
        max_completion_tokens: 4000,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return parseTranslations(content, texts.length);
  } catch {
    return null;
  }
}

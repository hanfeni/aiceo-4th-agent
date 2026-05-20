/**
 * 하네스 요소 자동 생성 — gpt-5.4-mini (서버 전용).
 *
 * 사용자가 한 줄 요청(예: "PDF 표 추출 스킬")을 주면 SKILL / SUBAGENT /
 * INSTRUCTION 의 필드를 JSON 으로 생성한다. 하네스 관리 폼의 "AI 생성"
 * 버튼이 호출(/api/harness/generate) → 결과를 폼 필드에 자동 입력.
 *
 * 모델: gpt-5.4-mini (사용자 결정 — 제목·번역용 nano 보다 생성 품질↑).
 * 호출: openai SDK 미추가, fetch 직접(generateTitle.ts 패턴, CLAUDE.md
 * "불필요한 패키지 추가 금지"). 서버 전용 OPENAI_API_KEY(NEXT_PUBLIC_ 금지).
 *
 * 실패 철학: 키 없음·HTTP 오류·JSON 파싱 실패는 throw(라우트가 4xx/5xx
 * JSON 으로 표면화 — 사용자에게 "생성 실패" 안내). 제목 생성과 달리
 * 결과가 폼을 채우는 핵심 동작이라 조용한 null 폴백은 부적절.
 */

/** 하네스 요소 자동 생성 전용 모델(고정). */
export const GENERATE_MODEL = "gpt-5.4-mini";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** 생성 대상 종류. */
export type GenerateKind = "skill" | "subagent" | "instruction";

/** kind 별 생성 결과(폼 필드와 1:1). */
export interface GeneratedSkill {
  name: string;
  description: string;
  body: string;
}
export interface GeneratedSubagent {
  name: string;
  description: string;
  systemPrompt: string;
}
export interface GeneratedInstruction {
  label: string;
  body: string;
}
export type GenerateResult =
  | GeneratedSkill
  | GeneratedSubagent
  | GeneratedInstruction;

/** slug 정규화 — 영문 소문자·숫자·하이픈(2~64자). 검증 RE 와 호환. */
function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
}

/** kind 별 system 프롬프트 + JSON 키 명세. */
function spec(kind: GenerateKind): { system: string; keys: string[] } {
  if (kind === "skill") {
    return {
      keys: ["name", "description", "body"],
      system:
        "너는 LLM 에이전트 하네스의 '스킬(SKILL.md)'을 설계하는 도우미다. " +
        "사용자의 한 줄 요청을 받아 스킬 1개를 만든다. JSON 만 출력(설명·코드펜스 금지). " +
        "필드: name(영문 소문자·숫자·하이픈 slug, 2~40자), " +
        "description(이 스킬을 언제 쓰는지 한 문장, frontmatter 에 들어가 LLM 이 읽음), " +
        "body(SKILL.md 본문 — '# 제목', '## When to use', '## How' 섹션을 갖춘 마크다운, 한국어). " +
        '예: {"name":"pdf-table-extract","description":"...","body":"# ...\\n..."}',
    };
  }
  if (kind === "subagent") {
    return {
      keys: ["name", "description", "systemPrompt"],
      system:
        "너는 LLM 에이전트 하네스의 '서브에이전트'를 설계하는 도우미다. " +
        "메인 에이전트가 task 도구로 위임할 일꾼 에이전트 1개를 만든다. JSON 만 출력. " +
        "필드: name(영문 소문자·숫자·하이픈 slug, 2~40자), " +
        "description(메인이 언제 이 서브에이전트에 위임할지 판단하는 근거 한 문장), " +
        "systemPrompt(이 서브에이전트의 역할·지침 전문 — 한국어, 구체적이고 실행 가능하게).",
    };
  }
  return {
    keys: ["label", "body"],
    system:
      "너는 LLM 에이전트의 '시스템 인스트럭션(변형)'을 설계하는 도우미다. " +
      "사용자 요청에 맞는 시스템 프롬프트 변형 1개를 만든다. JSON 만 출력. " +
      "필드: label(이 변형의 짧은 이름, 예: '간결 모드'·'영어 보조'), " +
      "body(시스템 인스트럭션 전문 — 한국어, 에이전트의 어조·규칙·출력 형식을 구체적으로).",
  };
}

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) throw new Error("OPENAI_API_KEY 가 설정되지 않았습니다.");
  return k;
}

/**
 * 한 줄 요청에서 kind 에 맞는 필드를 생성한다. 실패 시 throw.
 * slug 필드(name)는 toSlug 로 정규화해 검증 RE(SLUG_RE) 와 호환.
 */
export async function generateHarnessElement(
  kind: GenerateKind,
  prompt: string,
): Promise<GenerateResult> {
  const head = prompt.trim().slice(0, 2000);
  if (!head) throw new Error("요청 내용을 입력하세요.");
  const key = apiKey();
  const { system, keys } = spec(kind);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GENERATE_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: head },
      ],
      // 구조화 출력 — JSON object 강제(파싱 안정).
      response_format: { type: "json_object" },
      max_completion_tokens: 1400,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`생성 API 오류 (HTTP ${res.status}) ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("생성 결과가 비어 있습니다.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("생성 결과를 JSON 으로 해석하지 못했습니다.");
  }
  // 필수 키 누락 방어 + 타입 강제(문자열).
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = parsed[k];
    out[k] = typeof v === "string" ? v : "";
  }
  if ("name" in out) out.name = toSlug(out.name);
  return out as unknown as GenerateResult;
}

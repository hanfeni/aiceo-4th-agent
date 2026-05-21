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

// 디폴트 인스트럭션 본문(참고자료) — 사이클 회피 위해 함수(fs 로드) 경유
// 대신 상수 직접 import. systemPrompt.ts↔instructions.ts 는 이미 양방향
// 의존이라 상수만 끌어오는 게 안전(getInstruction 은 fs 까지 끌어들임).
import { SYSTEM_PROMPT } from "@/lib/agent/prompts/systemPrompt";

/** 하네스 요소 자동 생성 전용 모델(고정). */
export const GENERATE_MODEL = "gpt-5.4-mini";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** 생성 대상 종류. */
export type GenerateKind = "skill" | "subagent" | "instruction" | "agent" | "agent-bundle";

/**
 * instruction 생성 모드(사용자 택1 — 2026-05-21).
 *  - "reference": 디폴트 인스트럭션을 참고자료로 주입해 동등 분량·구조로
 *    재작성(기본값 — 충실한 인스트럭션).
 *  - "rewrite": 디폴트 무시, 사용자 한 줄 요청만으로 백지 생성(짧고 자유).
 * skill/subagent 는 참조 대상이 없어 mode 무시(영향 0).
 */
export type GenerateMode = "reference" | "rewrite";

/** instruction 생성 기본 모드(폼 미선택 시 — 사용자 결정: 디폴트 참조). */
export const DEFAULT_GENERATE_MODE: GenerateMode = "reference";

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
export interface GeneratedAgent {
  name: string;
  description: string;
}

/** agent-bundle: 에이전트 + 새 스킬 목록 + 새 서브에이전트 목록을 한 번에. */
export interface GeneratedAgentBundle {
  agentName: string;
  agentDescription: string;
  newSkills: Array<{ name: string; description: string; body: string }>;
  newSubagents: Array<{ name: string; description: string; systemPrompt: string }>;
  existingSkillNames: string[];
  existingSubagentNames: string[];
}

export type GenerateResult =
  | GeneratedSkill
  | GeneratedSubagent
  | GeneratedInstruction
  | GeneratedAgent
  | GeneratedAgentBundle;

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

/**
 * kind 별 system 프롬프트 + JSON 키 명세. instruction 은 mode 로 분기:
 *  - reference: 디폴트를 참고자료로 주입(user 메시지)해 동등 분량 재작성.
 *  - rewrite: 디폴트 무시, 한 줄 요청만으로 백지 생성(짧고 자유 — 기존 방식).
 * skill/subagent 는 mode 무시(참조 대상 없음).
 */
function spec(
  kind: GenerateKind,
  mode: GenerateMode,
): { system: string; keys: string[] } {
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
  if (kind === "agent") {
    return {
      keys: ["name", "description"],
      system:
        "너는 LLM 챗 에이전트 이름과 설명을 제안하는 도우미다. " +
        "사용자의 한 줄 요청(에이전트 목적)을 받아 이름과 설명을 만든다. JSON 만 출력(설명·코드펜스 금지). " +
        "필드: name(한글 또는 영어 자유 형식, 최대 30자 — 친숙하고 기억하기 쉬운 이름), " +
        "description(이 에이전트가 무엇을 잘 하는지 한 문장, 최대 100자). " +
        '예: {"name":"재무 분석 전문가","description":"재무제표와 투자지표를 분석해 핵심 인사이트를 제공합니다."}',
    };
  }
  // ── instruction ── mode 로 분기(reference=디폴트 참조 / rewrite=백지). ──
  if (mode === "rewrite") {
    // 완전히 재구성 — 디폴트 미주입(user 메시지 = 한 줄 요청만). 기존 방식.
    return {
      keys: ["label", "body"],
      system:
        "너는 LLM 에이전트의 '시스템 인스트럭션(변형)'을 설계하는 도우미다. " +
        "사용자 요청에 맞는 시스템 프롬프트 변형 1개를 만든다. JSON 만 출력. " +
        "필드: label(이 변형의 짧은 이름, 예: '간결 모드'·'영어 보조'), " +
        "body(시스템 인스트럭션 전문 — 한국어, 에이전트의 어조·규칙·출력 형식을 구체적으로).",
    };
  }
  // reference(기본) — 디폴트 본문을 참고자료로 주입(user 메시지)해 재작성.
  return {
    keys: ["label", "body"],
    system:
      "너는 LLM 에이전트의 '시스템 인스트럭션(변형)'을 설계하는 도우미다. " +
      "사용자 요청에 맞는 시스템 프롬프트 변형 1개를 만든다. JSON 만 출력. " +
      // 디폴트 본문이 user 메시지에 [기존 기본 인스트럭션]으로 함께 온다.
      // 그것을 '참고자료'로만 삼아 동등한 분량·다층 구조(정체성/능력 경계/
      // 행동 원칙/추론 정책/출력 계약/안전)를 갖춘 충실한 인스트럭션을 새로 쓴다.
      // 사용자 결정(2026-05-21): 디폴트를 그대로 복사 금지 — 새 톤으로 재구성.
      "user 메시지에 [기존 기본 인스트럭션]이 함께 제공된다. 그것을 그대로 " +
      "복사하지 말고 '참고자료'로만 활용해, 사용자 요청 방향에 맞게 톤·규칙·" +
      "출력 형식을 새로 재구성하되 기본만큼 충실한 분량과 다층 구조(정체성·" +
      "능력 경계·행동 원칙·추론 정책·출력 계약·안전 등)를 갖춘다. " +
      // R5/출력 계약 보존 — 디폴트의 [REC_QUERY] 추천 질문 규약·추론 누출 차단은
      // 클라이언트 파싱·필터와 직결되므로 변형에서도 동등하게 유지하도록 명시.
      "기본 인스트럭션의 핵심 출력 계약([REC_QUERY] 추천 질문 블록 형식, " +
      "내부 추론을 최종 답변에 섞지 않는 규칙)은 변형에서도 동등하게 유지한다. " +
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
 * agent-bundle 전용 생성 함수.
 * 한 줄 요청 + 기존 스킬/서브에이전트 목록을 주면 AI가
 * 에이전트 이름·설명, 새로 만들 스킬 목록, 새로 만들 서브에이전트 목록,
 * 기존 목록 중 활성화할 항목을 한 번에 제안한다.
 */
export async function generateAgentBundle(
  prompt: string,
  existingSkills: string[],
  existingSubagents: string[],
): Promise<GeneratedAgentBundle> {
  const head = prompt.trim().slice(0, 2000);
  if (!head) throw new Error("요청 내용을 입력하세요.");
  const key = apiKey();

  const existingSkillList = existingSkills.length > 0
    ? existingSkills.map((n) => `- ${n}`).join("\n")
    : "없음";
  const existingSubList = existingSubagents.length > 0
    ? existingSubagents.map((n) => `- ${n}`).join("\n")
    : "없음";

  const system =
    "너는 LLM 에이전트 하네스 전체 구성을 설계하는 도우미다. " +
    "사용자의 요청을 받아 에이전트 이름·설명과 함께 " +
    "필요한 스킬·서브에이전트 전체를 한 번에 설계한다. " +
    "기존 등록된 스킬·서브에이전트 목록이 주어지면 재활용 가능한 것은 existingSkillNames/existingSubagentNames 에 넣고, " +
    "새로 필요한 것만 newSkills/newSubagents 에 넣는다. " +
    "JSON 만 출력(설명·코드펜스 금지). " +
    "스키마: { " +
    '"agentName": "string(자유 형식 이름, 최대 30자)", ' +
    '"agentDescription": "string(한 문장 설명)", ' +
    '"newSkills": [{"name":"slug","description":"한 문장","body":"SKILL.md 마크다운(# 제목/## When to use/## How 섹션 포함, 한국어)"}], ' +
    '"newSubagents": [{"name":"slug","description":"한 문장","systemPrompt":"역할·지침 전문(한국어, 구체적)"}], ' +
    '"existingSkillNames": ["기존 스킬 중 활성화할 name 목록"], ' +
    '"existingSubagentNames": ["기존 서브에이전트 중 활성화할 name 목록"] ' +
    "}. " +
    "slug 는 영문 소문자·숫자·하이픈(2~40자). " +
    "스킬·서브에이전트가 불필요하면 빈 배열([])로 둬도 된다.";

  const userContent =
    `[사용자 요청]\n${head}\n\n` +
    `[기존 등록된 스킬]\n${existingSkillList}\n\n` +
    `[기존 등록된 서브에이전트]\n${existingSubList}`;

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
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
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
  if (typeof content !== "string") throw new Error("생성 결과가 비어 있습니다.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("생성 결과를 JSON 으로 해석하지 못했습니다.");
  }

  const safeStr = (v: unknown): string => (typeof v === "string" ? v : "");
  const safeArr = <T>(v: unknown, mapper: (item: unknown) => T): T[] =>
    Array.isArray(v) ? v.map(mapper) : [];

  return {
    agentName: safeStr(parsed.agentName),
    agentDescription: safeStr(parsed.agentDescription),
    newSkills: safeArr(parsed.newSkills, (item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        name: toSlug(safeStr(o.name)),
        description: safeStr(o.description),
        body: safeStr(o.body),
      };
    }),
    newSubagents: safeArr(parsed.newSubagents, (item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        name: toSlug(safeStr(o.name)),
        description: safeStr(o.description),
        systemPrompt: safeStr(o.systemPrompt),
      };
    }),
    existingSkillNames: safeArr(parsed.existingSkillNames, safeStr),
    existingSubagentNames: safeArr(parsed.existingSubagentNames, safeStr),
  };
}

/**
 * 한 줄 요청에서 kind 에 맞는 필드를 생성한다. 실패 시 throw.
 * slug 필드(name)는 toSlug 로 정규화해 검증 RE(SLUG_RE) 와 호환.
 *
 * mode(instruction 전용 — 사용자 택1):
 *  - reference(기본): 디폴트 본문을 참고자료로 주입해 동등 분량 재작성.
 *  - rewrite: 디폴트 미주입, 한 줄 요청만으로 백지 생성(짧고 자유).
 * skill/subagent 는 mode 무시(참조 대상 없음 — 항상 백지 동작 유지).
 */
export async function generateHarnessElement(
  kind: GenerateKind,
  prompt: string,
  mode: GenerateMode = DEFAULT_GENERATE_MODE,
): Promise<GenerateResult> {
  const head = prompt.trim().slice(0, 2000);
  if (!head) throw new Error("요청 내용을 입력하세요.");
  const key = apiKey();
  const { system, keys } = spec(kind, mode);

  // 디폴트 주입은 "instruction + reference 모드"일 때만. rewrite 모드와
  // skill/subagent 는 user 메시지 = 한 줄 요청 그대로(백지 생성). reference
  // 는 디폴트가 길어 출력 분량도 커지므로 토큰 한도 상향(1400 → 4000).
  const injectDefault = kind === "instruction" && mode === "reference";
  const userContent = injectDefault
    ? `[기존 기본 인스트럭션 — 참고자료. 그대로 복사하지 말고 이 분량·구조 수준을 기준으로 재작성하라]\n${SYSTEM_PROMPT}\n\n[사용자 요청 — 위 기본을 이 방향으로 재구성/보완]\n${head}`
    : head;
  const maxTokens = injectDefault ? 4000 : 1400;

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
        { role: "user", content: userContent },
      ],
      // 구조화 출력 — JSON object 강제(파싱 안정).
      response_format: { type: "json_object" },
      max_completion_tokens: maxTokens,
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

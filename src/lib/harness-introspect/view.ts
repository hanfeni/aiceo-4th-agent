import { z } from "zod";
import type { HarnessConfig, SubagentSpec } from "@/types";

/**
 * 하네스 요소 introspect 순수 코어 (Slice 1 / Plan Critic C1·C2·C3).
 *
 * 목적: /harness 페이지가 "현재 챗에 설정된 하네스 요소(SKILL/AGENT/도구/
 * 시스템 인스트럭션/토글)"를 보여줄 수 있도록, HarnessConfig 를 **직렬화
 * 안전한 표시용 뷰**로 변환한다.
 *
 * C1: 이 모듈은 buildHarnessConfig 를 **호출하지 않는다**. 이미 만들어진
 *     HarnessConfig 를 인자로 받는 순수 함수다(buildHarnessConfig 는
 *     createCheckpointer/createSkillsBackend side-effect 가 있어 호출
 *     금지 — docs/notes/harness-introspect-probe.md).
 * C2: HarnessView 타입에 checkpointer/backend 필드가 **없다**(타입 레벨
 *     배제, 화이트리스트). HarnessConfig.checkpointer 는 SqliteSaver
 *     Proxy 라 enumerate/stringify 시 SQLite 파일이 생성된다 → 이 함수는
 *     config.checkpointer / config.skills.backend 를 절대 읽지 않는다.
 * C3: 도구는 ClientTool(.name/.description) 과 ServerTool({type}) 구조가
 *     다르다(실측). tool.name ?? tool.type ?? "(unknown)" 방어적 추출.
 * R8: ServerTool 형태(`{type:"web_search"}`)는 probe 로 실측 확정.
 */

export type ToolKind = "client" | "server" | "unknown";

/**
 * 도구명 → 표시 메타 매핑(등록 지점 tools/index.ts 에서 수집 — FR-08
 * 동적화). displayName 은 항상, description 은 ServerTool 처럼 도구
 * 객체에 .description 이 없는 경우의 유일한 설명 경로(옵션).
 */
export interface ToolMeta {
  name: string;
  displayName: string;
  /** ServerTool 등 .description 미보유 도구의 설명(등록 지점 제공). */
  description?: string;
}

export interface ToolView {
  /** ClientTool=.name, ServerTool=.type, 미지=(unknown). */
  name: string;
  kind: ToolKind;
  /** ClientTool 만 보유. ServerTool/미지는 null. */
  description: string | null;
  /** ToolMeta 매핑 결과. 없으면 null. */
  displayName: string | null;
  /**
   * LLM 이 도구 호출 시 참조하는 **사용 명세**(parameters). ClientTool 의
   * zod schema 를 JSON Schema 로 변환한 것(zod v4 z.toJSONSchema — LLM 에
   * 실제 전달되는 형태와 동일, .describe() 텍스트 보존). ServerTool/zod
   * schema 미보유/변환 실패는 null(provider 내장 명세이거나 표시 불가).
   * 직렬화 안전한 plain object(JSON Schema).
   */
  parametersSchema: Record<string, unknown> | null;
  /**
   * ServerTool 의 **우리 구성값**(실측: webSearchTool 객체에
   * `{type, search_context_size, filters, user_location}` — type 제외
   * 나머지 = buildWebSearchOptions 가 OpenAI 에 보내는 설정). ClientTool
   * 은 zod schema 가 명세라 구성값 개념이 아니므로 null. ServerTool 도
   * type 외 키가 없으면 null. 직렬화 안전 plain object.
   */
  configValues: Record<string, unknown> | null;
}

export interface SubagentView {
  name: string;
  description: string;
  systemPrompt: string;
  /** systemPrompt 본문에 PLACEHOLDER 가 포함되면 true(UI 배지 — A2). */
  isPlaceholder: boolean;
  /** SubagentSpec.tools 객체 누출 방지(M2) — 도구명만 추출. */
  toolNames: string[];
  /**
   * LLM 모델 표시 라벨. SubagentSpec 에 model 이 명시되면 그 값,
   * 없으면 "메인 에이전트 모델 상속" (deepagents 기본 동작 — SubAgent
   * .model 미지정 시 defaultModel 상속, 실측 .d.ts:1974). 현재
   * SubagentSpec 타입엔 model 필드가 없어 항상 상속이지만, 향후 확장
   * (model?: string) 대비 방어적 추출(R8 — 타입에 없어도 런타임 값 잡음).
   */
  modelLabel: string;
}

/**
 * 스킬 상세 (사용자 요구: 스킬 상세 정보 노출). SKILL.md 파싱 결과 —
 * frontmatter name/description = LLM 시스템 프롬프트 주입분(스킬 사용
 * 시점 판단 근거), body = 에이전트가 read_file 로 읽는 실행 가이드.
 * 파일 미존재/파싱 실패는 graceful(name/description null, body "").
 */
export interface SkillDetail {
  /** SKILL_SOURCES 경로(/deep-web-research/). */
  source: string;
  /** frontmatter name. 없으면 null. */
  name: string | null;
  /** frontmatter description(LLM 이 스킬 사용 시점 판단). 없으면 null. */
  description: string | null;
  /** frontmatter 제외 본문(마크다운). 읽기 실패 시 "". */
  body: string;
}

/**
 * 직렬화 안전 표시용 뷰. checkpointer/skills.backend 필드 **부재**(C2 —
 * 타입 레벨 화이트리스트). Response.json/props 로 안전하게 전달된다.
 */
export interface HarnessView {
  toggles: {
    planning: boolean;
    filesystem: boolean;
    /** subagents 가 1개 이상이면 활성으로 간주(registry 가 off 시 []). */
    subagents: boolean;
    skills: boolean;
  };
  systemPrompt: string;
  subagents: SubagentView[];
  tools: ToolView[];
  skills: {
    enabled: boolean;
    sources: string[];
    /** 각 source 의 SKILL.md 파싱 상세(사용자 요구 — 상세 노출). */
    details: SkillDetail[];
  };
}

/**
 * SKILL.md 내용 → {name, description, body} 파싱 (순수 함수).
 *
 * 형식: YAML frontmatter(`---` … `---`) + 마크다운 본문. frontmatter 는
 * `name:`/`description:` 단순 key-value 만(YAML 전체 스펙 불요 — js-yaml
 * 의존성 0). 첫 콜론으로만 분리(description 값에 콜론 포함 허용).
 * content=null(읽기 실패) 은 graceful: name/description null, body "".
 */
export function parseSkillDetail(
  source: string,
  content: string | null,
): SkillDetail {
  if (content == null) {
    return { source, name: null, description: null, body: "" };
  }
  const FM = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
  const m = content.match(FM);
  if (!m) {
    // frontmatter 없음 → 전체가 body.
    return { source, name: null, description: null, body: content.trim() };
  }
  const [, fmBlock, body] = m;
  let name: string | null = null;
  let description: string | null = null;
  for (const line of fmBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "name") name = value || null;
    else if (key === "description") description = value || null;
  }
  return { source, name, description, body: body.trim() };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * 값을 RSC 경계 안전한 **순수 plain object** 로 정규화한다.
 *
 * Server Component → Client Component props 직렬화는 JSON.stringify 보다
 * 엄격하다 — 클래스 인스턴스·메서드·non-plain prototype 을 거부한다
 * ("Only plain objects can be passed..."). z.toJSONSchema 결과는 JSON
 * 직렬화는 되지만 내부 구조가 plain 이 아닐 수 있어 RSC 경계에서 터진다.
 * JSON round-trip 으로 완전한 plain object 로 만든다(순수 — side-effect 0).
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * zod schema → JSON Schema(LLM 명세). zod v4 z.toJSONSchema 내장 사용.
 * 비-zod(임의 객체)·schema 부재·변환 throw 는 graceful null. 순수 변환
 * 이라 side-effect 0(view.ts 순수성 유지). toPlain 으로 RSC 경계 안전
 * 보장(server→client props).
 */
function toParametersSchema(schema: unknown): Record<string, unknown> | null {
  if (schema == null || typeof schema !== "object") return null;
  try {
    // z.toJSONSchema 는 zod 스키마가 아니면 throw → catch 로 graceful.
    const js = z.toJSONSchema(schema as z.ZodType);
    return toPlain(js) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * ServerTool 의 우리 구성값 추출 — 객체에서 `type` 제외 모든 키.
 * 실측(probe): webSearchTool = `{type, search_context_size, filters,
 * user_location}`. type 은 name 으로 이미 노출되므로 제외. 키 0개면
 * null. 직렬화 안전(plain object copy).
 */
function extractConfigValues(
  tool: Record<string, unknown>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tool)) {
    if (k === "type") continue;
    out[k] = v;
  }
  if (Object.keys(out).length === 0) return null;
  // RSC 경계 안전: ServerTool 객체 값이 non-plain 일 수 있어 정규화.
  try {
    return toPlain(out);
  } catch {
    return null; // 순환참조 등 직렬화 불가 → graceful
  }
}

/** 도구 객체 1개 → 안전 메타. ClientTool/ServerTool/미지 방어(C3). */
export function extractToolMeta(
  tool: unknown,
  toolMetas: ToolMeta[],
): ToolView {
  let name = "(unknown)";
  let kind: ToolKind = "unknown";
  let objDescription: string | null = null;
  let parametersSchema: Record<string, unknown> | null = null;
  let configValues: Record<string, unknown> | null = null;

  if (isRecord(tool)) {
    if (typeof tool.name === "string" && tool.name.length > 0) {
      name = tool.name;
      kind = "client";
      objDescription =
        typeof tool.description === "string" ? tool.description : null;
      // ClientTool 만 zod schema 보유 → LLM 명세(parameters) 추출.
      // configValues 는 ClientTool 개념 아님(zod schema 가 명세) → null.
      parametersSchema = toParametersSchema(tool.schema);
    } else if (typeof tool.type === "string" && tool.type.length > 0) {
      name = tool.type;
      kind = "server";
      // ServerTool(OpenAI web_search)은 .description/zod schema 미보유
      // (provider 내장). description 은 등록 지점 매핑(meta)에서, 우리
      // 구성값은 type 외 키에서(실측: search_context_size 등).
      objDescription =
        typeof tool.description === "string" ? tool.description : null;
      configValues = extractConfigValues(tool);
    }
  }

  const meta = toolMetas.find((m) => m.name === name);
  // description 우선순위: 도구 객체 .description > 등록 지점 매핑.
  // (ClientTool 은 객체에 있음, ServerTool 은 매핑이 유일 경로.)
  const description = objDescription ?? meta?.description ?? null;
  return {
    name,
    kind,
    description,
    displayName: meta ? meta.displayName : null,
    parametersSchema,
    configValues,
  };
}

const PLACEHOLDER_RE = /PLACEHOLDER/;

function toSubagentView(spec: SubagentSpec): SubagentView {
  const toolNames: string[] = [];
  if (Array.isArray(spec.tools)) {
    for (const t of spec.tools) {
      if (isRecord(t)) {
        const n =
          typeof t.name === "string" && t.name.length > 0
            ? t.name
            : typeof t.type === "string"
              ? t.type
              : null;
        if (n) toolNames.push(n);
      }
    }
  }
  // model 방어적 추출: SubagentSpec 타입엔 없으나(항상 상속) 향후
  // model?: string 확장 / deepagents SubAgent 형태 유입 대비. string
  // 이면 그 값, 아니면(미지정·LanguageModelLike 객체) "메인 상속".
  const rawModel = (spec as unknown as Record<string, unknown>).model;
  const modelLabel =
    typeof rawModel === "string" && rawModel.length > 0
      ? rawModel
      : "메인 에이전트 모델 상속 (개별 지정 없음)";

  return {
    name: spec.name,
    description: spec.description,
    systemPrompt: spec.systemPrompt,
    isPlaceholder: PLACEHOLDER_RE.test(spec.systemPrompt),
    toolNames,
    modelLabel,
  };
}

/**
 * HarnessConfig + 시스템 프롬프트 + 도구 displayName 매핑 → HarnessView.
 * config.checkpointer / config.skills.backend 는 **절대 접근하지 않는다**
 * (C2 — Proxy touch 시 SQLite 생성). config.skills.enabled/sources 만 읽음.
 */
export function toHarnessView(
  config: HarnessConfig,
  systemPrompt: string,
  toolMetas: ToolMeta[],
  /**
   * 각 skill source 의 SKILL.md 파싱 상세(사용자 요구 — 상세 노출).
   * 파일 읽기는 side-effect(server I/O)라 순수 view 가 직접 못 한다 →
   * page.tsx(server)가 SKILL_SOURCES 순회·읽기·parseSkillDetail 후 주입.
   * 미제공/빈 배열이면 details=[](기존 호출 호환 — 기본값).
   */
  skillDetails: SkillDetail[] = [],
): HarnessView {
  return {
    toggles: {
      planning: config.planning.enabled,
      filesystem: config.filesystem.enabled,
      subagents: config.subagents.length > 0,
      skills: config.skills.enabled,
    },
    systemPrompt,
    subagents: config.subagents.map(toSubagentView),
    tools: config.tools.map((t) => extractToolMeta(t, toolMetas)),
    // C2: backend 는 읽지 않는다. enabled/sources/details(직렬화 안전)만.
    skills: {
      enabled: config.skills.enabled,
      sources: config.skills.sources,
      details: skillDetails,
    },
  };
}

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { HarnessConfig } from "@/types";
import {
  toHarnessView,
  extractToolMeta,
  parseSkillDetail,
  type ToolMeta,
} from "@/lib/harness-introspect/view";

// Slice 1 — 하네스 introspect 순수 코어. Plan Critic C1/C2 핵심:
//  - toHarnessView 는 buildHarnessConfig 를 호출하지 않는다(인자로 받음).
//  - HarnessView 타입에 checkpointer/backend 필드 자체가 없다(화이트리스트).
//  - JSON.stringify(view) 에 SqliteSaver Proxy/sqlite 흔적 0 (SQLite 파일
//    생성 회귀 방지 — probe docs/notes/harness-introspect-probe.md).
//  - 빈 토글(subagents[]/tools[]/skills off) 안전 처리(M5).

// checkpointer 자리에 "건드리면 터지는" 가짜 Proxy 를 넣어, view 가 이
// 필드를 절대 enumerate/touch 하지 않음을 강제 검증(C2 회귀 가드).
function makeBoobyTrappedConfig(over: Partial<HarnessConfig> = {}): HarnessConfig {
  const trap = new Proxy(
    {},
    {
      get() {
        throw new Error("checkpointer Proxy touched — SQLite 생성 회귀!");
      },
      ownKeys() {
        throw new Error("checkpointer enumerate — 직렬화 회귀!");
      },
    },
  );
  return {
    planning: { enabled: true },
    filesystem: { enabled: true },
    subagents: [
      {
        name: "web-searcher",
        description: "웹 검색 일꾼",
        systemPrompt: "정상 프롬프트. (PLACEHOLDER — 사용자가 정책을 확정해 교체)",
        tools: [{ type: "web_search" }],
      },
    ],
    tools: [
      { name: "current_time", description: "현재 시각 반환" }, // ClientTool 형태
      { type: "web_search" }, // ServerTool 형태(.name 없음)
    ],
    checkpointer: trap,
    skills: { enabled: true, sources: ["/deep-web-research/"], backend: trap },
    ...over,
  };
}

const toolMetaMap: ToolMeta[] = [
  { name: "current_time", displayName: "현재 시각" },
  {
    name: "web_search",
    displayName: "웹 검색",
    // ServerTool 은 .description 이 없으므로 등록 지점 매핑이 유일 경로.
    description: "OpenAI Responses API 웹검색(provider 종속).",
  },
];

describe("toHarnessView — 순수 추출(C1: buildHarnessConfig 미호출, C2: 핸들 배제)", () => {
  it("checkpointer/backend Proxy 를 절대 touch 하지 않는다(throw 0)", () => {
    const cfg = makeBoobyTrappedConfig();
    // trap 이 발동하면 throw → 이 호출 자체가 실패. 통과 = 미접촉 증명.
    expect(() => toHarnessView(cfg, "시스템 프롬프트", toolMetaMap)).not.toThrow();
  });

  it("HarnessView 에 checkpointer/backend 필드가 없다(화이트리스트 타입)", () => {
    const view = toHarnessView(makeBoobyTrappedConfig(), "SP", toolMetaMap);
    expect("checkpointer" in view).toBe(false);
    expect(view.skills && "backend" in view.skills).toBe(false);
  });

  it("JSON.stringify(view) 안전 — sqlite/Proxy 흔적 0 (SQLite 생성 회귀 가드)", () => {
    const view = toHarnessView(makeBoobyTrappedConfig(), "SP", toolMetaMap);
    // stringify 가 trap 을 건드리면 throw — 통과 자체가 안전 증명.
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/sqlite|checkpoints|Proxy/i);
  });

  it("토글 boolean 그대로 반영(planning/filesystem)", () => {
    const view = toHarnessView(
      makeBoobyTrappedConfig({
        planning: { enabled: false },
        filesystem: { enabled: true },
      }),
      "SP",
      toolMetaMap,
    );
    expect(view.toggles.planning).toBe(false);
    expect(view.toggles.filesystem).toBe(true);
  });

  it("systemPrompt 전문 그대로 통과(사용자 A2: 전문 표시)", () => {
    const sp = "당신은 한국어 AI 어시스턴트입니다.\n역할: ...";
    const view = toHarnessView(makeBoobyTrappedConfig(), sp, toolMetaMap);
    expect(view.systemPrompt).toBe(sp);
  });

  it("subagent: name/description/systemPrompt + tools 는 이름만 + PLACEHOLDER 배지", () => {
    const view = toHarnessView(makeBoobyTrappedConfig(), "SP", toolMetaMap);
    expect(view.subagents).toHaveLength(1);
    const sa = view.subagents[0];
    expect(sa.name).toBe("web-searcher");
    expect(sa.description).toContain("웹 검색");
    expect(sa.systemPrompt).toContain("정상 프롬프트");
    expect(sa.isPlaceholder).toBe(true); // PLACEHOLDER 문자열 감지
    // tools 는 객체가 아니라 이름 문자열 배열(ServerTool 객체 누출 방지 M2)
    expect(sa.toolNames).toEqual(["web_search"]);
  });

  it("subagent model: SubagentSpec 에 model 없으면 '메인 에이전트 상속'", () => {
    const view = toHarnessView(makeBoobyTrappedConfig(), "SP", toolMetaMap);
    const sa = view.subagents[0];
    // webSearcher 는 model 미지정 → deepagents 가 메인 모델 상속.
    expect(sa.modelLabel).toBe("메인 에이전트 모델 상속 (개별 지정 없음)");
  });

  it("subagent model: SubagentSpec 에 model 명시되면 그 값(향후 대비)", () => {
    const cfg = makeBoobyTrappedConfig({
      subagents: [
        {
          name: "custom",
          description: "d",
          systemPrompt: "p",
          // SubagentSpec 미래 확장: model 키가 들어오면 그대로 표시.
          model: "gpt-5.4-mini",
        } as never,
      ],
    });
    const view = toHarnessView(cfg, "SP", toolMetaMap);
    expect(view.subagents[0].modelLabel).toBe("gpt-5.4-mini");
  });

  it("tool: ClientTool .name / ServerTool .type 방어적 추출 + displayName 매핑(C3)", () => {
    const view = toHarnessView(makeBoobyTrappedConfig(), "SP", toolMetaMap);
    expect(view.tools).toHaveLength(2);
    const ct = view.tools.find((t) => t.name === "current_time");
    expect(ct?.kind).toBe("client");
    expect(ct?.description).toBe("현재 시각 반환");
    expect(ct?.displayName).toBe("현재 시각");
    const st = view.tools.find((t) => t.name === "web_search");
    expect(st?.kind).toBe("server"); // .name 없고 .type 만
    // ServerTool description 은 등록 지점 매핑(toolMetaMap)에서.
    expect(st?.description).toBe("OpenAI Responses API 웹검색(provider 종속).");
    expect(st?.displayName).toBe("웹 검색");
  });

  it("skills: enabled/sources 만, backend 부재(M2)", () => {
    const view = toHarnessView(makeBoobyTrappedConfig(), "SP", toolMetaMap);
    expect(view.skills.enabled).toBe(true);
    expect(view.skills.sources).toEqual(["/deep-web-research/"]);
  });

  it("빈 토글 안전: subagents []/tools []/skills off (M5)", () => {
    const view = toHarnessView(
      makeBoobyTrappedConfig({
        subagents: [],
        tools: [],
        skills: { enabled: false, sources: [], backend: null },
      }),
      "SP",
      toolMetaMap,
    );
    expect(view.subagents).toEqual([]);
    expect(view.tools).toEqual([]);
    expect(view.skills.enabled).toBe(false);
    expect(view.skills.sources).toEqual([]);
  });
});

describe("extractToolMeta — 도구 객체 → 안전 메타(C3 방어적)", () => {
  it("ClientTool: name/description 추출, kind=client", () => {
    const m = extractToolMeta(
      { name: "current_time", description: "시각" },
      toolMetaMap,
    );
    expect(m).toMatchObject({
      name: "current_time",
      kind: "client",
      description: "시각",
      displayName: "현재 시각",
    });
  });

  it("ServerTool: type → name=type, kind=server, description=매핑값", () => {
    const m = extractToolMeta({ type: "web_search" }, toolMetaMap);
    expect(m).toMatchObject({
      name: "web_search",
      kind: "server",
      // ServerTool 은 .description 없음 → 등록 지점 매핑에서.
      description: "OpenAI Responses API 웹검색(provider 종속).",
      displayName: "웹 검색",
    });
  });

  it("ServerTool 구성값(type 외 키) 추출 — 실측: search_context_size 등", () => {
    const m = extractToolMeta(
      {
        type: "web_search",
        search_context_size: "medium",
        filters: null,
        user_location: null,
      },
      toolMetaMap,
    );
    expect(m.configValues).toEqual({
      search_context_size: "medium",
      filters: null,
      user_location: null,
    });
    // type 은 name 으로 이미 노출되므로 configValues 에서 제외.
    expect(m.configValues && "type" in m.configValues).toBe(false);
  });

  it("ServerTool 구성값 없음(type 만) → configValues null", () => {
    const m = extractToolMeta({ type: "web_search" }, toolMetaMap);
    expect(m.configValues).toBeNull();
  });

  it("ClientTool 은 configValues null (zod schema 가 명세 — 구성값 개념 아님)", () => {
    const m = extractToolMeta(
      { name: "current_time", description: "시각" },
      toolMetaMap,
    );
    expect(m.configValues).toBeNull();
  });

  it("매핑에 description 없으면 ClientTool 은 .description 사용(회귀)", () => {
    // current_time 매핑엔 description 없음 → 객체 .description 폴백
    const m = extractToolMeta(
      { name: "current_time", description: "객체 설명" },
      toolMetaMap,
    );
    expect(m.description).toBe("객체 설명");
  });

  it("미지 객체: name=(unknown), kind=unknown, displayName=null (graceful)", () => {
    const m = extractToolMeta({ foo: 1 }, toolMetaMap);
    expect(m.name).toBe("(unknown)");
    expect(m.kind).toBe("unknown");
    expect(m.displayName).toBeNull();
  });

  it("displayName 매핑 없으면 null (회귀 안전)", () => {
    const m = extractToolMeta({ name: "no_map_tool", description: "x" }, toolMetaMap);
    expect(m.displayName).toBeNull();
  });
});

// 도구 명세(parameters) — LLM 이 도구 호출 시 보는 사용 설명서.
// ClientTool 의 zod schema → JSON Schema(z.toJSONSchema, zod v4 내장).
// ServerTool/미지/비-zod 는 graceful null. 사용자 요구: 명세 텍스트 표시.
describe("extractToolMeta — parametersSchema(LLM 명세 = JSON Schema)", () => {
  it("ClientTool zod schema → JSON Schema (.describe() 보존)", () => {
    const tool = {
      name: "current_time",
      description: "현재 시각",
      schema: z.object({
        timezone: z
          .string()
          .optional()
          .describe("IANA 타임존 (예: 'Asia/Seoul'). 미지정 시 KST."),
      }),
    };
    const m = extractToolMeta(tool, toolMetaMap);
    expect(m.parametersSchema).not.toBeNull();
    const ps = m.parametersSchema as Record<string, unknown>;
    expect(ps.type).toBe("object");
    const props = ps.properties as Record<string, { description?: string; type?: string }>;
    expect(props.timezone.type).toBe("string");
    // .describe() 텍스트가 LLM 명세에 그대로 보존돼야 함(사용법 노출 목적)
    expect(props.timezone.description).toContain("IANA 타임존");
  });

  it("ServerTool(zod schema 없음) → parametersSchema null (provider 내장)", () => {
    const m = extractToolMeta({ type: "web_search" }, toolMetaMap);
    expect(m.parametersSchema).toBeNull();
  });

  it("비-zod schema(임의 객체) → graceful null (변환 throw 0)", () => {
    const m = extractToolMeta(
      { name: "weird", description: "x", schema: { not: "a zod schema" } },
      toolMetaMap,
    );
    expect(m.parametersSchema).toBeNull();
  });

  it("schema 미보유 ClientTool → null (안전)", () => {
    const m = extractToolMeta({ name: "noschema", description: "y" }, toolMetaMap);
    expect(m.parametersSchema).toBeNull();
  });

  it("JSON.stringify(parametersSchema) 직렬화 안전(순수 JSON Schema)", () => {
    const tool = {
      name: "t",
      description: "d",
      schema: z.object({ a: z.number().describe("숫자 a") }),
    };
    const m = extractToolMeta(tool, toolMetaMap);
    expect(() => JSON.stringify(m)).not.toThrow();
    expect(JSON.stringify(m)).toContain("숫자 a");
  });
});

// 메타 가드: 이 모듈은 buildHarnessConfig / checkpointer 를 import 하지
// 않아야 한다(C1 — 순수성). import 시 side-effect 0 확인용 sanity.
describe("순수성 sanity — 모듈 import 가 side-effect 0", () => {
  it("vi.spyOn fs 없이도 import/호출이 파일시스템 미접촉(throw 0)", () => {
    // 이미 위 describe 들이 trap config 로 검증. 여기선 빈 config 1회 더.
    const empty: HarnessConfig = {
      planning: { enabled: false },
      filesystem: { enabled: false },
      subagents: [],
      tools: [],
      checkpointer: null,
      skills: { enabled: false, sources: [], backend: null },
    };
    expect(() => toHarnessView(empty, "", [])).not.toThrow();
  });
});

// 스킬 상세 — SKILL.md(YAML frontmatter + 마크다운 본문) 파싱.
// frontmatter name/description = LLM 시스템 프롬프트 주입분(스킬 사용
// 시점 판단 근거), body = 에이전트가 read_file 로 읽는 실행 가이드.
// 사용자 요구: 스킬 상세 정보도 모두 노출. 순수 함수(파일 내용 인자).
describe("parseSkillDetail — SKILL.md → {name,description,body} (순수)", () => {
  const SAMPLE = [
    "---",
    "name: deep-web-research",
    'description: 깊게 조사 요청 시 사용한다. 단순 사실 확인엔 쓰지 않는다.',
    "---",
    "",
    "# Deep Web Research",
    "",
    "복합 주제를 3개 각도로 병렬 조사한다.",
    "",
    "## 절차",
    "1단계 — 분할",
  ].join("\n");

  it("frontmatter name/description 추출 + body 분리", () => {
    const d = parseSkillDetail("/deep-web-research/", SAMPLE);
    expect(d.source).toBe("/deep-web-research/");
    expect(d.name).toBe("deep-web-research");
    expect(d.description).toContain("깊게 조사");
    expect(d.body).toContain("# Deep Web Research");
    expect(d.body).toContain("## 절차");
    // frontmatter 구분선(---)은 body 에 포함 안 됨
    expect(d.body.startsWith("---")).toBe(false);
  });

  it("frontmatter 없는 파일 → name/description null, 전체가 body", () => {
    const d = parseSkillDetail("/x/", "# 제목만\n본문");
    expect(d.name).toBeNull();
    expect(d.description).toBeNull();
    expect(d.body).toContain("# 제목만");
  });

  it("내용 읽기 실패(null) → 모두 null, body 빈문자열 (graceful)", () => {
    const d = parseSkillDetail("/missing/", null);
    expect(d.source).toBe("/missing/");
    expect(d.name).toBeNull();
    expect(d.description).toBeNull();
    expect(d.body).toBe("");
  });

  it("description 콜론 포함 값도 정확 파싱(첫 콜론만 분리)", () => {
    const md = "---\nname: t\ndescription: a:b:c 형태도 처리\n---\n본문";
    const d = parseSkillDetail("/t/", md);
    expect(d.description).toBe("a:b:c 형태도 처리");
  });

  it("JSON 직렬화 안전(plain object)", () => {
    const d = parseSkillDetail("/deep-web-research/", SAMPLE);
    expect(() => JSON.stringify(d)).not.toThrow();
  });
});

// vi 미사용 경고 회피용 no-op (테스트 가독성 — 실제 spy 는 불필요).
void vi;

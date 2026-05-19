/**
 * D7 dartAnalyst subagent + 8관점 dartPrompts 단위 테스트 — 역검증(green 기대).
 *
 * 대상:
 *  - src/lib/agent/harness/subagents/dartPrompts.ts (순수 상수/함수 SSOT —
 *    BASE_PROMPT / ANALYSIS_TYPES(8관점) / getFullSystemPrompt /
 *    getTaskInstruction / getAnalysisTypeName)
 *  - src/lib/agent/harness/subagents/dartAnalyst.ts (SubagentSpec —
 *    name="dart-analyst", systemPrompt 합성, tools:[dartTool,webSearchTool])
 *  - src/lib/agent/harness/subagents/index.ts (HARNESS_SUBAGENTS R2 등록)
 *
 * 실제 LLM/API/네트워크 호출 0 — 순수 상수·구조 검증만(NFR-18). dartAnalyst.ts
 * 가 import 하는 dartTool 어댑터는 @/lib/dart(jszip dynamic import) 를 끌어오나,
 * 본 테스트는 dartTool 을 *실행하지 않고* tools 배열 멤버 식별·길이만 확인하므로
 * 모듈 모킹 불필요(import 시 부수효과 없음 — D6 dartTool.test.ts 와 동일 전제).
 *
 * 정답지(추측 0): 원본 SSOT `.design-handoff/dart-source/src/lib/prompts/
 * dart-analysis-prompts.ts` 의 8관점 name 필드 실측(L47~367):
 *   financial_health=재무건전성 / growth=성장성 / profitability=수익성 /
 *   valuation=밸류에이션 / governance=지배구조 / risk=리스크 /
 *   workforce=인력/조직 / comprehensive=종합분석.
 * 원본 12종 중 미이식 4종(investment_thesis L288 / peer_comparison L327 /
 * integrated_analysis L407 / cross_validation L448) + 원본 L493/L502
 * PERPLEXITY_BASE_PROMPT·PERPLEXITY_SEARCH_TYPES 절단 확인. PRD §3 /
 * D5 AnalysisPerspective / dartTool zod enum 8종과 1:1 정합.
 *
 * TC 매핑:
 *  - TC-46.4 / TC-41.3 / TC-41.5 / TC-42.2 / AC-30: 8관점 매핑 결정성·조립
 *    (관점-항목 매핑 상수·systemPrompt 단위 결정 검증, LLM 비호출)
 *  - AC-30 (신뢰도 표기) + R8 정합(KIS 제거 — 실시간 시세 단정 0)
 *  - TC-47.1/47.2 / AC-22: gemini/perplexity 분석 경로 의존 0
 *  - TC-41.1 / FR-20 / R2: dartAnalystSubagent SubagentSpec 구조 +
 *    HARNESS_SUBAGENTS 등록(webSearcher 동형)
 *  - TC-44.3/44.4 / TC-45.x / R5: dartTool 은 subagent.tools 엔 주입되나
 *    HARNESS_TOOLS(메인 도구 배열) 엔 미등록(격리 회귀 가드 — D6 재확인)
 */

import { describe, it, expect } from "vitest";
import {
  BASE_PROMPT,
  ANALYSIS_TYPES,
  getFullSystemPrompt,
  getTaskInstruction,
  getAnalysisTypeName,
} from "@/lib/agent/harness/subagents/dartPrompts";
import * as dartPrompts from "@/lib/agent/harness/subagents/dartPrompts";
import {
  dartAnalystSubagent,
  dartAnalystSubagentDisplayName,
} from "@/lib/agent/harness/subagents/dartAnalyst";
import { HARNESS_SUBAGENTS } from "@/lib/agent/harness/subagents";
import { HARNESS_TOOLS } from "@/lib/agent/harness/tools";
import { dartTool } from "@/lib/agent/harness/tools/dartTool";
import { webSearchTool } from "@/lib/agent/harness/tools/webSearchTool";

/** 원본 SSOT 실측 8관점 한글명 정답지(추측 0 — dart-analysis-prompts.ts L47~367). */
const EXPECTED_PERSPECTIVES: Record<string, string> = {
  financial_health: "재무건전성",
  growth: "성장성",
  profitability: "수익성",
  valuation: "밸류에이션",
  governance: "지배구조",
  risk: "리스크",
  workforce: "인력/조직",
  comprehensive: "종합분석",
};

/** 원본 12종 중 미이식 4종(Perplexity·확장 분석유형 절단 — STRUCTURAL #2). */
const UNPORTED_TYPES = [
  "investment_thesis",
  "peer_comparison",
  "integrated_analysis",
  "cross_validation",
];

// ══════════════════════════════════════════════════════════════════════════
// 1. 8관점 매핑 결정성 (TC-46.4 / TC-41.3 / TC-41.5 / TC-42.2 / AC-30) [P0]
//    관점-항목 매핑 상수·조립 함수 단위 결정 검증 — LLM 비호출.
// ══════════════════════════════════════════════════════════════════════════
describe("8관점 매핑 결정성 (TC-46.4·41.3·41.5·42.2 / AC-30) — 순수 상수", () => {
  it("ANALYSIS_TYPES 키가 정확히 8개 (PRD §3 / D5 AnalysisPerspective 1:1)", () => {
    expect(Object.keys(ANALYSIS_TYPES).sort()).toEqual(
      Object.keys(EXPECTED_PERSPECTIVES).sort(),
    );
    expect(Object.keys(ANALYSIS_TYPES)).toHaveLength(8);
  });

  it("원본 12종 중 미이식 4종(investment_thesis/peer_comparison/integrated_analysis/cross_validation) 부재", () => {
    for (const t of UNPORTED_TYPES) {
      expect(ANALYSIS_TYPES[t]).toBeUndefined();
    }
  });

  it("각 관점 {name,systemInstruction,taskInstruction} 비어있지 않음", () => {
    for (const [key, cfg] of Object.entries(ANALYSIS_TYPES)) {
      expect(cfg.name, `${key}.name`).toBeTruthy();
      expect(cfg.systemInstruction.trim().length, `${key}.systemInstruction`).toBeGreaterThan(0);
      expect(cfg.taskInstruction.trim().length, `${key}.taskInstruction`).toBeGreaterThan(0);
    }
  });

  it("getAnalysisTypeName 이 8관점 한글명 정확값 반환 (원본 SSOT 실측)", () => {
    for (const [key, name] of Object.entries(EXPECTED_PERSPECTIVES)) {
      expect(getAnalysisTypeName(key)).toBe(name);
      // 상수 직접값도 동일 — name 필드가 SSOT 정답지와 일치
      expect(ANALYSIS_TYPES[key].name).toBe(name);
    }
  });

  it("getAnalysisTypeName(미등록 타입) → 입력값 그대로 (폴백 결정성)", () => {
    expect(getAnalysisTypeName("investment_thesis")).toBe("investment_thesis");
    expect(getAnalysisTypeName("unknown_xyz")).toBe("unknown_xyz");
  });

  it("getFullSystemPrompt('comprehensive') = BASE + '\\n\\n' + comprehensive.systemInstruction (조립 결정성)", () => {
    const expected =
      BASE_PROMPT.getFullBasePrompt() +
      "\n\n" +
      ANALYSIS_TYPES.comprehensive.systemInstruction;
    expect(getFullSystemPrompt("comprehensive")).toBe(expected);
  });

  it("getFullSystemPrompt(미등록 타입) → base 만 반환 (config 부재 폴백)", () => {
    expect(getFullSystemPrompt("investment_thesis")).toBe(
      BASE_PROMPT.getFullBasePrompt(),
    );
  });

  it("getTaskInstruction('growth') = growth.taskInstruction / 미등록 → ''", () => {
    expect(getTaskInstruction("growth")).toBe(
      ANALYSIS_TYPES.growth.taskInstruction,
    );
    expect(getTaskInstruction("peer_comparison")).toBe("");
    expect(getTaskInstruction("unknown_xyz")).toBe("");
  });

  it("getFullSystemPrompt 가 8관점 전수에서 base + 해당 systemInstruction 결정 조립", () => {
    const base = BASE_PROMPT.getFullBasePrompt();
    for (const key of Object.keys(EXPECTED_PERSPECTIVES)) {
      expect(getFullSystemPrompt(key)).toBe(
        `${base}\n\n${ANALYSIS_TYPES[key].systemInstruction}`,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. R8 KIS 정합 — 실시간 시세 문구 제거 + 신뢰도 표기 (AC-30 / TC-47.3 인접) [P0]
//    원본 "DART & 실시간 주가 데이터를 1차 자료" → "DART 전자공시"로 재서술.
// ══════════════════════════════════════════════════════════════════════════
describe("R8 KIS 정합 (실시간 시세 단정 0 / AC-30 신뢰도 표기) — 순수 상수", () => {
  it("BASE_PROMPT.principles 가 DART 전자공시 기반 + 실시간 시세 미제공 명시", () => {
    const p = BASE_PROMPT.principles;
    expect(p).toContain("DART 전자공시");
    // 원본 "DART & 실시간 주가 데이터를 1차 자료" 류 시세 1차자료 문구 부재
    expect(p).not.toContain("실시간 주가 데이터를 1차");
    expect(p).not.toContain("실시간 주가 데이터");
    // 실시간 시세 미제공을 명시(LLM 이 없는 주가를 단정하지 않게)
    expect(p).toMatch(/실시간 주가·시세는 제공되지 않으므로/);
  });

  it("신뢰도 표기 🟢🟡🔴 가 BASE_PROMPT.principles 에 정의됨 (AC-30)", () => {
    const p = BASE_PROMPT.principles;
    expect(p).toContain("🟢");
    expect(p).toContain("🟡");
    expect(p).toContain("🔴");
    expect(p).toContain("신뢰도");
  });

  it("valuation 관점: 목표주가·상승여력은 *금지 절* 안에서만 등장(시세 단정 0) + 멀티플 적정성 중심", () => {
    const v = ANALYSIS_TYPES.valuation;
    const combined = v.systemInstruction + "\n" + v.taskInstruction;
    // R8 정합: 원본엔 없던 "목표주가/상승여력" 을 *부정 절*로 도입해 LLM 의
    // 시세 단정을 차단한다. 따라서 단어 존재 자체가 아니라 "단정 지시로
    // 등장하지 않음" 을 검증 — 등장 시 반드시 부정/금지 문맥이어야 한다.
    if (/목표주가/.test(combined)) {
      expect(combined).toMatch(
        /목표주가[^\n]*?(하지 않|단정|금지|제공되지 않)/,
      );
    }
    if (/상승여력/.test(combined)) {
      expect(combined).toMatch(
        /상승여력[^\n]*?(하지 않|단정|금지|제공되지 않)/,
      );
    }
    // "현재 주가 대비 N%" 식 시세 단정 패턴은 0 (원본 KIS 전제 제거)
    expect(combined).not.toMatch(/현재 주가 대비\s*\d/);
    expect(combined).not.toMatch(/저평가\/적정\/고평가/);
    // 재서술 후 핵심 가드·중심 문구 존재 (시세 단정 금지 / 멀티플 적정성)
    expect(combined).toMatch(/시세 단정|시세 기반 단정/);
    expect(combined).toMatch(/멀티플/);
  });

  it("comprehensive 밸류에이션 영역도 시세 단정 금지 명시 (5대 영역 정합)", () => {
    const c =
      ANALYSIS_TYPES.comprehensive.systemInstruction +
      "\n" +
      ANALYSIS_TYPES.comprehensive.taskInstruction;
    // valuation 과 동일 R8 원칙: 단어가 있으면 부정/금지 문맥이어야 함
    if (/목표주가/.test(c)) {
      expect(c).toMatch(/목표주가[^\n]*?(하지 않|단정|금지)/);
    }
    if (/상승여력/.test(c)) {
      expect(c).toMatch(/상승여력[^\n]*?(하지 않|단정|금지)/);
    }
    expect(c).not.toMatch(/현재 주가 대비\s*\d/);
    expect(c).toMatch(/시세 단정 금지/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. gemini/perplexity 분석 경로 의존 0 (AC-22 / TC-47.1·47.2) [P0]
//    dartApi.test.ts grep 패턴 — 소스 텍스트에서 폐기 종속 0(주석 제외).
// ══════════════════════════════════════════════════════════════════════════
describe("gemini/perplexity 분석 경로 0 (AC-22 / TC-47.1·47.2)", () => {
  it("dartPrompts.ts / dartAnalyst.ts 가 gemini/perplexity export 미노출", () => {
    // 원본 PERPLEXITY_BASE_PROMPT(L493)·PERPLEXITY_SEARCH_TYPES(L502) 절단 확인
    expect(
      (dartPrompts as Record<string, unknown>).PERPLEXITY_BASE_PROMPT,
    ).toBeUndefined();
    expect(
      (dartPrompts as Record<string, unknown>).PERPLEXITY_SEARCH_TYPES,
    ).toBeUndefined();
    expect(
      (dartPrompts as Record<string, unknown>).getPerplexitySystemPrompt,
    ).toBeUndefined();
  });

  it("dartPrompts.ts 소스 import/식별자에 gemini/generative-ai/perplexity 0 (주석 제외)", () => {
    // grep≠AST(tool-limitations): 본 단언은 정적 텍스트 검증.
    // 코드 라인(import·식별자)만 보도록 // 주석 라인은 제거 후 검사.
    const src = readSourceWithoutComments(
      "src/lib/agent/harness/subagents/dartPrompts.ts",
    );
    expect(src).not.toMatch(/\bgemini\b/i);
    expect(src).not.toMatch(/generative-ai/i);
    expect(src).not.toMatch(/perplexity/i);
  });

  it("dartAnalyst.ts 소스 import/식별자에 gemini/generative-ai/perplexity 0 (주석 제외)", () => {
    const src = readSourceWithoutComments(
      "src/lib/agent/harness/subagents/dartAnalyst.ts",
    );
    expect(src).not.toMatch(/\bgemini\b/i);
    expect(src).not.toMatch(/generative-ai/i);
    expect(src).not.toMatch(/perplexity/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. dartAnalystSubagent 구조 (SubagentSpec / TC-41.1 / FR-20) [P0]
//    webSearcher 동형 — name/description/systemPrompt/tools 필수 필드.
// ══════════════════════════════════════════════════════════════════════════
describe("dartAnalystSubagent 구조 (SubagentSpec — webSearcher 동형) [TC-41.1/FR-20]", () => {
  it("name='dart-analyst'", () => {
    expect(dartAnalystSubagent.name).toBe("dart-analyst");
  });

  it("description 에 '8관점'·'펀더멘털' 취지 포함", () => {
    expect(dartAnalystSubagent.description).toMatch(/8관점/);
    expect(dartAnalystSubagent.description).toMatch(/펀더멘털/);
  });

  it("systemPrompt 가 BASE role + 8관점 가이드 + 워크플로우(도구 사용 안내) 포함", () => {
    const sp = dartAnalystSubagent.systemPrompt;
    expect(sp.trim().length).toBeGreaterThan(0);
    // BASE_PROMPT.role 흡수 (CFA 페르소나)
    expect(sp).toContain(BASE_PROMPT.role);
    // 워크플로우 — dartTool / 웹검색 도구 사용 안내 문자열
    expect(sp).toContain("dart_company_data");
    expect(sp).toMatch(/웹검색/);
    expect(sp).toMatch(/워크플로우/);
    // 8관점 전 키가 systemPrompt 가이드에 노출(perspectiveGuide 합성)
    for (const key of Object.keys(EXPECTED_PERSPECTIVES)) {
      expect(sp, `systemPrompt 가 관점 키 '${key}' 노출`).toContain(key);
    }
    // 실시간 시세 단정 금지 가드(BASE 정합 흡수)도 본문 명시
    expect(sp).toMatch(/실시간 주가·시세/);
  });

  it("tools 배열 = [dartTool, webSearchTool] (.length===2 — webSearcher 동형 주입)", () => {
    expect(Array.isArray(dartAnalystSubagent.tools)).toBe(true);
    expect(dartAnalystSubagent.tools).toHaveLength(2);
    expect(dartAnalystSubagent.tools).toContain(dartTool);
    expect(dartAnalystSubagent.tools).toContain(webSearchTool);
  });

  it("SubagentSpec 필수 필드 충족 (name/description/systemPrompt string)", () => {
    expect(typeof dartAnalystSubagent.name).toBe("string");
    expect(typeof dartAnalystSubagent.description).toBe("string");
    expect(typeof dartAnalystSubagent.systemPrompt).toBe("string");
  });

  it("dartAnalystSubagentDisplayName='기업 펀더멘털 분석' (사고 패널 한글 — 백엔드 미제공)", () => {
    expect(dartAnalystSubagentDisplayName).toBe("기업 펀더멘털 분석");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. R2 등록 (HARNESS_SUBAGENTS — webSearcher 동형 1줄 등록) [P0]
//    TC-41.1 / FR-20 / R2 — 레지스트리 단일 지점.
// ══════════════════════════════════════════════════════════════════════════
describe("R2 등록 (HARNESS_SUBAGENTS / TC-41.1·FR-20)", () => {
  it("배열에 name='dart-analyst' 존재 + 기존 'web-searcher' 유지 (둘 다, 길이 2)", () => {
    const names = HARNESS_SUBAGENTS.map((s) => s.name);
    expect(names).toContain("dart-analyst");
    expect(names).toContain("web-searcher");
    expect(HARNESS_SUBAGENTS).toHaveLength(2);
  });

  it("HARNESS_SUBAGENTS 의 dart-analyst 항목이 dartAnalystSubagent 인스턴스(동일 참조)", () => {
    const entry = HARNESS_SUBAGENTS.find((s) => s.name === "dart-analyst");
    expect(entry).toBe(dartAnalystSubagent);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. R5 격리 정합 — subagent.tools 엔 주입, HARNESS_TOOLS 엔 미등록 [P0]
//    TC-44.3/44.4 (토글 OFF 영향면 0) + TC-45.x (본문 누출 0 구조 보장).
//    D6 검증 재확인 — 회귀 가드(dartTool 이 메인 도구 배열에 새지 않음).
// ══════════════════════════════════════════════════════════════════════════
describe("R5 격리 정합 (dartTool subagent 전용 주입 / TC-44.3·44.4·45.x)", () => {
  it("dartAnalystSubagent.tools 에 dartTool 포함 (subagent 전용 주입 — R5)", () => {
    expect(dartAnalystSubagent.tools).toContain(dartTool);
  });

  it("HARNESS_TOOLS(메인 도구 배열) 에 dartTool/dart_company_data 0건 (격리 회귀 가드 — D6 재확인)", () => {
    expect(HARNESS_TOOLS).not.toContain(dartTool);
    const ids = HARNESS_TOOLS.map((t) =>
      String(
        (t as Record<string, unknown>).name ??
          (t as Record<string, unknown>).type ??
          "",
      ),
    );
    expect(ids.some((n) => n.toLowerCase().includes("dart"))).toBe(false);
    expect(ids).not.toContain("dart_company_data");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 헬퍼: 소스 파일에서 // 한 줄 주석 제거(블록 주석 헤더 포함) 후 텍스트 반환.
// grep≠AST 한계 회피용 — import/식별자 라인만 폐기 종속 검사 대상으로 좁힌다.
// (정적 파일 read 1회 — LLM/네트워크 0)
// ──────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSourceWithoutComments(relPath: string): string {
  const abs = resolve(process.cwd(), relPath);
  const raw = readFileSync(abs, "utf8");
  // 블록 주석(/** ... */) 통째 제거 + 라인 // 주석 제거.
  const noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlock
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

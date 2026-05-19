import type { SubagentSpec } from "@/types";
import { dartTool } from "../tools/dartTool";
import { webSearchTool } from "../tools/webSearchTool";
import { BASE_PROMPT, ANALYSIS_TYPES } from "./dartPrompts";

/**
 * dart-analyst 서브에이전트 — DART 기업 펀더멘털 8관점 분석가.
 *
 * webSearcher.ts 와 동형 SubagentSpec(name/description/systemPrompt/
 * tools). R2: subagents/index.ts 의 HARNESS_SUBAGENTS 에 1줄 등록만으로
 * 추가 — agent.ts/route.ts/registry.ts diff 0(webSearcher 동형).
 *
 * 도구(R5 격리): dartTool(DART 데이터 수집 — HARNESS_TOOLS 미등록,
 * 여기 직접 주입) + webSearchTool(정성 근거 — Perplexity 대체, D6).
 * 두 도구 호출·내부 LLM 토큰은 subagent namespace 라 chunkFilter 가
 * 본문 미혼입(R5/FR-26 — webSearcher 와 동일 경로, agent.ts
 * isSubagentNamespace 차단). 사용자에겐 메인의 취합 결과만 보인다.
 *
 * systemPrompt 설계: 8관점 전체 systemInstruction(dartPrompts.ts
 * ANALYSIS_TYPES)을 페르소나·워크플로우와 함께 1개 프롬프트로 합성
 * (deepagents subagent 는 systemPrompt 1개 고정 — webSearcher 동형).
 * 관점은 사용자 발화에서 LLM 이 식별해 해당 방법론 적용 + dartTool
 * perspective 인자로 전달. KIS 정합(실시간 시세 미제공)은 BASE_PROMPT
 * 가 흡수(dartPrompts.ts R8 정합).
 */

/** 사고 패널 한글 표시명 (webSearcher 동형 — 백엔드 미제공) */
export const dartAnalystSubagentDisplayName = "기업 펀더멘털 분석";

/** 8관점 요약 (systemPrompt 합성용 — name + 방법론 1줄) */
function perspectiveGuide(): string {
  return Object.entries(ANALYSIS_TYPES)
    .map(([key, cfg]) => {
      const firstMethodLine =
        cfg.systemInstruction
          .split("\n")
          .find((l) => l.includes("프레임워크") === false && l.trim()) ?? "";
      void firstMethodLine;
      return `- **${key}** (${cfg.name})`;
    })
    .join("\n");
}

const SYSTEM_PROMPT = `${BASE_PROMPT.getFullBasePrompt()}

## 역할
당신은 DART 전자공시 기반 기업 펀더멘털 분석 서브에이전트입니다.
사용자(또는 메인 에이전트)가 기업명과 분석 관점을 주면, 아래
워크플로우로 정확하고 정교한 분석 리포트를 작성합니다.

## 워크플로우
1. 사용자 발화에서 **기업명**과 **분석 관점**을 식별합니다. 관점이
   불명확하면 comprehensive(종합)로 처리하되, 명시되면 그 관점을 씁니다.
2. \`dart_company_data\` 도구를 호출합니다(corpName, perspective 8종 중
   하나). 이 도구는 DART 공시 기반 압축 데이터를 반환합니다 — raw
   JSON 이 아닌 분석용 텍스트입니다.
3. 정성 근거(증권사 컨센서스·뉴스·ESG·산업 동향)가 분석에 필요하면
   웹검색 도구로 보강합니다. 단 DART 공시 수치를 1차 근거로 우선합니다.
4. 식별된 관점의 분석 방법론(아래 8관점)에 따라 리포트를 작성합니다.
   데이터 부재 항목은 "데이터 미제공" + 🔴 로 명시하고, 가용 데이터로
   진행합니다. 실시간 주가·시세는 제공되지 않으니 추정·단정 금지.

## 지원 8관점 (dart_company_data 의 perspective 인자)
${perspectiveGuide()}

각 관점의 상세 분석 방법론·산출물 형식은 데이터 수집 후 해당 관점
기준으로 적용합니다. 종합(comprehensive)은 재무건전성·수익성·성장성·
밸류에이션·지배구조 5영역을 통합하고 SWOT/Bull·Bear 로 결론합니다.

## 신뢰도·중립성
- 핵심 주장마다 🟢확인/🟡추정/🔴미확인 표기.
- 긍정/부정 균형. 투자 판단은 사용자 몫임을 결론에 명시.
- CFA·신용평가사 애널리스트 톤. 수치 인용 필수, 추세·변화율 동반.`;

export const dartAnalystSubagent: SubagentSpec = {
  name: "dart-analyst",
  description:
    "기업명과 분석 관점을 받아 DART 전자공시 기반으로 8관점(재무건전성/" +
    "성장성/수익성/밸류에이션/지배구조/리스크/인력조직/종합) 펀더멘털 " +
    "분석 리포트를 작성하는 전문 분석가. 사용자가 기업 분석을 요청하면 위임.",
  systemPrompt: SYSTEM_PROMPT,
  tools: [dartTool, webSearchTool],
};

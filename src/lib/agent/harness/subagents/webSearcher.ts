import type { SubagentSpec } from "@/types";
import { webSearchTool } from "../tools/webSearchTool";

/**
 * web-searcher 서브에이전트 (deep-web-research SKILL 의 일꾼).
 *
 * 단일 종(種)을 SKILL.md 가 `task` 도구로 3회 위임한다 — 사용자
 * "전체 범위 동일 비동기 병렬" 원칙 정합. 관점 차별화는 SKILL.md 가
 * 각 task 호출에 넘기는 지시(검색 각도/쿼리)로 만든다(서브에이전트는
 * 받은 지시에 충실히 검색·요약하는 범용 일꾼).
 *
 * tools: webSearchTool(OpenAI ServerTool) 만 부여 — 역할을 웹검색으로
 * 좁힌다. 메인 defaultTools 상속 대신 명시 주입(SubAgent.tools, 실측:
 * StructuredTool[] 시그니처지만 ServerTool 1급 수용 — probe §6-A 패턴,
 * 런타임 재확인 대상).
 *
 * R5/FR-09: 이 서브에이전트의 검색 토큰은 langgraph_node !==
 * "model_request" 라 chunkFilter 가 본문 미혼입한다. 사용자에겐 메인
 * 에이전트의 취합 결과만 보인다(설계가 이 SKILL 을 이미 받쳐줌).
 */
/**
 * 사고 패널 한글 표시명 (medigate-new agentName 대응). deepagents 는
 * subagent 를 `task` 도구의 args.subagent_type 으로 흘리므로(name=
 * "web-searcher") 백엔드가 한글을 안 준다 — subagent 파일이 직접 선언
 * (FR-08 요소1개=파일1개, 도구 *DisplayName 과 동일 패턴).
 * thinkingLabels.subagentDisplayName 이 subagent_type→이 라벨 수집.
 */
export const webSearcherSubagentDisplayName = "웹 검색";

export const webSearcherSubagent: SubagentSpec = {
  name: "web-searcher",
  description:
    "단일 검색 과제를 받아 웹을 검색하고 핵심 사실·출처를 구조화해 반환하는 일꾼. " +
    "deep-web-research 스킬이 서로 다른 검색 각도로 여러 번 위임한다.",
  // TODO(learning): 아래 systemPrompt 를 확정하라 (5~10줄).
  //
  // 이 프롬프트가 검색 결과의 다양성·취합 가치를 좌우한다. 고려할 점:
  //  - 받은 검색 지시(각도)에 충실히 따를 것 vs. 스스로 쿼리 확장할 것
  //  - 출처 명시 강제 형식 (취합 단계가 파싱하기 쉬운 구조 — 예: 사실
  //    1줄 + 출처 URL 1줄 반복). 형식을 고정해야 메인의 취합이 안정적.
  //  - 검색 횟수 상한 (토큰·지연 — 무한 재검색 방지)
  //  - 불확실/근거 부족 시 추측 금지, "근거 없음" 명시 (CLAUDE.md
  //    "불확실할 때 가정 금지" 원칙과 정합)
  //
  // 아래는 동작 골격 placeholder. 정책을 확정해 교체할 것.
  systemPrompt:
    "당신은 웹검색 일꾼입니다. 받은 검색 지시 한 건을 수행하고 " +
    "결과를 출처와 함께 간결히 정리해 반환하세요. 추측 금지, 근거 없으면 " +
    "그렇게 명시하세요. (PLACEHOLDER — 사용자가 정책을 확정해 교체)",
  tools: [webSearchTool],
};

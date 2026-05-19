import { currentTimeToolDisplayName } from "@/lib/agent/harness/tools/exampleTool";
import { webSearchToolDisplayName } from "@/lib/agent/harness/tools/webSearchTool";

/**
 * 사고 패널 한글 안내문구 생성 — 순수 함수(LLM/React 무관, NFR-11).
 *
 * 배경: medigate-new 는 백엔드가 `toolDisplayName` 과 step 제목을
 * 내려준다. 우리 deepagents/LangGraph 는 영문 reasoning 토큰만 주고
 * 한글 제목을 안 준다. 그래서 클라이언트가 step 의 order/kind/도구명
 * 으로 한글 안내문구를 **직접 생성**한다(medigate-new useAgentService
 * 규칙 그대로 모방):
 *   reasoning: order 0 → '질문 분석 중' / 완료 '질문 분석'
 *              order≥1 → '결과 분석 중' / 완료 '결과 분석'
 *   tool:      '{한글라벨} 도구 실행 중' / 완료 '{한글라벨} 도구 완료'
 *
 * 도구 한글 라벨은 각 도구 파일의 `*DisplayName` export 에서 수집한다
 * (FR-08 — 요소1개=파일1개). 새 도구는 그 파일에 displayName 을 추가
 * 하고 아래 TOOL_DISPLAY_NAMES 에 1줄 등록(레지스트리 패턴). 미매핑
 * 도구는 원본 도구명으로 폴백 — 등록 안 해도 깨지지 않는다.
 *
 * 영문 reasoning 텍스트(`Clarifying user intent` 등)는 **제목이 아니라
 * 본문**이다(medigate-new 와 동일). 더 이상 **bold** 를 제목으로
 * 파싱하지 않는다 — reduceReasoning 이 order 로 제목을 생성한다.
 */

/** 도구명 → 한글 표시명. 새 도구는 여기 1줄 등록(미등록=원본명 폴백). */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  current_time: currentTimeToolDisplayName,
  web_search: webSearchToolDisplayName,
};

/** 도구명을 한글 표시명으로. 미매핑은 원본명, 빈값은 '도구' 폴백. */
export function toolDisplayName(name: string): string {
  if (!name) return "도구";
  return TOOL_DISPLAY_NAMES[name] ?? name;
}

/**
 * reasoning step 제목. order 0 은 '질문 분석', 이후는 '결과 분석'.
 * 진행 중이면 '… 중' 접미사(완료 시 제거 — medigate-new 규칙).
 */
export function reasoningTitle(order: number, done: boolean): string {
  const base = order === 0 ? "질문 분석" : "결과 분석";
  return done ? base : `${base} 중`;
}

/**
 * tool step 제목. '{한글라벨} 도구 실행 중' → 완료 '{한글라벨} 도구 완료'.
 */
export function toolTitle(name: string, done: boolean): string {
  const label = toolDisplayName(name);
  return done ? `${label} 도구 완료` : `${label} 도구 실행 중`;
}

/**
 * 제목이 진행 중 상태('… 중')인가 — UI 가 스태틱 '...' 부착 여부 판정.
 * (사용자 요구: '분석중'이면 그 뒤에 점점점을 스태틱하게 붙인다.)
 */
export function isInProgress(title: string): boolean {
  // 생성 규칙상 진행 중 제목은 항상 '… 중'(공백+중)으로 끝난다.
  // '집중' 같은 무관 단어 오탐 방지를 위해 공백+중만 인정.
  return title.endsWith(" 중");
}

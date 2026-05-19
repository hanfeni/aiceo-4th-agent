/**
 * webSearcher 서브에이전트 표시 메타 (경량 모듈 — 의존 0).
 *
 * 분리 이유 (보안): webSearcher.ts 는 `webSearchTool`(ClientTool —
 * openai SDK 의존 서버 전용)을 import 해 tools 배열에 넣는다. 클라
 * 이언트 컴포넌트 ThinkingPanel → thinkingLabels.ts 가 표시명
 * (webSearcherSubagentDisplayName)만 필요한데 같은 파일에 있으면
 * 번들러가 webSearchTool→openai SDK 를 클라이언트 번들로 끌어간다.
 * webSearchTool.meta.ts 와 동일한 서버/클라 경계 분리 정석.
 */

/** 사고 패널 한글 표시명 (FR-08 — 서브에이전트 task 위임 라벨). */
export const webSearcherSubagentDisplayName = "웹 검색";

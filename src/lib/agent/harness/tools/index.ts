import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { currentTimeTool, currentTimeToolDisplayName } from "./exampleTool";
import {
  webSearchTool,
  webSearchToolDisplayName,
  webSearchToolDescription,
} from "./webSearchTool";

/**
 * H4 커스텀 도구 등록 지점 (스펙 디렉토리 원칙의 re-export
 * 허용 예외 — 등록 지점에만 허용).
 *
 * 새 도구 추가 절차 (요소 추가·제거 용이 — FR-08):
 *   1. harness/tools/<myTool>.ts 작성 (langchain `tool()` 형태, zod ^4)
 *      + `export const <myTool>DisplayName = "한글명";`
 *   2. 아래 HARNESS_TOOLS 배열 + HARNESS_TOOL_DISPLAY_NAMES 배열에
 *      각 1줄 추가 (도구명은 ClientTool=.name / ServerTool=.type 실측)
 *   3. 그 외 파일 변경 0 (agent.ts/route.ts/harness 화면 무수정 —
 *      R2/NFR-6 + FR-08: /harness introspect 가 이 매핑을 동적으로 읽어
 *      새 도구도 한글명까지 자동 표시)
 *
 * 도구는 두 종류가 혼재할 수 있다 (createDeepAgent 가 1급 수용 —
 * probe note §6-A): ClientTool(우리 측 실행, 예: exampleTool) /
 * ServerTool(provider 측 실행, 예: OpenAI webSearch). 배열 타입을
 * deepagents 시그니처와 동일한 union 으로 정렬한다.
 *
 * 배열을 [] 로 비워도 빌드·기동·기본 채팅이 정상이어야 한다 (AC-4).
 */
export const HARNESS_TOOLS: (ClientTool | ServerTool)[] = [
  currentTimeTool,
  webSearchTool,
];

/**
 * 도구명 → 사고 패널/하네스 화면 한글 표시명 매핑 (FR-08 동적화).
 * /harness introspect 가 이 배열을 읽어 displayName 을 붙인다 — 새 도구
 * 추가 시 이 배열 1줄만 더하면 화면 코드(page.tsx/HarnessView) 수정 0.
 * 도구명은 ClientTool=.name / ServerTool=.type (실측 — probe note).
 * HARNESS_TOOLS 와 별도 배열로 둬 기존 도구 배열 타입/회귀 0.
 */
export const HARNESS_TOOL_DISPLAY_NAMES: {
  name: string;
  displayName: string;
  /** ServerTool 처럼 .description 미보유 도구의 설명(introspect ToolMeta
   *  와 구조 호환 — 인라인 유지로 introspect 역방향 결합 회피). */
  description?: string;
}[] = [
  // ClientTool(current_time)은 도구 객체 .description 보유 → 매핑 description
  // 불요(introspect 가 .description 우선). ServerTool 만 매핑이 유일 경로.
  { name: "current_time", displayName: currentTimeToolDisplayName },
  {
    name: "web_search",
    displayName: webSearchToolDisplayName,
    description: webSearchToolDescription,
  },
];

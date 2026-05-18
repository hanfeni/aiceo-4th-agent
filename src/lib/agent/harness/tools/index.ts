import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { currentTimeTool } from "./exampleTool";
import { webSearchTool } from "./webSearchTool";

/**
 * H4 커스텀 도구 등록 지점 (requirements.md 디렉토리 원칙의 re-export
 * 허용 예외 — 등록 지점에만 허용).
 *
 * 새 도구 추가 절차 (요소 추가·제거 용이 — FR-08):
 *   1. harness/tools/<myTool>.ts 작성 (langchain `tool()` 형태, zod ^4)
 *   2. 아래 HARNESS_TOOLS 배열에 import 후 1줄 추가
 *   3. 그 외 파일 변경 0 (agent.ts/route.ts 무수정 — R2/NFR-6)
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

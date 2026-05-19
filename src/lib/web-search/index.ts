/**
 * 웹검색 ClientTool 도메인 배럴 (src/lib/dart/index.ts 동형 — 도메인
 * 디렉토리 1개 = 1 배럴). webSearchTool.ts 는 여기서만 import 한다.
 */
export { runWebSearch } from "./client";
export { formatWebSearchContext } from "./context-formatter";
export type {
  WebSearchRawResult,
  WebSearchStep,
  WebSearchCitation,
} from "./types";

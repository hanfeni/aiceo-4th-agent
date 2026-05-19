/**
 * webSearchTool 표시 메타 (경량 모듈 — 의존 0).
 *
 * 분리 이유 (보안): webSearchTool.ts 가 ServerTool→ClientTool 교체로
 * `openai` SDK + @/lib/web-search 를 import 한다(서버 전용, 무거움).
 * 클라이언트 컴포넌트 ThinkingPanel → thinkingLabels.ts 가 표시명
 * 상수 1개(webSearchToolDisplayName)만 필요한데 같은 파일에 묶여
 * 있으면 번들러가 서버 전용 실행 코드(runWebSearch/openai)까지 클라
 * 이언트 번들로 끌어간다(.next/static 누출 — Plan Critic 항목8 실현).
 * 표시 상수는 의존 없는 이 파일로 분리 — 클라이언트는 meta 만,
 * 서버(index.ts/webSearcher)는 webSearchTool 본체를 import.
 *
 * CLAUDE.md "도구 1개 = 파일 1개"의 합리적 예외: SDK 의존 ServerTool
 * 류 도구에 한해 "표시 메타 / 실행 본체" 2분리(서버/클라 경계 정석).
 * exampleTool(currentTime)은 무거운 의존이 없어 분리 불요.
 */

/**
 * 사고 패널 한글 표시명 (FR-08 — 백엔드 미제공, 도구가 선언).
 * ClientTool 은 .name="web_search" 로 흐른다(HARNESS_TOOL_DISPLAY_NAMES
 * 매핑 키 보존).
 */
export const webSearchToolDisplayName = "웹 검색";

/**
 * ClientTool 설명 (FR-08 동적화 — introspect 가 .description 우선
 * 사용). ServerTool 문구 폐기 — 우리가 OpenAI 를 직호출해 정제.
 */
export const webSearchToolDescription =
  "웹에서 최신 정보를 검색한다. OpenAI Responses API 웹검색을 직호출해 " +
  "여러 단계의 검색·페이지 열람을 수행하고, 검색어·출처·요약을 정제한 " +
  "결과를 반환한다. 최신 시세·뉴스·사실 확인이 필요할 때 사용.";

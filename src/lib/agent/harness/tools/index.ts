import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { currentTimeTool, currentTimeToolDisplayName } from "./exampleTool";
import {
  webSearchTool,
  webSearchToolDisplayName,
  webSearchToolDescription,
} from "./webSearchTool";
// index_search 는 도메인별 팩토리(makeIndexSearchTool)라 정적
// HARNESS_TOOLS 배열엔 안 들어간다(registry 가 세션 도메인으로
// 조건부 합성). 표시 메타·schema(도메인 무관)만 여기서 가져온다.
import {
  indexSearchToolDisplayName,
  indexSearchToolDescription,
  indexSearchToolSchema,
} from "./indexSearchTool.meta";
// sql_query 도 도메인별 팩토리(makeSqlQueryTool) — index_search
// 와 동일하게 정적 배열 미포함, registry 가 조건부 합성.
import {
  sqlQueryToolDisplayName,
  sqlQueryToolDescription,
  sqlQueryToolSchema,
} from "./sqlQueryTool.meta";
// graph_query 도 데이터셋별 팩토리(makeGraphQueryTool) — 동일하게
// 정적 배열 미포함, registry 가 조건부 합성(수업1·3 연결).
import {
  graphQueryToolDisplayName,
  graphQueryToolDescription,
  graphQueryToolSchema,
} from "./graphQueryTool.meta";

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
  // index_search: 팩토리 도구라 객체 .description 이 도메인별로
  // 다르나, 사고패널 표시는 도메인 무관 단일 매핑으로 충분.
  {
    name: "index_search",
    displayName: indexSearchToolDisplayName,
    description: indexSearchToolDescription,
  },
  {
    name: "sql_query",
    displayName: sqlQueryToolDisplayName,
    description: sqlQueryToolDescription,
  },
  {
    name: "graph_query",
    displayName: graphQueryToolDisplayName,
    description: graphQueryToolDescription,
  },
];

/**
 * 카탈로그 표시용 팩토리 도구 메타 (/harness 도구 탭 전용).
 *
 * index_search·sql_query·graph_query 는 도메인 선택 시에만 인스턴스가
 * 생기는 팩토리 도구라 정적 HARNESS_TOOLS 에 없고, /harness 페이지는
 * 세션 도메인을 모를뿐더러 팩토리 호출 시 getSchema/getMemStore(네이티브
 * I/O) side-effect 가 page 부작용-0 원칙(AD-2)을 흔든다. 그래서 팩토리를
 * 호출하지 않고, introspect 가 읽는 최소 형태({name, description, schema})
 * 만 도메인 무관 메타·schema 로 합성한다. extractToolMeta 가 .name +
 * .schema 만 보므로 이 형태로 ToolView(parameters 표·명세 포함)가 나온다.
 *
 * 채팅 런타임 도구 바인딩(registry 의 조건부 합성)과는 무관 — 이건 순수
 * 표시용 카탈로그다(실행 함수 없음).
 */
export const HARNESS_TOOL_CATALOG: {
  name: string;
  description: string;
  schema: unknown;
}[] = [
  {
    name: "index_search",
    description: indexSearchToolDescription,
    schema: indexSearchToolSchema,
  },
  {
    name: "sql_query",
    description: sqlQueryToolDescription,
    schema: sqlQueryToolSchema,
  },
  {
    name: "graph_query",
    description: graphQueryToolDescription,
    schema: graphQueryToolSchema,
  },
];

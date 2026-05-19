import { tools as openaiTools } from "@langchain/openai";

/**
 * OpenAI 내장 웹검색 도구 (H4 커스텀 도구 슬롯 — ServerTool).
 *
 * exampleTool.ts(StructuredTool)와 작성 패턴이 정반대다: 실행 주체가
 * OpenAI Responses API 라 우리 측 실행 함수가 없다. 이 모듈은 단지
 * `tools.webSearch(options)` 를 호출해 ServerTool 선언 객체를 만드는
 * 팩토리다. createDeepAgent 는 `(ClientTool | ServerTool)[]` 를 1급
 * 수용하므로(probe note §6-A) 별도 어댑터 없이 HARNESS_TOOLS 에 그대로
 * 등록된다. "도구 1개 = 파일 1개" 원칙 (NFR-3).
 *
 * 의존성·API키 추가 0 — @langchain/openai(이미 설치) + OPENAI_API_KEY
 * 재사용. provider 종속(ServerTool): OpenAI provider 에서만 실제 검색
 * 발동, anthropic 토글 시 무동작(에러 아님 — probe note §6-A 제약).
 *
 * 정책 자유도는 WebSearchOptions(filters/userLocation/search_context_size)
 * 하나뿐 — 검색 품질·비용·안전성을 좌우한다. buildWebSearchOptions() 에
 * 격리해 LLM 호출 없이 단위 테스트 가능하게 한다(레지스트리·필터·파서는
 * 순수 함수 — CLAUDE.md Mock 금지 절).
 */

/**
 * webSearch 구성 옵션을 만드는 순수 함수 (단위 테스트 대상).
 *
 * 운영 정책 확정(사용자 결정 — 보수적 기본):
 *  - search_context_size: "medium" — 비용·지연과 근거 풍부도의 균형.
 *    범용 시작점. 운영 데이터 누적 후 high/low 로 조정 가능.
 *  - filters.allowedDomains 미지정 — 도메인 화이트리스트로 좁히면
 *    최신·롱테일 정보 누락 위험. 필터 없이 시작(추후 정책화 여지).
 *  - userLocation 미지정 — 위치 노출 회피 + 지역 무관 질의가 다수.
 *
 * 옵션 타입 실측: @langchain/openai WebSearchOptions
 * (search_context_size?: "low"|"medium"|"high").
 */
export function buildWebSearchOptions(): Parameters<
  typeof openaiTools.webSearch
>[0] {
  return { search_context_size: "medium" };
}

/**
 * HARNESS_TOOLS 에 등록되는 ServerTool 선언 객체.
 * 런타임 형태: filters/location 미지정 시 `{ type: "web_search" }`.
 *
 * 정적 const 유지 — registry.test.ts(TC-7.2/25.14)가 `cfg.tools ===
 * HARNESS_TOOLS` 를 단언하므로 이 코드베이스는 도구 레지스트리가
 * top-level 평가되는 정적 배열임을 전제·테스트한다. import-시점 평가
 * 자체는 수용되는 패턴이며, `@langchain/openai` 를 mock 하는 단위
 * 테스트는 ChatOpenAI 와 함께 `tools` 도 mock 해야 한다(테스트 책임).
 */
/**
 * 사고 패널 한글 표시명 (medigate-new toolDisplayName 대응 — 우리는
 * 백엔드가 안 주므로 도구 파일이 직접 선언, FR-08 요소1개=파일1개).
 * ServerTool 은 런타임에 `web_search` 라는 name 으로 흐른다(probe).
 */
export const webSearchToolDisplayName = "웹 검색";

export const webSearchTool = openaiTools.webSearch(buildWebSearchOptions());

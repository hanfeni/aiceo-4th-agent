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
 * TODO(USER): 운영 정책을 여기서 결정한다. 아래 셋의 트레이드오프:
 *
 *  - filters.allowedDomains: 신뢰 도메인만 허용 → 환각·저품질 출처 차단.
 *    단 도메인을 좁히면 최신·롱테일 정보 누락 위험 (최대 100개).
 *  - userLocation: 지역 질의("근처 ...") 정확도↑. 단 위치 노출,
 *    지역 무관 질의엔 무의미. type:"approximate" 만 지원.
 *  - search_context_size("low"|"medium"|"high"): 컨텍스트 윈도우 사용량.
 *    high → 근거 풍부·정확도↑ but 토큰 비용·지연↑. 기본 "medium".
 *
 * 빈 객체({})를 넘기면 OpenAI 기본값(필터 없음·medium)으로 동작한다.
 * 가장 보수적인 시작점이 무엇인지는 운영 의도에 달려 있다.
 */
export function buildWebSearchOptions(): Parameters<
  typeof openaiTools.webSearch
>[0] {
  // TODO(USER): 5~10줄 — 운영 정책 반영. 예: 신뢰 도메인 화이트리스트,
  // search_context_size, (필요 시) userLocation. 미정이면 {} 반환 유지.
  return {};
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
export const webSearchTool = openaiTools.webSearch(buildWebSearchOptions());

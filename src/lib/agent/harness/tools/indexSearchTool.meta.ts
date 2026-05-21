/**
 * indexSearchTool 표시 메타 (경량 모듈 — zod 외 의존 0).
 *
 * webSearchTool.meta.ts 와 동일 분리 이유(보안): indexSearchTool.ts
 * 는 OpenSearch 클라이언트·임베딩(@/lib/searchlab/search)을 import
 * (서버 전용·무거움). 클라이언트(thinkingLabels)는 표시명만 필요 →
 * SDK 가 클라 번들로 누출되지 않도록 표시 상수를 이 파일로 분리.
 *
 * 도구는 도메인별 팩토리(makeIndexSearchTool)로 생성되나 .name 은
 * 단일("index_search") — 사고패널/introspect 매핑 키 1개로 충분
 * (도메인은 세션 정체성이라 도구명에 안 박음).
 *
 * 카탈로그 schema(아래): 팩토리 도구는 도메인 선택 전엔 인스턴스가
 * 없어 /harness 도구 탭에서 빠졌다(부작용 우려로 page 에서 팩토리
 * 미호출). 스키마·이름·설명은 도메인 무관이므로 이 경량 모듈에서
 * export 해 page 가 부작용 0 으로 카탈로그 도구를 합성·표시한다.
 */

import { z } from "zod";

/** 사고 패널 한글 표시명 (FR-08 — 도구가 선언). ClientTool .name 키. */
export const indexSearchToolDisplayName = "인덱스 검색";

/**
 * 카탈로그용 LLM 명세 schema — 팩토리(makeIndexSearchTool) 내부
 * schema 와 동일(도메인 무관). /harness introspect 가 이 schema 를
 * JSON Schema 로 변환해 파라미터 표·명세를 표시한다. 팩토리 schema
 * 변경 시 이 상수도 동기화(단일 도구 명세 — 두 곳 정합).
 */
export const indexSearchToolSchema = z.object({
  query: z
    .string()
    .describe(
      "검색할 질의(자연어). 사용자 질문에서 핵심 키워드·의도를 추출해 전달.",
    ),
  mode: z
    .enum(["lexical", "vector", "hybrid"])
    .optional()
    .describe(
      "검색 방식. lexical=키워드 정확매칭(고유명사·법조문 번호 등), " +
        "vector=의미 유사(개념·동의어), hybrid=둘 결합(기본·애매할 때 권장). " +
        "미지정 시 hybrid.",
    ),
});

/**
 * ClientTool 설명 (introspect 가 .description 우선). 도메인은
 * 세션에서 사전 선택(우측 드롭다운) — LLM 은 query·mode 만 결정.
 */
export const indexSearchToolDescription =
  "선택된 도메인의 OpenSearch 색인 코퍼스를 검색해 관련 문서 " +
  "스니펫을 반환한다. 질문이 그 도메인 자료(상권·의료·금융·법률·" +
  "정책 중 세션에서 고른 하나)와 관련될 때 사용. 검색 방식(렉시컬/" +
  "벡터/하이브리드)은 질문 성격에 맞게 직접 고른다.";

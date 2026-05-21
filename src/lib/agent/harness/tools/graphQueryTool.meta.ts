/**
 * graphQueryTool 표시 메타 (경량 모듈 — 의존 0).
 *
 * indexSearchTool.meta.ts / sqlQueryTool.meta.ts 와 동일 분리 이유
 * (보안): graphQueryTool.ts 는 neo4j-driver(getNeo4jDriver) 를
 * import(서버 전용·네이티브). 클라이언트(thinkingLabels)는 표시명만
 * 필요 → 드라이버가 클라 번들로 누출되지 않도록 표시 상수를 분리.
 *
 * 도구는 데이터셋별 팩토리(makeGraphQueryTool)로 생성되나 .name 은
 * 단일("graph_query") — 사고패널/introspect 매핑 키 1개로 충분
 * (데이터셋은 세션 정체성이라 도구명에 안 박음).
 */

import { z } from "zod";

/** 사고 패널 한글 표시명 (FR-08 — 도구가 선언). ClientTool .name 키. */
export const graphQueryToolDisplayName = "온톨로지 조회 (Cypher)";

/**
 * 카탈로그용 LLM 명세 schema — 팩토리(makeGraphQueryTool) 내부 schema 와
 * 동일(데이터셋 무관). /harness introspect 가 파라미터 표·명세를 표시한다.
 * 팩토리 schema 와 단일 출처(정합).
 */
export const graphQueryToolSchema = z.object({
  cypher: z
    .string()
    .describe(
      "실행할 읽기 전용 Cypher. 도구 설명의 스키마(노드 라벨·속성·관계)를 " +
        "보고 직접 작성. MATCH/RETURN/WITH 등 읽기 구문만, 쓰기 구문 금지. " +
        "멀티홉 경로를 적극 활용.",
    ),
});

/**
 * ClientTool 설명 (introspect 가 .description 우선). 순수 실행기:
 * LLM 이 아래 동적 주입 스키마를 보고 **직접 읽기전용 Cypher 를
 * 작성**해 cypher 인자로 넘긴다. 도구는 쓰기 키워드 가드 후 실행해
 * 결과만 반환(도구 내부 LLM 없음 — sqlQueryTool 동형 사상).
 * makeGraphQueryTool 이 뒤에 세션 데이터셋 스키마 텍스트를 이어붙인다.
 */
export const graphQueryToolDescription =
  "선택된 온톨로지 데이터셋의 Neo4j 그래프에 읽기 전용 Cypher 를 " +
  "실행해 결과를 반환하는 실행기다. 공동보유·교집합·연결고리 같은 " +
  "멀티홉 관계 질의(여러 노드를 잇는 경로 탐색)에 사용. SQL 의 다중 " +
  "self-JOIN 으로 표현이 곤란한 관계 추론에 강하다. 아래 스키마를 " +
  "보고 Cypher 를 직접 작성해 cypher 인자로 넘겨라.";

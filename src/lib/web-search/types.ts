/**
 * 웹검색 ClientTool 의 경계 타입 (R8 — OpenAI SDK 타입 직노출 0).
 *
 * OpenAI Responses API 응답(`openai` SDK 의 `ResponseOutputItem[]`)을
 * 우리 도메인이 다루기 좋게 정규화한 형태. SDK 타입을 그대로 흘리면
 * SDK 메이저 변동 시 정제 로직·테스트가 깨지므로(R8 — 학습지식/외부
 * 타입 단정 금지), client.ts 가 SDK 응답을 이 타입으로 좁혀 반환하고
 * context-formatter.ts(순수 함수)는 이 타입만 본다.
 *
 * dart/context-formatter.ts 의 `DartCompactInput` 동형 패턴.
 */

/** OpenAI 가 내부에서 수행한 검색 1스텝 (search/open_page/find_in_page). */
export type WebSearchStep =
  | { kind: "search"; queries: string[] }
  | { kind: "open_page"; url: string }
  | { kind: "find_in_page"; pattern: string; url: string }
  /** 미지 action.type — graceful passthrough (R8, 하드코딩 0). */
  | { kind: "other"; type: string };

/** 최종 답변 본문에 달린 출처 인용 (url_citation). */
export interface WebSearchCitation {
  url: string;
  title: string;
}

/**
 * client.ts 가 반환하는 정규화 결과. 성공/실패를 타입으로 분기 —
 * formatter 가 reason 별 안내 문자열을 만든다(dart NFR-18 graceful).
 *
 * 실패 reason 분리(Plan Critic 항목5):
 *  - no_api_key       : OPENAI_API_KEY 미설정 (호출 전 차단)
 *  - model_unsupported: 모델이 web_search built-in tool 미지원(400)
 *  - network          : 네트워크/timeout
 *  - api_error        : 그 외 OpenAI API 오류
 *  - empty            : 호출 성공했으나 검색·본문 0
 */
export type WebSearchRawResult =
  | {
      ok: true;
      /** OpenAI 가 한 N개 내부 검색 스텝 (순서 보존). */
      steps: WebSearchStep[];
      /** N검색을 종합한 최종 답변 본문 (output_text). */
      answer: string;
      /** 본문에 달린 출처들 (중복 제거 전 raw — formatter 가 정리). */
      citations: WebSearchCitation[];
    }
  | {
      ok: false;
      reason:
        | "no_api_key"
        | "model_unsupported"
        | "network"
        | "api_error"
        | "empty";
      /** 디버깅용 상세 (LLM 반환 문자열엔 미노출). */
      detail?: string;
    };

// 공유 타입 단일 파일 (PRD §1.7 — types: single file).
// LLM/하네스 비의존. ChatMessage / SseEvent / HarnessConfig / SubagentSpec.
// checkpointer·tools 는 느슨하게 둔다(Slice 4/5 에서 정밀화 — CLAUDE.md R8).

/** 채팅 메시지 한 건 (Zustand 스토어 + UI 렌더 단위). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /**
   * 사고 과정 단계 — assistant 만. 본문 content 와 분리된 별도 채널
   * (FR-09/R5: 본문 누출 0 유지). reasoning step 과 tool step 이
   * **발생 순서대로 한 배열에** 쌓여 교차(사고→도구→사고→도구)가
   * 보존된다(medigate-new thinkingSteps[] 패턴). 사고 패널이 렌더한다.
   */
  thinkingSteps?: ThinkingStep[];
  /**
   * web_search 참고 출처 — assistant 만. 답변 본문 하단 References
   * 패널이 렌더한다(디자인 핸드오프 chat.jsx SourcesPanel — 풋노트
   * 학술 스타일). 데이터원은 web_search annotations(url_citation):
   * extractWebSearchCitations 가 만든 텍스트를 parseCitationText 로
   * 역파싱해 적재한다. 비면 패널 미표시(chat.jsx:502 게이트).
   */
  sources?: WebSource[];
  /**
   * 첨부 흔적 — user 만. 사용자가 무엇을 보냈는지 메시지 버블에 표시
   * (Plan Critic I1). 이미지는 base64 로 body.images, 텍스트/PDF/DOCX 는
   * 추출돼 query 에 합쳐지므로 content 만으론 첨부 사실이 안 보임 → 별도
   * 메타로 칩 렌더(MessageList). image 는 썸네일(dataUrl) 노출.
   */
  attachments?: Array<{
    name: string;
    kind: "image" | "text";
    /** image 일 때 썸네일용 base64 data URL(선택). */
    dataUrl?: string;
  }>;
  /**
   * 후속 추천 질문 — assistant 만. LLM 이 응답 끝에 [REC_QUERY]…
   * [/REC_QUERY] 마커로 심은 것을 splitRecQueries 가 본문과 분리해
   * 적재한다(medigate-new rec_query 패턴 모방). 답변 하단에 클릭
   * 가능한 칩으로 렌더(클릭 = 그 질문 재전송). 본문(content)에는
   * 마커·질문이 남지 않는다(스트리밍 중에도 즉시 분리 — 누출 0).
   * 비면 칩 미표시.
   */
  recQueries?: string[];
}

/** 참고 출처 1건(References 패널 항목). web_search url_citation 유래. */
export interface WebSource {
  /** 출처 제목. 없으면 url 을 제목 자리에 노출(SourcesPanel 폴백). */
  title: string;
  /** 원문 URL(절대). "원문 열기 ↗" 가 새 탭으로 연다. */
  url: string;
}

/**
 * 사고 패널의 한 단계. reasoning 과 tool 이 단일 배열에 시간순으로
 * 섞인다(교차 보존). medigate-new agentSession.ts thinkingSteps[] 모방:
 *  - reasoning: `**bold 제목**` 을 만나면 새 step(title=제목), 같은
 *    제목 연속이면 기존 step 에 content 누적.
 *  - tool: tool_call 시 새 step push(title=서브타이틀), tool_result
 *    로 result 채움. id 로 호출↔결과 매칭.
 */
export type ThinkingStep =
  | {
      kind: "reasoning";
      /** 서브타이틀(reasoning 의 ** 볼드 제목). 없으면 빈 문자열. */
      title: string;
      /** 이 step 의 사고 본문 누적(제목 제외). */
      content: string;
      order: number;
    }
  | {
      kind: "tool";
      /** 서브타이틀(도구 표시명, 예: "current_time", "web_search"). */
      title: string;
      /** tool_call id. 호출↔결과 매칭 키. */
      id: string;
      /** 도구명. */
      name: string;
      /** 누적된 인자 JSON(스트리밍 중 점진). */
      args: string;
      /** 실행 결과(OUT). 미수신 시 undefined(실행 중). */
      result?: string;
      /**
       * tool_call 수신 시각(ms epoch). 클라이언트 측정 — deepagents/
       * LangGraph 는 서버 elapsed 를 안 주므로 reducer 가 clock 으로 기록.
       * (Slice E: count 그룹화 폐기 — 동일 도구도 항상 개별 step.)
       */
      startedAt?: number;
      /**
       * IN→OUT 소요시간(ms). tool_result 매칭 시 now-startedAt 으로 채움.
       * medigate IOPair elapsed 표시 모방.
       */
      elapsedMs?: number;
      order: number;
    };

/**
 * 서버 → 클라이언트 SSE 이벤트 (discriminated union).
 * route.ts 가 thread → token(*) → done|error 순으로 emit
 * (PRD §1.6 SSE 계약).
 */
export type SseEvent =
  | { type: "thread"; conversationId: string }
  | { type: "token"; text: string }
  | { type: "thinking"; text: string }
  // 도구 호출 IN(model_request 노드의 tool_call_chunk 누적).
  | { type: "tool_call"; id: string; name: string; args: string }
  // 도구 실행 결과 OUT(tools 노드의 tool 메시지).
  | { type: "tool_result"; id: string; name: string; result: string }
  // DART 전용 라우트(/api/dart/analyze) 고정 파이프라인 6단계 진행
  // (교육용 노드-엣지 시각화 데이터원 — D14 + 웹검색 정성 단계 삽입).
  // 챗 라우트는 이 타입을 emit 하지 않으며, 챗 store asSseEvent 는
  // switch default:null 로 자동 폐기(case "stage" 추가 금지 — 챗 회귀
  // 0 구조 불변식. union 확장 1..5→1..6 도 default 분기라 영향 0).
  // R5: input 은 우리 코드 산출물(corpCode/압축컨텍스트/검색질의/
  // system+human 프롬프트)만 — LLM reasoning 절대 미포함. LLM 출력은
  // token 이벤트(chunkText 통과분)로 별도 흐름.
  | {
      type: "stage";
      stage: 1 | 2 | 3 | 4 | 5 | 6;
      status: "start" | "done" | "error";
      label: string;
      input?: string;
      output?: string;
    }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * 서브에이전트 명세. deepagents subagents[] 슬롯에 합성된다.
 * (PRD FR-12 / harness/subagents/ — Slice 5 에서 레지스트리 합성.)
 *
 * tools: deepagents SubAgent.tools (옵션 — 미지정 시 defaultTools 상속).
 * web-searcher 처럼 특정 도구만 줘 역할을 좁힐 때 사용. R8 에 따라
 * 느슨하게(unknown[]) 둔다 — ClientTool/ServerTool 혼재 가능, 정밀
 * 타입 narrow 는 buildAgentOptions 경계에서만.
 */
export interface SubagentSpec {
  name: string;
  description: string;
  systemPrompt: string;
  /** deepagents SubAgent.tools — 미지정 시 메인 defaultTools 상속. */
  tools?: unknown[];
}

/**
 * 하네스 요소 조립 계약 (PRD §1.3 FR-08 / §1.10 AD-1·AD-6).
 * buildHarnessConfig(env) 가 이 형태를 단일 지점에서 조립한다.
 * checkpointer / tools 는 이 레벨에서 느슨하게 둔다 — Slice 4/5 가
 * 실제 타입(BaseCheckpointSaver / StructuredTool)으로 정밀화한다(R8).
 */
export interface HarnessConfig {
  planning: { enabled: boolean };
  filesystem: { enabled: boolean };
  subagents: SubagentSpec[];
  tools: unknown[];
  checkpointer: unknown;
  /**
   * SKILL 요소 (deepagents SkillsMiddleware — PoC). skill 소스 경로 +
   * backend 인스턴스. enabled=false 또는 filesystem off 시 sources=[]
   * (skill 은 본문을 read_file 로 읽으므로 filesystem 미들웨어 의존).
   * backend 는 R8 에 따라 느슨하게 둔다(buildAgentOptions 경계에서 narrow).
   */
  skills: { enabled: boolean; sources: string[]; backend: unknown };
}

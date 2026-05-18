LangGraph DeepAgents(JS) 기반 하네스 + LLM 챗 에이전트 — 요구사항

문서 버전: v1.0 (2026-05-19 KST 작성)
이전 기준 문서: prompt-sample.md (OpenCode SDK 기반 — 본 문서로 대체됨, 보존만 함)
전환 사유: OpenCode SDK(블랙박스 세션/이벤트) → LangGraph DeepAgents(JS).
           하네스 요소(계획/파일시스템/서브에이전트/체크포인터)를 명시적으로 조립하고,
           요소 단위 추가·제거가 용이한 레지스트리 구조를 채택한다.

작업 원칙:
  1. 크리티컬한 이슈가 아니라면 사용자에게 묻지 말고 다음 단계를 자동으로 진행.
  2. docs/notes/ 에 각 단계 결과를 기록한다.
  3. 가능한 비동기 병렬 작업을 진행해 완료를 빠르게 수행한다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[전제: 처음 설치부터 시작하는 사용자 기준]

이 프로젝트는 실제 LLM API 만 호출한다. route 본문에 모킹 경로 없음.

[검증 철학] — prompt-sample.md 에서 계승

* "한 번 성공" 은 보장이 아니다. 모든 stateful 경로(특히 멀티턴 + 체크포인터)는
  반드시 "연속 2회 이상", "여러 유형의 입력" 으로 검증한다.
* 모델 출력은 입력에 따라 "생성되는 이벤트/메시지 종류 자체가 달라질 수 있다".
  probe 시나리오는 짧은 인사뿐 아니라 최소 1개의 "추론(reasoning)이 필요한 입력",
  최소 1개의 "도구 호출을 유발하는 입력"을 포함해야 한다.
* 모델 내부 사고(thinking/reasoning) 토큰이 최종 답변 스트림에서 제외되는지 확인.
* 하네스 요소를 1개 끄거나 켠 직후에도 위 검증을 반복한다 (조립 변경이 회귀를 부른다).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[환경 사전 점검 — 코드 작성 전 반드시 완료]
결과를 docs/notes/env-precheck.md 에 기록.

1. LLM API 키 존재 확인 (HARD PRECONDITION)
   프로바이더 추상화이므로 active 프로바이더의 키만 있으면 된다.
   * .env 또는 .env.local 에 다음 중 active 프로바이더 키 필수:
       ANTHROPIC_API_KEY=sk-ant-...   (LLM_PROVIDER=anthropic 일 때)
       OPENAI_API_KEY=sk-...          (LLM_PROVIDER=openai 일 때)
   * LLM_PROVIDER 미지정 시 기본값은 anthropic.
   * active 프로바이더 키가 없으면 즉시 멈추고 사용자에게 요청. 임의 대체 금지.

2. 모델 호출 가능 여부는 "실증"으로만 판단 — 학습 지식 의존 금지
   모델의 "존재 여부" 를 LLM 학습 컷오프 기준으로 blocking 하지 마라.
   active 프로바이더에 대해 아래로 실증한다.

   (anthropic 일 때 — 1토큰 테스트, 소액 과금)
     curl -sS https://api.anthropic.com/v1/messages \
       -H "x-api-key: $ANTHROPIC_API_KEY" \
       -H "anthropic-version: 2023-06-01" \
       -H "content-type: application/json" \
       -d '{"model":"<MODEL_ID>","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}' \
       | python3 -m json.tool | head -20

   (openai 일 때 — 1토큰 테스트, 소액 과금)
     curl -sS https://api.openai.com/v1/chat/completions \
       -H "Authorization: Bearer $OPENAI_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{"model":"<MODEL_ID>","messages":[{"role":"user","content":"hi"}],"max_completion_tokens":5}' \
       | python3 -m json.tool | head -20

   * 성공하면 진행. 실패 시 사용자에게 보고:
       "[모델 검증 실패] API 응답: <에러 본문 그대로>. 계속하려면 모델 ID 확인 필요."
     임의 대체 금지. 사용자 결정 대기.
   * GPT-5 계열은 max_tokens 가 아닌 max_completion_tokens 사용에 유의.
   * 모델 ID 는 .env 의 LLM_MODEL 로 주입 (하드코딩 금지).

3. 런타임 버전 점검
   * Node.js 20 LTS 이상 (LangGraph.js / deepagents 요구). node -v 로 확인.
   * pnpm 10+ 확인.

4. 포트 점유 상태
     lsof -nP -iTCP:3000 -sTCP:LISTEN
   * 3000: Next.js dev 기본 포트.
   * 점유 중이면 PID 확인 후 kill -9. pkill 패턴 매칭 금지.
   * OpenCode 4096 포트 개념 없음 (별도 서버 스폰 안 함 — DeepAgents 는 인프로세스).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[고정 스택 — 가장 무난·컴팩트한 표준형 + 가능한 최신 버전]

원칙(사용자 지시):
  - 기본 프레임워크는 "가장 많이 쓰고 무난하며 컴팩트한 형태"로 구현한다.
    → deepagents 공식 권장 최소 설치형(npm install deepagents langchain
      @langchain/core)을 기준으로 한다. @langchain/langgraph 는 deepagents 의
      dependency 로 자동 포함되므로 별도 핀하지 않는다 (불필요한 명시 금지).
  - 패키지는 "가능한 최신 버전". 아래는 2026-05-19 KST npm registry 실측값이며,
    구현 시점에 다시 npm view 로 최신을 재확인해 캐럿(^) 범위로 잡는다.

패키지 매니저: pnpm 10+
런타임 (실측 최신):
  next ^16.2.6 (App Router) + react ^19.2.6 + react-dom ^19.2.6
  TypeScript strict + @types/node ^20 (Node 20 LTS+)
에이전트 하네스 — 공식 최소 3종만 명시 (실측 최신):
  deepagents ^1.10.2          ※ createDeepAgent. @langchain/langgraph ^1.3,
                                @langchain/core ^1.1, langchain ^1.4, zod ^4 를
                                dependency 로 자동 동반 (peer: langsmith)
  langchain ^1.4.0            ※ tool() 등 — deepagents 가 의존하나 직접 import 하므로 명시
  @langchain/core ^1.1.46     ※ 메시지 타입(AIMessageChunk 등). 버전 정렬 기준점
LLM 프로바이더 (추상화 — 실측 최신):
  @langchain/anthropic ^1.3.29   ※ ChatAnthropic
  @langchain/openai ^1.4.5       ※ ChatOpenAI
  (active 프로바이더는 LLM_PROVIDER 환경변수 스위칭)
체크포인터 (멀티턴 영속화):
  @langchain/langgraph-checkpoint-sqlite ^1.0.1  ※ SqliteSaver. core 인터페이스는
                                                  langgraph 가 이미 제공하므로
                                                  -checkpoint 단독 패키지는 불필요
상태관리:     zustand ^5
스타일:       tailwindcss ^4 + @tailwindcss/postcss ^4
마크다운:     react-markdown ^10 + remark-gfm ^4 + rehype-raw ^7 + rehype-sanitize ^6
              (rehype-raw 뒤에 rehype-sanitize 체인 — LLM 출력 XSS 방어)
아이콘:       lucide-react
유틸:         clsx, zod ^4 (deepagents 와 동일 메이저 — 정렬 필수)
단위 테스트:  vitest ^4 + @testing-library/react ^16 + jsdom + @vitest/coverage-v8
E2E:          @playwright/test ^1.59
린트:         eslint ^9 + eslint-config-next (next 와 동일 버전)

[버전 정합 — 코드 생성 시 중요 (프로젝트 CLAUDE.md 에도 기록)]
* LangChain v1 생태계는 @langchain/core 를 단일 버전으로 정렬해야 한다.
  deepagents / @langchain/anthropic / @langchain/openai / -checkpoint-sqlite
  가 모두 @langchain/core 에 peer/dependency 한다. 버전이 갈리면
  AIMessageChunk instanceof 체크가 깨진다(서로 다른 클래스 정체성).
  → pnpm 의 dedupe 확인. pnpm why @langchain/core 로 단일 트리 검증.
* zod 는 deepagents(^4) 와 앱 코드가 같은 메이저여야 한다 (스키마 타입 호환).
* langsmith 는 deepagents 의 peerDependency(>=0.6.0). 트레이싱 미사용이면
  설치 안 해도 동작하나 설치 경고가 뜰 수 있음 — 경고면 정상, 에러면 보고.

[설치 금지]
* @opencode-ai/sdk, @opencode-ai/plugin (OpenCode 경로 폐기)
* @langchain/langgraph 를 package.json 에 직접 추가 (deepagents 가 관리 —
  중복 명시는 버전 갈림 위험. 단 import 는 가능: deepagents 트리에서 해석됨)
* next-auth (인증 없음)
* framer-motion, antd, uuid (미사용 — uuid 필요 시 crypto.randomUUID 사용)

[버전 핀 정책]
deepagents / @langchain/* 는 활발히 변하는 패키지다. 학습 지식의 API 시그니처를
신뢰하지 말고, pnpm install 직후 node_modules 의 .d.ts 와 README 를 읽어
실제 export 시그니처를 docs/notes/deepagents-api-probe.md 에 기록한 뒤 구현한다.
※ 실측 차이 1건 이미 확인: 공식 문서는 createDeepAgent({ tools, systemPrompt })
  형태이고 tool 은 "langchain" 에서 import 한다 (초안의 instructions 추정과 다름).
  정확한 옵션 키는 pre-work 실측으로 확정 (U1 참조).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[★ 핵심 아키텍처 제약: 하네스 요소는 플러그인이다 ★]

요구: 하네스 요소의 추가·제거가 용이해야 한다.

원칙:
  - 하네스 요소를 agent 생성부에 하드코딩하지 않는다.
  - 단일 레지스트리(harness/registry.ts)에서 "활성 요소 목록"을 조립한다.
  - 요소 1개를 끄는 것은 레지스트리 배열에서 항목 1줄을 제거(또는 enabled:false)하는
    것으로 끝나야 하고, agent.ts / route.ts 본문은 수정 불필요해야 한다.
  - 새 요소 추가는 (1) 요소 모듈 파일 1개 작성 + (2) 레지스트리 배열에 1줄 등록.
    그 외 파일 변경 0 을 목표로 한다.

하네스 요소 4종 (모두 포함, 각각 독립 토글 — 단 토글 메커니즘은
deepagents@1.10.2 실측에 따라 아래와 같이 확정. 근거:
docs/notes/deepagents-api-probe.md §2~§4. R8 절차로 사용자 승인 완료):

  ※ 실측 핵심: deepagents JS 의 빌트인 미들웨어 중
    FilesystemMiddleware·SubAgentMiddleware 는 REQUIRED_MIDDLEWARE_NAMES
    이라 "미들웨어 자체 제거" 불가(제거 시도 시 construction throw).
    토글 주입은 createDeepAgent 파라미터가 아니라 전역
    registerHarnessProfile(modelSpec, HarnessProfileOptions) 레지스트리로
    이뤄진다. 이 두 사실은 아래 토글 수단을 규정한다.

  H1. Planning tool (write_todos) — 완전 토글 가능
      - TodoListMiddleware 는 REQUIRED 아님.
      - off: HarnessProfileOptions.excludedMiddleware:["TodoListMiddleware"].
      - 레지스트리 planning.enabled=false → 위 프로파일 옵션으로 변환.

  H2-a. Virtual filesystem — soft toggle (미들웨어 제거 불가, 도구 숨김)
      - FilesystemMiddleware 는 REQUIRED → 미들웨어 자체는 항상 존재.
      - off 의 의미를 재정의: "사용자 관점에서 파일 도구 비노출".
        excludedTools:["ls","read_file","write_file","edit_file","glob","grep"]
        로 도구 가시성 제거 = 실질 off (모델이 파일 도구를 못 봄).
      - 레지스트리 filesystem.enabled=false → 위 excludedTools 로 변환.
      - ★ "FilesystemMiddleware 미들웨어 제거"는 스펙 목표가 아니다(불가).
        soft toggle = UX 등가물이 본 프로젝트의 확정 정의다.

  H2-b. Subagents — 배열 비우기 + GP 비활성 (task 미들웨어는 잔존)
      - SubAgentMiddleware 는 REQUIRED → task 스캐폴딩 항상 존재.
      - off: createDeepAgent subagents:[] +
        HarnessProfileOptions.generalPurposeSubagent.enabled:false
        (+ 선택: excludedTools:["task"] 로 task 도구까지 숨김).
      - subagent 정의는 harness/subagents/ 하위 모듈로 분리.

  H3. Checkpointer 기반 멀티턴 영속화 — createDeepAgent 파라미터
      - createDeepAgent({ checkpointer }) 직접 주입
        (실측: checkpointer?: BaseCheckpointSaver | boolean).
      - 기본 SQLite(@langchain/langgraph-checkpoint-sqlite, 별도 설치 필요),
        환경변수로 memory 전환. thread_id = 클라이언트 conversationId.
      - 백엔드는 harness/checkpointer.ts 단일 함수에서 교체(AD-2 lazy).

  H4. 커스텀 도구 (웹검색·코드실행 등 확장 슬롯) — createDeepAgent.tools
      - harness/tools/ 하위 도구 1개 = 파일 1개. langchain tool() 형태.
      - createDeepAgent({ tools }) 배열에 등록된 것만 주입.
      - 초기 범위: 도구 인터페이스 + 안전한 예시 도구 1개(과금·외부의존
        없음). 외부 의존 도구는 슬롯만, 등록 절차 README 명시.

레지스트리 계약(harness/registry.ts 가 export 하는 형태 — 공개 인터페이스는
유지. HarnessProfile 변환은 buildAgentOptions.ts 가 내부 흡수: AD-1 결정):
  interface HarnessConfig {
    planning: { enabled: boolean }       // → excludedMiddleware
    filesystem: { enabled: boolean }     // → excludedTools (soft toggle)
    subagents: SubagentSpec[]            // → createDeepAgent.subagents (빈배열 허용)
    tools: StructuredTool[]              // → createDeepAgent.tools (빈배열 허용)
    checkpointer: BaseCheckpointSaver    // → createDeepAgent.checkpointer
  }
  buildHarnessConfig(env): HarnessConfig // 환경변수 → 조립 (AD-2: FS side effect 0)
  buildAgentOptions(config, model, systemPrompt):
    → createDeepAgent 완전 인자 객체 생성 + registerHarnessProfile 호출.
      planning/filesystem 의 프로파일 변환 분기는 전부 이 함수에 격리.
  agent.ts 는 createDeepAgent(buildAgentOptions(...)) 분기 0줄 단일 호출.

수용 기준 (이 제약의 테스트 — 실측 반영판):
  - tools 배열을 [] 로 비워도 빌드·기동·기본 채팅이 정상.
  - subagents 배열을 [] 로 비워도 빌드·기동·기본 채팅이 정상.
  - planning.enabled=false (TodoListMiddleware 제외) 로도 정상.
  - filesystem.enabled=false (파일 도구 excludedTools soft toggle) 로도 정상.
  - 위 4개 토글 시 agent.ts / route.ts 의 코드 변경이 0 줄
    (변환 로직은 registry.ts / buildAgentOptions.ts 에만 존재).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[★ 이 프로젝트 고유의 함정 — 반드시 지킬 것 ★]
(OpenCode 함정은 폐기. DeepAgents/LangGraph.js 함정으로 재작성)

◆ 함정 1: createDeepAgent 반환값은 "컴파일된 LangGraph 그래프"다
   별도 서버 스폰·이벤트 구독 없음. graph.stream(input, config) 로 직접 스트리밍.
   OpenCode 의 event.subscribe()/session.prompt() 패턴을 적용하려 하지 말 것.

◆ 함정 2: 멀티턴은 checkpointer + thread_id 가 전부다
   checkpointer 를 createDeepAgent 에 주입하지 않으면 매 호출이 무상태가 되어
   멀티턴 맥락이 통째로 사라진다 (1턴짜리 챗으로 퇴화).
   반드시:
     - createDeepAgent({ ..., checkpointer }) 로 주입
     - graph.stream(input, { configurable: { thread_id: conversationId } }) 로 호출
     - conversationHistory 를 수동으로 messages 에 쌓아 보내지 말 것
       (checkpointer 가 로드 → 중복 누적되어 컨텍스트 오염)
   probe 는 같은 thread_id 로 "2턴 이상" 보내 직전 발화를 기억하는지 확인.

◆ 함정 3: streamMode 를 잘못 고르면 토큰이 안 온다
   LangGraph.js stream 모드는 여러 종류다.
     - "messages" : LLM 토큰 단위 청크 (어시스턴트 텍스트 스트리밍의 핵심)
     - "updates"  : 노드 단위 상태 변화 (도구 호출/계획 단계 추적용)
     - "values"   : 전체 상태 스냅샷
   텍스트 스트리밍은 "messages" 가 필요. "updates" 만 구독하면 토큰이 안 흐른다.
   계획/도구 진행 표시도 원하면 멀티 모드(["messages","updates"]) 사용 가능.
   구현 전 반드시 실제 청크를 full JSON 으로 찍어 모드별 페이로드를 확인할 것.

◆ 함정 4: thinking/reasoning 토큰이 답변 스트림으로 누출된다
   Claude 의 thinking, GPT-5 계열의 reasoning 은 "messages" 스트림에도
   섞여 들어올 수 있다. AIMessageChunk 의 content 가 문자열이 아니라
   블록 배열({type:"thinking"|"text"|...})로 올 수 있다.
   올바른 필터:
     1) 청크 content 가 배열이면 type==="text" 블록만 UI 로 yield.
     2) type==="thinking"/"reasoning"/"redacted_thinking" 은 버린다.
     3) tool_use / tool_call 청크는 (선택) "도구 사용 중" 표시로만, 본문엔 안 섞음.
   probe 에 "생각이 필요한 질문"(예: "17 x 24 답만 한 줄로") 을 최소 1회 포함해
   thinking 누출 함정을 의도적으로 재현·검증할 것.

◆ 함정 5: 서브에이전트/도구 출력이 메인 답변에 섞인다
   subagent 가 켜져 있으면 그 내부 메시지도 그래프 이벤트로 흐른다.
   "messages" 청크에서 메인 그래프의 최종 어시스턴트 노드 출력만 UI 로 보낼 것.
   메타데이터(langgraph_node 등)로 출처 노드를 식별해 필터링한다.
   실제 메타데이터 키는 함정 3 의 full JSON dump 로 확인 후 확정.

◆ 함정 6: 하네스 요소를 켰다 끌 때 agent 코드를 만지면 설계 실패다
   요소 토글은 레지스트리/환경변수에서만 일어나야 한다.
   agent.ts/route.ts 에 if(toolEnabled) 분기를 흩뿌리면 "제거·추가 용이" 요구 위반.
   조립은 buildHarnessConfig() 한 곳으로 모은다 (핵심 아키텍처 제약 참조).

◆ 함정 7: dev 서버 재시작 시 포트 정리 + 캐시 삭제
     lsof -t -iTCP:3000 -sTCP:LISTEN | xargs -r kill -9
     rm -rf .next
     sleep 2
   생략하면 "변경 사항이 반영 안 되는" 허위 단서로 시간 낭비.

◆ 함정 8: 디버그 로그는 full JSON dump
   console.log(JSON.stringify(chunk).slice(0, 300)) ← 금지.
   중요한 필드(content 배열, metadata)가 경계 뒤에 있으면 오진한다.
   로그가 길면 /tmp/debug.jsonl 에 append.

◆ 함정 9: Next.js 16 에서 next lint 제거됨
   package.json lint 스크립트는 eslint . 로 쓴다.
   eslint-config-next 16 flat config 직접 export:
     import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
     import nextTs from "eslint-config-next/typescript";
     export default [...nextCoreWebVitals, ...nextTs, globalIgnores([".next/", "out/"])];
   FlatCompat 사용 금지 (circular structure JSON 에러).

◆ 함정 10: route handler 런타임
   SQLite 체크포인터/네이티브 의존 가능 → edge runtime 불가.
   route.ts 최상단:
     export const runtime = "nodejs";
     export const dynamic = "force-dynamic";

◆ 함정 11: HMR 이 모듈 레벨 싱글톤(에이전트/체크포인터)을 리셋한다
   dev 모드에서 route 핸들러 재평가 시 모듈 변수가 초기화되어 그래프/체크포인터가
   매번 재생성된다. SQLite 파일 핸들 중복·메모리 체크포인터 초기화로 멀티턴이 깨진다.
   해결: 싱글톤을 globalThis 에 고정 (Prisma 공식 패턴):
     const g = globalThis as unknown as { __agent?: { graph?: Promise<…> } };
     if (!g.__agent) g.__agent = {};
   production(next start)에선 모듈 재평가가 없어 let 도 되지만 globalThis 가 양쪽 안전.

◆ 함정 12: checkpointer 백엔드 선택이 멀티턴 신뢰성을 좌우한다
   MemorySaver 는 프로세스 메모리 — dev HMR/서버 재시작 시 히스토리 증발.
   기본은 SQLite(@langchain/langgraph-checkpoint-sqlite), 파일 경로는 환경변수.
   메모리 백엔드는 테스트/일회성에만. 백엔드 교체는 harness/checkpointer.ts 한 곳에서.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Mock 경로 금지]
* route.ts 에 E2E_MOCK / MOCK_MODE 분기 금지.
* playwright.config.ts 에 E2E_MOCK=1 prefix 금지.
* 테스트에서 "deterministic 응답" 가정 금지.
단, vitest 단위 테스트는 LLM/그래프 의존성을 모킹 필수
(실제 그래프 실행 시 과금·비결정성). route.ts 본문엔 mock 분기 존재 금지.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[디렉토리 구조 — 정확히 이대로]

src/
  app/
    layout.tsx                 루트 레이아웃
    page.tsx                   / → /chat 리다이렉트
    globals.css                Tailwind CSS
    (main)/
      layout.tsx               사이드바 + 헤더 (인라인, 분리 금지)
      chat/
        page.tsx               /chat 페이지
        HeaderControls.tsx     모델 표시 + 새 대화 버튼
    api/chat/route.ts          POST /api/chat SSE
  components/
    chat/
      ChatPanel.tsx            메인 채팅 (MessageList + ChatInput 직접 조합)
      useChat.ts               채팅 훅 (API + 스토어 + conversationId)
    common/
      BaseChat/
        ChatInput.tsx          입력창 (Enter 전송, Shift+Enter 줄바꿈)
        MessageList.tsx        메시지 목록 (자동 스크롤)
      ChatMarkdown.tsx         마크다운 + 코드 복사 + rehype-sanitize
  lib/
    agent/
      agent.ts                 그래프 싱글톤(globalThis) + 스트림 어댑터
      harness/
        registry.ts            ★ buildHarnessConfig(env) — 단일 조립 지점
        checkpointer.ts        BaseCheckpointSaver 팩토리 (SQLite/Memory 교체)
        model.ts               프로바이더 추상화 (anthropic/openai 스위칭)
        tools/
          index.ts             tools 배열 export (등록 지점)
          exampleTool.ts       안전한 예시 도구 1개 (외부 의존 없음)
        subagents/
          index.ts             SubagentSpec[] export (등록 지점)
      prompts/
        systemPrompt.ts        시스템 프롬프트 (한국어 챗봇 역할)
      utils/
        sseStreamParser.ts     클라이언트측 SSE 파서
        chunkFilter.ts         thinking/서브에이전트 누출 필터 (함정 4·5)
  store/
    index.ts                   Zustand 스토어 팩토리 + 싱글톤 (단일 파일)
  types/
    index.ts                   타입 정의 (단일 파일)

tests/e2e/                     Playwright 테스트
playwright.config.ts           baseURL: http://localhost:3000
vitest.config.ts

[디렉토리 원칙]
* 작은 관련 파일은 합친다 (types/index.ts, store/index.ts 단일 파일).
* re-export 전용 index 는 "등록 지점"(tools/index.ts, subagents/index.ts)에만 허용.
  그 외 re-export 전용 index 금지 (직접 import).
* Sidebar/Header/PageHeader 는 (main)/layout.tsx 와 chat/page.tsx 에 인라인.
* harness/ 하위는 "요소 1개 = 파일 1개" 원칙. 토글은 registry.ts 에 집중.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[환경 파일]

.env 또는 .env.local:
  # 프로바이더 스위칭
  LLM_PROVIDER=anthropic            # anthropic | openai (기본 anthropic)
  LLM_MODEL=<모델ID>                # 예: claude-... 또는 gpt-...
  ANTHROPIC_API_KEY=sk-ant-...      # provider=anthropic 일 때 필수
  OPENAI_API_KEY=sk-...             # provider=openai 일 때 필수

  # 하네스 토글 (레지스트리가 읽음 — 함정 6 참조. 실측 메커니즘은
  # 하네스 요소 H1~H4 정의 + docs/notes/deepagents-api-probe.md 참조)
  HARNESS_PLANNING=true             # false → excludedMiddleware:[TodoListMiddleware]
  HARNESS_FILESYSTEM=true           # false → excludedTools:[ls,read_file,...] (soft toggle;
                                    #   FilesystemMiddleware 자체는 REQUIRED 라 제거 불가)
  HARNESS_SUBAGENTS=                # false → subagents:[] + GP subagent enabled:false
  HARNESS_CHECKPOINTER=sqlite       # sqlite | memory
  CHECKPOINTER_SQLITE_PATH=./.data/checkpoints.sqlite

  ※ 키는 서버 전용. NEXT_PUBLIC_ 접두사 절대 금지 (클라이언트 번들 누출 방지).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[npm scripts]
dev             next dev                            (포트 3000)
build           next build
start           next start
lint            eslint .                            (next lint 제거됨)
test            vitest run
test:watch      vitest
test:coverage   vitest run --coverage
test:e2e        playwright test
test:e2e:ui     playwright test --ui

[로컬 서버 실행 쉘스크립트] (전역 CLAUDE.md 규칙 준수)
루트에 run-dev.sh 생성: 캐시 제거(rm -rf .next) + 포트 3000 kill +
pnpm 버전 체크 + .env active 프로바이더 키 존재 확인 후 pnpm dev.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기능 요구사항]

FR-01  POST /api/chat SSE 스트리밍 응답                         Must
FR-02  checkpointer + thread_id 기반 멀티턴 대화 영속화          Must
FR-03  채팅 메시지 입력 + 전송 (Enter / Shift+Enter 줄바꿈)      Must
FR-04  어시스턴트 응답 토큰 스트리밍 표시                        Must
FR-05  마크다운 렌더링 (코드 복사 + rehype-sanitize XSS 방어)    Must
FR-06  새 대화 버튼 (새 thread_id 발급 + 스토어 리셋)            Must
FR-07  모델/프로바이더 표시 (active provider + model)            Should
FR-08  하네스 요소 레지스트리 — 요소 추가/제거 용이              Must
FR-09  thinking/reasoning·서브에이전트 출력 본문 누출 차단        Must
FR-10  LLM 프로바이더 추상화 (anthropic/openai 환경변수 스위칭)   Must
FR-11  Planning(write_todos) 하네스 요소 — 토글 가능             Must
FR-12  Virtual filesystem + Subagent 하네스 요소 — 토글 가능     Must

[비기능]
* 첫 SSE 청크: warm 3초, cold start 15초 이내.
* 빌드/린트 에러 0. TypeScript strict.
* 단일 파일 1000줄 초과 금지 (초과 시 기능별 분리 + 등록 index re-export).
* API 키는 클라이언트 번들에 절대 포함 금지.
* LLM 마크다운 출력은 rehype-sanitize 필수.
* 하네스 요소 토글 시 agent.ts/route.ts 코드 변경 0 줄 (FR-08 검증 기준).
* checkpointer SQLite 파일은 .gitignore (./.data/).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[구현 가이드]

[코드 작성 전 pre-work — 필수]
1. pnpm install 후 node_modules 의 다음 .d.ts / README 를 읽어 실제 시그니처 확인,
   docs/notes/deepagents-api-probe.md 에 기록:
   * deepagents: createDeepAgent 의 정확한 옵션 키 (model/tools/subagents/
     checkpointer/instructions/builtinTools 등 — 추정 금지, 실측)
   * @langchain/langgraph: 컴파일된 그래프의 .stream() 시그니처와 streamMode 값
   * @langchain/langgraph-checkpoint(-sqlite): saver 생성·주입 위치
   * @langchain/core: AIMessageChunk content 형태 (string vs 블록 배열)
2. 최소 node 스크립트로 createDeepAgent → graph.stream(..., {configurable:{thread_id}})
   를 2턴 실행하고, streamMode 별 실제 청크 3~5개를 full JSON 으로 기록
   → docs/notes/live-stream-events.md.
   타입 정의와 실제 방출이 다를 수 있으므로 실제 방출 기준으로 구현.
   이때 함정 4(thinking 누출)·함정 5(서브에이전트 누출)를 재현하는 입력 포함.

[구현 순서]
1. 타입: src/types/index.ts
   ChatMessage, SseEvent(union: token | done | error | thread), HarnessConfig,
   SubagentSpec.

2. 스토어: src/store/index.ts
   상태: messages, conversationId(thread_id), isStreaming, error,
         provider/model 표시값.
   액션: addMessage, appendToLastAssistant, setConversationId, setStreaming,
         finalizeLastAssistant, setError, resetChat(새 conversationId 발급).
   팩토리 + 싱글톤 + useChatStore 한 파일.

3. 프로바이더 추상화: src/lib/agent/harness/model.ts
   LLM_PROVIDER 로 ChatAnthropic / ChatOpenAI 인스턴스 선택. LLM_MODEL 주입.
   ★ HITL: 두 프로바이더의 streaming/thinking 설정 차이가 있으면 이 파일에 흡수.

4. 체크포인터: src/lib/agent/harness/checkpointer.ts
   HARNESS_CHECKPOINTER 로 SQLite/Memory saver 반환. .data 디렉토리 보장.

5. 하네스 도구·서브에이전트 슬롯:
   tools/exampleTool.ts (외부 의존 없는 안전한 1개) + tools/index.ts (배열 export)
   subagents/index.ts (초기 [] 또는 예시 1개 + 등록 규약 주석)

6. 레지스트리: src/lib/agent/harness/registry.ts
   buildHarnessConfig(env): HarnessConfig — 환경변수 → 4종 요소 조립 단일 지점.

7. 청크 필터: src/lib/agent/utils/chunkFilter.ts
   AIMessageChunk → UI 노출 텍스트만 추출 (thinking/서브에이전트/도구 제거, 함정 4·5).

8. 에이전트: src/lib/agent/agent.ts
   * globalThis 싱글톤으로 컴파일된 그래프 1회 생성 (함정 11)
   * createDeepAgent(buildHarnessConfig() 결과 전달 — 분기 금지, 함정 6)
   * createStream({ query, conversationId }): graph.stream(input,
     {configurable:{thread_id:conversationId}}, streamMode) → SseEvent yield

9. 시스템 프롬프트: src/lib/agent/prompts/systemPrompt.ts
   간단한 한국어 챗봇 역할. 레퍼런스 소스 잔재 금지.

10. API Route: src/app/api/chat/route.ts
   * runtime="nodejs", dynamic="force-dynamic"
   * Zod 로 { query: string, conversationId?: string } 검증
   * conversationId 없으면 crypto.randomUUID() 발급
   * 첫 SSE 이벤트로 { type:'thread', conversationId } 전송 (프론트 저장)
   * 이후 token/done/error 이벤트 SSE forward
   * ReadableStream.cancel() 로 client disconnect 대응

11. 채팅 UI (라이트 모드 기본):
   ChatInput / MessageList(스트리밍 커서) / ChatMarkdown(remark-gfm +
   rehype-raw + rehype-sanitize + 코드 복사·언어 라벨) / ChatPanel(직접 조합) /
   useChat(fetch + SSE 파싱 + 스토어):
     type==='thread'  → setConversationId
     type==='token'   → appendToLastAssistant
     type==='done'    → break
     type==='error'   → setError
     finally 에서 setStreaming(false) + finalizeLastAssistant() 반드시 호출.

12. 레이아웃:
   (main)/layout.tsx: Sidebar(로고 + "채팅") + Header(고정 이메일) 인라인.
   chat/page.tsx: 페이지 헤더 + ChatPanel.
   HeaderControls: active provider/model 표시 + "새 대화" 버튼(resetChat).

[단위 테스트 (필수)]
* SSE 파서 (5~7 TC): 정상/불완전 청크/빈 body/JSON 파싱 실패/멀티 이벤트/thread 이벤트.
* chunkFilter (5~7 TC): text 블록 통과 / thinking 블록 제거 / 문자열 content /
  배열 content / 서브에이전트 노드 메타 제거 / 빈 청크.
* 스토어 (5 TC): 초기 상태/addMessage/appendToLastAssistant/setConversationId/resetChat.
* 레지스트리 (4~6 TC): planning off / tools [] / subagents [] / checkpointer 분기 /
  잘못된 provider → 명확한 에러 (FR-08 핵심 — 토글 회귀 방지).
* 시스템 프롬프트 (3~4 TC): 역할 정의/한국어 규칙/레퍼런스 잔재 없음.

[모킹 규칙]
vi.mock 경로는 import 경로와 정확히 동일해야 한다.
agent 단위 테스트는 deepagents/@langchain 그래프를 모킹 (실제 실행 시 과금).
레지스트리/필터/파서 테스트는 LLM 호출 없이 순수 함수로 검증 가능해야 함
(이를 위해 조립·필터·파싱을 LLM 호출과 분리 설계).

[막힘 탈출 정책]
테스트 실패 시 가설 3개를 순차 검증. 3개 모두 반증되면 즉시 보고:
  "시도한 가설 N개, 각 반증 결과, 다음 방향 후보 1~2개, 추가 정보 요청"
4번째 가설을 혼자 세우지 말 것.

[UI 추가 판단 정책]
스펙에 없는 UI 요소(아이콘/스피너/배지/카운터 등) 추가 판단이 들면 구현하지 말고
"추가 제안: <요소>, 이유: <why>" 를 docs/notes/ui-suggestions.md 에 기록만.

[실제 실행 검증 — TDD 완료 후 필수]
1. lsof -t -iTCP:3000 -sTCP:LISTEN | xargs -r kill -9 ; rm -rf .next && sleep 2
2. ./run-dev.sh (포트 3000)
3. curl 로 /api/chat 에 "안녕" 전송 → 15초 이내 실제 token SSE 수신.
4. 같은 conversationId 로 2번째 메시지(직전 발화 참조형) → 멀티턴 맥락 유지 (FR-02).
5. "추론 필요" 입력으로 thinking 누출 0 확인 (FR-09, 함정 4).
6. 하네스 토글 회귀: HARNESS_PLANNING=false / tools [] / subagents [] 각각으로
   재기동 → 기본 채팅 정상 + agent.ts/route.ts diff 0 (FR-08).
7. pnpm test:e2e 전 시나리오 통과.

[자주 나오는 에러와 해결]
* 멀티턴이 매번 초기화됨
  → checkpointer 미주입 또는 thread_id 미전달 (함정 2).
* 어시스턴트 버블 비고 커서만
  → streamMode 가 "messages" 아님, 또는 chunkFilter 가 text 블록까지 버림 (함정 3·4).
* 내부 사고가 답변에 노출
  → content 블록 배열에서 thinking 미제거 (함정 4).
* dev 2번째 요청부터 멀티턴 깨짐
  → 모듈 싱글톤 HMR 리셋, globalThis 고정 누락 (함정 11).
* 요소 토글하려는데 agent.ts 를 고치게 됨
  → 조립이 registry.ts 로 안 모임. 설계 위반 (함정 6, FR-08).
* "model not found"
  → LLM_MODEL/LLM_PROVIDER 불일치. 환경 사전 점검 2 로 실증 후 사용자 보고.

[E2E 테스트 작성 규칙]
real API 는 non-deterministic:
* "정확히 N 줄" / "특정 단어 포함" 어설션 금지.
* 대신:
  - /api/chat: 200 + text/event-stream
  - 어시스턴트 버블 15초 안에 visible
  - 버블 innerText 60초 안에 비어있지 않음
  - 새 대화 버튼 클릭 후 메시지 0개 + conversationId 변경
  - 2턴 시나리오: 직전 발화 참조 응답이 비어있지 않음 (멀티턴 smoke)
* Playwright test.use({ retries: 1 }) — rate limit 흡수.
* webServer: pnpm dev, baseURL: http://localhost:3000, reuseExistingServer: false.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[보안]
* API 키가 클라이언트 번들에 포함되지 않는지 확인:
    grep -rlE "ANTHROPIC_API_KEY|OPENAI_API_KEY" .next/static/   → 0 matches
    grep -rE "sk-(ant-)?[A-Za-z0-9_-]{20,}" .next/static/        → 0 matches
* NEXT_PUBLIC_ 접두사로 키를 노출하지 않았는지 grep 확인.
* checkpointer SQLite 파일(./.data/) .gitignore 등록 확인.
* pnpm audit --prod 실행.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[보고]
각 단계 종료 시 특별한 문제 없으면 알아서 다음 단계 바로 시작.

[작업 종료 시 정리]
  lsof -t -iTCP:3000 -sTCP:LISTEN | xargs -r kill -9
orphan dev 프로세스가 PPID=1 로 남으면 다음 세션 포트 충돌.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[미해결 — pre-work 에서 실측 확정할 항목]
이 문서는 deepagents(JS)/LangGraph.js 의 공개 동작을 기준으로 작성됐다.
다음은 학습 지식이 아닌 "pnpm install 후 .d.ts/README 실측"으로 확정한다:
  U1. createDeepAgent 의 정확한 옵션 키 (checkpointer 주입 위치 포함)
  U2. 컴파일 그래프 .stream() 의 streamMode 인자 형태/멀티모드 지원 여부
  U3. AIMessageChunk content 의 thinking 블록 실제 type 문자열
  U4. subagent/도구 출처 식별용 메타데이터 키 (langgraph_node 등)
  U5. checkpoint-sqlite saver 의 생성 API (fromConnString 등)
실측 결과가 본 문서와 충돌하면 사용자에게 보고 후 본 문서를 개정한다 (임의 변경 금지).

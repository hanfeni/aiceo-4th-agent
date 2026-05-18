# PRD — LangGraph DeepAgents(JS) 기반 하네스 + LLM 챗 에이전트

문서 버전: v1.0 (2026-05-19 KST 작성)
상태: Draft
원본 스펙: [requirements.md](../requirements.md) (FR-01~FR-12, 비기능 요구사항의 단일 근거)
코드 생성 하드 규칙: [CLAUDE.md](../CLAUDE.md) (R1~R8)
폐기 문서: prompt-sample.md (OpenCode SDK 구안 — 본 PRD 와 무관, 따르지 말 것)

## 문서 규약

- 본 PRD 는 use-case / architecture / QA / plan 문서의 단일 출처(single source)다.
  하위 문서는 본 PRD 의 섹션 번호와 FR 번호를 인용해 추적성을 유지한다.
- 기능 섹션은 번호로 식별한다 (`1. <feature>`, `2. <feature>` …).
- 각 기능 섹션은 다음 하위 항목을 모두 포함한다: 기능 설명·목표 / 사용자 스토리 /
  기능 요구사항 / 비기능 요구사항 / 수용 기준 / 영향 엔드포인트 / 스키마·상태 변경 /
  UI 변경.
- 산문은 한국어, 코드·식별자·환경변수·패키지명은 영어 원형을 유지한다.
- 새 기능 추가 시 마지막 섹션 다음 번호로 append 하고, 관련 기존 섹션을 번호로
  상호 참조해 모순을 방지한다.

## 프로젝트 개요

OpenCode SDK(블랙박스 세션/이벤트) 의존을 폐기하고, LangGraph DeepAgents(JS) 기반의
명시적 하네스 위에 동작하는 SSE 스트리밍 LLM 챗 웹앱을 구축한다. 핵심 가치는
"하네스 요소(planning / virtual filesystem + subagents / checkpointer / custom tools)를
플러그인처럼 조립·토글" 할 수 있는 단일 레지스트리 구조에 있다. 요소 1개의 on/off 는
레지스트리/환경변수 변경만으로 끝나야 하며, 에이전트·라우트 본문은 손대지 않는다.

스택은 공식 최소 설치형(`deepagents` + `langchain` + `@langchain/core`)을 기준으로
Next.js 16 App Router + React 19 + TypeScript strict 로 구성한다. LLM 프로바이더는
환경변수(`LLM_PROVIDER`)로 anthropic / openai 를 스위칭하는 추상화 계층을 둔다.
실제 LLM API 만 호출하며 route 본문에 모킹 경로는 존재하지 않는다.

본 프로젝트의 첫 기능이자 전체 범위는 아래 단일 섹션이 정의한다.

---

## 1. DeepAgents JS 하네스 + 스트리밍 챗 에이전트

### 1.1 기능 설명 및 목표

`deepagents` 의 `createDeepAgent()` 가 반환하는 **컴파일된 LangGraph 그래프**를 인프로세스로
구동해, 사용자가 웹 채팅 UI 에서 LLM 과 멀티턴으로 대화하는 기능을 제공한다. 별도 서버
스폰이나 이벤트 구독은 없다 (그래프를 `graph.stream(input, config)` 로 직접 스트리밍).

목표:

1. **하네스 플러그인화**: planning(write_todos) / virtual filesystem + subagents /
   checkpointer / custom tools 4종 요소를 `src/lib/agent/harness/registry.ts` 의
   `buildHarnessConfig(env)` 단일 지점에서 조립한다. 요소 토글은 레지스트리·환경변수
   에서만 발생하고, `agent.ts` / `route.ts` 본문 변경은 0 줄이어야 한다 (FR-08).
2. **신뢰 가능한 멀티턴**: checkpointer + `thread_id` 만으로 대화 맥락을 영속화한다.
   `conversationHistory` 를 수동으로 messages 에 쌓지 않는다 (중복 누적·컨텍스트 오염
   방지). dev HMR 에도 그래프·checkpointer 싱글톤이 살아남도록 globalThis 에 고정한다.
3. **출력 위생**: 모델 내부 사고(thinking/reasoning/redacted_thinking) 및 서브에이전트·
   도구 출력이 최종 답변 스트림으로 누출되지 않는다 (FR-09).
4. **프로바이더 추상화**: `LLM_PROVIDER` 환경변수로 anthropic / openai 를 스위칭하고,
   모델 ID 는 `LLM_MODEL` 로 주입(하드코딩 금지)한다 (FR-10).
5. **컴팩트·안전**: 공식 최소 설치형 유지, API 키 클라이언트 번들 누출 0,
   LLM 마크다운 출력 rehype-sanitize 강제, 단일 파일 1000줄 상한.

### 1.2 사용자 스토리

- US-1 (엔드 유저 — 채팅): 방문자로서, 채팅창에 질문을 입력하고 Enter 로 전송하면
  어시스턴트의 답변이 토큰 단위로 실시간 스트리밍되어 보여서, 응답을 기다리지 않고
  진행 상황을 즉시 확인하고 싶다.
- US-2 (엔드 유저 — 멀티턴): 방문자로서, 같은 대화 안에서 후속 질문을 하면 직전 발화를
  기억한 답변을 받아서, 매번 맥락을 다시 설명하지 않고 대화를 이어가고 싶다.
- US-3 (엔드 유저 — 새 대화): 방문자로서, "새 대화" 버튼을 누르면 메시지 목록이
  비워지고 새로운 대화 컨텍스트가 시작돼서, 이전 맥락과 분리된 새 주제를 시작하고 싶다.
- US-4 (엔드 유저 — 가독성): 방문자로서, 코드 블록·표·목록이 포함된 답변이 마크다운으로
  렌더링되고 코드 복사 버튼이 있어서, 답변을 보기 좋게 읽고 코드를 쉽게 가져가고 싶다.
- US-5 (개발자 — 요소 토글): 개발자로서, 환경변수/레지스트리에서 planning 을 끄거나
  tools·subagents 배열을 비우면 `agent.ts`/`route.ts` 코드를 한 줄도 고치지 않고
  기본 채팅이 계속 정상 동작해서, 하네스 구성을 안전하게 실험하고 싶다.
- US-6 (개발자 — 요소 추가): 개발자로서, 새 도구를 추가할 때 도구 모듈 파일 1개를
  만들고 레지스트리 배열에 1줄만 등록하면 그 외 파일 변경 없이 반영돼서, 하네스를
  빠르게 확장하고 싶다.
- US-7 (개발자 — 프로바이더 전환): 개발자로서, `LLM_PROVIDER` 와 `LLM_MODEL`
  환경변수만 바꾸면 코드 수정 없이 anthropic ↔ openai 를 전환할 수 있어서, 프로바이더를
  유연하게 교체하고 싶다.
- US-8 (개발자 — 출력 신뢰): 개발자로서, 추론이 필요한 입력에도 모델 내부 사고가
  답변 본문에 절대 섞이지 않아서, 사용자에게 깨끗한 응답만 노출하고 싶다.

### 1.3 기능 요구사항 (FR-01 ~ FR-12)

requirements.md `[기능 요구사항]` 섹션을 1:1 로 전사하고 검증 가능하도록 구체화한다.
신규 FR 을 발명하지 않는다.

- **FR-01 — POST /api/chat SSE 스트리밍 응답 (Must)**
  `POST /api/chat` 가 `text/event-stream` 으로 응답한다. 핸들러는
  `runtime = "nodejs"`, `dynamic = "force-dynamic"` (R7). 요청 본문은 Zod 로
  `{ query: string, conversationId?: string }` 검증. `conversationId` 미존재 시
  `crypto.randomUUID()` 발급. 첫 SSE 이벤트로 `{ type: 'thread', conversationId }`
  를 보내 프론트가 저장하게 하고, 이후 `token` / `done` / `error` 이벤트를 forward
  한다. `ReadableStream.cancel()` 로 client disconnect 를 처리한다.

- **FR-02 — checkpointer + thread_id 기반 멀티턴 대화 영속화 (Must)**
  `createDeepAgent({ ..., checkpointer })` 로 checkpointer 를 주입하고,
  `graph.stream(input, { configurable: { thread_id: conversationId } })` 로 호출한다.
  같은 `thread_id` 재호출 시 checkpointer 가 히스토리를 자동 로드한다.
  `conversationHistory` 를 수동으로 messages 에 쌓아 보내지 않는다 (R3, 중복 누적
  방지). 동일 thread_id 로 2턴 이상 보냈을 때 직전 발화를 기억해야 한다.

- **FR-03 — 채팅 메시지 입력 + 전송 (Must)**
  `ChatInput` 은 textarea + Send 버튼. Enter = 전송, Shift+Enter = 줄바꿈.
  스트리밍 중 입력 잠금 정책을 적용하고, 전송 종료(`finally`)에서 입력 잠금을 해제한다.

- **FR-04 — 어시스턴트 응답 토큰 스트리밍 표시 (Must)**
  `streamMode` 는 텍스트 토큰을 위한 `"messages"` 를 사용한다 (R4, `"updates"`
  단독 구독 시 토큰 미흐름). 수신 토큰을 마지막 어시스턴트 메시지에 점진적으로
  append 하고, 스트리밍 중 커서를 표시한다. 정확한 streamMode 인자 형태는 pre-work
  실측(`docs/notes/deepagents-api-probe.md`)으로 확정한다.

- **FR-05 — 마크다운 렌더링 (코드 복사 + rehype-sanitize XSS 방어) (Must)**
  `ChatMarkdown` 은 react-markdown + remark-gfm + rehype-raw → **rehype-sanitize**
  체인(rehype-raw 뒤에 sanitize)으로 LLM 출력 XSS 를 방어한다. 코드 블록에 복사
  버튼과 언어 라벨을 제공한다. LLM 마크다운 출력의 rehype-sanitize 적용은 필수다.

- **FR-06 — 새 대화 버튼 (새 thread_id 발급 + 스토어 리셋) (Must)**
  "새 대화" 버튼 클릭 시 `resetChat` 이 새 `conversationId`(thread_id) 를 발급하고
  messages 등 대화 상태를 초기화한다. 새 thread_id 는 이전 대화 맥락과 분리된다.

- **FR-07 — 모델/프로바이더 표시 (Should)**
  헤더에 active provider 와 model 을 표시한다. 표시값은 서버 환경변수에서 유래하되
  API 키는 절대 노출하지 않는다 (provider/model 식별자만 노출).

- **FR-08 — 하네스 요소 레지스트리 — 요소 추가/제거 용이 (Must)**
  `buildHarnessConfig(env)` 가 환경변수를 읽어 `HarnessConfig`(planning /
  filesystem / subagents / tools / checkpointer)를 단일 지점에서 조립한다.
  `agent.ts` 는 `buildHarnessConfig()` 결과만 받아 `createDeepAgent` 에 전달하며
  `if(toolEnabled)` 분기를 흩뿌리지 않는다 (R2, 함정 6). 요소 추가 = 모듈 파일
  1개 + 레지스트리 1줄 등록, 그 외 파일 변경 0 이 목표다.
  레지스트리 계약:
  ```
  interface HarnessConfig {
    planning: { enabled: boolean }
    filesystem: { enabled: boolean }
    subagents: SubagentSpec[]            // 빈 배열 허용
    tools: StructuredTool[]              // 빈 배열 허용
    checkpointer: BaseCheckpointSaver
  }
  buildHarnessConfig(env): HarnessConfig
  ```

- **FR-09 — thinking/reasoning·서브에이전트 출력 본문 누출 차단 (Must)**
  `AIMessageChunk.content` 가 string 이면 그대로, 블록 배열이면 `type==="text"`
  블록만 UI 로 yield 한다. `thinking` / `reasoning` / `redacted_thinking` 블록과
  서브에이전트·도구(tool_use/tool_call) 노드 출력은 버린다 (R5, 함정 4·5).
  메인 그래프의 최종 어시스턴트 노드 출력만 노출하도록 메타데이터(langgraph_node 등)
  로 출처를 식별한다. 필터 로직은 `utils/chunkFilter.ts` 에 격리해 LLM 호출 없이
  단위 테스트가 가능해야 한다. 실제 thinking 블록 type 문자열·메타데이터 키는
  pre-work 실측으로 확정한다 (U3·U4).

- **FR-10 — LLM 프로바이더 추상화 (anthropic/openai 환경변수 스위칭) (Must)**
  `src/lib/agent/harness/model.ts` 가 `LLM_PROVIDER` 로 `ChatAnthropic` /
  `ChatOpenAI` 를 선택하고 `LLM_MODEL` 을 주입한다 (기본 provider = anthropic).
  프로바이더 간 streaming/thinking 설정 차이는 이 파일이 흡수한다. 모델 ID
  하드코딩 금지.

- **FR-11 — Planning(write_todos) 하네스 요소 — 토글 가능 (Must)**
  deepagents 내장 planning(write_todos)을 레지스트리 `planning.enabled` 플래그
  (`HARNESS_PLANNING` 환경변수)로 on/off 한다. off 여도 빌드·기동·기본 채팅이
  정상이며 `agent.ts`/`route.ts` diff 0.

- **FR-12 — Virtual filesystem + Subagent 하네스 요소 — 토글 가능 (Must)**
  deepagents 내장 파일 도구(ls/read_file/write_file/edit_file)와 subagent spawn 을
  하네스 요소로 제공한다. filesystem 은 `HARNESS_FILESYSTEM` 으로 토글, subagent
  정의는 `harness/subagents/` 하위 모듈로 분리하고 레지스트리에서 배열로 합성한다
  (`HARNESS_SUBAGENTS`). subagents 배열이 0개면 단일 에이전트로 동작하며 빌드·기동·
  기본 채팅이 정상이고 `agent.ts`/`route.ts` diff 0.

  보조 요소(FR 외 — 핵심 아키텍처 제약 H4): custom tools 슬롯은 `harness/tools/`
  하위에 "도구 1개 = 파일 1개"로 두고 레지스트리 `tools` 배열에 등록된 것만 주입한다.
  초기 범위는 도구 인터페이스 + 외부 의존·과금 없는 안전한 예시 도구 1개이며,
  웹검색/코드실행 등 외부 의존 도구는 슬롯만 마련하고 등록 절차를 README 에 명시한다.

### 1.4 비기능 요구사항

requirements.md `[비기능]` 및 `[보안]` 섹션 기준.

- **NFR-1 (성능 — 스트리밍 레이턴시)**: 첫 SSE 청크가 warm 3초 이내,
  cold start 15초 이내 도달.
- **NFR-2 (품질)**: `pnpm build` / `eslint .` 에러 0. TypeScript strict.
  Next.js 16 은 `next lint` 제거 → lint 스크립트는 `eslint .` (flat config
  직접 export, FlatCompat 금지 — 함정 9).
- **NFR-3 (유지보수)**: 단일 파일 1000줄 초과 금지. 초과 시 기능별 분리 +
  등록 index re-export. harness/ 하위는 "요소 1개 = 파일 1개".
- **NFR-4 (보안 — 키 비누출)**: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 는
  서버 전용. `NEXT_PUBLIC_` 접두사 절대 금지. 빌드 후 `.next/static/` 에서
  `ANTHROPIC_API_KEY|OPENAI_API_KEY` 및 `sk-(ant-)?[A-Za-z0-9_-]{20,}` grep
  결과 0 matches.
- **NFR-5 (보안 — 출력 sanitize)**: LLM 마크다운 출력은 rehype-sanitize 필수
  (FR-05 와 연동, rehype-raw 뒤 체인).
- **NFR-6 (하네스 토글 회귀 0)**: planning off / tools [] / subagents [] 토글 시
  `agent.ts` 와 `route.ts` 의 코드 변경이 **0 줄** (FR-08 검증 기준, R2).
- **NFR-7 (영속성 신뢰)**: 기본 checkpointer 백엔드는 SQLite. MemorySaver 는
  테스트/일회성에만(HMR·재시작 시 히스토리 증발). 백엔드 교체는
  `harness/checkpointer.ts` 한 곳에서. dev HMR 대비 그래프·checkpointer 싱글톤은
  globalThis 에 고정 (R6, 함정 11).
- **NFR-8 (형상관리)**: checkpointer SQLite 파일(`./.data/`)은 `.gitignore` 등록.
- **NFR-9 (런타임)**: route handler 는 nodejs 런타임(edge 불가, SQLite/네이티브
  의존), `dynamic = "force-dynamic"` (R7, 함정 10).
- **NFR-10 (의존성 정합)**: `@langchain/core` 단일 버전 정렬(`pnpm why
  @langchain/core` 단일 트리), zod 는 deepagents(^4)와 같은 메이저 (R1).
- **NFR-11 (Mock 금지)**: route.ts 본문에 `E2E_MOCK`/`MOCK_MODE` 분기 금지,
  playwright config 에 mock prefix 금지. 단위 테스트는 deepagents/@langchain
  그래프 모킹 필수(실행 시 과금·비결정). 레지스트리·필터·파서는 LLM 호출과
  분리되어 순수 함수로 테스트 가능하게 설계.

### 1.5 수용 기준 (검증 가능 조건)

- **AC-1 (FR-01)**: `POST /api/chat` 에 `{ query: "안녕" }` 전송 시 HTTP 200 +
  `Content-Type: text/event-stream`. 첫 이벤트가 `{ type: 'thread',
  conversationId }`. 이후 15초(cold) 이내 첫 `token` 이벤트 수신.
- **AC-2 (FR-02, 멀티턴)**: 동일 `conversationId` 로 1턴 전송 후, 직전 발화를
  참조하는 2턴째를 보내면 직전 맥락을 기억한 응답이 비어있지 않게 수신된다.
  "연속 2회 이상", "추론 필요 입력 ≥1 + 도구 유발 입력 ≥1" 시나리오로 검증.
  checkpointer 미주입/`thread_id` 미전달 시 멀티턴이 깨짐을 회귀 테스트로 방지.
- **AC-3 (FR-09, thinking-leak=0)**: "추론이 필요한 입력"(예: "17 x 24 답만
  한 줄로")을 최소 1회 포함해도 최종 답변 스트림에 thinking/reasoning/
  redacted_thinking 텍스트가 **0건** 노출된다. `chunkFilter` 단위 테스트가
  text 블록 통과 / thinking 블록 제거 / string content / 배열 content /
  서브에이전트 노드 메타 제거 / 빈 청크 케이스를 모두 통과한다.
- **AC-4 (FR-08 / NFR-6, 하네스 토글 diff=0)**: 다음 3가지를 각각 적용해 재기동
  했을 때 빌드·기동·기본 채팅이 정상이며 `agent.ts` 와 `route.ts` 의 git diff 가
  **0 줄**이다:
  1. `HARNESS_PLANNING=false` (planning off)
  2. 레지스트리 `tools` 배열 `[]`
  3. 레지스트리 `subagents` 배열 `[]`
  추가로 잘못된 `LLM_PROVIDER` 값은 명확한 에러를 발생시킨다.
- **AC-5 (FR-03/04)**: Enter 전송 / Shift+Enter 줄바꿈 동작. 어시스턴트 버블이
  15초 안에 visible, innerText 가 60초 안에 비어있지 않음. 전송 종료 후 입력
  잠금이 해제된다(`finalizeLastAssistant` 호출 누락 시 입력 고착 회귀 방지).
- **AC-6 (FR-05)**: 코드 블록/표/목록 마크다운 렌더링, 코드 복사 버튼·언어 라벨
  동작. rehype-sanitize 가 적용되어 LLM 출력의 스크립트 주입이 차단된다.
- **AC-7 (FR-06)**: "새 대화" 버튼 클릭 후 메시지 0개 + `conversationId` 변경.
- **AC-8 (FR-07)**: 헤더에 active provider/model 식별자 표시. `.next/static/`
  grep 으로 API 키 0 matches (NFR-4).
- **AC-9 (FR-10)**: `LLM_PROVIDER` 를 anthropic↔openai 로 바꾸고 `LLM_MODEL` 만
  교체하면 코드 변경 없이 동작. 모델 검증은 1토큰 실증 호출로 판단(학습 지식
  blocking 금지), 실패 시 에러 본문 그대로 사용자 보고.
- **AC-10 (단위 테스트)**: SSE 파서(5~7 TC), chunkFilter(5~7 TC),
  스토어(5 TC), 레지스트리(4~6 TC), 시스템 프롬프트(3~4 TC) 통과.
  레지스트리/필터/파서는 LLM 호출 없이 순수 함수로 검증된다.
- **AC-11 (E2E)**: Playwright 시나리오 통과 — `/api/chat` 200 +
  text/event-stream, 어시스턴트 버블 15초 내 visible, innerText 60초 내
  non-empty, 새 대화 후 메시지 0개 + conversationId 변경, 2턴 멀티턴 smoke.
  "정확히 N줄"/"특정 단어 포함" 어설션 금지, `retries: 1`,
  `reuseExistingServer: false`.

### 1.6 영향 엔드포인트

- **`POST /api/chat`** (신규, `src/app/api/chat/route.ts`):
  - 런타임: `export const runtime = "nodejs"`, `export const dynamic =
    "force-dynamic"` (NFR-9, R7).
  - 요청: `Content-Type: application/json`, body `{ query: string,
    conversationId?: string }` (Zod 검증). `conversationId` 미존재 시
    `crypto.randomUUID()` 발급.
  - 응답: `text/event-stream` (SSE). 이벤트 순서 — ① `{ type: 'thread',
    conversationId }` ② `{ type: 'token', ... }` (반복) ③ `{ type: 'done' }`
    또는 `{ type: 'error', ... }`.
  - 클라이언트 disconnect 시 `ReadableStream.cancel()` 핸들러로 그래프 스트림
    정리.
  - route.ts 본문에 mock/하네스 분기 없음 (NFR-11, R2).

### 1.7 스키마 / 상태 변경

본 프로젝트에 관계형 애플리케이션 DB 는 없다. 영속 상태는 LangGraph checkpointer 와
클라이언트 Zustand 스토어로 한정된다.

- **Checkpointer (서버 영속 상태)**:
  - 기본 백엔드: SQLite (`@langchain/langgraph-checkpoint-sqlite` 의 SqliteSaver).
  - 파일 경로: `CHECKPOINTER_SQLITE_PATH` (기본 `./.data/checkpoints.sqlite`).
    `.data/` 디렉토리 생성 보장, `.gitignore` 등록(NFR-8).
  - 백엔드 선택: `HARNESS_CHECKPOINTER` = `sqlite` | `memory`. 교체는
    `harness/checkpointer.ts` 단일 함수에서.
  - 키: `thread_id` = 클라이언트 `conversationId`. 동일 thread_id 재호출 시
    그래프 상태(대화 히스토리)를 자동 로드. 스키마는 LangGraph checkpoint 라이브러리
    내부 포맷을 따른다(앱이 직접 정의하지 않음). saver 생성 API 는 pre-work
    실측(U5)으로 확정.
  - 싱글톤: 그래프와 checkpointer 는 globalThis 에 고정(`__agent` 키)해 dev HMR
    리셋을 방지(NFR-7, R6).

- **Zustand 스토어 (`src/store/index.ts`, 단일 파일 — 팩토리 + 싱글톤 +
  `useChatStore`)**:
  - 상태: `messages`(ChatMessage[]), `conversationId`(thread_id, string),
    `isStreaming`(boolean), `error`(string|null), `provider`/`model`(표시값).
  - 액션: `addMessage`, `appendToLastAssistant`, `setConversationId`,
    `setStreaming`, `finalizeLastAssistant`, `setError`,
    `resetChat`(새 `conversationId` 발급 + 상태 초기화).

- **타입 (`src/types/index.ts`, 단일 파일)**:
  - `ChatMessage`, `SseEvent`(union: `token` | `done` | `error` | `thread`),
    `HarnessConfig`(FR-08 계약), `SubagentSpec`.

### 1.8 UI 변경

라이트 모드 기본. 스펙에 없는 UI 요소(아이콘/스피너/배지/카운터 등)는 구현하지 말고
`docs/notes/ui-suggestions.md` 에 제안만 기록한다.

- **레이아웃 (`src/app/(main)/layout.tsx`)**: Sidebar(로고 + "채팅" 링크) +
  Header(고정 이메일 표시)를 인라인으로 구성(분리 금지).
- **루트 (`src/app/page.tsx`)**: `/` → `/chat` 리다이렉트.
- **채팅 페이지 (`src/app/(main)/chat/page.tsx`)**: 페이지 헤더 + `ChatPanel`.
- **HeaderControls (`src/app/(main)/chat/HeaderControls.tsx`)**: active
  provider/model 표시(FR-07) + "새 대화" 버튼(`resetChat`, FR-06).
- **ChatPanel (`src/components/chat/ChatPanel.tsx`)**: `MessageList` +
  `ChatInput` 직접 조합(BaseChat 래퍼 금지).
- **ChatInput (`src/components/common/BaseChat/ChatInput.tsx`)**: textarea +
  Send. Enter 전송 / Shift+Enter 줄바꿈(FR-03).
- **MessageList (`src/components/common/BaseChat/MessageList.tsx`)**: user/
  assistant 구분, 자동 스크롤, 스트리밍 커서(FR-04).
- **ChatMarkdown (`src/components/common/ChatMarkdown.tsx`)**: react-markdown +
  remark-gfm + rehype-raw → rehype-sanitize, 코드 블록 복사 버튼 + 언어
  라벨(FR-05, NFR-5).
- **useChat (`src/components/chat/useChat.ts`)**: fetch + SSE 파싱 + 스토어
  업데이트. 이벤트 매핑 — `thread` → `setConversationId`, `token` →
  `appendToLastAssistant`, `done` → break, `error` → `setError`.
  `finally` 에서 `setStreaming(false)` + `finalizeLastAssistant()` 반드시 호출.

### 1.9 pre-work 의존 미확정 항목 (구현 전 실측 확정)

본 PRD 는 deepagents(JS)/LangGraph.js 의 공개 동작 기준이다. 다음은 학습 지식이
아닌 `pnpm install` 후 `.d.ts`/README 실측(`docs/notes/deepagents-api-probe.md`,
`docs/notes/live-stream-events.md`)으로 확정하며, 충돌 시 임의 변경 없이 사용자
보고 후 본 PRD 를 개정한다 (R8):

- U1. `createDeepAgent` 의 정확한 옵션 키(checkpointer 주입 위치 포함).
- U2. 컴파일 그래프 `.stream()` 의 streamMode 인자 형태 / 멀티모드 지원 여부.
- U3. `AIMessageChunk.content` 의 thinking 블록 실제 type 문자열.
- U4. subagent/도구 출처 식별용 메타데이터 키(`langgraph_node` 등).
- U5. checkpoint-sqlite saver 의 생성 API(`fromConnString` 등).

### 1.10 아키텍처 결정 (Architecture Review 확정 — Action Item 1·3)

Architecture Review 결과 PASS. 아래는 사용자 확정된 STRUCTURAL 결정으로,
downstream QA·plan·구현이 반드시 따른다 (변경 시 사용자 재확인 필요).

- **AD-1 (Objection 1·2 — 어댑터 위치):** `HarnessConfig` → `createDeepAgent`
  옵션 변환 어댑터는 전용 파일 `src/lib/agent/harness/buildAgentOptions.ts`
  가 담당한다. 이 함수가 `HarnessConfig` + `model`(model.ts) +
  `systemPrompt`(prompts/systemPrompt.ts)를 받아 `createDeepAgent` 의
  **완전한 단일 인자 객체**를 생성한다. `agent.ts` 는
  `createDeepAgent(buildAgentOptions(config, model, systemPrompt))` 형태의
  **분기 0줄 단일 호출**만 가진다. planning/filesystem 의 키 생략·분기 매핑은
  전부 `buildAgentOptions.ts` 내부에 격리된다. → NFR-6/AC-4(토글 시
  agent.ts diff 0)의 실질 강제 지점. U1 실측 직후 `deepagents-api-probe.md`
  에 옵션 키 매핑을 확정한 뒤 agent/registry 슬라이스를 시작한다.

- **AD-2 (Objection 3 — registry 순수성):** `checkpointer.ts` 는 `./.data/`
  디렉토리 생성·SQLite 파일 핸들 열기를 **최초 사용 시점까지 지연(lazy)**
  한다. 따라서 `buildHarnessConfig(env)` 는 파일시스템 side effect 가 없는
  진짜 순수 함수로 유지되고, NFR-11/AC-10 의 "순수 함수 단위 테스트" 주장이
  문자 그대로 성립한다 (checkpointer/model 분기 포함).

- **AD-3 (Action Item 4 — 동시 cold-start 레이스):** globalThis 싱글톤은
  resolved graph 가 아닌 `Promise` 를 메모이즈한다
  (`if (!g.__agent.graph) g.__agent.graph = buildGraph(); await g.__agent.graph`).
  동시 첫 요청 2개가 `createDeepAgent` 를 중복 호출하지 않아야 하며,
  agent 슬라이스에 "동시 진입 시 createDeepAgent 최대 1회 호출" 단위 테스트를
  포함한다.

- **AD-4 (Action Item 5 — route 입력 계약):** `POST /api/chat` 의 Zod 검증
  실패 응답은 **HTTP 400 + `{ error: string }` JSON**(SSE 아님)으로 고정한다.
  `query` 가 빈 문자열/공백만일 경우 route 경계에서 **거부(400)** 한다
  (모델에 위임하지 않음). 정상 흐름만 `text/event-stream` 으로 응답한다.

- **AD-5 (보안 사전검토 슬라이스):** 다음 슬라이스는 구현 중 security
  pre-review 필수 — (a) `route.ts` SSE 인코더(에러 본문 개행/`event:` 경계
  이스케이프, `ReadableStream.cancel()` 이 그래프 스트림 실제 중단),
  (b) `harness/checkpointer.ts`(SQLite 경로·`.data/` 생성·`.gitignore`,
  요청 입력이 경로에 영향 못 줌), (c) `harness/model.ts`(API 키 이 파일에만
  국한·응답 비직렬화, 잘못된 `LLM_PROVIDER` hard-throw),
  (d) `ChatMarkdown.tsx`(`rehype-raw`→`rehype-sanitize` 순서, 스트리밍 부분
  마크다운 재렌더가 sanitize 우회 불가). build-output 키 누출 grep 은
  merge-ready 게이트.

- **AD-6 (R8 실측 — deepagents@1.10.2 하네스 토글 메커니즘 확정):**
  pre-work 전 `.d.ts` 실측으로 U1 및 토글 가능성을 확정했고, 사용자
  승인 완료(R8 절차). 근거: `docs/notes/deepagents-api-probe.md` §2~§4.
  - **AD-6-1:** `createDeepAgent` 파라미터는 `model / tools / systemPrompt
    / middleware / subagents / checkpointer(BaseCheckpointSaver|boolean)
    / backend / ...`. `harnessProfile` 옵션은 **없음** — 토글은 전역
    `registerHarnessProfile(modelSpec, HarnessProfileOptions)` 레지스트리로
    주입한다.
  - **AD-6-2:** `FilesystemMiddleware`·`SubAgentMiddleware` 는
    `REQUIRED_MIDDLEWARE_NAMES` — `excludedMiddleware` 로 제거 시
    construction-time throw. 따라서 **FR-12 의 "filesystem off" 는
    미들웨어 제거가 아니라 soft toggle 로 재정의**: `filesystem.enabled
    =false` → `excludedTools:["ls","read_file","write_file","edit_file",
    "glob","grep"]`. UX 등가물이 본 프로젝트의 확정 정의다(임의 변경
    아님 — 사용자 승인됨).
  - **AD-6-3:** 토글 매핑(planning→excludedMiddleware, filesystem→
    excludedTools, subagents→subagents[]+GP enabled:false, tools→tools[],
    checkpointer→checkpointer)은 전부 `harness/buildAgentOptions.ts`
    내부에 격리(AD-1 유지). `agent.ts` 는 `createDeepAgent(
    buildAgentOptions(...))` 분기 0줄 단일 호출. AC-4/NFR-6 의 "토글 시
    agent.ts·route.ts diff 0" 검증 대상에 **filesystem soft toggle 추가**
    (4종 토글 전부).
  - **AD-6-4:** R1 정렬 검증 통과 — `@langchain/core 1.1.46` 단일 트리
    실측 확인. `@langchain/langgraph` 는 deepagents dependency 로 자동
    해석(직접 핀 안 함, 규약 준수).
  - **AD-6-5 (잔여 미실측 — pre-work 슬라이스에서 확정):** streamMode
    인자 형태(R4), AIMessageChunk content 블록 type 문자열(R5),
    subagent 노드 출력 식별 메타키(R5), `checkpointer: boolean` 의미,
    `@langchain/langgraph-checkpoint-sqlite` 별도 설치 필요(현재 미설치).
    이들은 인터페이스 불변(이미 격리된 모듈의 상수)이므로 각 소유
    슬라이스에서 실측 후 채운다.

# 프로젝트: LangGraph DeepAgents(JS) 기반 하네스 + LLM 챗 에이전트

이 파일은 코드 트리에 남는 **유일한 가드 문서**다 — "코드 생성 시 어기면
안 되는 중요 사항"만 압축한다. 상세 함정·구현 순서·전체 스펙(requirements.md),
PRD/plan/use-cases/QA/실측 노트/디자인 핸드오프 원본(docs/)은 코드 최소화를
위해 옵시디언 vault 로 이관됐다 (2026-05-19, commit `3f0a46d`).
vault 위치: `specs/aiceo-4th-agent/` (iCloud Obsidian Documents/)

- `requirements.md` — 전체 스펙 (이 파일의 상세 원본)
- `docs/` — PRD, plan, use-cases, qa, notes, design-ref
- `prompt-sample.md` — 폐기된 OpenCode SDK 구안 (따르지 말 것)
- `README.md` — 이관 인덱스·출처

코드 생성·변경 시 상세 근거가 필요하면 위 vault 산출물을 참조한다.
실측이 스펙과 충돌하면 임의 변경 말고 사용자 보고(R8 불변).

## 스택 핵심 (코드 생성 전 반드시 인지)

- 에이전트 하네스: `deepagents` (JS). `createDeepAgent()` 가 **컴파일된 LangGraph
  그래프**를 반환한다. 별도 서버 스폰·이벤트 구독 없음 (OpenCode 패턴 적용 금지).
- 공식 최소 설치형 = `deepagents` + `langchain` + `@langchain/core`. 가장 무난·
  컴팩트한 형태가 요구사항. 불필요한 패키지 추가 금지.
- `@langchain/langgraph` 는 deepagents 의 dependency. **package.json 에 직접
  추가하지 말 것** (버전 갈림 위험). 단 실측 정정: pnpm strict node_modules
  에선 앱 코드가 `@langchain/langgraph` 를 **직접 import 할 수 없다**
  (`ERR_MODULE_NOT_FOUND`). 그래프는 deepagents 반환분을 쓰고,
  checkpointer 는 직접 의존인 `@langchain/langgraph-checkpoint-sqlite`
  (`SqliteSaver`, `:memory:` 포함)로 해결한다 — langgraph 본체 직접
  import 0 (live-stream-events.md U5).
- 패키지는 "가능한 최신 버전". 구현 시점에 `npm view <pkg> version` 으로
  재확인 후 캐럿(^) 범위로 핀. (2026-05-19 실측: deepagents 1.10.2,
  langchain 1.4.0, @langchain/core 1.1.46, next 16.2.6, react 19.2.6)

## 코드 생성 시 절대 규칙 (위반 = 설계 실패)

### R1. @langchain/core 버전 단일 정렬
deepagents / @langchain/anthropic / @langchain/openai / -checkpoint-sqlite 가
모두 @langchain/core 에 의존한다. 버전이 갈리면 `AIMessageChunk instanceof`
체크가 깨진다 (서로 다른 클래스 정체성). 설치 후 `pnpm why @langchain/core`
로 단일 트리 검증. zod 도 deepagents(^4)와 같은 메이저로 정렬.

### R2. 하네스 요소 토글은 레지스트리에서만
하네스 요소(planning / filesystem / subagents / tools / checkpointer)의
on/off 는 `src/lib/agent/harness/registry.ts` 의 `buildHarnessConfig(env)`
한 곳에서만 일어난다. `agent.ts` / `route.ts` 에 `if(toolEnabled)` 분기를
흩뿌리면 "요소 추가·제거 용이" 요구(FR-08) 위반.
검증 기준: planning off / tools [] / subagents [] 토글 시
agent.ts·route.ts diff 가 **0 줄**이어야 함. 새 요소 추가 = 모듈 파일 1개 +
레지스트리 1줄 등록, 그 외 파일 변경 0.

### R3. 멀티턴 = checkpointer + thread_id (수동 히스토리 금지)
createDeepAgent 에 checkpointer 주입 + graph.stream(input,
`{configurable:{thread_id: conversationId}}`) 호출이 멀티턴의 전부.
conversationHistory 를 messages 에 수동으로 쌓아 보내면 checkpointer 로드분과
**중복 누적**되어 컨텍스트 오염. checkpointer 미주입 시 매 호출 무상태로 퇴화.

### R4. streamMode 는 "messages" (텍스트 토큰용)
LangGraph.js stream: `"messages"`=토큰청크, `"updates"`=노드변화,
`"values"`=전체스냅샷. 텍스트 스트리밍은 "messages" 필수. "updates" 만
구독하면 토큰 안 흐름. 정확한 인자 형태는 pre-work 실측으로 확정.

### R5. thinking/reasoning·서브에이전트 출력 본문 누출 차단 (FR-09)
AIMessageChunk content 는 string 이거나 블록 배열일 수 있다.
배열이면 `type==="text"` 블록만 UI 로 yield. `thinking`/`reasoning`/
`redacted_thinking` 및 subagent 노드 출력은 버린다. 필터 로직은
`utils/chunkFilter.ts` 에 격리 (LLM 호출 없이 단위 테스트 가능해야 함).

### R6. globalThis 싱글톤 (HMR 리셋 방지)
컴파일 그래프·checkpointer 는 모듈 변수로 두면 dev HMR 시 재생성되어
멀티턴이 깨진다. Prisma 공식 패턴대로 globalThis 에 고정.

### R7. route.ts 런타임
SQLite/네이티브 의존 → edge 불가. 최상단:
`export const runtime = "nodejs"` / `export const dynamic = "force-dynamic"`.

### R8. 학습 지식으로 API 단정 금지
deepagents/@langchain API 는 빠르게 변한다. createDeepAgent 옵션 키
(systemPrompt vs instructions 등), streamMode 인자 형태, checkpointer 주입
위치, content 블록 type 문자열, subagent 식별 메타데이터 키는 **pnpm install
후 .d.ts/README 실측 → docs/notes/deepagents-api-probe.md 기록 후** 구현.
실측이 requirements.md 와 충돌하면 임의 변경 말고 사용자 보고.
(이미 확인된 차이: 공식 문서는 `createDeepAgent({ tools, systemPrompt })`,
`tool` 은 `"langchain"` 에서 import — 초안의 instructions 추정과 다름.)

**런타임 실측 확정(thinking-panel 작업 이후 추가 — 코드 정합 보정):**

- OpenAI 에서 reasoning 텍스트를 받으려면 `ChatOpenAI` 에
  `useResponsesApi:true` + `reasoning:{summary:"auto"}` 필수. Chat
  Completions API 는 reasoning 을 카운트만 하고 텍스트를 반환 안 함
  (사고 패널 데이터원 = Responses API summary). model.ts 에 격리.
- 컴파일 그래프 `.stream()` 은 **`Promise<IterableReadableStream>`** 반환
  → `await graph.stream(...)` 후 `for await`. await 누락 시 런타임
  "not async iterable" (async generator mock 은 이 차이를 못 잡음).
- 런타임 `AIMessageChunk` 는 살아있는 인스턴스라 텍스트가 `msg.content`
  (최상위)에 있다. probe 의 `JSON.stringify` 직렬화형(`kwargs.content`)과
  다름 → chunkFilter 는 `msg.content ?? msg.kwargs.content` 양쪽 방어.
- OpenAI built-in `web_search` 는 ServerTool — ClientTool 의
  `tool_call_chunks` 가 아니라 `additional_kwargs.tool_outputs[]`
  (`{type:"web_search_call", action:{queries}}`) **다른 채널**로 온다.
  ClientTool 채널만 보면 웹검색이 안 잡힘(extractToolOutputs 별도 수집).

## 보안

- API 키(ANTHROPIC_API_KEY / OPENAI_API_KEY)는 서버 전용. `NEXT_PUBLIC_`
  접두사 절대 금지. 빌드 후 `.next/static/` grep 으로 0 matches 확인.
- checkpointer SQLite 파일(`./.data/`)은 `.gitignore` 등록.

## Mock 금지

route.ts 본문에 E2E_MOCK/MOCK_MODE 분기 금지. 단위 테스트는 deepagents/
@langchain 그래프를 모킹 필수(실제 실행 시 과금·비결정). 레지스트리·필터·
파서는 LLM 호출과 분리되어 순수 함수로 테스트 가능하게 설계.

## 작업 원칙

- 패키지 버전은 항상 "가능한 최신 버전"을 사용한다. 추가·갱신 직전
  `npm view <pkg> version` 으로 재확인 후 캐럿(^) 범위로 핀. 학습 지식에
  남아 있는 구버전을 임의로 적지 말 것.
- 크리티컬 이슈 아니면 묻지 말고 다음 단계 자동 진행. 결과는 `docs/notes/` 기록.
- 단일 파일 1000줄 초과 금지. harness/ 는 "요소 1개 = 파일 1개".
- 막힘 시: 가설 3개 순차 검증, 모두 반증되면 보고 (4번째 가설 단독 수립 금지).
- 스펙에 없는 UI 요소 추가 판단 시 구현 말고 docs/notes/ui-suggestions.md 기록만.

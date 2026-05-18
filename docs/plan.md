# 구현 계획 — LangGraph DeepAgents(JS) 하네스 + 스트리밍 챗 에이전트

> 작성: 2026-05-19 KST · planner 에이전트 산출 + AD-6(R8 실측) 통합판
> 입력: docs/PRD.md(§1.3 FR, §1.5 AC, §1.10 AD-1~AD-6), use-cases(24 UC),
> qa(132 TC), requirements.md, CLAUDE.md(R1~R8), deepagents-api-probe.md(실측 확정)

## 0. BLOCKING RISK 상태 — 해소됨

planner 가 식별한 "deepagents JS 미들웨어 비활성 미지원" BLOCKING 은
`node_modules/deepagents/dist/index.d.ts` @ 1.10.2 **실측으로 해소**되었고
사용자 승인 완료(R8). 결론(probe note §4 / PRD AD-6):

- planning/subagents/tools 토글 → 표준 API 로 완전 달성.
- filesystem → **soft toggle**(excludedTools, 미들웨어 제거 아님)로 재정의·승인.
- 토글 주입 = 전역 `registerHarnessProfile` + createDeepAgent params,
  변환은 `buildAgentOptions.ts` 격리(AD-1·AD-6-3).

→ 원안의 "Slice 1 BLOCKING 게이트(미결정 시 Slice 4·5 차단)"는 **제거**.
  Slice 1 은 스캐폴드 + 설치 + 잔여 U2~U5 실측으로 축소.

## 1. 선행 문서 확인

| 항목 | 경로 | 상태 |
|------|------|------|
| PRD | docs/PRD.md §1.3/1.5/1.10(AD-1~6) | PASS |
| Use cases | docs/use-cases/deepagents-chat-harness_use_cases.md | 24 UC / 124 시나리오 |
| QA | docs/qa/deepagents-chat-harness_test_cases.md | 132 TC |
| Architecture | PRD §1.10 | PASS + AD-1~6 |
| API probe | docs/notes/deepagents-api-probe.md | 실측 확정 |

코드베이스: 빈 프로젝트. node_modules 부분 설치(deepagents 1.10.2,
langchain 1.4.0, @langchain/core 1.1.46, @langchain/anthropic 1.3.29,
@langchain/langgraph 1.3.0 동반). next/react/@langchain/openai/
@langchain/langgraph-checkpoint-sqlite/zustand/vitest/playwright 미설치.

## 2. 슬라이스 (9개)

### Slice 1 [Wave 1] Pre-work — 스캐폴드 + 의존성 + 잔여 U2~U5 실측

- **UC/TC:** TC-26.8(pnpm why core 단일트리+zod^4+audit), TC-26.11,
  TC-12.1/12.3·TC-13.1/13.4(active key precheck+1토큰 실증), TC-18.6/19.6(U3·U4)
- **FR/AC:** 전체 기반. AC-9, NFR-10/R1, R8, AD-6-5
- **Files(생성/수정):** package.json(보강), pnpm-lock.yaml, tsconfig.json,
  next.config.ts, eslint.config.mjs(flat, FlatCompat 금지·함정9),
  vitest.config.ts, playwright.config.ts(baseURL 3000·retries 1·
  reuseExistingServer false), postcss.config.mjs, .gitignore(.next/
  node_modules/ ./.data/ .env*), .env.example(NEXT_PUBLIC_ 금지 주석),
  run-dev.sh(캐시제거+포트3000 kill+pnpm 버전+active key 확인),
  src/app/{globals.css,layout.tsx,page.tsx(/→/chat stub)},
  docs/notes/env-precheck.md, docs/notes/deepagents-api-probe.md(U2·U5 추가),
  docs/notes/live-stream-events.md(실 LLM 2턴 probe — U3·U4 청크 JSON,
  함정4·5 재현 입력)
- **설치 최신 핀:** next ^16.2.6, react/react-dom ^19.2.6,
  @langchain/openai ^1.4.5, @langchain/langgraph-checkpoint-sqlite ^1.0.1,
  zustand ^5, tailwindcss ^4 + @tailwindcss/postcss ^4, react-markdown ^10
  + remark-gfm ^4 + rehype-raw ^7 + rehype-sanitize ^6, lucide-react, clsx,
  zod ^4, vitest ^4 + @testing-library/react ^16 + jsdom +
  @vitest/coverage-v8, @playwright/test ^1.59, eslint ^9 +
  eslint-config-next, @types/node ^20, typescript. (@langchain/langgraph
  직접 추가 금지 — deepagents 관리)
- **Done:** pnpm install 후 `pnpm why @langchain/core` 단일 트리 ;
  `pnpm build` exit 0 ; `eslint .` 0 ; env-precheck 1토큰 실증 기록 ;
  live-stream-events.md 에 U2·U3·U4 가 실제 청크 JSON 인용과 함께 확정
- **Pre-review:** architect + security

### Slice 2 [Wave 2] 타입 + Zustand 스토어 (순수)

- **UC/TC:** TC-25.8~25.12(store 5), TC-3.2/3.4/3.5(race)/3.6, TC-20.2(부분)
- **FR/AC:** FR-04, FR-06, AC-7, AC-10, PRD §1.7
- **Files:** src/types/index.ts, src/store/index.ts, tests/unit/store.test.ts
- **Done:** store 단위 green ; resetChat() 후 conversationId 변경 +
  messages 0 ; provider/model 불변

### Slice 3 [Wave 2] 순수 함수 — chunkFilter + sseStreamParser + systemPrompt

- **UC/TC:** TC-18.3~18.5/18.7~18.13(chunkFilter 7), TC-19.4/19.5,
  TC-25.1~25.7(sseParser 7), TC-25.19~25.22(systemPrompt 4)
- **FR/AC:** FR-09, FR-01, AC-3, AC-10. U3·U4 실측 상수 인용(R8/AD-6-5)
- **Files:** src/lib/agent/utils/{chunkFilter,sseStreamParser}.ts,
  src/lib/agent/prompts/systemPrompt.ts, tests/unit/{chunkFilter,
  sseStreamParser,systemPrompt}.test.ts
- **Done:** chunkFilter≥7+sseParser≥7+systemPrompt≥4 green ;
  thinking 블록 제거·text 통과 ; systemPrompt 레퍼런스 잔재 grep 0

### Slice 4 [Wave 3] 하네스 model + checkpointer + tools/subagents 슬롯

- **UC/TC:** TC-9.2/9.3/9.8, TC-17.1~17.4, TC-11.3/11.5/11.6,
  TC-25.16/25.17, TC-10.6/10.7, TC-26.5~26.7
- **FR/AC:** FR-10, FR-12, AC-4, AC-9, AC-10, NFR-7/8, AD-2, AD-5(b)(c)
- **Files:** src/lib/agent/harness/{model.ts,checkpointer.ts(AD-2 lazy),
  tools/exampleTool.ts,tools/index.ts,subagents/index.ts},
  tests/unit/{model,checkpointer}.test.ts
- **Done:** model+checkpointer 단위 green ; LLM_PROVIDER 오값 throw ;
  checkpointer 팩토리 호출 직후 ./.data 미생성(lazy) ; API 키 grep
  model.ts 외 0
- **Pre-review:** security (AD-5 b/c)

### Slice 5 [Wave 4] registry + buildAgentOptions(AD-1·AD-6) + agent 싱글톤(AD-3)

- **UC/TC:** TC-6.2/6.3/6.7/6.8, TC-7.2, TC-8.2, TC-25.13~25.18,
  TC-15.1~15.4, TC-21.1/21.2(동시 cold-start ≤1회)/21.3, TC-2.2
- **FR/AC:** FR-02/08/11/12, AC-2/4/10, NFR-6/7, AD-1/2/3/6
- **Files:** src/lib/agent/harness/{registry.ts(AD-2 순수),
  buildAgentOptions.ts(AD-1·AD-6-3: HarnessConfig+model+systemPrompt →
  createDeepAgent 완전인자 + registerHarnessProfile 호출, planning→
  excludedMiddleware/filesystem→excludedTools/subagents→subagents[]+GP
  false 매핑 격리)}, src/lib/agent/agent.ts(분기 0줄 단일 호출, AD-3
  globalThis Promise 메모이즈, createStream→graph.stream(input,
  {configurable:{thread_id}},<U2 streamMode>)→chunkFilter→SseEvent),
  tests/unit/{registry,buildAgentOptions}.test.ts,
  tests/integration/agent.test.ts(그래프 모킹)
- **Done:** registry≥6+buildAgentOptions+agent 통합 green ;
  buildHarnessConfig({HARNESS_PLANNING:'false'})→planning.enabled false
  & 호출 직후 ./.data 미생성 ; 동시 2개 createStream → createDeepAgent
  spy 카운트 1 ; filesystem.enabled=false → excludedTools 매핑 확인
- **Pre-review:** architect (AD-1·AD-3·AD-6 STRUCTURAL)

### Slice 6 [Wave 5] API Route — POST /api/chat SSE + Zod(AD-4) + cancel(AD-5a)

- **UC/TC:** TC-1.4~1.7, TC-2.2/2.7, TC-14.1~14.6, TC-16.1~16.4,
  TC-23.3/23.4, TC-24.2/24.3, TC-26.4/26.9/26.10
- **FR/AC:** FR-01/02, AC-1/9, NFR-9/R7, NFR-11/R2, AD-4, AD-5(a)
- **Files:** src/app/api/chat/route.ts(runtime nodejs·dynamic force-dynamic
  R7, Zod, AD-4 실패→400+{error} JSON·빈/공백 query→400 거부,
  conversationId 없으면 crypto.randomUUID, SSE thread→token→done/error,
  AD-5a 인코더 경계 이스케이프·cancel graph abort, mock 분기 0),
  tests/integration/route.test.ts(agent.createStream 모킹)
- **Done:** route 통합 green ; {query:123}→400+application/json ;
  공백 query→400 ; 정상→200+text/event-stream+첫 thread 이벤트 ;
  E2E_MOCK/MOCK_MODE grep 0 ; 1~2행 runtime+dynamic
- **Pre-review:** security (AD-5 a)

### Slice 7 [Wave 4] ChatMarkdown — rehype-raw→sanitize + 코드복사 (AD-5d)

- **UC/TC:** TC-4.1~4.10, TC-26.3
- **FR/AC:** FR-05, AC-6, NFR-5, AD-5(d)
- **Files:** src/components/common/ChatMarkdown.tsx(rehypePlugins:
  [rehypeRaw, rehypeSanitize] 순서 강제·코드복사·언어라벨),
  tests/unit/ChatMarkdown.test.tsx(jsdom+clipboard 모킹)
- **Done:** ChatMarkdown≥9 green ; `<script>` 입력 시 DOM script 0개 ;
  복사 클릭 시 코드 전체 writeText ; sanitize 인덱스 > raw 인덱스
- **Pre-review:** security (AD-5 d)

### Slice 8 [Wave 5] 채팅 UI 조립 — ChatInput/MessageList/ChatPanel/useChat/레이아웃

- **UC/TC:** TC-1.8, TC-3.5, TC-5.2/5.4, TC-20.2/20.4~20.6,
  TC-23.1/23.2/23.5, TC-24.5
- **FR/AC:** FR-03/04/06/07, AC-5/7/8(부분)
- **Files:** src/components/chat/{useChat.ts(finally 에서
  setStreaming(false)+finalizeLastAssistant() 필수),ChatPanel.tsx},
  src/components/common/BaseChat/{ChatInput,MessageList}.tsx,
  src/app/(main)/{layout.tsx,chat/page.tsx,chat/HeaderControls.tsx},
  src/app/page.tsx(/→/chat 확정), tests/unit/{useChat,ChatInput}.test.*
- **Done:** useChat/ChatInput 단위 green ; pnpm build exit 0 ;
  error 이벤트 시 setError+finally 입력 잠금 해제 ; 빈/공백 입력
  Enter→fetch spy 0 ; /→/chat 리다이렉트

### Slice 9 [Wave 6] 통합 검증 + 보안/품질 merge-ready 게이트 + E2E

- **UC/TC:** TC-1.1~3, TC-2.1/2.3~2.5, TC-6.1/7.1/8.1(토글 diff 0,
  filesystem soft toggle 포함 — AD-6-3), TC-22.1~22.5(연속 2회×인사/
  추론/도구 3턴), TC-26.1~26.12(보안/품질 게이트 전체)
- **FR/AC:** AC-1~11 최종, NFR-1~11, AD-5/6 전 게이트, R1~R8 회귀
- **Files:** tests/e2e/{chat,multiturn}.spec.ts, docs/notes/
  {ui-suggestions,merge-ready-report}.md
- **Done:** pnpm build exit 0 + eslint . 0 ; 키 grep 2종+NEXT_PUBLIC_
  grep 0 ; **토글 4종(planning/filesystem soft/tools/subagents) 각각
  agent.ts·route.ts diff 0줄** ; pnpm test:e2e 전 통과 ; AC-1~11
  체크리스트 merge-ready-report.md 기록
- **Pre-review:** security (AD-5/6 전 게이트 merge-ready 차단)

## 3. Wave 병렬화

| Wave | Slices | 비고 |
|------|--------|------|
| 1 | 1 | 스캐폴드+설치+잔여 U2~U5 실측. 후속 전부 의존(단독). BLOCKING 게이트 제거됨 |
| 2 | 2, 3 | 순수 함수. Files 교집합 0, 둘 다 Slice 1 만 의존 → **병렬** |
| 3 | 4 | 하네스 요소. Slice 5 가 import → 선행 |
| 4 | 5, 7 | 5(registry/agent)↔7(ChatMarkdown) Files 교집합 0, 논리 무관 → **병렬** |
| 5 | 6, 8 | 6(route)↔8(UI) Files 교집합 0, useChat 는 SSE 계약만 의존 → **병렬** |
| 6 | 9 | 통합·보안·E2E (단독, 전 슬라이스 의존) |

병렬 쌍(Wave 2/4/5) 각 Files 교집합 0 — exclusive file ownership 충족.
의존 순서: 1→{2,3}→4→{5,7}→{6,8}→9.

## 4. Acceptance criteria → 슬라이스

AC-1(S6,9) AC-2(S5,9) AC-3(S3,9) **AC-4(S5,9 — 토글 4종 diff 0,
filesystem soft 포함)** AC-5(S8,9) AC-6(S7) AC-7(S2,8,9) AC-8(S8,9)
AC-9(S1,4,9) AC-10(S2,3,5) AC-11(S9)

## 5. Risks

| 위험 | 영향 | 완화 |
|------|------|------|
| ~~미들웨어 비활성 불가~~ | 해소됨 | 실측+AD-6 soft toggle 승인 |
| @langchain/core 버전 갈림 | instanceof 깨짐(R1) | S1 pnpm why + S9 재검증(TC-26.8) |
| U2~U5 미실측 | streamMode/메타키 오동작 | S1 실 LLM probe → S3/S5 상수 반영(R8) |
| deepagents JS API drift | 시그니처 변동 | 전 시그니처 .d.ts 기준, 실측≠스펙 시 사용자 보고 |
| API 키 클라이언트 누출 | 보안 | model.ts 국한(AD-5c), NEXT_PUBLIC_ 금지, S9 grep 0 |
| SQLite ./.data/ | 영속/보안 | .gitignore, 경로 env 상수만(AD-5b), lazy(AD-2) |
| 동시 cold-start 레이스 | createDeepAgent 중복 | AD-3 Promise 메모이즈 + TC-21.2 |

## 6. 사전검토 플래그

| Slice | architect | security |
|-------|-----------|----------|
| 1 | ● | ● |
| 4 | — | ● (AD-5 b/c) |
| 5 | ● (AD-1/3/6) | — |
| 6 | — | ● (AD-5 a) |
| 7 | — | ● (AD-5 d) |
| 9 | — | ● (AD-5/6 게이트) |

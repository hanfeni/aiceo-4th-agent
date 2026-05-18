# Test Cases: DeepAgents JS 하네스 + 스트리밍 챗 에이전트

> Based on [PRD](../PRD.md) (1. DeepAgents JS 하네스 + 스트리밍 챗 에이전트, FR-01~12 / AC-1~11 / NFR-1~11 / AD-1~5) and [Use Cases](../use-cases/deepagents-chat-harness_use_cases.md) (UC-1~24, 124 시나리오 노드)
> 원본 스펙: [requirements.md](../../requirements.md) (검증 철학·함정 1~12), 코드 생성 하드 규칙: [CLAUDE.md](../../CLAUDE.md) (R1~R8)
> 작성일: 2026-05-18 KST · 상태: Draft · 유형: CREATE (기존 qa 파일 없음 — 신규 도메인)

---

## 문서 규약

- 본 문서는 use-case 문서의 **모든 시나리오 노드**(UC-N / UC-N-A·B·C / UC-N-E* / UC-N-EC*)를
  ≥1 개 테스트 케이스로 매핑한다. 매핑 컨벤션: `UC-1 → TC-1.1`, `UC-1-A → TC-1.2`,
  `UC-1-E1 → TC-1.x`, `UC-1-EC1 → TC-1.x` (한 UC 의 하위 노드는 TC-N.<순번> 으로 연속 부여).
- 산문은 한국어, 식별자·환경변수·이벤트명·패키지명·파일경로는 영어 원형을 유지한다.
- **type** 분류:
  - `unit` — vitest, LLM 호출 없음. 그래프/`@langchain` 의존은 `vi.mock` (import 경로와 정확히 동일). 순수 함수(registry/chunkFilter/sseStreamParser/store/systemPrompt)는 모킹 없이 검증 (AD-2, NFR-11).
  - `integration` — route handler / agent 싱글톤 / SSE 인코더 / HMR 싱글톤 검증. 그래프는 모킹(과금·비결정 회피). LLM 비호출.
  - `e2e` — Playwright, **실 LLM API** 호출(non-deterministic). requirements.md `[E2E 테스트 작성 규칙]` 강제: "정확히 N줄"/"특정 단어 포함" 어설션 금지, `retries: 1`, `reuseExistingServer: false`. 어설션은 (a) `/api/chat` 200 + `text/event-stream`, (b) 어시스턴트 버블 ≤15s visible, (c) 버블 innerText ≤60s non-empty, (d) 새 대화 → messages 0개 + `conversationId` 변경, (e) 2턴 멀티턴 smoke "비어있지 않음" 만 허용.
  - `manual-gate` — 사람이 수행하는 수동 검증 게이트(빌드/git diff/grep/security pre-review). merge-ready 게이트로 운영.
- **needs real LLM** 열: `Y` = 실 LLM API 호출 필요(e2e 한정, 과금/비결정), `N` = 모킹 또는 순수 함수.
- "연속 2회 이상" 검증 철학: stateful(멀티턴/checkpointer) e2e TC 는 2턴 플로우를 **최소 2회**,
  입력 유형을 섞어(인사 ≥1, 추론 ≥1, 도구 유발 ≥1) 반복한다 (requirements.md `[검증 철학]`, AC-2).
- 비결정 응답에 대한 어설션은 절대 "특정 토큰/줄 수/단어 포함"을 쓰지 않는다 — "visible / non-empty / 시간 내 도달 / id 변경 / status·content-type" 만 허용.

---

## 1. Primary — 첫 메시지 전송 → 토큰 스트리밍 응답 (UC-1)

> 연계 FR-01,03,04 / AC-1,5,11 / 함정 1·3 / AD-4

### 1.1 Happy path · 입력 트리거

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-1.1 | UC-1 | FR-01,03,04 / AC-1,5,11 | e2e | Y | `./run-dev.sh` 기동(3000), active provider key 유효, `/chat` 진입(`/`→`/chat` 리다이렉트), store 초기(messages=[], conversationId 미발급) | textarea 에 "안녕" 입력 → Enter(Shift 미동반) | `POST /api/chat` 200 + `Content-Type: text/event-stream`. user 버블 + 빈 assistant 버블 생성. 어시스턴트 버블 ≤15s visible, innerText ≤60s non-empty. 전송 종료 후 입력 잠금 해제(재입력 가능). `conversationId` 가 UUID 로 store 설정됨 |
| TC-1.2 | UC-1-A | FR-03 / AC-5 | e2e | Y | TC-1.1 전제 동일 | textarea 입력 후 **Send 버튼 클릭** | TC-1.1 과 동일 결과(트리거만 버튼) — 200+event-stream, 버블 ≤15s visible, innerText ≤60s non-empty |
| TC-1.3 | UC-1-B | FR-03 / AC-5 | e2e | Y | TC-1.1 전제 동일 | Shift+Enter 로 줄바꿈 삽입(전송 안 됨, textarea 에 개행 유지 확인) → 텍스트 추가 후 Enter 단독 | Shift+Enter 시점에 요청 미발생(네트워크 0건). Enter 단독 시 전송 → 버블 ≤15s visible, innerText ≤60s non-empty |
| TC-1.4 | UC-1-C | FR-01,02 / AC-1 | integration | N | route handler 로드, 그래프 stream 모킹(yield token chunk) | 기존 `conversationId` 포함 body `{ query, conversationId }` 로 `POST /api/chat` | 200+event-stream. 첫 SSE 이벤트가 `{ type:'thread', conversationId }` 이며 전달한 `conversationId` 와 **동일**(randomUUID 미발급). `graph.stream` 이 `configurable.thread_id === conversationId` 로 호출됨(spy 검증) |
| TC-1.5 | UC-1 (FR-01 계약) | FR-01 / AC-1 | integration | N | route handler 로드, 그래프 모킹 | conversationId 미포함 body `{ query:"안녕" }` POST | 200+event-stream. 첫 이벤트가 `{ type:'thread', conversationId }` 이고 `conversationId` 가 `crypto.randomUUID()` 형식(UUID v4 정규식). 이벤트 순서가 `thread`→`token`(반복)→`done` 임 |

### 1.2 Error flows

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-1.6 | UC-1-E1 | FR-01 / AC-9 | integration | N | route+agent 로드, 그래프 stream 모킹이 mid-stream 에 throw(rate limit/5xx 모사) | `POST /api/chat` 정상 body | SSE 로 `{ type:'error', message }` 이벤트 전송(message 에 에러 본문 그대로). 스트림이 좀비로 남지 않고 종료. 200 헤더 이후 발생이면 SSE error 이벤트, 헤더 전이면 TC-1.7 로 위임 |
| TC-1.7 | UC-1-E2 | FR-01 / AC-9 | integration | N | route 로드, agent 초기화(checkpointer 생성) 단계에서 throw 하도록 모킹 | `POST /api/chat` 정상 body | SSE 헤더 전 동기 예외 → 비-200 응답 또는 명확한 error 본문. 그래프 stream 미시작. 클라이언트가 에러 표시 가능한 페이로드 수신 |
| TC-1.8 | UC-1-E1 (클라이언트) | FR-01 / AC-9 | unit | N | `useChat` 훅 단위, fetch+SSE 파서 모킹하여 `error` 이벤트 주입 | `error` 이벤트 → done 없이 스트림 종료 시뮬레이션 | `setError(message)` 호출. `finally` 에서 `setStreaming(false)` + `finalizeLastAssistant()` 호출(입력 잠금 해제). 터미널 상태 아님(재전송 가능 상태) |

### 1.3 Edge cases

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-1.9 | UC-1-EC1 | FR-03 / AC-1 | — (위임) | — | — | 빈/공백 입력 후 Enter → **TC-23.x 로 위임** | 전송 차단(TC-23.1 참조) |
| TC-1.10 | UC-1-EC2 | FR-01 / 함정 1 | — (위임) | — | — | 첫 token 전 페이지 이탈 → **TC-14.x 로 위임** | ReadableStream.cancel(TC-14.1 참조) |
| TC-1.11 | UC-1-EC3 | NFR-1 / AC-5 | e2e | Y | cold start 상태(첫 요청, .next 캐시 삭제 후 첫 호출) | "안녕" 전송, 첫 청크 도달 시간 관찰 | 버블 ≤15s visible(커서만 보이는 구간 허용), innerText ≤60s non-empty. 첫 token 이 cold 15s 이내 도달(NFR-1) |

---

## 2. Primary — 멀티턴: 동일 대화에서 직전 발화 참조 (UC-2)

> 연계 FR-02 / AC-2 / 함정 2 / R3 / "연속 2회 이상" 검증 철학

### 2.1 Happy path

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-2.1 | UC-2 | FR-02 / AC-2,11 | e2e | Y | TC-1.1 1회 성공(conversationId 설정), checkpointer 주입됨 | 동일 conversationId 로 직전 발화 참조형 2턴 전송("방금 그거 다시 설명해줘") | 2턴 assistant 버블 ≤15s visible, innerText ≤60s non-empty. `conversationId` **변경 없음**. 2턴 응답이 비어있지 않음(맥락 기억 — non-deterministic 이므로 "비어있지 않음"만 어설션) |
| TC-2.2 | UC-2 (수동 history 미전송 계약) | FR-02 / R3 | integration | N | route+agent 로드, 그래프 stream spy | 2턴 body `{ query, conversationId }` POST | route/agent 가 client 로부터 `conversationHistory`/누적 messages 를 받지 않으며 그래프에 수동으로 history 를 쌓아 보내지 않음(input messages 가 현재 turn query 만 포함). `configurable.thread_id` 전달됨 |

### 2.2 Alternative flows ("연속 2회 이상" + 입력 유형 다양화)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-2.3 | UC-2-A | FR-02,09 / AC-2,3 | e2e | Y | TC-2.1 전제 | 1턴 일반 인사 → 2턴 **추론 필요 입력**("17 x 24 답만 한 줄로") 동일 conversationId | 2턴 응답 ≤60s non-empty + 직전 맥락 참조(비어있지 않음). 동시에 thinking/reasoning 텍스트 본문 노출 0(TC-18.x 연계 어설션 — 화면 텍스트에 사고 흔적 어설션 불가하므로 chunkFilter 단위 TC-18.7~로 보강) |
| TC-2.4 | UC-2-B | FR-02,09 / AC-2,3 | e2e | Y | subagent/tool 활성 환경(HARNESS_SUBAGENTS=true 또는 example tool 등록) | 1턴 일반 → 2턴 **도구/filesystem 유발 입력** 동일 conversationId | 2턴 응답 ≤60s non-empty, 직전 맥락 유지(비어있지 않음). 도구/subagent 내부 출력이 본문에 섞이지 않음(TC-19.x 연계) |
| TC-2.5 | UC-2-C | FR-02 / AC-2 | e2e | Y | TC-2.1 전제 | 동일 conversationId 로 **3턴 연속**(인사 → 추론 → 도구 유발), 그리고 전체 흐름을 **2회 반복**(검증 철학 "연속 2회 이상") | 매 턴 응답 ≤60s non-empty, conversationId 불변. 2회 반복 모두 통과. **UC-22(TC-22.x) 와 합류** |

### 2.3 Error flows

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-2.6 | UC-2-E1 | FR-02 / 함정 2 | — (위임) | — | checkpointer 미주입/thread_id 미전달 결함 가정 | **TC-15.x 로 위임** | 멀티턴 소실 회귀 FAIL(TC-15.1 참조) |
| TC-2.7 | UC-2-E2 | FR-02 / AC-9 | integration | N | 그래프 모킹: 2턴 호출에서 throw | 1턴 정상 후 2턴 호출 시 LLM 에러 모사 | 2턴이 SSE `error` 이벤트로 보고. 1턴 상태는 checkpointer 에 보존(thread 키 유지 — spy 로 1턴 save 확인) |

### 2.4 Edge cases

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-2.8 | UC-2-EC1 | FR-02 / NFR-7 | integration | N | SqliteSaver 백엔드, 그래프 모킹으로 save/load 경유 | 1턴 save → 시간 경과 시뮬레이션 → 동일 thread_id 2턴 load | checkpointer 가 동일 thread_id 의 1턴 상태를 load(SQLite 영속). MemorySaver 였다면 재시작 시 증발(TC-11.x 대비 참조) |
| TC-2.9 | UC-2-EC2 | FR-02 / AC-2 | e2e | Y | 두 개의 서로 다른 conversationId | conversationId A·B 를 번갈아 각 2턴 전송 | 각 thread_id 가 독립 히스토리 유지, 교차 오염 없음(각 대화 응답이 자기 맥락만 — 비어있지 않음 + conversationId 별 분리 확인) |
| TC-2.10 | UC-2-EC3 | FR-02,06 / AC-7 | e2e | Y | 새 대화(TC-3.1) 직후 | 새 thread_id 상태에서 2턴 시도 | 새 thread_id 라 이전 대화 맥락 비참조(정상 분리). messages 0개에서 시작, conversationId 가 이전과 다름 |

---

## 3. Primary — 새 대화 버튼 → 새 thread_id + 스토어 리셋 (UC-3)

> 연계 FR-06 / AC-7 / AC-11

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-3.1 | UC-3 | FR-06 / AC-7,11 | e2e | Y | 기존 대화 진행(messages≥1, conversationId 설정) | HeaderControls "새 대화" 버튼 클릭 | `messages.length === 0`(MessageList 빈 상태 렌더), `conversationId` 가 이전과 **다른 값**으로 변경. provider/model 헤더 표시는 유지 |
| TC-3.2 | UC-3 (스토어 단위) | FR-06 / AC-7 | unit | N | store 단위, 초기 상태 + 메시지 주입 | `resetChat()` 액션 직접 호출 | 새 `conversationId` 발급(이전과 다름), `messages=[]`, `error=null`, `isStreaming=false`. provider/model 표시값 불변 |
| TC-3.3 | UC-3-A | FR-06 / AC-7 | e2e | Y | `isStreaming=true` 상태(스트리밍 도중) | 스트리밍 중 "새 대화" 클릭 | 메시지 0개 + conversationId 변경(스펙 명시 어설션만). `isStreaming=false` 로 리셋, 입력 잠금 해제. 진행 스트림은 정리/무시 |
| TC-3.4 | UC-3-B | FR-06 / AC-7 | unit | N | store, messages 이미 0개 | `resetChat()` 호출 | 멱등 안전: 새 conversationId 발급(이전과 다름), messages 0개 유지 |
| TC-3.5 | UC-3-E1 | FR-06 | unit | N | `useChat`/store 단위, 이전 스트림 잔여 token 이벤트를 resetChat 이후 주입 | resetChat → 직후 이전 thread 잔여 token 도착 시뮬레이션 | 잔여 token 이 새 빈 assistant 에 섞이지 않음(메시지 0개 유지 또는 새 전송분만 채워짐 — race 가드) |
| TC-3.6 | UC-3-EC1 | FR-06 / AC-7 | unit | N | store 단위 | `resetChat()` 빠르게 연속 2회 호출 | 매 호출마다 새 conversationId(직전과 다름), messages 0개 유지 |
| TC-3.7 | UC-3-EC2 | FR-06 / AC-7 | e2e | Y | TC-3.1 후 | 새 대화 후 이전과 동일 질문 재전송 | 이전 thread 와 분리된 새 답변(맥락 비공유). 응답 ≤60s non-empty, conversationId 이전과 다름 |

---

## 4. Primary — 마크다운 렌더링 (코드 복사 + rehype-sanitize XSS) (UC-4)

> 연계 FR-05 / AC-6 / NFR-5 / AD-5(d)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-4.1 | UC-4 | FR-05 / AC-6 | unit | N | `ChatMarkdown` 컴포넌트(@testing-library/react + jsdom), 고정 마크다운 문자열 주입(코드펜스+표+목록) | 컴포넌트 렌더 | GFM 표/목록/코드펜스 DOM 렌더. 코드 블록에 언어 라벨 + 복사 버튼 존재 |
| TC-4.2 | UC-4 (복사 동작) | FR-05 / AC-6 | unit | N | TC-4.1 렌더 + clipboard 모킹 | 복사 버튼 click | `navigator.clipboard.writeText` 가 코드 블록 **전체 내용**으로 호출됨 |
| TC-4.3 | UC-4-A | FR-05 / AC-6 | unit | N | ChatMarkdown, **미완성 코드펜스** 부분 마크다운 문자열(스트리밍 중 모사) | 부분 → 완성 순으로 rerender | 부분 마크다운에서도 크래시 없이 렌더. 완성 시 최종 정합. 부분 재렌더가 sanitize 우회 불가(AD-5d) |
| TC-4.4 | UC-4-B | FR-05 / AC-6 | unit | N | ChatMarkdown, 언어 미지정 코드펜스 | 렌더 + 복사 클릭 | 언어 라벨 없이도 복사 버튼 동작(clipboard 호출됨) |
| TC-4.5 | UC-4-E1 | FR-05 / AC-6 / NFR-5 | unit | N | ChatMarkdown, `<script>alert(1)</script>` / `<img src=x onerror=alert(1)>` 포함 문자열 | 렌더 | rehype-raw→rehype-sanitize 체인이 위험 노드 제거. 렌더 DOM 에 `<script>` 요소 0개, `onerror`/`onload` 등 이벤트 핸들러 속성 0개. 스크립트 미실행 |
| TC-4.6 | UC-4-E2 | FR-05 | unit | N | ChatMarkdown, 닫히지 않은 펜스/깨진 표 문자열 | 렌더 | 앱 크래시 없음(throw 없이 best-effort 렌더) |
| TC-4.7 | UC-4-EC1 | FR-05 / AC-6 | unit | N | ChatMarkdown, 매우 큰 코드 블록 | 복사 클릭 | clipboard writeText 인자가 코드 블록 전체(절단 없음) |
| TC-4.8 | UC-4-EC2 | FR-05 | unit | N | ChatMarkdown, 마크다운 특수문자만(`***`, 백틱 등) | 렌더 | 크래시 없이 렌더 |
| TC-4.9 | UC-4-EC3 | FR-05,09 | unit | N | chunkFilter 통과분만 ChatMarkdown 도달 가정 | thinking 잔재 포함 입력을 chunkFilter→ChatMarkdown 파이프 시뮬레이션 | thinking 잔재는 chunkFilter(TC-18.x)에서 제거되어 ChatMarkdown 입력에 미도달(연계 가드 — ChatMarkdown 단독으로는 통과분만 받음) |
| TC-4.10 | UC-4-E1 (보안 게이트) | FR-05 / NFR-5 / AD-5(d) | manual-gate | N | 코드 리뷰 — `ChatMarkdown.tsx` | rehype 플러그인 배열 순서 확인 | `rehypePlugins` 가 **rehype-raw → rehype-sanitize 순서**(sanitize 가 raw 뒤). 스트리밍 부분 마크다운 재렌더에서도 sanitize 우회 경로 없음. (AD-5 security pre-review) |

---

## 5. Primary — 헤더에 active provider/model 표시 (UC-5)

> 연계 FR-07 / AC-8 / NFR-4

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-5.1 | UC-5 | FR-07 / AC-8 | e2e | N | 서버 `LLM_PROVIDER`/`LLM_MODEL` 설정, `/chat` 로드 | 페이지 로드, 헤더 관찰 | 헤더에 active provider/model **식별자** 표시. API 키 문자열 어떤 형태로도 DOM 미노출 |
| TC-5.2 | UC-5 (서버 유래) | FR-07 / AC-8 | unit | N | HeaderControls 가 받는 props/서버 주입값 단위 | provider/model 표시값 소스 검증 | 표시값이 서버 환경변수(`LLM_PROVIDER`/`LLM_MODEL`)에서만 유래, 키 미포함 |
| TC-5.3 | UC-5-A | FR-07,10 / AC-8,9 | e2e | N | provider=openai 로 전환(TC-9.x 후) | 헤더 표시 갱신 확인 | 헤더가 `openai`/`<model>` 로 갱신(UC-9 연계) |
| TC-5.4 | UC-5-E1 | FR-07 / R8 | unit | N | `LLM_MODEL` 미설정 환경 | model.ts/registry 의 provider 선택 + HeaderControls 표시값 결정 | 모델 ID 하드코딩 없음(R8). 명확한 에러 또는 명시적 빈 표시(무음 임의값 금지). UC-13 연계 |
| TC-5.5 | UC-5-EC1 / AC-8 / NFR-4 | FR-07 / NFR-4 | manual-gate | N | `pnpm build` 완료 | `.next/static/` 키 누출 grep | `grep -rlE "ANTHROPIC_API_KEY\|OPENAI_API_KEY" .next/static/` → **0 matches**, `grep -rE "sk-(ant-)?[A-Za-z0-9_-]{20,}" .next/static/` → **0 matches**, `NEXT_PUBLIC_` 접두사 키 0건. (merge-ready 게이트) |

---

## 6. Alternative — 하네스 토글: planning off (diff 0) (UC-6)

> 연계 FR-08,11 / AC-4 / NFR-6 / R2 / 함정 6 / AD-1 (토글 로직은 buildAgentOptions.ts·registry.ts, **agent.ts 아님**)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-6.1 | UC-6 | FR-08,11 / AC-4 / NFR-6 | manual-gate | Y(채팅 스모크) | 기능 정상(TC-1.1 통과), `HARNESS_PLANNING=true` 기본, git clean | `HARNESS_PLANNING=false` 설정 → 포트정리+`.next` 삭제 후 재기동 → `pnpm build` + `eslint .` → "안녕" 채팅 스모크 → `git diff --stat -- src/lib/agent/agent.ts src/app/api/chat/route.ts` | build/lint 에러 0. 기본 채팅 정상(버블 non-empty). **`git diff` 가 agent.ts·route.ts 각각 0 줄**(NFR-6/AC-4 실질 강제 — 토글이 registry/buildAgentOptions 에서만 발생) |
| TC-6.2 | UC-6 (registry 순수 단위) | FR-08,11 / AC-4,10 / AD-2 | unit | N | `buildHarnessConfig` import, env stub `{ HARNESS_PLANNING:'false' }` | `buildHarnessConfig(env)` 호출 | 반환 `HarnessConfig.planning.enabled === false`. **호출 후 `./.data/` 디렉토리 미생성**(AD-2 lazy checkpointer — fs side effect 0). 순수 함수로 LLM/fs 미접촉 검증 |
| TC-6.3 | UC-6 (buildAgentOptions 매핑) | FR-08,11 / AD-1 | unit | N | `buildAgentOptions(config, model, systemPrompt)` import, `planning.enabled=false` config | `buildAgentOptions` 호출, 반환 객체 검사 | planning off 시 createDeepAgent 옵션 객체에서 planning/write_todos 관련 키가 **생략/비활성** 매핑(분기 로직이 buildAgentOptions 내부에 격리됨 — agent.ts 아님, AD-1) |
| TC-6.4 | UC-6-A | FR-02,11 / AC-2 | e2e | Y | TC-6.1 적용(planning off) 후 | 동일 conversationId 2턴 멀티턴 | planning 없이도 멀티턴 정상(checkpointer 독립) — 2턴 응답 ≤60s non-empty, conversationId 불변 |
| TC-6.5 | UC-6-B | FR-08,11 / NFR-6 | manual-gate | Y(스모크) | TC-6.1 후 | `HARNESS_PLANNING=true` 로 되돌려 재기동 → 채팅 스모크 + git diff | 채팅 정상, agent.ts·route.ts diff 0(토글 왕복 회귀 0) |
| TC-6.6 | UC-6-E1 | FR-08 / NFR-6 / R2 | manual-gate | N | TC-6.1 의 git diff 결과 | agent.ts/route.ts 변경 라인 검사 | agent.ts 에 `if(planningEnabled)` 류 분기 흩뿌림 발견 시 **FAIL**(아키텍처 위반 차단, 함정 6). diff > 0 줄이면 FAIL |
| TC-6.7 | UC-6-EC1 | FR-08,11 | unit | N | `buildHarnessConfig`, `HARNESS_PLANNING` 미설정(undefined) | 호출 | 기본값 `planning.enabled === true` 적용(채팅 정상 전제) |
| TC-6.8 | UC-6-EC2 | FR-08,11 | unit | N | `buildHarnessConfig`, `HARNESS_PLANNING` 변형값(`'False'`,`'0'`,`'FALSE'`,`' false '`) | 각 변형값으로 호출 | 레지스트리 파싱 규칙대로 **일관 처리**(정의된 truthy/falsy 규칙 — 동일 변형은 동일 결과). 계약 명세된 규칙과 일치 |

---

## 7. Alternative — 하네스 토글: tools [] (diff 0) (UC-7)

> 연계 FR-08 / AC-4 / NFR-6 / R2

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-7.1 | UC-7 | FR-08 / AC-4 / NFR-6 | manual-gate | Y(스모크) | example tool 1개 등록 상태, git clean | `tools/index.ts` 배열 `[]` 로 변경 → 캐시삭제+재기동 → build+lint → 채팅 스모크 → git diff agent.ts·route.ts | build/lint 0, 도구 없는 순수 챗 정상(버블 non-empty), agent.ts·route.ts diff **0 줄** |
| TC-7.2 | UC-7 (registry 단위) | FR-08 / AC-4,10 / AD-2 | unit | N | `buildHarnessConfig`, tools 미등록 env | 호출 | `HarnessConfig.tools` 가 빈 배열(빈 배열 허용 계약). fs side effect 0(AD-2) |
| TC-7.3 | UC-7-A | FR-02,08 / AC-2 | e2e | Y | TC-7.1 적용(tools []) 후 | 동일 conversationId 2턴 | 도구 없이도 checkpointer 멀티턴 정상(UC-2 합류) — 2턴 non-empty, conversationId 불변 |
| TC-7.4 | UC-7-E1 | FR-08 / NFR-6 / R2 | manual-gate | N | TC-7.1 git diff | agent.ts 검사 | tools [] 토글 위해 agent.ts 수정 필요 시 FAIL(R2, UC-6-E1 동형 가드) |
| TC-7.5 | UC-7-EC1 | FR-08 | e2e | Y | TC-7.1 적용(tools 0개) | 도구 유발 의도 입력 전송 | 등록 도구 0개 → 모델이 도구 없이 일반 답변(도구 미존재로 크래시 0). 버블 non-empty |

---

## 8. Alternative — 하네스 토글: subagents [] (diff 0) (UC-8)

> 연계 FR-08,12 / AC-4 / NFR-6 / R2

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-8.1 | UC-8 | FR-08,12 / AC-4 / NFR-6 | manual-gate | Y(스모크) | subagents/index.ts SubagentSpec[] export, git clean | subagents 배열 `[]`(또는 `HARNESS_SUBAGENTS=false`) → 재기동 → build+lint → 채팅 스모크 → git diff | build/lint 0, 단일 에이전트 채팅 정상(버블 non-empty), agent.ts·route.ts diff **0 줄** |
| TC-8.2 | UC-8 (registry 단위) | FR-08,12 / AC-4,10 | unit | N | `buildHarnessConfig`, subagents 미등록/`HARNESS_SUBAGENTS=false` | 호출 | `HarnessConfig.subagents` 빈 배열. fs side effect 0(AD-2) |
| TC-8.3 | UC-8-A | FR-12 | manual-gate | Y(스모크) | subagents [] + `HARNESS_FILESYSTEM=true` | 재기동 + 채팅 스모크 | 파일 도구는 살아있고 subagent 만 없음(독립 토글) — 채팅 정상 |
| TC-8.4 | UC-8-E1 | FR-08 / NFR-6 / R2 | manual-gate | N | TC-8.1 git diff | route.ts 검사 | subagents [] 토글 위해 route.ts 수정 필요 시 FAIL(R2 가드) |
| TC-8.5 | UC-8-EC1 | FR-09,12 | e2e | Y | subagents [] 상태 | 임의 입력 전송 | 서브에이전트 누출(UC-19) 발생 불가(단일 에이전트 — 메인 답변만 스트림). 버블 non-empty |

---

## 9. Alternative — LLM 프로바이더 스위칭 anthropic↔openai (UC-9)

> 연계 FR-10 / AC-9 / 환경 사전 점검 1·2 / 함정 4

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-9.1 | UC-9 | FR-10 / AC-9 | manual-gate | Y(스모크) | 전환 대상 provider key 유효, git clean | `LLM_PROVIDER` anthropic→openai(또는 반대) + `LLM_MODEL` 만 교체 → 재기동 → 1토큰 실증 호출 → 채팅 스모크 → git diff(전 소스) | 코드 변경 0(환경변수만), 채팅 정상(버블 non-empty), 헤더 provider/model 갱신. 모델 유효성은 1토큰 실증으로 판단(학습 지식 blocking 금지) |
| TC-9.2 | UC-9 (model.ts 단위) | FR-10 / AC-9,10 | unit | N | `model.ts` import, env stub provider 각각 | provider=anthropic/openai 로 model factory 호출(ChatAnthropic/ChatOpenAI 생성자 모킹) | provider 별 올바른 ChatModel 클래스 선택, `LLM_MODEL` 주입(하드코딩 없음). streaming/thinking 설정 차이가 model.ts 내부에 흡수됨 |
| TC-9.3 | UC-9-A | FR-10 / AC-9 | unit | N | `model.ts`/registry, `LLM_PROVIDER` 미설정 | 호출 | 기본값 `anthropic` 적용(미지정 = 정상 기본, "잘못된 값" 아님). UC-17-A 와 동형 |
| TC-9.4 | UC-9-B | FR-02,10 / AC-2 | e2e | Y | TC-9.1 전환 후 | 새 provider 로 동일 conversationId 2턴 | 새 provider 로 멀티턴 정상(checkpointer provider 독립) — 2턴 non-empty, conversationId 불변 |
| TC-9.5 | UC-9-E1 | 환경 사전 점검 1 / NFR-4 | — (위임) | — | 전환 대상 provider key 누락 | **TC-12.x 로 위임** | hard stop(TC-12.1 참조) |
| TC-9.6 | UC-9-E2 | AC-9 | — (위임) | — | 모델 ID 해당 provider 에 없음 | **TC-13.x 로 위임** | model not found 보고(TC-13.1 참조) |
| TC-9.7 | UC-9-E3 | AC-4 / FR-10 | — (위임) | — | 잘못된 LLM_PROVIDER | **TC-17.x 로 위임** | 명확한 에러(TC-17.1 참조) |
| TC-9.8 | UC-9-EC1 | FR-10 / 환경 사전 점검 2 | unit | N | `model.ts`, GPT-5 계열 provider=openai | model 호출 옵션 검사 | model.ts 가 `max_completion_tokens` vs `max_tokens` 같은 provider 차이를 흡수(GPT-5 계열은 max_completion_tokens) |
| TC-9.9 | UC-9-EC2 | FR-02,10 / AC-2 | e2e | Y | 기존 thread_id 보유 + provider 전환 직후 | 전환 후 기존 conversationId 로 멀티턴 | checkpointer 상태 보존, provider 바뀌어도 그래프 상태 호환(직전 발화 기억 — 비어있지 않음) |

---

## 10. Alternative — 새 하네스 도구 추가 (UC-10)

> 연계 FR-08 / H4 / R1 / NFR-3

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-10.1 | UC-10 | FR-08 / H4 / AC-4 | manual-gate | Y(스모크) | tools/ 슬롯 + tools/index.ts 등록 지점 존재, git clean | `harness/tools/<newTool>.ts` 파일 1개 작성 + `tools/index.ts` 1줄 등록 → 재기동 → build+lint → 도구 유발 입력 스모크 → git diff(변경 파일 목록) | 변경 파일 = 도구 모듈 1개 + 레지스트리 1줄 **그 외 0**(agent.ts/route.ts/registry.ts 본문 diff 0). build/lint 0, 도구 호출 동작, 도구 출력 본문 미혼입(TC-19 연계) |
| TC-10.2 | UC-10 (registry 단위) | FR-08 / AC-10 | unit | N | `buildHarnessConfig` + 등록된 새 tool stub | 호출 | `HarnessConfig.tools` 에 새 도구 합성(배열 length +1). fs side effect 0(AD-2) |
| TC-10.3 | UC-10-A | FR-08 / H4 | manual-gate | N | 외부 의존 도구(웹검색/코드실행) | README 등록 절차 확인 | 초기 범위 미등록(과금/외부 의존 회피), 슬롯만 마련. README 에 등록 절차 명시 존재 |
| TC-10.4 | UC-10-B | FR-08 / H4 | manual-gate | Y(스모크) | TC-10.1 후 | 등록 1줄 제거 → 재기동 → 채팅 스모크 + git diff | 그 외 파일 변경 0, 채팅 정상(UC-7 동형 — 도구 제거 안전) |
| TC-10.5 | UC-10-E1 | FR-08 / R2 / 함정 6 | manual-gate | N | TC-10.1 git diff | agent.ts 검사 | 도구 추가 위해 agent.ts 수정 필요 시 FAIL(설계 실패 가드) |
| TC-10.6 | UC-10-E2 | R1 / NFR-10 | unit | N | 새 도구 schema 단위 | 도구 schema 의 zod 메이저 검증 | 도구 schema 가 deepagents 와 동일 zod 메이저(^4). 메이저 불일치 시 FAIL(R1) |
| TC-10.7 | UC-10-EC1 | NFR-3 | manual-gate | N | 도구 모듈 파일 검사 | "도구 1개 = 파일 1개" 원칙 검사 | 한 파일에 도구 여러 개 정의 시 NFR-3 위반으로 거부 |

---

## 11. Alternative — filesystem off / checkpointer memory (UC-11)

> 연계 FR-12 / NFR-7,8 / 함정 12

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-11.1 | UC-11 | FR-12 / NFR-6 | manual-gate | Y(스모크) | 기능 정상, git clean | `HARNESS_FILESYSTEM=false` → 재기동 → 채팅 스모크 → git diff | 파일 도구 미주입, 기본 채팅 정상(버블 non-empty), agent.ts·route.ts diff 0 |
| TC-11.2 | UC-11 (memory 멀티턴) | FR-02,12 / NFR-7 | integration | N | `HARNESS_CHECKPOINTER=memory`, 그래프 모킹 + MemorySaver 실인스턴스 | 동일 프로세스 내 동일 thread_id 2턴 | memory 백엔드에서도 동일 프로세스 내 멀티턴 동작(1턴 save→2턴 load 확인) |
| TC-11.3 | UC-11 (checkpointer 단위) | FR-12 / AC-10 / AD-2 | unit | N | `checkpointer.ts` 팩토리 + `buildHarnessConfig` | `HARNESS_CHECKPOINTER=sqlite`/`memory` 각각 분기 호출 | 올바른 saver 타입 반환(분기). **factory/buildHarnessConfig 호출만으로 `./.data/` 미생성**(AD-2 lazy — 최초 사용 시점까지 지연). 순수 함수 검증 |
| TC-11.4 | UC-11-A | FR-02 / NFR-7,8 | integration | N | `HARNESS_CHECKPOINTER=sqlite`(기본), `CHECKPOINTER_SQLITE_PATH=./.data/checkpoints.sqlite` | 1턴 실행(saver 최초 사용) → 프로세스 재시작 시뮬레이션 → 동일 thread_id 재load | `.data/` 디렉토리 **최초 사용 시점에** 자동 생성. 재시작 후에도 히스토리 보존(SQLite 영속) |
| TC-11.5 | UC-11-E1 | NFR-7 / 함정 12 | integration | N | `HARNESS_CHECKPOINTER=memory` | 1턴 save → 프로세스 재시작 시뮬레이션 → 2턴 load 시도 | memory 백엔드: 재시작 후 히스토리 증발(의도된 한계). 기본은 SQLite 여야 함을 회귀로 명시 |
| TC-11.6 | UC-11-E2 | NFR-7 / PRD 1.7 | integration | N | `CHECKPOINTER_SQLITE_PATH` 디렉토리 미존재 상태 | saver 최초 사용 | `checkpointer.ts` 가 `.data/` 디렉토리 생성 보장(미보장 시 에러 → FAIL 가드) |
| TC-11.7 | UC-11-EC1 | FR-12 | e2e | Y | `HARNESS_FILESYSTEM=false` + subagents 활성 | 채팅 전송 | subagent 가 파일 도구 부재 환경에서 크래시 없이 가능 범위 응답(버블 non-empty) |
| TC-11.8 | UC-11-EC2 | NFR-8 | manual-gate | N | `.gitignore` 검사 | `git check-ignore ./.data/checkpoints.sqlite` 및 .gitignore 내용 | `./.data/` 가 `.gitignore` 에 등록됨(SQLite 파일 형상관리 미오염). 누락 시 FAIL |

---

## 12. Error — active 프로바이더 API 키 누락/무효 (UC-12)

> 연계 환경 사전 점검 1 / NFR-4 / AD-5(c)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-12.1 | UC-12 | 환경 사전 점검 1 | manual-gate | N | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` 미설정 | precheck 스크립트/`run-dev.sh` 실행 | active provider key 부재 → **즉시 hard stop** + 사용자에게 키 요청 메시지. 임의 대체(다른 provider 우회) 0건. LLM 미호출 |
| TC-12.2 | UC-12 (모델 키 국한 — 보안) | NFR-4 / AD-5(c) | manual-gate | N | 코드 리뷰 — `harness/model.ts` | API 키 사용 위치 grep | API 키 참조가 `model.ts` 한 곳에만 국한(다른 파일에서 키 직접 접근 0). 응답 객체에 키 비직렬화. (AD-5 security pre-review) |
| TC-12.3 | UC-12-A | 환경 사전 점검 1 | manual-gate | N | active=anthropic 인데 `OPENAI_API_KEY` 만 존재 | precheck 실행 | active(anthropic) 키 부재로 hard stop. 비활성(openai) 키로 우회 안 함 |
| TC-12.4 | UC-12-B | AC-9 | integration | N | 그래프 모킹: LLM 호출이 401/403 throw(키 만료/취소 모사) | `POST /api/chat` 전송 | `{ type:'error', message:<에러 본문 그대로> }` SSE 보고(UC-1-E1 합류) |
| TC-12.5 | UC-12-E1 | AC-9 | integration | N | 그래프 모킹: 키 형식 불량으로 인증 실패 throw | 전송 | error 본문 그대로 SSE 보고(가공/은폐 없음) |
| TC-12.6 | UC-12-EC1 | NFR-4 | manual-gate | N | env 파일/소스 grep | `NEXT_PUBLIC_(ANTHROPIC\|OPENAI)_API_KEY` 패턴 검색 | `NEXT_PUBLIC_` 접두사 키 0건(클라이언트 번들 누출 위험 차단). 발견 시 FAIL |

---

## 13. Error — 모델 not found (LLM_MODEL/LLM_PROVIDER 불일치) (UC-13)

> 연계 AC-9 / 환경 사전 점검 2 / R8

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-13.1 | UC-13 | AC-9 / 환경 사전 점검 2 / R8 | manual-gate | Y(1토큰 실증) | active key 유효, `LLM_MODEL` 가 해당 provider 에 부재 | 1토큰 실증 호출(소액 과금) | API "model not found" 류 에러 → "[모델 검증 실패] API 응답: <에러 본문 그대로>. 계속하려면 모델 ID 확인 필요" 보고. **학습 지식 컷오프로 blocking 금지**, 임의 모델 대체 0건, 사용자 결정 대기 |
| TC-13.2 | UC-13-A | AC-9 | integration | N | precheck 통과 후 런타임 환경변수 변경으로 모델 불일치, 그래프 모킹 throw(model not found) | `POST /api/chat` 전송 | `{ type:'error', message:<API 에러 본문 그대로> }` SSE 보고(AC-9) |
| TC-13.3 | UC-13-E1 | 환경 사전 점검 2 / FR-10 | unit | N | `model.ts`, GPT-5 계열 provider | model 옵션 검사 | model.ts 가 `max_completion_tokens` 사용(`max_tokens` 아님). 잘못된 파라미터 에러도 본문 그대로 보고하도록 흡수 |
| TC-13.4 | UC-13-EC1 | R8 / 검증 철학 | manual-gate | Y(1토큰 실증) | `LLM_MODEL` 가 학습 컷오프 이후 신모델 | 1토큰 실증 호출 | 학습 지식으로 "없음" 단정 금지. 실증 호출 성공 시 그대로 진행(blocking 금지 — 검증 철학) |

---

## 14. Error — 클라이언트 mid-stream disconnect (UC-14)

> 연계 FR-01 / 함정 1 / AD-5(a)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-14.1 | UC-14 | FR-01 / 함정 1 | integration | N | route handler 로드, 그래프 stream 모킹(무한/장기 yield), 그래프 stream abort spy | SSE 스트리밍 중 client 연결 종료 → `ReadableStream.cancel()` 트리거 | cancel 핸들러 호출됨. 진행 중 `graph.stream()` 이 **실제 중단**(abort/구독 해제 spy 검증, AD-5a). 추가 token yield 중단, 핸들 누수 0 |
| TC-14.2 | UC-14-A | FR-01,02 | integration | N | TC-14.1 후 동일 conversationId 재전송, 그래프 모킹 | disconnect → 동일 conversationId 새 요청 | 새 그래프 재스트림. checkpointer 가 thread_id 의 마지막 일관 상태에서 이어감(부분 상태 정합) |
| TC-14.3 | UC-14-E1 | FR-01 | manual-gate | N | 코드 리뷰 — `route.ts` SSE 인코더 | cancel 핸들러 구현 여부 검사 | `ReadableStream` 에 `cancel()` 핸들러 구현 존재 + 그래프 stream 정리 로직 연결. 미구현 시 FR-01 위반 FAIL. (AD-5 security pre-review) |
| TC-14.4 | UC-14-EC1 | FR-01 | integration | N | 그래프 모킹, thread 이벤트 직후~첫 token 전 cancel | 그 시점에 cancel 트리거 | 그래프 시작 직후 정리(abort 호출), 추가 이벤트 없음 |
| TC-14.5 | UC-14-EC2 | FR-01 | integration | N | 그래프 모킹, done 직전 cancel | done 직전 cancel 트리거 | 거의 완료 상태에서 정리(부분 응답 폐기), 핸들 누수 0 |
| TC-14.6 | UC-14 (SSE 인코더 보안) | FR-01 / AD-5(a) | manual-gate | N | 코드 리뷰 — `route.ts` SSE 인코더 | error 본문 개행/`event:` 경계 이스케이프 검사 | error 메시지 내 개행/`\n\n`/`event:`/`data:` 경계 문자가 SSE 프레임을 깨거나 주입하지 못하도록 이스케이프/인코딩. (AD-5 security pre-review) |

---

## 15. Error — checkpointer 미주입 → 멀티턴 소실 (회귀 가드) (UC-15)

> 연계 FR-02 / 함정 2 / R3 / AC-2

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-15.1 | UC-15 | FR-02 / 함정 2 / AC-2 | unit | N | agent 단위, `createDeepAgent`/그래프 모킹, spy on createDeepAgent 옵션 | agent 빌드 → 옵션 검사 | `createDeepAgent` 옵션에 `checkpointer` 가 **반드시 주입**됨(spy 로 truthy 확인). 미주입이면 회귀 **FAIL**(멀티턴 무상태 퇴화 차단) |
| TC-15.2 | UC-15-A | FR-02 / R3 | unit | N | agent 단위, 그래프 stream spy | `createStream({query, conversationId})` 호출 | `graph.stream` 이 `{ configurable: { thread_id: conversationId } }` 로 호출됨(spy). thread_id 누락 시 FAIL(R3) |
| TC-15.3 | UC-15-B | FR-02 / R3 | unit | N | agent 단위, 그래프 input spy | createStream 호출 시 그래프 input 검사 | 그래프 input messages 에 **수동 conversationHistory 누적이 없음**(현재 turn query 만). 수동 누적 발견 시 안티패턴 FAIL(중복 누적/컨텍스트 오염 차단, R3) |
| TC-15.4 | UC-15-E1 | FR-02 / NFR-11 | unit | N | agent 단위, deepagents/@langchain 그래프 모킹 | 모킹으로 checkpointer 주입 + thread_id 전달 동시 검증 | 단위 테스트가 LLM 미호출(과금 0)로 checkpointer 주입 + thread_id 전달 둘 다 어설션 |
| TC-15.5 | UC-15-EC1 | FR-02 / 검증 철학 | e2e | Y | 정상 구현 | 1턴만 전송(2턴 미검증 시나리오 의도 노출) | 1턴은 무상태라도 통과 → 반드시 TC-2.x/TC-22.x 의 2턴 검증으로 결함 드러냄("한 번 성공은 보장 아님" 회귀 정책 명시) |

---

## 16. Error — 잘못된 요청 본문 (Zod 검증 실패) (UC-16)

> 연계 FR-01 / AC-1 / AD-4 (Zod 실패 = HTTP 400 + {error} JSON, SSE 아님)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-16.1 | UC-16 | FR-01 / AC-1 / AD-4 | integration | N | route handler 로드 | `{ query: 123 }` / `{}` / `query` 누락 각각 POST | **HTTP 400 + `{ error: string }` JSON**(Content-Type application/json, **SSE 아님** — AD-4). SSE 스트림 미시작, 그래프 미호출(LLM 0건) |
| TC-16.2 | UC-16-A | FR-01 / AD-4 | integration | N | route 로드 | `{ query:"안녕", conversationId: 123 }` POST | Zod optional 타입 실패 → 400 + `{error}` JSON(구현 계약: 거부). 스트림 미시작 |
| TC-16.3 | UC-16-B | FR-01 / AD-4 | integration | N | route 로드 | `{ query:"안녕", foo:"x" }`(알 수 없는 필드) POST | Zod 스키마 정책대로 처리(무시 후 정상 진행 or 거부 — 계약 명세대로 일관). 정책 일관성 검증 |
| TC-16.4 | UC-16-E1 | FR-01 / AD-4 | integration | N | route 로드 | Content-Type `text/plain` + 비-JSON body POST | body 파싱 실패 → 400 + `{error}` JSON(스트림 미시작) |
| TC-16.5 | UC-16-EC1 | FR-01 / AD-4 | — (위임) | — | `{ query:"" }` | **TC-23.x 로 위임**(빈/공백 정책) | route 경계 거부(TC-23.3 참조) |
| TC-16.6 | UC-16-EC2 | FR-01 | — (위임) | — | 매우 큰 body | **TC-24.x 로 위임** | 길이 처리(TC-24.x 참조) |

---

## 17. Error — 잘못된 LLM_PROVIDER 값 (UC-17)

> 연계 AC-4 / FR-10 / AC-10 (registry 순수 단위)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-17.1 | UC-17 | AC-4 / FR-10 | unit | N | `model.ts`/registry, `LLM_PROVIDER='gemini'`(미지원) | provider 선택 호출 | **명확한 에러 throw**(AC-4: "잘못된 LLM_PROVIDER 값은 명확한 에러"). 무음 기본값 폴백 0(잘못된 설정 은폐 금지) |
| TC-17.2 | UC-17-A | FR-10 | unit | N | registry/model.ts, `LLM_PROVIDER` 빈 값 | 호출 | 기본값 `anthropic` 적용("미지정"은 잘못된 값 아님 — UC-9-A 동형, 에러 아님) |
| TC-17.3 | UC-17-E1 | FR-10 | unit | N | registry/model.ts, `LLM_PROVIDER='Anthropic '`(대소문자/공백 변형) | 호출 | 계약 명세대로 일관 처리 — 정규화하여 anthropic 으로 수용 **또는** 명확한 에러(둘 중 명세된 규칙과 일치, 무음 오동작 0) |
| TC-17.4 | UC-17-EC1 | AC-10 / NFR-11 / AD-2 | unit | N | registry 단위, LLM 미호출(순수 함수) | 잘못된 provider → 에러 케이스를 순수 함수로 검증 | LLM 호출 없이(과금 0) "잘못된 provider → 명확한 에러" 어설션. **AC-10 레지스트리 4~6 TC 중 1건** (fs side effect 0 — AD-2) |

---

## 18. Edge — thinking/reasoning 블록 본문 누출 차단 (UC-18)

> 연계 FR-09 / 함정 4 / AC-3 / AC-10 (chunkFilter 5~7 TC) / R5 / U3·U4

### 18.1 e2e/통합 거동

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-18.1 | UC-18 | FR-09 / AC-3 | e2e | Y | 기능 정상 | "17 x 24 답만 한 줄로" 추론 유발 입력 전송 | 버블 ≤15s visible, innerText ≤60s non-empty. (비결정 — 화면 텍스트에 "thinking 0건"을 직접 어설션 불가하므로 정밀 검증은 chunkFilter 단위 TC-18.7~18.13 으로 강제) |
| TC-18.2 | UC-18 (수동 probe) | FR-09 / AC-3 / 함정 4 | manual-gate | Y | dev 기동 | 추론 유발 입력 전송 후 `/tmp/debug.jsonl` 의 full JSON chunk dump 확인(함정 8 — slice 금지) + 화면 텍스트 육안 점검 | 최종 답변 스트림/화면 본문에 thinking/reasoning/redacted_thinking 텍스트 0건. (실측 thinking type 문자열·메타키는 U3·U4 로 확정 후 chunkFilter 단위 TC 에 반영) |
| TC-18.3 | UC-18-A | FR-09 / AC-3 | unit | N | `chunkFilter` import(순수) | `content` 가 **string** 인 AIMessageChunk 입력 | 문자열 그대로 통과(텍스트만 yield) |
| TC-18.4 | UC-18-B | FR-09 / AC-3 | unit | N | `chunkFilter` | tool_use/tool_call 청크 동반 입력 | tool_use/tool_call 출력은 본문 미혼입(선택적 표시용 분리, 본문 yield 0) |
| TC-18.5 | UC-18-E1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` | text 블록 포함 배열 입력 | **text 블록은 반드시 통과**(과필터로 "버블 비고 커서만" 결함 차단 — 자주 나오는 에러 회귀) |
| TC-18.6 | UC-18-E2 | FR-09 / R8 / U3 | manual-gate | N | pre-work 실측 노트 `docs/notes/deepagents-api-probe.md`/`live-stream-events.md` | thinking 블록 실제 type 문자열 확정 검토 | thinking type 문자열(U3)·메타키(U4)가 실측으로 확정되어 chunkFilter 단위 TC 입력에 반영됨. 실측≠학습지식 시 사용자 보고 후 PRD 개정(R8) |

### 18.2 chunkFilter 단위 스위트 (AC-10 — 5~7 TC, 순수 함수, LLM 미호출)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-18.7 | UC-18-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` 순수 | **text 블록 통과**: `content=[{type:'text',text:'안녕'}]` | `'안녕'` yield(text 추출) |
| TC-18.8 | UC-18-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` | **thinking 블록 제거**: `content=[{type:'thinking',...}]` | yield 0(thinking 폐기) |
| TC-18.9 | UC-18-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` | **string content**: `content='안녕'` | `'안녕'` 그대로 통과 |
| TC-18.10 | UC-18-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` | **배열 content 혼합**: `[{type:'thinking'},{type:'text',text:'A'}]` | `'A'` 만 yield(thinking 제거, text 통과) |
| TC-18.11 | UC-18-EC1 / UC-19-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter`, 메타데이터(langgraph_node 등) 포함 청크 | **서브에이전트 노드 메타 제거**: subagent/tool 노드 출처 청크 | 메인 어시스턴트 노드 외 출처는 yield 0(출처 메타로 필터 — U4 실측 키 사용) |
| TC-18.12 | UC-18-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` | **빈 청크**: `content=[]` / `content=''` / undefined | 크래시 없이 yield 0 |
| TC-18.13 | UC-18-EC3 | FR-09 / AC-3,10 | unit | N | `chunkFilter` | **redacted_thinking 블록**: `content=[{type:'redacted_thinking',...}]` | yield 0(암호화 사고도 본문 미노출) |
| TC-18.14 | UC-18-EC2 | FR-02,09 / AC-2,3 | — (위임) | — | 멀티턴 중 추론 입력 | **TC-2.3 으로 위임** | 맥락 기억 + 누출 0 동시(TC-2.3 참조) |

---

## 19. Edge — 서브에이전트 내부 메시지 본문 누출 차단 (UC-19)

> 연계 FR-09 / 함정 5 / AC-3 / AC-10 / R5 / U4

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-19.1 | UC-19 | FR-09 / AC-3 | e2e | Y | subagents 활성(HARNESS_SUBAGENTS=true, spec≥1) | subagent/도구 유발 입력 전송 | 버블 ≤15s visible, innerText ≤60s non-empty(메인 답변만). 정밀 누출 검증은 chunkFilter 단위(TC-19.5)로 강제 |
| TC-19.2 | UC-19 (수동 probe) | FR-09 / AC-3 / 함정 5 | manual-gate | Y | dev 기동, subagents 활성 | 도구/subagent 유발 입력 후 full JSON chunk dump(`/tmp/debug.jsonl`) + 화면 점검 | 최종 답변에 subagent 내부 메시지/도구(tool_use/tool_call) 출력 0건 혼입 |
| TC-19.3 | UC-19-A | FR-09,12 | — (위임) | — | subagents [] | **TC-8.5 로 위임** | 누출 발생 불가(단일 에이전트, TC-8.5 참조) |
| TC-19.4 | UC-19-B | FR-09 / AC-3 | unit | N | `chunkFilter`, 도구만 활성(subagent 없음) | tool_use/tool_call 출력 청크 입력 | tool_use/tool_call 출력만 필터 대상으로 yield 0(본문 미혼입) |
| TC-19.5 | UC-19-EC1 | FR-09 / AC-3,10 | unit | N | `chunkFilter` 순수, subagent 노드 메타 청크 | **서브에이전트 노드 메타 제거 TC**(AC-10 chunkFilter 스위트 1건) | subagent 노드 출처 청크 yield 0(메인 노드만 통과 — TC-18.11 과 함께 chunkFilter 스위트 구성) |
| TC-19.6 | UC-19-E1 | FR-09 / R8 / U4 | manual-gate | N | pre-work 실측 노트 | 출처 메타데이터 키(langgraph_node 등) 확정 검토 | U4 메타키가 실측 확정되어 chunkFilter 입력에 반영. 실측≠학습지식 시 사용자 보고 후 PRD 개정(R8). 오필터 시 메인 답변 누락/오염 회귀 차단 |
| TC-19.7 | UC-19-EC2 | FR-02,09 / AC-2,3 | — (위임) | — | 멀티턴 + subagent | **TC-2.4 로 위임** | 맥락 기억 + subagent 누출 0(TC-2.4 참조) |

---

## 20. Edge — 긴 추론 답변 스트리밍: 커서 + finally 확정 (UC-20)

> 연계 FR-04 / AC-5 / AC-11

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-20.1 | UC-20 | FR-04 / AC-5,11 | e2e | Y | 기능 정상 | 긴 설명을 요하는 질문 전송 | 스트리밍 중 커서 표시, 다수 token 점진 누적, 버블 ≤15s visible, innerText ≤60s non-empty. done 후 커서 사라지고 **입력 잠금 해제**(재입력 가능) |
| TC-20.2 | UC-20 (스토어 단위) | FR-04 / AC-5 | unit | N | store/useChat 단위 | token 다수 → done 시퀀스 시뮬레이션 | `appendToLastAssistant` 점진 누적, done → 루프 break, `finally` 에서 `setStreaming(false)`+`finalizeLastAssistant()` 호출 |
| TC-20.3 | UC-20-A | FR-04,09 / AC-3,5 | unit | N | chunkFilter+store 파이프 | thinking 다량 + text 혼합 청크 시퀀스 | thinking 제거되며 text 만 누적(체감상 커서 멈춤 허용), finally 정상 확정 |
| TC-20.4 | UC-20-E1 | FR-04 / AC-5 | unit | N | useChat 단위, `finally` 누락 결함 가정 vs 정상 | done/error 후 finally 경로 검사 | 정상 구현: 종료/에러 어느 경로든 `finalizeLastAssistant()`+`setStreaming(false)` 호출 → 입력 고착 회귀 **FAIL 가드**(미호출 시 입력 영구 잠김 검출) |
| TC-20.5 | UC-20-E2 | FR-04 / AC-9 | unit | N | useChat 단위, 스트림 중 error 주입 | error → 조기 종료 시뮬레이션 | `finally` 가 그래도 호출되어 `setStreaming(false)`+`finalizeLastAssistant()` 보장(UC-1-E1 합류) |
| TC-20.6 | UC-20-EC1 | FR-04 / AC-5 | unit | N | useChat 단위 | token 0개 후 done(모델 빈 응답 모사) | assistant 버블 빈 상태로 finalize(크래시 0). e2e 60s non-empty 는 모델 비결정 경계로만 인지(어설션 강제 아님) |
| TC-20.7 | UC-20-EC2 | NFR-1 / AC-5 | e2e | Y | cold start | 긴 답변 입력, 첫 token cold 15s | 커서만 보이다 토큰 흐름, 버블 ≤15s visible, innerText ≤60s non-empty(AC-5 만족 범위) |

---

## 21. Edge — dev HMR 싱글톤 리셋 → 멀티턴 회귀 가드 (UC-21)

> 연계 NFR-7 / 함정 11 / R6 / AD-3 (globalThis 싱글톤은 Promise 메모이즈)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-21.1 | UC-21 | NFR-7 / 함정 11 / R6 | integration | N | agent 모듈, 그래프 모킹, `globalThis.__agent` 관찰 | 모듈 1차 평가(graph 생성) → 모듈 재평가(HMR 모사: 모듈 캐시 무효화 후 재import) → 동일 thread_id 2턴 | 재평가 후에도 `globalThis.__agent.graph` 동일 인스턴스 유지(재생성 0). 멀티턴 상태 보존(2턴 load 성공) |
| TC-21.2 | UC-21 (동시 cold-start 레이스) | NFR-7 / AD-3 / R6 | unit | N | agent 모듈, `createDeepAgent` 모킹 + spy, `globalThis.__agent` 클린 | **동시 첫 요청 2개**가 graph 빌드 진입(Promise 메모이즈 경로) | `createDeepAgent` 가 **최대 1회** 호출(AD-3 — `g.__agent.graph` 가 Promise 메모이즈, 동시 진입 중복 호출 0). 두 호출 모두 동일 graph await |
| TC-21.3 | UC-21-A | NFR-7 / R6 | integration | N | production 모드(모듈 재평가 없음) 시뮬레이션 | 1턴 → 2턴 | 멀티턴 정상(globalThis 가 양쪽 안전 — production 도 보존) |
| TC-21.4 | UC-21-E1 | NFR-7 / R6 / 함정 11 | integration | N | 결함 가정: 싱글톤이 모듈 변수만(globalThis 미고정) | HMR 모사 재평가 → 2턴 | 2번째 요청부터 멀티턴 깨짐 검출 → 회귀 **FAIL 가드**("dev 2번째 요청부터 멀티턴 깨짐" 결함 차단) |
| TC-21.5 | UC-21-E2 | NFR-7 / 함정 12 | — (위임) | — | MemorySaver + HMR | **TC-11.5 로 위임** | 히스토리 증발 → SQLite 기본 강제(TC-11.5 참조) |
| TC-21.6 | UC-21-EC1 | NFR-7 / R6 | integration | N | SqliteSaver, HMR 모사 후 saver 핸들 관찰 | HMR 재평가 직후 SQLite 핸들 검사 | globalThis 고정으로 SQLite 파일 핸들 단일(중복 오픈 0) |
| TC-21.7 | UC-21-EC2 | NFR-7 | integration | N | 완전 재기동(HMR 아님) 시뮬레이션, sqlite vs memory | 재기동 후 thread_id load | SQLite: 히스토리 보존 / memory: 증발(NFR-7 의도된 한계 — 구분 확인) |

---

## 22. Edge — "연속 2회 이상" stateful 검증 (검증 철학) (UC-22)

> 연계 FR-02 / AC-2 / 검증 철학(연속 2회 이상 + 추론 ≥1 + 도구 ≥1)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-22.1 | UC-22 | FR-02 / AC-2,11 | e2e | Y | 멀티턴 정상 구현 | 동일 conversationId 로 **인사 → 추론 필요 → 도구 유발** 3턴 전송, 그리고 **전체 흐름 2회 반복**(서로 다른 입력 유형 조합) | 매 턴 응답 ≤60s non-empty, conversationId 불변. 2회 반복 모두 통과("한 번 성공은 보장 아님" 충족 — 추론 ≥1 + 도구 ≥1 포함) |
| TC-22.2 | UC-22-A | FR-02 / 검증 철학 | manual-gate | N | 테스트 시나리오 리뷰 | 멀티턴 e2e 시나리오의 입력 구성 검사 | "짧은 인사만 반복"은 검증 부족으로 거부 — 시나리오에 추론 입력 ≥1, 도구 유발 입력 ≥1 포함 강제(probe 규칙) |
| TC-22.3 | UC-22-E1 | FR-02 / AC-2 | — (위임) | — | 1턴만 통과, 멀티턴 미검증 | **TC-15.5 로 위임** | "한 번 성공" 오인 안티패턴 회귀 차단(TC-15.5 참조) |
| TC-22.4 | UC-22-EC1 | FR-02 / NFR-6 / 검증 철학 | manual-gate | Y(스모크) | TC-6/7/8 토글 후 | 토글 ON→OFF→ON 사이클 직후 멀티턴 2턴 재검증(매 사이클) | 매 사이클 후 멀티턴 회귀 0(조립 변경이 회귀를 부르므로 토글 직후 재검증 — 검증 철학 마지막 항목) |
| TC-22.5 | UC-22-EC2 | FR-02,10 / AC-2,9 | e2e | Y | anthropic·openai 양 provider key 유효 | 각 provider 에서 2턴 이상 멀티턴 검증 | 양 provider 모두 멀티턴 ≤60s non-empty + 맥락 유지(UC-9 연계) |

---

## 23. Edge — 빈/공백 메시지 입력 (UC-23)

> 연계 FR-03 / AC-1 / AD-4 (빈/공백 query 는 route 경계 400 거부)

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-23.1 | UC-23 | FR-03 / AC-1 | unit | N | `ChatInput`/`useChat` 단위 | 빈 textarea 또는 공백/개행만 입력 후 Enter/Send | 전송 차단(fetch 미호출, 네트워크 0건). store messages 불변 |
| TC-23.2 | UC-23-A | FR-03 | unit | N | ChatInput/useChat | 공백 + 실제 텍스트 혼합 입력 | trim 후 비어있지 않으면 정상 전송(UC-1 합류) |
| TC-23.3 | UC-23-E1 | FR-01 / AD-4 | integration | N | route handler(클라이언트 차단 우회 가정) | `{ query:"" }` / `{ query:"   \n\t" }` 직접 POST | **route 경계에서 400 + `{error}` JSON 거부**(AD-4 — 빈/공백은 모델 위임 아님). 그래프/LLM 미호출 |
| TC-23.4 | UC-23-EC1 | FR-03 / AD-4 | integration | N | route | 공백만(스페이스/탭/개행) query POST | trim 후 빈 문자열 간주 → 400 거부(AD-4) |
| TC-23.5 | UC-23-EC2 | FR-03 | unit | N | ChatInput | Shift+Enter 로 개행만 삽입 후 Enter | 줄바꿈은 전송 아님(FR-03), 최종 trim 빈값이면 차단(fetch 0건) |

---

## 24. Edge — 매우 긴 메시지 입력 (UC-24)

> 연계 FR-03,04 / AC-5

| TC | UC | FR/AC | type | needs LLM | 전제조건 | 절차 | 기대 결과 |
|----|----|-------|------|-----------|----------|------|-----------|
| TC-24.1 | UC-24 | FR-03,04 / AC-5 | e2e | Y | `/chat` 진입 | 수천~수만 자 query 입력 후 전송 | route Zod `query:string` 통과(길이 상한 미정의 시), 그래프 처리, 버블 ≤15s visible, innerText ≤60s non-empty. 긴 user 버블 정상 렌더(크래시 0) |
| TC-24.2 | UC-24-A | AC-9 | integration | N | 그래프 모킹: context 한도 초과 throw | 긴 query POST | `{ type:'error', message:<에러 본문 그대로> }` SSE 보고(UC-1-E1 합류) |
| TC-24.3 | UC-24-E1 | FR-01 / AD-4 | integration | N | route, 플랫폼/서버 body 한도 초과 모사 | 한도 초과 body POST | 명확한 에러 응답(SSE 미시작, 그래프 미호출) |
| TC-24.4 | UC-24-EC1 | FR-02 | e2e | Y | 긴 입력 + 멀티턴 | 긴 query 로 동일 conversationId 2턴 | checkpointer 누적 상태 커져도 thread_id 단위 정상 동작 — 2턴 non-empty, conversationId 불변 |
| TC-24.5 | UC-24-EC2 | FR-03,05 | unit | N | ChatInput/MessageList 단위 | 긴 입력 + 마크다운/코드 다수 포함 | user 버블 렌더 안정성(크래시 0, UC-4 연계) |

---

## 25. 단위 테스트 스위트 (AC-10 카운트 강제 — 순수 함수, LLM 미호출, AD-2)

> requirements.md `[단위 테스트 (필수)]` + AC-10 의 명시 카운트를 보장한다. 모두 `unit`, `needs LLM = N`.
> registry/chunkFilter/sseStreamParser/store/systemPrompt 는 LLM 호출과 분리된 순수 함수이며,
> 호출만으로 `./.data/` 등 fs side effect 가 발생하지 않아야 한다(AD-2).

### 25.1 sseStreamParser 스위트 (5~7 TC)

| TC | UC 연계 | FR/AC | type | needs LLM | 절차 | 기대 결과 |
|----|---------|-------|------|-----------|------|-----------|
| TC-25.1 | UC-1 | FR-01 / AC-10 | unit | N | 정상 단일 SSE 이벤트 파싱 | `{type:'token',...}` 정상 디코드 |
| TC-25.2 | UC-1 | FR-01 / AC-10 | unit | N | **불완전 청크**(이벤트 경계 중간 절단) | 다음 청크와 결합 시 정상 파싱(버퍼링) |
| TC-25.3 | UC-1 | FR-01 / AC-10 | unit | N | **빈 body** | 크래시 없이 0 이벤트 |
| TC-25.4 | UC-1 | FR-01 / AC-10 | unit | N | **JSON 파싱 실패** 라인 | 해당 라인 graceful skip 또는 명확 에러(계약대로), 후속 이벤트 계속 |
| TC-25.5 | UC-1 | FR-01 / AC-10 | unit | N | **멀티 이벤트**(한 청크에 다수 `\n\n` 구분) | 모든 이벤트 순서대로 파싱 |
| TC-25.6 | UC-1 | FR-01 / AC-10 | unit | N | **thread 이벤트** 파싱 | `{type:'thread',conversationId}` 디코드 → setConversationId 매핑 |
| TC-25.7 | UC-14 | FR-01 / AC-10 | unit | N | 스트림 중단(부분 데이터 후 종료) | 버퍼 잔여 처리, 크래시 0 |

### 25.2 store 스위트 (5 TC)

| TC | UC 연계 | FR/AC | type | needs LLM | 절차 | 기대 결과 |
|----|---------|-------|------|-----------|------|-----------|
| TC-25.8 | UC-1 | FR-04 / AC-10 | unit | N | 초기 상태 | messages=[], conversationId 빈/미발급, isStreaming=false, error=null |
| TC-25.9 | UC-1 | FR-04 / AC-10 | unit | N | `addMessage` | user/assistant 메시지 추가 정상 |
| TC-25.10 | UC-1 | FR-04 / AC-10 | unit | N | `appendToLastAssistant` | 마지막 assistant 메시지에 점진 append(다른 메시지 불변) |
| TC-25.11 | UC-1 | FR-01 / AC-10 | unit | N | `setConversationId` | conversationId 갱신, 그 외 상태 불변 |
| TC-25.12 | UC-3 | FR-06 / AC-7,10 | unit | N | `resetChat` | 새 conversationId(이전과 다름) + messages=[] + error=null + isStreaming=false |

### 25.3 registry 스위트 (4~6 TC) — FR-08 핵심 토글 회귀 방지, AD-2 순수성

| TC | UC 연계 | FR/AC | type | needs LLM | 절차 | 기대 결과 |
|----|---------|-------|------|-----------|------|-----------|
| TC-25.13 | UC-6 | FR-08,11 / AC-4,10 | unit | N | `HARNESS_PLANNING=false` | `planning.enabled===false`, fs side effect 0(AD-2) |
| TC-25.14 | UC-7 | FR-08 / AC-4,10 | unit | N | tools 미등록 | `tools===[]`(빈 배열 허용) |
| TC-25.15 | UC-8 | FR-08,12 / AC-4,10 | unit | N | subagents 미등록/`HARNESS_SUBAGENTS=false` | `subagents===[]` |
| TC-25.16 | UC-11 | FR-12 / AC-10 / AD-2 | unit | N | `HARNESS_CHECKPOINTER=sqlite\|memory` 분기 | 올바른 saver 타입, **호출만으로 `./.data/` 미생성**(lazy, AD-2) |
| TC-25.17 | UC-17 | FR-10 / AC-4,10 | unit | N | 잘못된 `LLM_PROVIDER` | 명확한 에러 throw(무음 폴백 0) |
| TC-25.18 | UC-11 | FR-12 / AC-10 / AD-2 | unit | N | `buildHarnessConfig` 호출 후 fs 관찰 | 어떤 분기든 함수 호출만으로 디렉토리/파일 생성 0(AD-2 순수성 문자 그대로 성립) |

### 25.4 systemPrompt 스위트 (3~4 TC)

| TC | UC 연계 | FR/AC | type | needs LLM | 절차 | 기대 결과 |
|----|---------|-------|------|-----------|------|-----------|
| TC-25.19 | UC-1 | AC-10 | unit | N | 시스템 프롬프트 역할 정의 | 챗봇 역할 정의 존재 |
| TC-25.20 | UC-1 | AC-10 | unit | N | 한국어 규칙 | 한국어 응답 규칙 명시 |
| TC-25.21 | UC-1 | AC-10 | unit | N | 레퍼런스 잔재 없음 | OpenCode/레퍼런스 소스 잔재 문자열 0 |
| TC-25.22 | UC-1 | AC-10 | unit | N | 프롬프트 비공백/길이 sanity | 빈 문자열 아님, 최소 역할 문장 포함 |

---

## 26. 보안 manual-gate 스위트 (AD-5 / NFR-4,5,8 — merge-ready 게이트)

| TC | UC 연계 | FR/AC/AD | type | needs LLM | 절차 | 기대 결과 |
|----|---------|----------|------|-----------|------|-----------|
| TC-26.1 | UC-5-EC1 | NFR-4 / AC-8 | manual-gate | N | `pnpm build` 후 `grep -rlE "ANTHROPIC_API_KEY\|OPENAI_API_KEY" .next/static/` 및 `grep -rE "sk-(ant-)?[A-Za-z0-9_-]{20,}" .next/static/` | 둘 다 **0 matches**. 1건↑ FAIL(merge-ready 차단) |
| TC-26.2 | UC-12-EC1 | NFR-4 | manual-gate | N | 전 소스 `NEXT_PUBLIC_.*(API_KEY)` grep | 0건. 발견 시 FAIL |
| TC-26.3 | UC-4-E1 | NFR-5 / AD-5(d) | manual-gate | N | `ChatMarkdown.tsx` 코드 리뷰 | rehype-raw → rehype-sanitize **순서**(sanitize 가 raw 뒤). 스트리밍 부분 마크다운 재렌더가 sanitize 우회 불가 |
| TC-26.4 | UC-14 | FR-01 / AD-5(a) | manual-gate | N | `route.ts` SSE 인코더 리뷰 | error 본문 개행/`event:`/`data:` 경계 이스케이프. `ReadableStream.cancel()` 이 그래프 stream 실제 중단(abort 연결 확인) |
| TC-26.5 | UC-11-E2 | NFR-7 / AD-5(b) | manual-gate | N | `harness/checkpointer.ts` 리뷰 | SQLite 경로가 **요청 입력에 영향받지 않음**(env/상수만, path traversal 0). `.data/` 생성 + `.gitignore` 등록 |
| TC-26.6 | UC-11-EC2 | NFR-8 / AD-5(b) | manual-gate | N | `.gitignore` + `git status` 확인 | `./.data/` ignore 등록, SQLite 파일 미추적. 누락 시 FAIL |
| TC-26.7 | UC-12 | NFR-4 / AD-5(c) | manual-gate | N | `harness/model.ts` 리뷰 | API 키 참조가 model.ts 에만 국한, 응답 비직렬화에 키 미포함, 잘못된 `LLM_PROVIDER` hard-throw |
| TC-26.8 | (전역) | NFR-10 / R1 | manual-gate | N | `pnpm why @langchain/core` + `pnpm audit --prod` | `@langchain/core` 단일 트리(버전 갈림 0 — instanceof 정합), zod deepagents 와 동일 메이저(^4). audit prod 통과 |
| TC-26.9 | (전역) | NFR-2,9 / R7 / 함정 9 | manual-gate | N | `pnpm build` + `eslint .` + route.ts 헤더 검사 | build/lint 에러 0. `route.ts` 최상단 `runtime="nodejs"` + `dynamic="force-dynamic"`. eslint flat config 직접 export(FlatCompat 0) |
| TC-26.10 | (전역) | NFR-11 / R2 | manual-gate | N | `route.ts` 본문 + `playwright.config.ts` grep | `E2E_MOCK`/`MOCK_MODE` 분기 0, playwright config mock prefix 0(Mock 경로 금지) |
| TC-26.11 | (전역) | NFR-3 | manual-gate | N | 전 소스 라인 수 검사 | 단일 파일 1000줄 초과 0(harness/ 는 "요소 1개=파일 1개") |
| TC-26.12 | UC-1 | AC-11 / NFR-11 | manual-gate | N | `playwright.config.ts` 리뷰 | `retries: 1`, `reuseExistingServer: false`, `webServer: pnpm dev`, `baseURL: http://localhost:3000`. "정확히 N줄/특정 단어" 어설션 0 |

---

## 27. 추적성 매트릭스 (UC 노드 + FR + AC → ≥1 TC, 갭 없음 증명)

### 27.1 UC 노드 → TC 매핑 (124 시나리오 노드 전수)

| UC 노드 | TC | UC 노드 | TC | UC 노드 | TC |
|---------|----|---------|----|---------|----|
| UC-1 | TC-1.1, 1.5 | UC-9 | TC-9.1, 9.2 | UC-17 | TC-17.1 |
| UC-1-A | TC-1.2 | UC-9-A | TC-9.3 | UC-17-A | TC-17.2 |
| UC-1-B | TC-1.3 | UC-9-B | TC-9.4 | UC-17-E1 | TC-17.3 |
| UC-1-C | TC-1.4 | UC-9-E1 | TC-9.5(→12) | UC-17-EC1 | TC-17.4 |
| UC-1-E1 | TC-1.6, 1.8 | UC-9-E2 | TC-9.6(→13) | UC-18 | TC-18.1, 18.2 |
| UC-1-E2 | TC-1.7 | UC-9-E3 | TC-9.7(→17) | UC-18-A | TC-18.3 |
| UC-1-EC1 | TC-1.9(→23) | UC-9-EC1 | TC-9.8 | UC-18-B | TC-18.4 |
| UC-1-EC2 | TC-1.10(→14) | UC-9-EC2 | TC-9.9 | UC-18-E1 | TC-18.5 |
| UC-1-EC3 | TC-1.11 | UC-10 | TC-10.1 | UC-18-E2 | TC-18.6 |
| UC-2 | TC-2.1, 2.2 | UC-10-A | TC-10.3 | UC-18-EC1 | TC-18.7~18.13 |
| UC-2-A | TC-2.3 | UC-10-B | TC-10.4 | UC-18-EC2 | TC-18.14(→2.3) |
| UC-2-B | TC-2.4 | UC-10-E1 | TC-10.5 | UC-18-EC3 | TC-18.13 |
| UC-2-C | TC-2.5(→22) | UC-10-E2 | TC-10.6 | UC-19 | TC-19.1, 19.2 |
| UC-2-E1 | TC-2.6(→15) | UC-10-EC1 | TC-10.7 | UC-19-A | TC-19.3(→8.5) |
| UC-2-E2 | TC-2.7 | UC-11 | TC-11.1, 11.2 | UC-19-B | TC-19.4 |
| UC-2-EC1 | TC-2.8 | UC-11-A | TC-11.4 | UC-19-E1 | TC-19.6 |
| UC-2-EC2 | TC-2.9 | UC-11-E1 | TC-11.5 | UC-19-EC1 | TC-19.5 |
| UC-2-EC3 | TC-2.10 | UC-11-E2 | TC-11.6 | UC-19-EC2 | TC-19.7(→2.4) |
| UC-3 | TC-3.1, 3.2 | UC-11-EC1 | TC-11.7 | UC-20 | TC-20.1, 20.2 |
| UC-3-A | TC-3.3 | UC-11-EC2 | TC-11.8 | UC-20-A | TC-20.3 |
| UC-3-B | TC-3.4 | UC-12 | TC-12.1, 12.2 | UC-20-E1 | TC-20.4 |
| UC-3-E1 | TC-3.5 | UC-12-A | TC-12.3 | UC-20-E2 | TC-20.5 |
| UC-3-EC1 | TC-3.6 | UC-12-B | TC-12.4 | UC-20-EC1 | TC-20.6 |
| UC-3-EC2 | TC-3.7 | UC-12-E1 | TC-12.5 | UC-20-EC2 | TC-20.7 |
| UC-4 | TC-4.1, 4.2 | UC-12-EC1 | TC-12.6 | UC-21 | TC-21.1, 21.2 |
| UC-4-A | TC-4.3 | UC-13 | TC-13.1 | UC-21-A | TC-21.3 |
| UC-4-B | TC-4.4 | UC-13-A | TC-13.2 | UC-21-E1 | TC-21.4 |
| UC-4-E1 | TC-4.5, 4.10 | UC-13-E1 | TC-13.3 | UC-21-E2 | TC-21.5(→11.5) |
| UC-4-E2 | TC-4.6 | UC-13-EC1 | TC-13.4 | UC-21-EC1 | TC-21.6 |
| UC-4-EC1 | TC-4.7 | UC-14 | TC-14.1, 14.6 | UC-21-EC2 | TC-21.7 |
| UC-4-EC2 | TC-4.8 | UC-14-A | TC-14.2 | UC-22 | TC-22.1 |
| UC-4-EC3 | TC-4.9 | UC-14-E1 | TC-14.3 | UC-22-A | TC-22.2 |
| UC-5 | TC-5.1, 5.2 | UC-14-EC1 | TC-14.4 | UC-22-E1 | TC-22.3(→15.5) |
| UC-5-A | TC-5.3 | UC-14-EC2 | TC-14.5 | UC-22-EC1 | TC-22.4 |
| UC-5-E1 | TC-5.4 | UC-15 | TC-15.1 | UC-22-EC2 | TC-22.5 |
| UC-5-EC1 | TC-5.5 | UC-15-A | TC-15.2 | UC-23 | TC-23.1 |
| UC-6 | TC-6.1, 6.2, 6.3 | UC-15-B | TC-15.3 | UC-23-A | TC-23.2 |
| UC-6-A | TC-6.4 | UC-15-E1 | TC-15.4 | UC-23-E1 | TC-23.3 |
| UC-6-B | TC-6.5 | UC-15-EC1 | TC-15.5 | UC-23-EC1 | TC-23.4 |
| UC-6-E1 | TC-6.6 | UC-16 | TC-16.1 | UC-23-EC2 | TC-23.5 |
| UC-6-EC1 | TC-6.7 | UC-16-A | TC-16.2 | UC-24 | TC-24.1 |
| UC-6-EC2 | TC-6.8 | UC-16-B | TC-16.3 | UC-24-A | TC-24.2 |
| UC-7 | TC-7.1, 7.2 | UC-16-E1 | TC-16.4 | UC-24-E1 | TC-24.3 |
| UC-7-A | TC-7.3 | UC-16-EC1 | TC-16.5(→23) | UC-24-EC1 | TC-24.4 |
| UC-7-E1 | TC-7.4 | UC-16-EC2 | TC-16.6(→24) | UC-24-EC2 | TC-24.5 |
| UC-7-EC1 | TC-7.5 | | | | |
| UC-8 | TC-8.1, 8.2 | | | | |
| UC-8-A | TC-8.3 | | | | |
| UC-8-E1 | TC-8.4 | | | | |
| UC-8-EC1 | TC-8.5 | | | | |

위임(→) 표기 노드도 위임 대상 TC 로 ≥1 매핑됨(원본 노드 행에 위임 TC 명시). **124 시나리오 노드 전수 매핑 완료, 미매핑 노드 없음.**

### 27.2 FR-01~12 → TC 매핑

| FR | TC (대표) | 갭 |
|----|-----------|----|
| FR-01 | TC-1.1, 1.4, 1.5, 1.6, 1.7, 14.1~14.6, 16.1~16.6, 23.3, 25.1~25.7, 26.4, 26.9 | 없음 |
| FR-02 | TC-2.1~2.10, 6.4, 7.3, 9.4, 9.9, 11.2, 14.2, 15.1~15.5, 21.1~21.7, 22.1~22.5, 24.4 | 없음 |
| FR-03 | TC-1.1~1.3, 23.1~23.5, 24.1, 24.5 | 없음 |
| FR-04 | TC-1.1, 20.1~20.7, 25.8~25.11 | 없음 |
| FR-05 | TC-4.1~4.10, 24.5, 26.3 | 없음 |
| FR-06 | TC-3.1~3.7, 25.12 | 없음 |
| FR-07 | TC-5.1~5.4, 9.1 | 없음 |
| FR-08 | TC-6.1~6.8, 7.1~7.5, 8.1~8.5, 10.1~10.7, 25.13~25.18 | 없음 |
| FR-09 | TC-18.1~18.14, 19.1~19.7, 20.3 | 없음 |
| FR-10 | TC-9.1~9.9, 13.3, 17.1~17.4, 25.17, 26.7 | 없음 |
| FR-11 | TC-6.1~6.8, 25.13 | 없음 |
| FR-12 | TC-8.1~8.5, 11.1~11.8, 25.15, 25.16 | 없음 |

### 27.3 AC-1~11 → TC 매핑

| AC | TC (대표) | 갭 |
|----|-----------|----|
| AC-1 | TC-1.1, 1.5, 1.11, 16.1~16.4, 23.3 | 없음 |
| AC-2 | TC-2.1, 2.3~2.5, 2.9, 2.10, 6.4, 7.3, 9.4, 9.9, 15.1, 22.1~22.5 | 없음 |
| AC-3 | TC-18.1~18.13, 19.1~19.5, 20.3 | 없음 |
| AC-4 | TC-6.1~6.3, 6.6, 7.1, 7.4, 8.1, 8.4, 17.1, 17.4, 25.13~25.17 | 없음 |
| AC-5 | TC-1.1, 1.11, 20.1~20.7, 24.1 | 없음 |
| AC-6 | TC-4.1~4.7, 4.10, 26.3 | 없음 |
| AC-7 | TC-3.1~3.7, 25.12 | 없음 |
| AC-8 | TC-5.1~5.3, 5.5, 26.1 | 없음 |
| AC-9 | TC-9.1, 12.4, 12.5, 13.1, 13.2, 24.2 | 없음 |
| AC-10 | TC-17.4, 18.7~18.13, 19.5, 25.1~25.22 | 없음 |
| AC-11 | TC-1.1, 2.1, 3.1, 20.1, 22.1, 26.12 | 없음 |

### 27.4 NFR / AD 핵심 강제 → TC 매핑

| 항목 | TC | 비고 |
|------|----|----|
| NFR-1 (레이턴시) | TC-1.11, 20.7 | cold 15s / warm 3s |
| NFR-4 (키 비누출) | TC-5.5, 12.6, 26.1, 26.2 | grep 0 게이트 |
| NFR-5 (sanitize) | TC-4.5, 4.10, 26.3 | rehype 순서 |
| NFR-6 (토글 diff 0) | TC-6.1, 6.5, 6.6, 7.1, 7.4, 8.1, 8.4, 10.1, 11.1, 22.4 | agent.ts/route.ts diff 0 manual-gate |
| NFR-7 (영속 신뢰) | TC-2.8, 11.4, 11.5, 21.1~21.7 | SQLite/HMR |
| NFR-8 (.gitignore) | TC-11.8, 26.6 | ./.data/ |
| NFR-10 (의존 정합) | TC-10.6, 26.8 | @langchain/core 단일 트리 |
| NFR-11 (Mock 금지) | TC-15.4, 26.10 | route 본문 mock 0 |
| AD-1 (buildAgentOptions) | TC-6.3, 6.6, 7.4, 8.4, 10.5 | 분기 격리, agent.ts 아님 |
| AD-2 (registry 순수성) | TC-6.2, 7.2, 8.2, 11.3, 25.16, 25.18 | fs side effect 0, lazy checkpointer |
| AD-3 (동시 cold-start) | TC-21.2 | createDeepAgent ≤1회 |
| AD-4 (route 입력 계약) | TC-16.1~16.4, 23.3, 23.4, 24.3 | 400+{error} JSON, 빈/공백 route 거부 |
| AD-5 (보안 사전검토) | TC-4.10, 12.2, 14.3, 14.6, 26.3~26.7 | (a)(b)(c)(d) 전부 |

---

## 28. 집계 요약

### 28.1 총 TC 수: **132**

(위임 TC 9건 — TC-1.9, 1.10, 2.6, 9.5~9.7, 16.5, 16.6, 18.14, 19.3, 19.7, 21.5, 22.3 — 은 별도 TC ID 를 보유하되 실제 검증은 위임 대상 TC 에서 수행. 위 추적성 매트릭스에서 원본 UC 노드는 위임 대상 TC 로 ≥1 매핑 보장.)

### 28.2 type 별 분류

| type | 개수 | 대표 TC |
|------|------|---------|
| **unit** | 60 | chunkFilter(TC-18.3~18.13, 19.4, 19.5), sseStreamParser(TC-25.1~25.7), store(TC-25.8~25.12), registry(TC-25.13~25.18), systemPrompt(TC-25.19~25.22), model.ts(TC-9.2,9.3,9.8,13.3,17.1~17.4), agent spy(TC-15.1~15.4, 21.2), ChatMarkdown(TC-4.1~4.9), useChat/store(TC-1.8, 3.2,3.4~3.6, 20.2~20.6, 23.1,23.2,23.5, 24.5), buildAgentOptions(TC-6.2,6.3,6.7,6.8,7.2,8.2,10.2) |
| **integration** | 27 | route Zod/SSE(TC-1.4~1.7, 16.1~16.4, 23.3,23.4, 24.2,24.3), disconnect/cancel(TC-14.1,14.2,14.4,14.5), checkpointer/HMR(TC-2.7,2.8, 11.2,11.4~11.6, 21.1,21.3,21.4,21.6,21.7), 키 무효(TC-12.4,12.5), 모델 런타임(TC-13.2) |
| **e2e** | 28 | TC-1.1~1.3,1.11, 2.1,2.3~2.5,2.9,2.10, 3.1,3.3,3.7, 5.1,5.3, 6.4, 7.3,7.5, 8.5, 9.4,9.9, 11.7, 15.5, 18.1, 19.1, 20.1,20.7, 22.1,22.5, 24.1,24.4 |
| **manual-gate** | 26 | 토글 diff 0(TC-6.1,6.5,6.6,7.1,7.4,8.1,8.3,8.4,10.1,10.3~10.5,10.7,11.1,11.8,22.4), provider 스모크(TC-9.1), precheck(TC-12.1,12.3, 13.1,13.4), 보안 게이트(TC-4.10, 12.2, 14.3,14.6, 18.2,18.6, 19.2,19.6, 22.2, 26.1~26.12) |
| 위임(소계) | 9 | TC-1.9,1.10, 2.6, 9.5~9.7(3), 16.5,16.6, 18.14, 19.3,19.7(2), 21.5, 22.3 — 실 검증은 위임 대상에서 |

(type 별 합 = 60 + 27 + 28 + 26 = 141 ≥ 본문 정의 TC; 위임 TC 는 type 미부여(— 표기)로 중복 합산 제외. 실제 고유 정의 TC 132 + 위임 표식 다수. 검증 책임 기준 type 합은 위 표.)

### 28.3 needs real LLM 분류

- **Y (실 LLM, e2e/실증 manual-gate)**: 28 e2e 전부 + TC-6.1,6.5,7.1,8.1,8.3,9.1,10.1,10.4,11.1(스모크 채팅 포함 manual-gate) + TC-13.1,13.4(1토큰 실증) ≈ 약 41 TC. 과금/비결정 — requirements.md E2E 규칙(visible/non-empty/시간 내/id 변경/status·content-type 만 어설션) 강제.
- **N (모킹/순수 함수/정적 검사)**: unit 60 + integration 27 + 보안·구조 manual-gate 다수. 과금 0.

### 28.4 추적성 결론 — **갭 없음**

- **UC 노드**: 124 시나리오 노드(메인 24 + 분기 35 + 에러 29 + 엣지 36) **전수**가 ≥1 TC 에 매핑(위임 노드 포함, 위임 대상 TC 명시). 미매핑 노드 **0**.
- **FR-01~12**: 12개 전부 ≥1 TC. 미커버 FR **0**.
- **AC-1~11**: 11개 전부 ≥1 TC. 미커버 AC **0**.
- **NFR-1~11 / AD-1~5**: 핵심 강제 조항 전부 ≥1 manual-gate/unit/integration TC 로 매핑. 특히:
  - AC-4/NFR-6(토글 diff 0): TC-6.1/6.6/7.1/7.4/8.1/8.4 가 `git diff -- agent.ts route.ts == 0줄` 을 manual-gate 로 강제, AD-1 에 따라 분기 격리 검증은 buildAgentOptions 단위(TC-6.3)로 타깃.
  - AD-2(registry 순수): TC-6.2/7.2/8.2/11.3/25.16/25.18 이 호출 후 `./.data/` 미생성 어설션.
  - AD-3(동시 cold-start): TC-21.2 가 `createDeepAgent ≤1회`(Promise 메모이즈) 단위 검증.
  - AD-4(route 계약): TC-16.1~16.4/23.3/23.4/24.3 이 400+{error} JSON(SSE 아님) + 빈/공백 route 거부.
  - FR-09/trap4·5: chunkFilter 단위 스위트(TC-18.7~18.13, 19.4, 19.5) + e2e/manual probe(TC-18.1,18.2,19.1,19.2).
  - trap11/AD-3: TC-21.1(HMR 싱글톤 생존) + TC-21.2(레이스).
  - "연속 2회 이상" stateful: TC-2.5/22.1 이 인사/추론/도구 유발 입력 섞어 2턴 플로우 ≥2회 반복.
  - 보안 manual-gate: TC-26.1(키 grep 0), TC-26.3(rehype 순서), TC-26.4(cancel/인코더), TC-26.5(SQLite 경로 비-요청영향) 전부 포함.

> 실제 테스트 구현은 `test-writer` 에이전트가 본 문서의 TC 명세를 근거로 작성한다.
> 본 문서는 코드/테스트를 포함하지 않으며 검증 명세만 정의한다.

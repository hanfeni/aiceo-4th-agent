# Use Cases: DeepAgents JS 하네스 + 스트리밍 챗 에이전트

> Based on [PRD](../PRD.md) — 1. DeepAgents JS 하네스 + 스트리밍 챗 에이전트 (FR-01 ~ FR-12)
> 원본 스펙: [requirements.md](../../requirements.md), 코드 생성 하드 규칙: [CLAUDE.md](../../CLAUDE.md) (R1~R8)
> 작성일: 2026-05-18 KST · 상태: Draft · 유형: CREATE (기존 use-case 파일 없음 — 신규 도메인)

---

## 문서 규약

- 본 문서는 PRD 1장(단일 기능 = 전체 범위)의 모든 시나리오를 빠짐없이 전개한다.
- 각 UC 는 PRD 의 FR/AC, requirements.md 의 함정(trap) 번호를 인용해 추적성을 유지한다.
- 산문은 한국어, 식별자·환경변수·이벤트명·패키지명은 영어 원형을 유지한다.
- UC ID(UC-N), 분기 ID(UC-N-A, UC-N-E1, UC-N-EC1)는 QA test case 와 E2E 가 직접 참조한다.
- 본 문서는 E2E 테스트의 단일 청사진(single source of truth)이다.
- "actor" 는 엔드 유저(방문자) 또는 개발자(하네스 운영자) 또는 시스템(route/agent/graph)이다.
- non-deterministic real API 특성상 어설션은 "비어있지 않음 / visible / 시간 내 도달"
  형태로만 기술한다. "정확히 N줄" / "특정 단어 포함" 어설션은 금지(AC-11).

### UC 인덱스

| 분류 | UC | 제목 | 핵심 FR/AC |
|------|----|------|-----------|
| Primary | UC-1 | 첫 메시지 전송 → 토큰 스트리밍 응답 | FR-01,03,04 / AC-1,5 |
| Primary | UC-2 | 멀티턴: 동일 대화에서 직전 발화 참조 | FR-02 / AC-2 |
| Primary | UC-3 | 새 대화 버튼 → 새 thread_id + 스토어 리셋 | FR-06 / AC-7 |
| Primary | UC-4 | 마크다운 렌더링 (코드 복사 + sanitize) | FR-05 / AC-6 |
| Primary | UC-5 | 헤더에 active provider/model 표시 | FR-07 / AC-8 |
| Alternative | UC-6 | 하네스 토글: planning off (diff 0) | FR-08,11 / AC-4 / NFR-6 |
| Alternative | UC-7 | 하네스 토글: tools [] (diff 0) | FR-08 / AC-4 / NFR-6 |
| Alternative | UC-8 | 하네스 토글: subagents [] (diff 0) | FR-08,12 / AC-4 / NFR-6 |
| Alternative | UC-9 | LLM 프로바이더 스위칭 anthropic↔openai | FR-10 / AC-9 |
| Alternative | UC-10 | 새 하네스 도구 추가 (파일1 + 레지스트리1줄) | FR-08 / H4 |
| Alternative | UC-11 | 하네스 토글: filesystem off / checkpointer memory | FR-12 / NFR-7 |
| Error | UC-12 | active 프로바이더 API 키 누락/무효 (precheck hard stop) | 환경 사전 점검 1 / NFR-4 |
| Error | UC-13 | 모델 not found (LLM_MODEL/LLM_PROVIDER 불일치) | AC-9 / 환경 사전 점검 2 |
| Error | UC-14 | 클라이언트 mid-stream disconnect (ReadableStream.cancel) | FR-01 / 함정 1 |
| Error | UC-15 | checkpointer 미주입 → 멀티턴 소실 (회귀 가드) | FR-02 / 함정 2 / R3 |
| Error | UC-16 | 잘못된 요청 본문 (Zod 검증 실패) | FR-01 / AC-1 |
| Error | UC-17 | 잘못된 LLM_PROVIDER 값 | AC-4 / FR-10 |
| Edge | UC-18 | thinking/reasoning 블록 본문 누출 차단 | FR-09 / 함정 4 / AC-3 |
| Edge | UC-19 | 서브에이전트 내부 메시지 본문 누출 차단 | FR-09 / 함정 5 / AC-3 |
| Edge | UC-20 | 긴 추론 답변 스트리밍: 커서 상태 + finally 확정 | FR-04 / AC-5 |
| Edge | UC-21 | dev HMR 싱글톤 리셋 → 멀티턴 회귀 가드 (globalThis) | NFR-7 / 함정 11 / R6 |
| Edge | UC-22 | "연속 2회 이상" stateful 검증 (검증 철학) | FR-02 / AC-2 |
| Edge | UC-23 | 빈/공백 메시지 입력 | FR-03 / AC-1 |
| Edge | UC-24 | 매우 긴 메시지 입력 | FR-03,04 |

분류별 시나리오 개수 요약은 문서 맨 끝 **시나리오 카운트** 절에 집계한다.

---

## UC-1: 첫 메시지 전송 → 토큰 스트리밍 응답

**Actor**: 엔드 유저(방문자)
**Preconditions**:
- 앱이 기동 중(`./run-dev.sh`, 포트 3000), active 프로바이더 API 키가 유효.
- 사용자가 `/chat` 페이지에 진입(루트 `/` → `/chat` 리다이렉트, PRD 1.8).
- 스토어 초기 상태: `messages = []`, `conversationId` 미발급 또는 빈 값, `isStreaming = false`.
**Trigger**: 사용자가 `ChatInput` textarea 에 질문을 입력하고 Enter 로 전송.

### Primary Flow (Happy Path)
1. 사용자가 textarea 에 "안녕" 같은 질문을 입력한다.
2. 사용자가 Enter 키를 누른다(Shift 미동반). `useChat` 가 전송을 시작한다.
3. 스토어에 user 메시지가 `addMessage` 로 추가되고, 빈 assistant 메시지가 하나 추가된다.
4. `setStreaming(true)` 로 전환되고 입력이 잠금 정책에 따라 잠긴다(FR-03).
5. `useChat` 가 `POST /api/chat` 를 `Content-Type: application/json`,
   body `{ query: "안녕" }`(conversationId 미포함)으로 호출한다.
6. route(`src/app/api/chat/route.ts`)가 Zod 로 본문을 검증한다(통과).
7. `conversationId` 미존재 → route 가 `crypto.randomUUID()` 로 발급한다(FR-01).
8. route 가 SSE 응답을 시작한다: HTTP 200, `Content-Type: text/event-stream`.
9. 첫 SSE 이벤트로 `{ type: 'thread', conversationId }` 가 전송된다(AC-1).
10. `useChat` 가 `thread` 이벤트 → `setConversationId(conversationId)` 로 스토어에 저장한다.
11. agent 가 `graph.stream(input, { configurable: { thread_id: conversationId } }, "messages")`
    로 컴파일된 그래프를 인프로세스 스트리밍한다(함정 1).
12. `chunkFilter` 를 통과한 텍스트 토큰이 `{ type: 'token', ... }` 이벤트로 반복 forward 된다.
13. `useChat` 가 각 `token` → `appendToLastAssistant` 로 마지막 assistant 메시지에 점진 append.
14. `MessageList` 가 토큰을 실시간 렌더하며 스트리밍 커서를 표시한다(FR-04).
15. 그래프 스트림 종료 시 `{ type: 'done' }` 이벤트가 전송된다.
16. `useChat` 가 `done` → 수신 루프를 break 한다.
17. `finally` 블록에서 `setStreaming(false)` + `finalizeLastAssistant()` 가 반드시 호출된다.
18. 입력 잠금이 해제되어 사용자가 다음 메시지를 보낼 수 있다.

**Postconditions**:
- 스토어에 user 1 + assistant 1(비어있지 않음) 메시지, `conversationId` 가 UUID 로 설정됨.
- `isStreaming = false`, 입력 활성. checkpointer 에 thread_id 키로 1턴 상태 저장됨.
- 첫 `token` 이벤트가 cold start 15초 / warm 3초 이내 도달(NFR-1, AC-1).
- assistant 버블이 15초 내 visible, innerText 가 60초 내 non-empty(AC-5, AC-11).

### Alternative Flows
- **UC-1-A: Send 버튼 클릭 전송** — Enter 대신 Send 버튼 클릭으로 트리거.
  1. 사용자가 textarea 입력 후 Send 버튼을 클릭한다.
  2. 2단계 이후 Primary Flow 와 동일하게 진행된다.
- **UC-1-B: Shift+Enter 줄바꿈 후 전송** — 멀티라인 질문(FR-03).
  1. 사용자가 Shift+Enter 로 줄바꿈을 삽입한다(전송되지 않음, textarea 에 개행).
  2. 추가 텍스트 입력 후 Enter(단독)로 전송 → Primary Flow 2단계로 합류.
- **UC-1-C: conversationId 동반 첫 전송** — 클라이언트가 기존 conversationId 보유 시.
  1. body 에 `{ query, conversationId }` 포함 전송.
  2. route 가 randomUUID 발급을 건너뛰고 전달된 conversationId 로 thread 이벤트 전송.
  3. 이후 Primary Flow 11단계로 합류(checkpointer 가 해당 thread 히스토리 로드).

### Error Flows
- **UC-1-E1: 그래프 스트림 중 LLM API 에러** — provider 측 rate limit/5xx 발생.
  1. 그래프 스트림 도중 LLM 호출이 예외를 던진다.
  2. agent/route 가 `{ type: 'error', message: <에러 본문 그대로> }` SSE 이벤트를 전송한다(AC-9).
  3. `useChat` 가 `error` → `setError(message)` 로 스토어에 기록, UI 에 노출.
  4. `finally` 에서 `setStreaming(false)` + `finalizeLastAssistant()` 호출 → 입력 잠금 해제.
  5. 사용자는 재전송하거나 새 대화를 시작할 수 있다(터미널 상태 아님).
- **UC-1-E2: route 가 SSE 헤더 전 동기 예외** — agent 초기화 실패 등.
  1. route 핸들러가 스트림 시작 전 예외(예: checkpointer 생성 실패)를 던진다.
  2. 비-200 응답 또는 `error` 이벤트로 사용자에게 에러 본문이 보고된다.
  3. UI 가 에러를 표시하고 입력이 잠기지 않은 상태를 유지한다.

### Edge Cases
- **UC-1-EC1**: 빈/공백만 입력 후 Enter → UC-23 으로 위임(전송 차단 기대).
- **UC-1-EC2**: 첫 `token` 도달 전 사용자가 페이지 이탈/탭 닫음 → UC-14(disconnect)로 위임.
- **UC-1-EC3**: cold start 로 첫 청크가 3초 초과~15초 이내 → 커서만 보이다가 토큰 흐름 시작.
  버블 visible 은 15초 내, innerText non-empty 는 60초 내 만족해야 함(AC-5).

### Data Requirements
- **Input**: `{ query: string }` (JSON), optional `conversationId: string`.
- **Output**: SSE 이벤트 시퀀스 — ① `thread` ② `token`(반복) ③ `done` 또는 `error`.
- **Side Effects**: checkpointer(SQLite 기본)에 thread_id 키로 그래프 상태 1턴 영속.
  실 LLM API 호출(과금 발생). 클라이언트 스토어 상태 갱신. 모킹 경로 없음(NFR-11).

---

## UC-2: 멀티턴 — 동일 대화에서 직전 발화 참조

**Actor**: 엔드 유저(방문자)
**Preconditions**:
- UC-1 이 1회 이상 성공하여 스토어에 `conversationId`(thread_id) 가 설정됨.
- checkpointer 가 `createDeepAgent({ ..., checkpointer })` 로 주입되어 있음(R3, 함정 2).
- 1턴 상태가 해당 thread_id 키로 checkpointer 에 영속되어 있음.
**Trigger**: 사용자가 같은 대화 화면에서 직전 발화를 참조하는 후속 질문을 전송.

### Primary Flow (Happy Path)
1. 사용자가 1턴에서 어떤 주제(예: 특정 숫자/이름/사실)를 언급한 답변을 받았다.
2. 사용자가 "방금 그거 다시 설명해줘"처럼 직전 맥락을 참조하는 2턴 질문을 입력한다.
3. `useChat` 가 `POST /api/chat` 를 body `{ query, conversationId }`(동일 conversationId)로 호출.
4. route 가 Zod 검증 통과 → 전달된 conversationId 를 thread 이벤트로 그대로 반환.
5. agent 가 `graph.stream(input, { configurable: { thread_id: conversationId } }, "messages")` 호출.
6. checkpointer 가 동일 thread_id 의 기존 그래프 상태(1턴 히스토리)를 **자동 로드**한다(FR-02).
7. `conversationHistory` 를 클라이언트가 messages 에 수동으로 쌓아 보내지 **않는다**(R3, 중복 누적 방지).
8. 모델이 로드된 맥락을 반영해 직전 발화를 기억한 응답을 생성한다.
9. 토큰이 `chunkFilter` 통과 후 `token` 이벤트로 스트리밍된다.
10. `useChat` 가 `appendToLastAssistant` 로 2턴 assistant 메시지를 채운다.
11. `done` 수신 → `finally` 에서 `setStreaming(false)` + `finalizeLastAssistant()` 호출.

**Postconditions**:
- 2턴 assistant 응답이 직전 맥락을 기억한 채 비어있지 않게 수신됨(AC-2).
- 동일 thread_id 키 하나에 누적 그래프 상태(2턴)가 영속됨(중복 누적 아님).
- conversationId 는 변경되지 않음(같은 대화 유지).

### Alternative Flows
- **UC-2-A: 추론 필요 입력 2턴** — 1턴 일반, 2턴 "추론(reasoning) 필요" 입력
  (예: "17 x 24 답만 한 줄로"). thinking 누출 검증과 결합(UC-18 참조). 멀티턴 기억 + 누출 0 동시 만족.
- **UC-2-B: 도구 유발 입력 2턴** — 2턴이 등록된 custom tool/filesystem 을 유발하는 입력.
  도구 출력이 본문에 섞이지 않으면서(UC-19) 직전 맥락은 유지되어야 함.
- **UC-2-C: 3턴 이상 연속** — UC-22("연속 2회 이상" 검증 철학)로 확장. 매 턴 직전 맥락 유지.

### Error Flows
- **UC-2-E1: checkpointer 미주입/ thread_id 미전달** — UC-15(회귀 가드)로 위임.
  멀티턴이 무상태로 퇴화하여 직전 발화를 기억하지 못함 → 반드시 회귀로 차단.
- **UC-2-E2: 2턴 LLM API 에러** — UC-1-E1 과 동일 처리. 1턴 상태는 checkpointer 에 보존됨.

### Edge Cases
- **UC-2-EC1**: 1턴과 2턴 사이 긴 시간 경과 → SQLite 백엔드라 히스토리 보존(MemorySaver 였다면
  서버 재시작 시 증발, UC-11/NFR-7 참조).
- **UC-2-EC2**: 서로 다른 conversationId 두 개를 번갈아 전송 → 각 thread_id 가 독립 히스토리
  유지, 교차 오염 없음.
- **UC-2-EC3**: 새 대화(UC-3) 직후 2턴 시도 → 새 thread_id 라 직전 대화 맥락 비참조(정상 분리).

### Data Requirements
- **Input**: `{ query: string, conversationId: string }` (동일 conversationId 재사용).
- **Output**: SSE `thread`(동일 id) → `token`(맥락 반영) → `done`/`error`.
- **Side Effects**: 동일 thread_id 키에 그래프 상태 누적(checkpointer auto-load + save).
  수동 history 미전송. 실 LLM API 호출.

---

## UC-3: 새 대화 버튼 → 새 thread_id + 스토어 리셋

**Actor**: 엔드 유저(방문자)
**Preconditions**: 기존 대화가 진행 중(messages ≥ 1, conversationId 설정됨).
**Trigger**: 사용자가 `HeaderControls` 의 "새 대화" 버튼을 클릭.

### Primary Flow (Happy Path)
1. 사용자가 기존 대화(여러 메시지)를 보유한 상태로 "새 대화" 버튼을 클릭한다.
2. `resetChat` 액션이 호출된다(PRD 1.7 스토어 액션, 1.8 HeaderControls).
3. `resetChat` 가 새 `conversationId`(새 thread_id)를 발급한다.
4. `messages` 가 빈 배열로 초기화되고 `error = null`, `isStreaming = false` 로 리셋된다.
5. `MessageList` 가 메시지 0개를 렌더한다(빈 상태).
6. 헤더의 provider/model 표시는 유지된다(서버 환경 유래 — 변경 없음, FR-07).
7. 사용자가 다음 질문을 보내면 새 thread_id 로 UC-1 Primary Flow 가 시작된다.

**Postconditions**:
- `messages.length === 0`, `conversationId` 가 이전과 다른 값으로 변경됨(AC-7).
- 새 thread_id 는 이전 대화 맥락과 분리됨(checkpointer 가 새 키로 동작, FR-06).

### Alternative Flows
- **UC-3-A: 스트리밍 중 새 대화 클릭** — `isStreaming = true` 상태에서 클릭.
  1. 진행 중 스트림이 정리되거나 무시되고 `resetChat` 가 상태를 초기화한다.
  2. `isStreaming` 이 false 로 리셋되고 입력 잠금이 풀린다.
  3. (스펙 명시 정책이 없는 경계 — E2E 는 "메시지 0개 + conversationId 변경"만 어설션.)
- **UC-3-B: 빈 대화에서 새 대화 클릭** — messages 가 이미 0개일 때.
  1. `resetChat` 가 그래도 새 conversationId 를 발급한다(멱등적 안전).
  2. conversationId 가 변경되며 messages 는 0개 유지.

### Error Flows
- **UC-3-E1: resetChat 후 즉시 전송했는데 이전 thread 응답이 도착** — race.
  1. 이전 스트림의 잔여 토큰이 도착해도 새 빈 assistant 에 섞이지 않아야 한다.
  2. (E2E 가드: 새 대화 후 메시지 0개 확인 → 이후 새 전송만 채워짐.)

### Edge Cases
- **UC-3-EC1**: "새 대화" 연속 빠르게 2회 클릭 → 매 클릭마다 새 conversationId, messages 0개 유지.
- **UC-3-EC2**: 새 대화 후 동일 질문 재전송 → 이전 thread 와 분리된 새 답변(맥락 비공유).

### Data Requirements
- **Input**: 사용자 클릭(버튼). 서버 호출 없음(클라이언트 스토어 액션).
- **Output**: 스토어 상태 변경(`conversationId` 신규, `messages = []`).
- **Side Effects**: 없음(서버/ checkpointer 미접촉 — 새 thread_id 는 다음 전송 시점에 사용됨).

---

## UC-4: 마크다운 렌더링 (코드 복사 + rehype-sanitize XSS 방어)

**Actor**: 엔드 유저(방문자)
**Preconditions**: assistant 응답이 수신됨(스트리밍 중 또는 완료). `ChatMarkdown` 컴포넌트 사용.
**Trigger**: assistant 메시지가 코드 블록/표/목록/원시 HTML 을 포함한 마크다운으로 도착.

### Primary Flow (Happy Path)
1. assistant 응답에 코드 펜스, 표, 순서/비순서 목록이 포함되어 도착한다.
2. `ChatMarkdown` 이 react-markdown + remark-gfm 으로 GFM(표/목록 등)을 렌더한다.
3. 체인은 rehype-raw → **rehype-sanitize**(rehype-raw 뒤) 순으로 적용된다(FR-05, NFR-5).
4. 코드 블록에 언어 라벨과 복사 버튼이 표시된다.
5. 사용자가 복사 버튼을 클릭하면 코드 블록 내용이 클립보드에 복사된다.
6. 표/목록/코드가 가독성 있게 렌더된다.

**Postconditions**:
- GFM 요소가 시각적으로 렌더됨. 복사 버튼·언어 라벨 동작(AC-6).
- LLM 출력 내 위험 마크업(script 등)이 sanitize 로 무력화됨.

### Alternative Flows
- **UC-4-A: 스트리밍 중 점진 렌더** — 토큰 도착마다 부분 마크다운이 안전하게 재렌더.
  미완성 코드 펜스도 깨지지 않고 점진 표시(완료 시 최종 정합).
- **UC-4-B: 코드 블록에 언어 미지정** — 언어 라벨 없이도 복사 버튼은 동작.

### Error Flows
- **UC-4-E1: LLM 출력에 `<script>` / 이벤트 핸들러 주입 시도** — XSS 시나리오.
  1. assistant 출력에 `<script>alert(1)</script>` 또는 `<img onerror=...>` 가 포함된다.
  2. rehype-raw 가 원시 HTML 을 파싱하지만 후속 rehype-sanitize 가 위험 노드를 제거한다.
  3. 스크립트가 실행되지 않고 무해한 텍스트/제거된 형태로 렌더된다(AC-6, NFR-5).
- **UC-4-E2: 잘못된/깨진 마크다운** — 닫히지 않은 펜스, 깨진 표.
  1. react-markdown 이 가능한 한 견고하게 렌더(앱 크래시 없음).

### Edge Cases
- **UC-4-EC1**: 매우 큰 코드 블록 → 복사가 전체 내용을 포함해야 함.
- **UC-4-EC2**: 마크다운 특수문자만 포함(`***`, 백틱 등) → 크래시 없이 렌더.
- **UC-4-EC3**: thinking/reasoning 잔재가 마크다운에 섞여 들어옴 → 이는 chunkFilter
  단계(UC-18)에서 차단되어야 하므로 ChatMarkdown 에는 도달하지 않아야 함(연계 검증).

### Data Requirements
- **Input**: assistant 메시지 텍스트(마크다운 문자열, chunkFilter 통과분).
- **Output**: sanitize 된 DOM 렌더, 클립보드 복사 동작.
- **Side Effects**: 클립보드 쓰기(복사 시). 서버 호출 없음.

---

## UC-5: 헤더에 active provider/model 표시

**Actor**: 엔드 유저(방문자) / 개발자
**Preconditions**: 서버에 `LLM_PROVIDER`, `LLM_MODEL` 환경변수 설정됨.
**Trigger**: 사용자가 `/chat` 페이지를 로드.

### Primary Flow (Happy Path)
1. 사용자가 `/chat` 에 진입한다.
2. `HeaderControls` 가 active provider 와 model 식별자를 헤더에 표시한다(FR-07).
3. 표시값은 서버 환경변수(`LLM_PROVIDER`/`LLM_MODEL`)에서 유래한다.
4. API 키는 어떤 경로로도 노출되지 않는다(provider/model 식별자만).

**Postconditions**:
- 헤더에 active provider/model 식별자가 표시됨(AC-8).
- `.next/static/` grep 에서 `ANTHROPIC_API_KEY|OPENAI_API_KEY` 및
  `sk-(ant-)?[A-Za-z0-9_-]{20,}` 0 matches(NFR-4, AC-8).
- `NEXT_PUBLIC_` 접두사 키 0건.

### Alternative Flows
- **UC-5-A: provider=openai 일 때** — UC-9 로 프로바이더 전환 후 헤더 표시값이 openai/<model> 로 갱신.

### Error Flows
- **UC-5-E1: LLM_MODEL 미설정** — 표시값 결정 불가.
  1. 모델 ID 하드코딩 금지 정책(R8, 환경 사전 점검 2)에 따라 명확한 에러/빈 표시.
  2. (UC-13 모델 검증 실패와 연계 — 학습 지식 blocking 금지, 실증 기반.)

### Edge Cases
- **UC-5-EC1**: 빌드 산출물(`.next/static/`)에 키 문자열이 우연히 포함될 위험 → grep 0 강제.

### Data Requirements
- **Input**: 서버 환경변수 `LLM_PROVIDER`, `LLM_MODEL`(서버 전용).
- **Output**: 헤더에 provider/model 식별자(키 제외).
- **Side Effects**: 없음. API 키 클라이언트 번들 누출 0(NFR-4).

---

## UC-6: 하네스 토글 — planning off (agent.ts/route.ts diff 0)

**Actor**: 개발자(하네스 운영자)
**Preconditions**: 기능이 정상 동작(UC-1 통과). `HARNESS_PLANNING=true` 기본.
**Trigger**: 개발자가 `HARNESS_PLANNING=false` 로 설정 후 재기동.

### Primary Flow (Happy Path)
1. 개발자가 `.env`/`.env.local` 의 `HARNESS_PLANNING` 을 `false` 로 변경한다.
2. 포트 정리 + `.next` 캐시 삭제 후 재기동한다(함정 7).
3. `buildHarnessConfig(env)` 가 `planning.enabled = false` 로 `HarnessConfig` 를 조립한다(FR-08,11).
4. `agent.ts` 는 `buildHarnessConfig()` 결과만 받아 `createDeepAgent` 에 전달한다(분기 없음, R2/함정 6).
5. `pnpm build` 와 `eslint .` 에러 0(NFR-2). 서버 정상 기동.
6. 기본 채팅(UC-1)이 정상 동작한다(write_todos 미사용 상태).
7. `git diff` 로 `agent.ts` 와 `route.ts` 변경이 **0 줄**임을 확인한다(AC-4, NFR-6).

**Postconditions**:
- planning(write_todos) 비활성. 기본 채팅 정상. `agent.ts`/`route.ts` git diff 0 줄.

### Alternative Flows
- **UC-6-A: planning off 상태에서 멀티턴** — UC-2 가 planning 없이도 정상(checkpointer 독립).
- **UC-6-B: planning off → 다시 on 토글** — 환경변수만 되돌려 재기동, 코드 변경 0.

### Error Flows
- **UC-6-E1: 토글 위해 agent.ts/route.ts 를 수정하게 됨** — 설계 실패(함정 6, R2).
  1. agent.ts 에 `if(planningEnabled)` 분기가 흩뿌려져 있으면 NFR-6 위반.
  2. 회귀: 토글 후 두 파일 diff 가 0 줄이 아니면 FAIL 로 간주(아키텍처 위반 차단).

### Edge Cases
- **UC-6-EC1**: `HARNESS_PLANNING` 미설정(빈 값) → 기본값(true) 적용, 채팅 정상.
- **UC-6-EC2**: `HARNESS_PLANNING=False`/`0` 등 변형 표기 → 레지스트리 파싱 규칙대로 일관 처리.

### Data Requirements
- **Input**: 환경변수 `HARNESS_PLANNING=false`.
- **Output**: `HarnessConfig.planning.enabled = false`.
- **Side Effects**: 없음(레지스트리 조립만). agent.ts/route.ts 코드 불변.

---

## UC-7: 하네스 토글 — tools [] (agent.ts/route.ts diff 0)

**Actor**: 개발자(하네스 운영자)
**Preconditions**: 기능 정상. `harness/tools/index.ts` 에 예시 도구 1개 등록되어 있음(H4).
**Trigger**: 개발자가 레지스트리 `tools` 배열을 `[]` 로 비우고 재기동.

### Primary Flow (Happy Path)
1. 개발자가 `tools/index.ts`(등록 지점) 배열을 빈 배열로 만든다(또는 미등록).
2. 캐시 삭제 + 재기동(함정 7).
3. `buildHarnessConfig` 가 `tools: []` 로 조립한다(빈 배열 허용 — FR-08 계약).
4. `agent.ts` 는 빈 tools 를 받아 `createDeepAgent` 에 전달(분기 없음).
5. build/lint 0, 서버 기동, 기본 채팅(UC-1) 정상(도구 없는 순수 챗).
6. `agent.ts`/`route.ts` git diff 0 줄(AC-4, NFR-6).

**Postconditions**:
- custom tools 0개. 기본 채팅 정상. agent.ts/route.ts diff 0.

### Alternative Flows
- **UC-7-A: tools [] + 멀티턴** — checkpointer 멀티턴이 도구 없이도 정상(UC-2 합류).

### Error Flows
- **UC-7-E1: tools [] 인데 agent.ts 수정 필요** — 설계 실패(R2, UC-6-E1 과 동일 가드).

### Edge Cases
- **UC-7-EC1**: 도구 유발 의도 입력을 보내도 등록 도구 0개 → 모델이 도구 없이 일반 답변
  (도구 미존재로 인한 크래시 없음).

### Data Requirements
- **Input**: 레지스트리 `tools` 배열 = `[]`.
- **Output**: `HarnessConfig.tools = []`.
- **Side Effects**: 없음. 코드 불변.

---

## UC-8: 하네스 토글 — subagents [] (agent.ts/route.ts diff 0)

**Actor**: 개발자(하네스 운영자)
**Preconditions**: 기능 정상. `harness/subagents/index.ts` 가 SubagentSpec[] export.
**Trigger**: 개발자가 `subagents` 배열을 `[]` 로(또는 `HARNESS_SUBAGENTS=false`) 재기동.

### Primary Flow (Happy Path)
1. 개발자가 subagents 등록 배열을 비우거나 `HARNESS_SUBAGENTS=false` 로 설정한다.
2. 캐시 삭제 + 재기동.
3. `buildHarnessConfig` 가 `subagents: []` 로 조립(빈 배열 허용 — FR-08,12).
4. subagents 0개 → 단일 에이전트로 동작(H2).
5. build/lint 0, 기본 채팅(UC-1) 정상.
6. `agent.ts`/`route.ts` git diff 0 줄(AC-4, NFR-6).

**Postconditions**:
- subagent 미스폰. 단일 에이전트 채팅 정상. agent.ts/route.ts diff 0.

### Alternative Flows
- **UC-8-A: subagents [] + filesystem on** — 파일 도구는 살아있고 subagent 만 없음(독립 토글).

### Error Flows
- **UC-8-E1: subagents [] 인데 route.ts 수정 필요** — 설계 실패(R2, UC-6-E1 가드).

### Edge Cases
- **UC-8-EC1**: subagents [] 상태에서는 서브에이전트 누출(UC-19) 자체가 발생 불가 →
  메인 답변만 스트림. (subagents 활성 시 UC-19 누출 차단 별도 검증.)

### Data Requirements
- **Input**: `subagents` 배열 = `[]` 또는 `HARNESS_SUBAGENTS=false`.
- **Output**: `HarnessConfig.subagents = []`.
- **Side Effects**: 없음. 코드 불변.

---

## UC-9: LLM 프로바이더 스위칭 anthropic ↔ openai (환경변수)

**Actor**: 개발자(하네스 운영자)
**Preconditions**: 양 프로바이더 중 전환 대상 프로바이더의 API 키가 유효.
`model.ts` 가 프로바이더 추상화를 흡수(FR-10).
**Trigger**: 개발자가 `LLM_PROVIDER` 와 `LLM_MODEL` 만 변경 후 재기동.

### Primary Flow (Happy Path)
1. 개발자가 `.env` 에서 `LLM_PROVIDER=anthropic` → `openai`(또는 반대)로 변경한다.
2. `LLM_MODEL` 을 대상 프로바이더의 유효 모델 ID 로 교체한다(하드코딩 금지, R8).
3. 캐시 삭제 + 재기동.
4. `model.ts` 가 `LLM_PROVIDER` 로 `ChatAnthropic` / `ChatOpenAI` 인스턴스를 선택한다(FR-10).
5. 프로바이더 간 streaming/thinking 설정 차이를 `model.ts` 가 흡수한다.
6. 코드 변경 없이(환경변수만) 기본 채팅(UC-1)이 정상 동작한다(AC-9).
7. 헤더 provider/model 표시가 새 프로바이더로 갱신된다(UC-5 연계).
8. 모델 유효성은 1토큰 실증 호출로 판단한다(학습 지식 blocking 금지, 환경 사전 점검 2).

**Postconditions**:
- 전환된 프로바이더로 스트리밍 정상. 코드 diff 0(환경변수만 변경, AC-9).
- thinking 누출 0(UC-18)이 양 프로바이더 모두에서 유지(Claude thinking / GPT-5 reasoning).

### Alternative Flows
- **UC-9-A: LLM_PROVIDER 미지정** — 기본값 anthropic 적용(환경 사전 점검 1, FR-10).
- **UC-9-B: 전환 후 멀티턴** — UC-2 가 새 프로바이더로도 정상(checkpointer 프로바이더 독립).

### Error Flows
- **UC-9-E1: 전환 대상 프로바이더 키 누락** — UC-12(키 누락 hard stop)로 위임.
- **UC-9-E2: 모델 ID 가 해당 프로바이더에 없음** — UC-13(model not found)으로 위임.
  실패 시 "[모델 검증 실패] API 응답: <에러 본문 그대로>" 사용자 보고. 임의 대체 금지.
- **UC-9-E3: 잘못된 LLM_PROVIDER 값** — UC-17 로 위임(명확한 에러).

### Edge Cases
- **UC-9-EC1**: GPT-5 계열은 `max_tokens` 아닌 `max_completion_tokens` 사용 —
  `model.ts` 가 프로바이더별 차이를 흡수해야 함(환경 사전 점검 2 주의).
- **UC-9-EC2**: 전환 직후 기존 thread_id 로 멀티턴 → checkpointer 상태는 보존되나
  프로바이더가 바뀌어도 그래프 상태 호환(직전 발화 기억 유지) 확인.

### Data Requirements
- **Input**: 환경변수 `LLM_PROVIDER`(anthropic|openai), `LLM_MODEL`(대상 모델 ID).
- **Output**: 선택된 ChatModel 인스턴스. 코드 불변.
- **Side Effects**: 대상 프로바이더 실 API 호출(과금). 헤더 표시 갱신.

---

## UC-10: 새 하네스 도구 추가 (모듈 파일 1개 + 레지스트리 1줄)

**Actor**: 개발자(하네스 운영자)
**Preconditions**: 기능 정상. `harness/tools/` 슬롯과 `tools/index.ts` 등록 지점 존재(H4).
**Trigger**: 개발자가 새 안전 도구(외부 의존·과금 없음)를 추가하려 함.

### Primary Flow (Happy Path)
1. 개발자가 `harness/tools/<newTool>.ts` 파일 1개를 작성한다(LangChain `tool()` 형태).
2. `tools/index.ts` 배열에 해당 도구를 **1줄** 등록한다.
3. 그 외 파일(`agent.ts`/`route.ts`/`registry.ts` 본문 등) 변경은 **0**이다(FR-08, H4).
4. 캐시 삭제 + 재기동.
5. `buildHarnessConfig` 가 등록된 도구를 `tools` 배열에 합성해 주입한다.
6. build/lint 0. 기본 채팅 정상. 새 도구를 유발하는 입력 시 도구가 호출된다.
7. 도구의 내부 출력은 본문에 섞이지 않는다(UC-19 chunkFilter 연계).

**Postconditions**:
- 새 도구가 등록됨. 변경 파일 = 도구 모듈 1개 + 레지스트리 1줄(그 외 0, FR-08).
- 기본 채팅 정상 + 도구 호출 가능.

### Alternative Flows
- **UC-10-A: 외부 의존 도구(웹검색/코드실행)** — 슬롯만 마련, 등록은 후속.
  등록 절차를 README 에 명시(H4). 초기 범위에서는 미등록(과금/외부 의존 회피).
- **UC-10-B: 도구 제거** — 등록 1줄 제거 → 그 외 파일 변경 0, 채팅 정상(UC-7 와 동형).

### Error Flows
- **UC-10-E1: 도구 추가에 agent.ts 수정 필요** — 설계 실패(R2/함정 6, UC-6-E1 가드).
- **UC-10-E2: 도구 schema 가 zod 메이저 불일치** — R1/NFR-10 위반(zod ^4 정렬 필수).

### Edge Cases
- **UC-10-EC1**: 도구 1개 = 파일 1개 원칙 위반(한 파일에 여러 도구) → NFR-3 위반으로 거부.

### Data Requirements
- **Input**: 새 도구 모듈 파일 1개 + 레지스트리 등록 1줄.
- **Output**: `HarnessConfig.tools` 에 도구 추가.
- **Side Effects**: 없음(예시 도구는 외부 의존·과금 없음).

---

## UC-11: 하네스 토글 — filesystem off / checkpointer memory

**Actor**: 개발자(하네스 운영자)
**Preconditions**: 기능 정상. `harness/checkpointer.ts` 단일 팩토리 존재(NFR-7).
**Trigger**: 개발자가 `HARNESS_FILESYSTEM=false` 또는 `HARNESS_CHECKPOINTER=memory` 로 재기동.

### Primary Flow (Happy Path)
1. 개발자가 `HARNESS_FILESYSTEM=false` 로 설정 후 재기동한다(FR-12).
2. `buildHarnessConfig` 가 `filesystem.enabled = false` 로 조립.
3. 파일 도구(ls/read_file/write_file/edit_file) 미주입. 기본 채팅 정상.
4. `agent.ts`/`route.ts` diff 0(NFR-6 동형 가드).
5. 별도로 `HARNESS_CHECKPOINTER=memory` 설정 시 `checkpointer.ts` 가 MemorySaver 반환.
6. memory 백엔드에서도 동일 프로세스 내 멀티턴(UC-2)은 동작한다.

**Postconditions**:
- filesystem off 시 파일 도구 없음, 채팅 정상, 두 파일 diff 0.
- checkpointer=memory 시 동일 세션 멀티턴 동작(단, 재시작/HMR 시 히스토리 증발).

### Alternative Flows
- **UC-11-A: checkpointer=sqlite (기본)** — `./.data/checkpoints.sqlite` 사용,
  `.data/` 생성 보장, `.gitignore` 등록(NFR-8). 재시작 후에도 히스토리 보존.

### Error Flows
- **UC-11-E1: memory 백엔드 + 서버 재시작** — 멀티턴 히스토리 증발(함정 12, NFR-7).
  이는 의도된 한계 — 기본은 SQLite 여야 함. memory 는 테스트/일회성에만.
- **UC-11-E2: SQLite 파일 경로 디렉토리 미존재** — `.data/` 자동 생성 보장 누락 시 에러.
  `checkpointer.ts` 가 디렉토리 생성을 보장해야 함(PRD 1.7).

### Edge Cases
- **UC-11-EC1**: filesystem off + subagents 활성 → subagent 가 파일 도구 부재 환경에서
  동작(크래시 없이 가능 범위 내 응답).
- **UC-11-EC2**: SQLite 파일이 `.gitignore` 누락 → 형상관리 오염(NFR-8 위반, 가드).

### Data Requirements
- **Input**: `HARNESS_FILESYSTEM`, `HARNESS_CHECKPOINTER`(sqlite|memory), `CHECKPOINTER_SQLITE_PATH`.
- **Output**: `HarnessConfig.filesystem.enabled`, `HarnessConfig.checkpointer`(saver 인스턴스).
- **Side Effects**: SQLite 파일 생성(sqlite 백엔드). 코드 불변(레지스트리/checkpointer.ts 한곳).

---

## UC-12: active 프로바이더 API 키 누락/무효 (precheck hard stop)

**Actor**: 시스템(환경 사전 점검) / 개발자
**Preconditions**: `LLM_PROVIDER` 가 결정됨(미지정 시 기본 anthropic).
**Trigger**: active 프로바이더의 API 키가 `.env`/`.env.local` 에 없거나 무효.

### Primary Flow (Happy Path = 정상 차단)
1. 환경 사전 점검 단계가 active 프로바이더 키 존재를 확인한다(HARD PRECONDITION).
2. `LLM_PROVIDER=anthropic` 이면 `ANTHROPIC_API_KEY`, `openai` 면 `OPENAI_API_KEY` 필수.
3. active 프로바이더 키가 없으면 **즉시 멈추고** 사용자에게 키 제공을 요청한다.
4. 임의 대체(다른 프로바이더로 우회 등)는 **금지**(환경 사전 점검 1).
5. 키가 제공되면 정상 흐름(UC-1)으로 진행한다.

**Postconditions**:
- 키 부재 시 앱이 실 LLM 호출을 시도하지 않고 명확히 멈춤. 임의 대체 0건.

### Alternative Flows
- **UC-12-A: 비활성 프로바이더 키만 존재** — active=anthropic 인데 OPENAI_API_KEY 만 있음.
  1. active(anthropic) 키 부재로 hard stop. 비활성 키로 우회하지 않음.
- **UC-12-B: 런타임 중 키 무효(만료/취소)** — 전송 시 LLM API 가 401/403.
  1. `{ type: 'error', message: <에러 본문 그대로> }` 로 사용자 보고(UC-1-E1 합류).

### Error Flows
- **UC-12-E1: 키는 있으나 형식 불량** — 실증 호출 시 인증 실패 → 에러 본문 그대로 보고.

### Edge Cases
- **UC-12-EC1**: 키가 `NEXT_PUBLIC_` 접두사로 잘못 설정 → 보안 위반(NFR-4).
  precheck/리뷰가 이를 차단해야 함(클라이언트 번들 누출 위험).

### Data Requirements
- **Input**: `LLM_PROVIDER`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`(서버 전용).
- **Output**: precheck 결과(통과/하드 스톱). 누락 시 사용자 요청 메시지.
- **Side Effects**: 키 부재 시 LLM API 미호출. 보안: 키 클라이언트 비노출.

---

## UC-13: 모델 not found (LLM_MODEL / LLM_PROVIDER 불일치)

**Actor**: 시스템(환경 사전 점검) / 개발자
**Preconditions**: active 프로바이더 키는 유효. `LLM_MODEL` 이 해당 프로바이더에 존재하지 않음.
**Trigger**: 1토큰 실증 호출 또는 첫 채팅에서 모델 ID 불일치로 API 가 에러 반환.

### Primary Flow (Happy Path = 정상 보고)
1. 환경 사전 점검 2 가 active 프로바이더에 1토큰 실증 호출을 수행한다(소액 과금).
2. 모델의 존재 여부를 학습 지식 컷오프로 blocking 하지 **않는다**(실증만, R8).
3. API 가 "model not found" 류 에러를 반환한다.
4. 시스템이 사용자에게 보고한다: "[모델 검증 실패] API 응답: <에러 본문 그대로>.
   계속하려면 모델 ID 확인 필요."
5. 임의 대체 금지 — 사용자 결정 대기(환경 사전 점검 2).

**Postconditions**:
- 모델 불일치가 명확히 보고됨. 임의 모델 대체 0건. 사용자 결정까지 진행 보류.

### Alternative Flows
- **UC-13-A: 런타임 채팅 중 model not found** — precheck 통과 후 환경변수 변경으로 불일치.
  1. `{ type: 'error', message: <API 에러 본문 그대로> }` 로 사용자 보고(AC-9).

### Error Flows
- **UC-13-E1: GPT-5 계열인데 max_tokens 사용** — `max_completion_tokens` 필요(환경 사전 점검 2).
  잘못된 파라미터로 인한 에러도 본문 그대로 보고(model.ts 가 흡수해야 정상).

### Edge Cases
- **UC-13-EC1**: 모델 ID 가 학습 컷오프 이후 신모델 → 학습 지식으로 "없음" 단정 금지.
  실증 호출이 성공하면 진행(blocking 금지 — 검증 철학).

### Data Requirements
- **Input**: `LLM_PROVIDER`, `LLM_MODEL`, 1토큰 실증 요청.
- **Output**: 실증 성공/실패. 실패 시 에러 본문 그대로의 사용자 보고.
- **Side Effects**: 1토큰 실증 호출(소액 과금). 모델 ID 하드코딩 없음.

---

## UC-14: 클라이언트 mid-stream disconnect (ReadableStream.cancel)

**Actor**: 엔드 유저(방문자) / 시스템(route)
**Preconditions**: SSE 스트리밍이 진행 중(token 이벤트 흐름 중).
**Trigger**: 사용자가 스트리밍 중 탭/페이지를 닫거나 네트워크가 끊김.

### Primary Flow (Happy Path = 정상 정리)
1. assistant 토큰이 SSE 로 흐르는 중 클라이언트 연결이 끊긴다.
2. route 의 `ReadableStream.cancel()` 핸들러가 호출된다(FR-01, 함정 1).
3. 핸들러가 진행 중 `graph.stream()` 을 정리(중단/구독 해제)한다.
4. 서버 리소스(스트림/핸들)가 누수 없이 정리된다.
5. 끊기기 전까지의 그래프 상태는 checkpointer 정책에 따라 처리된다.

**Postconditions**:
- 서버 측 스트림/그래프 구독이 정리됨. 좀비 스트림/핸들 누수 0.

### Alternative Flows
- **UC-14-A: disconnect 후 동일 conversationId 재전송** — 새 요청으로 그래프 재스트림.
  1. checkpointer 가 thread_id 의 마지막 일관 상태에서 이어간다(부분 상태 정합 의존).

### Error Flows
- **UC-14-E1: cancel 핸들러 누락** — disconnect 시 그래프가 계속 돌아 과금/누수.
  회귀 가드: cancel 핸들러 미구현은 FR-01 위반으로 차단.

### Edge Cases
- **UC-14-EC1**: 첫 `thread` 이벤트 직후~첫 `token` 전 disconnect → 그래프 시작 직후 정리.
- **UC-14-EC2**: `done` 직전 disconnect → 거의 완료된 상태에서 정리(부분 응답 폐기).

### Data Requirements
- **Input**: 클라이언트 연결 종료 신호.
- **Output**: 서버 스트림 cancel 동작(추가 SSE 이벤트 없음).
- **Side Effects**: 진행 중 graph.stream 정리. 불필요한 추가 LLM 토큰 생성 중단.

---

## UC-15: checkpointer 미주입 → 멀티턴 소실 (회귀 가드)

**Actor**: 시스템(agent) / 개발자 (회귀 테스트 대상)
**Preconditions**: 잘못된 구현 가정 — `createDeepAgent` 에 checkpointer 미주입
또는 `graph.stream` 에 `thread_id` 미전달(R3/함정 2 위반 상태).
**Trigger**: 동일 conversationId 로 2턴 이상 전송.

### Primary Flow (= 결함 재현 → 회귀로 차단)
1. (결함 가정) checkpointer 가 `createDeepAgent` 에 주입되지 않았다.
2. 1턴 전송 → 응답 정상(무상태라도 1턴은 보임).
3. 동일 conversationId 로 직전 발화를 참조하는 2턴 전송.
4. checkpointer 가 없어 매 호출이 무상태 → 1턴짜리 챗으로 퇴화(함정 2).
5. 2턴 응답이 직전 발화를 기억하지 못한다(맥락 소실).
6. 회귀 테스트가 이 상태를 **FAIL** 로 검출한다(AC-2: 미주입/미전달 시 깨짐을 가드).

**Postconditions(가드 목표)**:
- 정상 구현에서는 UC-2 가 통과(직전 발화 기억). 미주입 시 회귀가 즉시 실패시킴.

### Alternative Flows
- **UC-15-A: checkpointer 주입했으나 thread_id 미전달** — `configurable.thread_id`
  누락 시에도 멀티턴 소실. 동일하게 회귀로 차단(R3).
- **UC-15-B: 수동 conversationHistory 누적으로 우회 시도** — 금지(R3).
  checkpointer 로드분과 중복 누적되어 컨텍스트 오염 → 안티패턴, 회귀로 차단.

### Error Flows
- **UC-15-E1: 단위 테스트에서 그래프 모킹으로 thread_id 전달 검증** — agent 단위
  테스트가 `configurable.thread_id` 전달과 checkpointer 주입을 모킹으로 검증(NFR-11).

### Edge Cases
- **UC-15-EC1**: 1턴만 보는 사용 패턴 — 결함이 드러나지 않으므로 반드시 2턴 검증 필요
  (검증 철학: "한 번 성공은 보장이 아니다").

### Data Requirements
- **Input**: 동일 conversationId 로 2턴 전송(직전 발화 참조).
- **Output**: (정상)맥락 기억 응답 / (결함)맥락 소실 → 회귀 FAIL.
- **Side Effects**: 정상 구현 시 checkpointer auto-load/save. 결함 시 무상태.

---

## UC-16: 잘못된 요청 본문 (Zod 검증 실패)

**Actor**: 시스템(route) / 잘못된 클라이언트
**Preconditions**: 앱 기동 중.
**Trigger**: `POST /api/chat` 에 스키마 불일치 본문 전송.

### Primary Flow (Happy Path = 정상 거부)
1. 클라이언트가 `{ query: 123 }` / `{}` / 비-JSON / `query` 누락 등으로 호출한다.
2. route 가 Zod 로 `{ query: string, conversationId?: string }` 를 검증한다(FR-01).
3. 검증 실패 → route 가 4xx(예: 400) 또는 명확한 에러 응답을 반환한다.
4. SSE 스트림이 시작되지 않고 그래프가 호출되지 않는다(불필요한 LLM 호출 0).

**Postconditions**:
- 잘못된 본문은 그래프 도달 전 차단. 과금/리소스 낭비 0.

### Alternative Flows
- **UC-16-A: conversationId 가 string 이 아님** — `conversationId: 123` 등.
  1. Zod optional 타입 검증 실패 → 거부(또는 스펙 정의대로 무시 후 randomUUID — 구현 계약 명시).
- **UC-16-B: 추가 알 수 없는 필드 포함** — `{ query, foo }`.
  1. Zod 스키마 정책대로 무시/거부(스펙은 query/conversationId 만 정의).

### Error Flows
- **UC-16-E1: Content-Type 누락/오류** — `application/json` 아님.
  1. body 파싱 실패 → 명확한 에러 응답(스트림 미시작).

### Edge Cases
- **UC-16-EC1**: `{ query: "" }`(빈 문자열) — UC-23(빈 메시지)으로 위임.
  Zod string 은 통과할 수 있으나 빈/공백 정책은 별도 UC 에서 다룸.
- **UC-16-EC2**: 매우 큰 body — UC-24(긴 메시지)로 위임.

### Data Requirements
- **Input**: 스키마 불일치 JSON / 비-JSON.
- **Output**: 4xx/에러 응답(SSE 미시작).
- **Side Effects**: 그래프/LLM 미호출. checkpointer 미접촉.

---

## UC-17: 잘못된 LLM_PROVIDER 값

**Actor**: 시스템(model.ts/registry) / 개발자
**Preconditions**: `LLM_PROVIDER` 가 `anthropic`/`openai` 가 아닌 값(예: `gemini`, 오타).
**Trigger**: 앱 기동 또는 첫 요청 시 프로바이더 선택.

### Primary Flow (Happy Path = 명확한 에러)
1. 개발자가 `LLM_PROVIDER=gemini`(미지원) 또는 오타 값을 설정한다.
2. `model.ts`/registry 가 프로바이더 선택을 시도한다.
3. 알 수 없는 프로바이더 값에 대해 **명확한 에러**를 발생시킨다(AC-4: "잘못된
   `LLM_PROVIDER` 값은 명확한 에러를 발생시킨다").
4. 임의로 기본값으로 무음 폴백하지 않는다(잘못된 설정을 숨기지 않음).

**Postconditions**:
- 미지원 프로바이더 값은 명확한 에러로 표면화. 무음 오동작 0.

### Alternative Flows
- **UC-17-A: LLM_PROVIDER 미설정(빈 값)** — UC-9-A 와 동일: 기본값 anthropic 적용
  (이는 "잘못된 값"이 아니라 "미지정" — 정상 기본 동작).

### Error Flows
- **UC-17-E1: 대소문자/공백 변형** — `Anthropic ` 등.
  1. 레지스트리 파싱 규칙대로 정규화하거나 명확한 에러(일관 처리 — 구현 계약 명시).

### Edge Cases
- **UC-17-EC1**: 레지스트리 단위 테스트가 "잘못된 provider → 명확한 에러"를 순수 함수로
  검증(AC-10 레지스트리 4~6 TC, LLM 호출 없이).

### Data Requirements
- **Input**: `LLM_PROVIDER`(미지원/오타).
- **Output**: 명확한 에러(throw/표면화).
- **Side Effects**: 그래프 생성 차단. LLM 미호출.

---

## UC-18: thinking/reasoning 블록 본문 누출 차단

**Actor**: 엔드 유저(방문자) / 시스템(chunkFilter)
**Preconditions**: 기능 정상. `utils/chunkFilter.ts` 가 LLM 호출과 분리된 순수 함수(R5, FR-09).
**Trigger**: 추론이 필요한 입력(예: "17 x 24 답만 한 줄로")으로 모델이 thinking/reasoning 생성.

### Primary Flow (Happy Path)
1. 사용자가 "17 x 24 답만 한 줄로" 같은 추론 유발 입력을 전송한다(검증 철학: 추론 입력 ≥1).
2. 모델이 thinking(Claude) / reasoning(GPT-5) 블록을 포함해 응답을 생성한다(함정 4).
3. `AIMessageChunk.content` 가 string 이면 그대로, 블록 배열이면 처리 분기.
4. `chunkFilter` 가 블록 배열에서 `type==="text"` 블록만 UI 로 yield 한다(R5).
5. `type==="thinking"/"reasoning"/"redacted_thinking"` 블록은 **버린다**.
6. 메인 그래프의 최종 어시스턴트 노드 출력만 노출(메타데이터 langgraph_node 등으로 출처 식별).
7. 사용자에게는 깨끗한 최종 답변만 토큰 스트리밍된다(US-8).

**Postconditions**:
- 최종 답변 스트림에 thinking/reasoning/redacted_thinking 텍스트 **0건**(AC-3).
- thinking 누출은 양 프로바이더(anthropic/openai) 모두에서 0(UC-9 연계).

### Alternative Flows
- **UC-18-A: content 가 string 인 경우** — 블록 배열 아닌 단순 문자열 → 그대로 통과(텍스트만).
- **UC-18-B: tool_use/tool_call 청크 동반** — 도구 청크는 (선택)표시용만, 본문엔 미혼입(함정 4).

### Error Flows
- **UC-18-E1: chunkFilter 가 text 블록까지 버림** — "버블 비고 커서만" 결함(자주 나오는 에러).
  1. 단위 테스트가 text 블록 통과를 보장(AC-3, AC-10 chunkFilter 5~7 TC).
- **UC-18-E2: thinking 블록 type 문자열 오인** — pre-work 실측(U3)으로 확정해야 함.
  실측과 학습 지식 차이 시 사용자 보고 후 PRD 개정(R8).

### Edge Cases
- **UC-18-EC1 (단위)**: chunkFilter TC — text 블록 통과 / thinking 블록 제거 /
  string content / 배열 content / 서브에이전트 노드 메타 제거 / 빈 청크 (AC-3, AC-10).
- **UC-18-EC2**: 멀티턴 중 추론 입력(UC-2-A) — 맥락 기억 + 누출 0 동시 만족.
- **UC-18-EC3**: redacted_thinking(암호화 사고) 블록 — 마찬가지로 본문 미노출.

### Data Requirements
- **Input**: 추론 유발 query. 그래프가 방출하는 AIMessageChunk(string/블록 배열).
- **Output**: text 블록만 추출된 토큰 스트림(thinking 제거).
- **Side Effects**: 없음(chunkFilter 는 순수 함수, LLM 미호출로 단위 테스트 가능).

---

## UC-19: 서브에이전트 내부 메시지 본문 누출 차단

**Actor**: 엔드 유저(방문자) / 시스템(chunkFilter)
**Preconditions**: subagents 활성(`HARNESS_SUBAGENTS=true`, 등록 spec ≥1). chunkFilter 동작.
**Trigger**: subagent spawn 또는 도구 호출을 유발하는 입력.

### Primary Flow (Happy Path)
1. 사용자가 subagent/도구 호출을 유발하는 입력을 전송한다(검증 철학: 도구 입력 ≥1).
2. subagent 가 spawn 되면 그 내부 메시지도 그래프 이벤트로 흐른다(함정 5).
3. `chunkFilter` 가 메타데이터(langgraph_node 등)로 출처 노드를 식별한다(R5, FR-09).
4. 메인 그래프의 최종 어시스턴트 노드 출력만 UI 로 yield 한다.
5. subagent/도구(tool_use/tool_call) 노드 출력은 버린다.
6. 사용자에게는 메인 답변만 노출된다.

**Postconditions**:
- subagent 내부 메시지·도구 출력이 최종 답변에 0건 혼입(AC-3, FR-09).

### Alternative Flows
- **UC-19-A: subagents [] 토글** — UC-8-EC1 과 동형: 누출 발생 자체가 불가(단일 에이전트).
- **UC-19-B: 도구만 활성(subagent 없음)** — tool_use/tool_call 출력만 필터링 대상.

### Error Flows
- **UC-19-E1: 출처 메타데이터 키 오인** — pre-work 실측(U4 langgraph_node 등)으로 확정.
  실측과 차이 시 사용자 보고 후 PRD 개정(R8). 잘못 필터하면 메인 답변 누락/오염.

### Edge Cases
- **UC-19-EC1 (단위)**: chunkFilter "서브에이전트 노드 메타 제거" TC 통과(AC-3, AC-10).
- **UC-19-EC2**: 멀티턴 + subagent(UC-2-B) — 직전 맥락 기억 + subagent 누출 0 동시.

### Data Requirements
- **Input**: subagent/도구 유발 query. 그래프 이벤트(노드 메타 포함).
- **Output**: 메인 어시스턴트 노드 텍스트만(subagent/도구 제거).
- **Side Effects**: 없음(chunkFilter 순수 함수). 실 그래프 실행 시 과금(E2E 한정).

---

## UC-20: 긴 추론 답변 스트리밍 — 커서 상태 + finally 확정

**Actor**: 엔드 유저(방문자)
**Preconditions**: 기능 정상. 추론이 길어지는 입력으로 다수 토큰 스트리밍.
**Trigger**: 사용자가 긴 답변/추론을 요하는 질문을 전송.

### Primary Flow (Happy Path)
1. 사용자가 긴 설명을 요하는 질문을 전송한다.
2. `setStreaming(true)` → 입력 잠금, `MessageList` 가 스트리밍 커서를 표시(FR-04).
3. 다수 `token` 이벤트가 도착하며 `appendToLastAssistant` 로 점진 누적된다.
4. 커서는 스트리밍 동안 마지막 assistant 메시지 끝에 유지된다.
5. `done` 수신 → 수신 루프 break.
6. `finally` 에서 `setStreaming(false)` + `finalizeLastAssistant()` 가 **반드시** 호출된다.
7. 커서가 사라지고 입력 잠금이 해제된다.

**Postconditions**:
- 긴 답변이 끊김 없이 누적됨. 종료 후 입력 잠금 해제(AC-5).
- 버블 visible 15초 내, innerText non-empty 60초 내(AC-5, AC-11).

### Alternative Flows
- **UC-20-A: 추론(thinking) 다량 동반** — UC-18 필터로 thinking 제거하면서 text 만 누적,
  사용자 체감상 커서가 잠시 멈춘 듯 보여도 finally 에서 정상 확정.

### Error Flows
- **UC-20-E1: `finalizeLastAssistant()` 호출 누락** — 입력 고착 회귀(AC-5 명시 가드).
  1. 스트림 종료/에러에도 `finally` 가 호출되지 않으면 입력이 영구 잠김.
  2. 회귀 테스트: 전송 종료 후 입력 잠금 해제를 반드시 어설션(AC-5).
- **UC-20-E2: 스트림 중 에러로 조기 종료** — UC-1-E1 합류. `finally` 가 그래도 호출되어
  `setStreaming(false)` + `finalizeLastAssistant()` 보장.

### Edge Cases
- **UC-20-EC1**: 토큰이 0개로 끝남(모델이 빈 응답) → assistant 버블이 빈 상태로 finalize.
  E2E 는 60초 내 non-empty 를 기대하므로 빈 응답은 모델 비결정성 경계로만 인지.
- **UC-20-EC2**: 첫 토큰까지 cold 15초 → 커서만 보이다가 토큰 흐름(AC-5 만족 범위).

### Data Requirements
- **Input**: 긴 답변 유발 query.
- **Output**: 다수 token 이벤트 → 누적 assistant 텍스트, done.
- **Side Effects**: 실 LLM 호출(다량 토큰, 과금). 스토어 점진 갱신 + finalize.

---

## UC-21: dev HMR 싱글톤 리셋 → 멀티턴 회귀 가드 (globalThis)

**Actor**: 개발자 / 시스템(agent 싱글톤)
**Preconditions**: dev 모드(`next dev`). 그래프·checkpointer 싱글톤이 `globalThis.__agent`
에 고정되어 있어야 함(R6, 함정 11, NFR-7).
**Trigger**: dev 중 코드 변경으로 HMR 이 route 모듈을 재평가.

### Primary Flow (Happy Path = HMR 견딤)
1. 사용자가 1턴을 보내 checkpointer 에 상태가 영속된다.
2. dev 중 HMR 이 route 모듈을 재평가한다(모듈 변수 초기화 위험).
3. 그래프·checkpointer 가 `globalThis.__agent` 에 고정되어 있어 재생성되지 않는다(R6).
4. 동일 conversationId 로 2턴 전송 → 싱글톤이 유지되어 멀티턴 맥락이 보존된다.
5. SQLite 파일 핸들 중복/메모리 체크포인터 초기화가 발생하지 않는다(함정 11).

**Postconditions**:
- dev HMR 이후에도 멀티턴(UC-2) 정상. 2번째 요청부터 멀티턴이 깨지지 않음.

### Alternative Flows
- **UC-21-A: production(next start)** — 모듈 재평가 없음. let 도 가능하나 globalThis 가
  양쪽 안전(함정 11). production 에서도 멀티턴 정상.

### Error Flows
- **UC-21-E1: globalThis 고정 누락(모듈 변수만)** — "dev 2번째 요청부터 멀티턴 깨짐"
  결함(자주 나오는 에러). 회귀 가드: dev 에서 HMR 후 멀티턴 소실은 FAIL(R6/함정 11).
- **UC-21-E2: MemorySaver + HMR** — UC-11-E1 과 결합. 메모리 백엔드는 HMR 리셋 시
  히스토리 증발 → 기본 SQLite 강제(NFR-7).

### Edge Cases
- **UC-21-EC1**: HMR 직후 SQLite 파일 핸들 중복 오픈 → globalThis 고정으로 단일 핸들 보장.
- **UC-21-EC2**: dev 서버 재시작(HMR 아닌 완전 재기동) — SQLite 백엔드면 히스토리 보존,
  memory 면 증발(NFR-7 의도된 한계).

### Data Requirements
- **Input**: 코드 변경 → HMR 트리거, 이후 동일 conversationId 2턴.
- **Output**: 싱글톤 유지 → 멀티턴 정상.
- **Side Effects**: globalThis.__agent 에 그래프/checkpointer 1회 고정.

---

## UC-22: "연속 2회 이상" stateful 검증 (검증 철학)

**Actor**: 시스템(검증) / 개발자
**Preconditions**: 멀티턴(UC-2) 정상 구현. 검증 철학: "한 번 성공은 보장이 아니다".
**Trigger**: 동일 thread_id 로 다양한 유형의 입력을 연속 2회 이상 전송.

### Primary Flow (Happy Path)
1. 동일 conversationId 로 1턴(일반 인사) 전송 → 응답 정상.
2. 동일 conversationId 로 2턴(직전 발화 참조 + 추론 필요 입력, 예: 계산) 전송.
3. 동일 conversationId 로 3턴(도구 호출 유발 입력) 전송(시나리오 다양화).
4. 매 턴 직전 맥락을 기억한 비어있지 않은 응답이 수신된다(AC-2).
5. 입력 유형을 섞어("추론 필요 ≥1 + 도구 유발 ≥1") 회귀를 누적 검증한다(검증 철학).
6. 하네스 요소 1개 토글(UC-6/7/8) 직후에도 동일 stateful 검증을 반복한다
   (조립 변경이 회귀를 부른다 — 검증 철학 마지막 항목).

**Postconditions**:
- 연속 2회 이상, 다양한 입력 유형에서 멀티턴 맥락 유지 검증 통과(AC-2).
- 토글 직후에도 검증 재실행되어 회귀 0 확인.

### Alternative Flows
- **UC-22-A: 짧은 인사만 반복** — 검증 부족(추론/도구 입력 미포함) → 검증 철학 위반.
  반드시 추론 입력 ≥1, 도구 입력 ≥1 포함해야 유효(probe 시나리오 규칙).

### Error Flows
- **UC-22-E1: 1턴만 통과하고 멀티턴 미검증** — UC-15 결함을 놓침.
  "한 번 성공"을 보장으로 오인하는 안티패턴 — 회귀 정책으로 차단.

### Edge Cases
- **UC-22-EC1**: 토글 ON→OFF→ON 사이클 직후 멀티턴 재검증 — 매 사이클 후 회귀 0.
- **UC-22-EC2**: anthropic/openai 양 프로바이더에서 각각 2턴 이상 검증(UC-9 연계).

### Data Requirements
- **Input**: 동일 thread_id, 다양한 유형의 query × ≥2회(추론 ≥1 + 도구 ≥1).
- **Output**: 매 턴 맥락 유지 비어있지 않은 응답.
- **Side Effects**: checkpointer 누적 상태. 실 LLM 호출(다회, 과금).

---

## UC-23: 빈/공백 메시지 입력

**Actor**: 엔드 유저(방문자)
**Preconditions**: `/chat` 진입, 입력 가능 상태.
**Trigger**: 사용자가 빈 textarea 또는 공백/개행만 입력 후 Enter/Send.

### Primary Flow (Happy Path = 정상 차단)
1. 사용자가 아무것도 입력하지 않거나 공백/개행만 입력한다.
2. Enter 또는 Send 를 누른다.
3. `ChatInput`/`useChat` 가 빈/공백 전송을 차단한다(불필요한 요청 0).
4. 스토어 messages 가 변하지 않고 서버 호출이 발생하지 않는다.

**Postconditions**:
- 빈/공백 전송 미발생. 그래프/LLM 미호출. UI 상태 불변.

### Alternative Flows
- **UC-23-A: 공백+실제 텍스트 혼합** — trim 후 비어있지 않으면 정상 전송(UC-1 합류).

### Error Flows
- **UC-23-E1: 클라이언트 차단 우회로 빈 query 가 route 도달** — UC-16-EC1 연계.
  1. route Zod/정책이 빈 query 를 거부하거나 정의된 계약대로 처리(스펙 명시 필요).

### Edge Cases
- **UC-23-EC1**: 공백만(스페이스/탭/개행) → trim 후 빈 문자열로 간주, 차단.
- **UC-23-EC2**: Shift+Enter 로 개행만 삽입 후 Enter → 줄바꿈은 전송 아님(FR-03),
  최종 trim 빈값이면 차단.

### Data Requirements
- **Input**: 빈/공백 query.
- **Output**: 전송 차단(SSE 미시작).
- **Side Effects**: 없음.

---

## UC-24: 매우 긴 메시지 입력

**Actor**: 엔드 유저(방문자)
**Preconditions**: `/chat` 진입, 입력 가능 상태.
**Trigger**: 사용자가 매우 긴 텍스트(수천~수만 자)를 입력하고 전송.

### Primary Flow (Happy Path)
1. 사용자가 매우 긴 query 를 textarea 에 입력(Shift+Enter 다수 포함 가능)한다.
2. Enter/Send 로 전송한다.
3. route 가 Zod `query: string` 검증을 통과(길이 상한 미정의 시 통과)한다.
4. 그래프가 긴 입력을 처리하고 응답을 스트리밍한다(UC-1 합류).
5. UI 가 긴 user 버블과 스트리밍 assistant 버블을 정상 렌더한다.

**Postconditions**:
- 긴 입력도 크래시 없이 처리, 응답 스트리밍 정상(AC-5 어설션 동일).

### Alternative Flows
- **UC-24-A: 프로바이더 컨텍스트 한도 초과** — LLM API 가 길이 초과 에러 반환.
  1. `{ type: 'error', message: <에러 본문 그대로> }` 사용자 보고(UC-1-E1 합류).

### Error Flows
- **UC-24-E1: 본문이 서버 body 한도 초과** — route/플랫폼 한도 초과 시 명확한 에러
  (SSE 미시작, 그래프 미호출).

### Edge Cases
- **UC-24-EC1**: 긴 입력 + 멀티턴 — checkpointer 누적 상태가 커지나 thread_id 단위로 동작.
- **UC-24-EC2**: 긴 입력에 마크다운/코드 다수 포함 → user 버블 렌더 안정성(UC-4 연계).

### Data Requirements
- **Input**: 매우 긴 query 문자열.
- **Output**: 정상 스트리밍 또는 길이 초과 시 에러 본문 그대로 보고.
- **Side Effects**: 실 LLM 호출(토큰 다량, 과금). checkpointer 상태 증가.

---

## 시나리오 카운트 (E2E 청사진 집계)

| 분류 | UC 메인 | 분기(A/B/C…) | 에러(E*) | 엣지(EC*) | 비고 |
|------|---------|--------------|----------|-----------|------|
| **Primary** | 5 (UC-1~5) | 8 | 5 | 7 | 핵심 챗 플로우 |
| **Alternative** | 6 (UC-6~11) | 11 | 9 | 9 | 하네스 토글/프로바이더/도구 |
| **Error** | 6 (UC-12~17) | 8 | 6 | 6 | 키/모델/disconnect/회귀/Zod/provider |
| **Edge** | 7 (UC-18~24) | 8 | 9 | 14 | 누출/커서/HMR/stateful/빈·긴 입력 |
| **합계** | **24 UC** | **35** | **29** | **36** | 총 시나리오 노드 **124** |

집계 규칙: "UC 메인" = 최상위 UC 개수, "분기/에러/엣지" = 각 UC 하위 -A/-E*/-EC*
시나리오 노드 수의 분류별 합. 총 시나리오 노드 = 24(메인) + 35 + 29 + 36 = **124**.

### 분류별 요약 카운트(요청 형식)

- **Primary flows**: 5 메인 UC (UC-1 첫 메시지·스트리밍, UC-2 멀티턴, UC-3 새 대화,
  UC-4 마크다운, UC-5 provider/model 표시) + 8 alt + 5 error + 7 edge.
- **Alternative flows**: 6 메인 UC (UC-6 planning off, UC-7 tools [], UC-8 subagents [],
  UC-9 provider 스위칭, UC-10 도구 추가, UC-11 filesystem/checkpointer 토글)
  + 11 alt + 9 error + 9 edge.
- **Error flows**: 6 메인 UC (UC-12 키 누락, UC-13 model not found, UC-14 disconnect,
  UC-15 checkpointer 미주입 회귀, UC-16 Zod 실패, UC-17 잘못된 provider)
  + 8 alt + 6 error + 6 edge.
- **Edge cases**: 7 메인 UC (UC-18 thinking 누출, UC-19 subagent 누출, UC-20 커서/finally,
  UC-21 HMR globalThis, UC-22 연속 2회 stateful, UC-23 빈·공백, UC-24 긴 입력)
  + 8 alt + 9 error + 14 edge.

### FR/AC 커버리지 매트릭스

| FR | UC | AC | UC |
|----|----|----|----|
| FR-01 | UC-1, UC-14, UC-16 | AC-1 | UC-1, UC-16, UC-23 |
| FR-02 | UC-2, UC-15, UC-21, UC-22 | AC-2 | UC-2, UC-15, UC-22 |
| FR-03 | UC-1, UC-23, UC-24 | AC-3 | UC-18, UC-19 |
| FR-04 | UC-1, UC-20 | AC-4 | UC-6, UC-7, UC-8, UC-17 |
| FR-05 | UC-4 | AC-5 | UC-1, UC-20 |
| FR-06 | UC-3 | AC-6 | UC-4 |
| FR-07 | UC-5 | AC-7 | UC-3 |
| FR-08 | UC-6, UC-7, UC-8, UC-10 | AC-8 | UC-5 |
| FR-09 | UC-18, UC-19 | AC-9 | UC-9, UC-13 |
| FR-10 | UC-9, UC-17 | AC-10 | UC-17, UC-18, UC-19 (단위) |
| FR-11 | UC-6 | AC-11 | UC-1, UC-2, UC-3, UC-20 (E2E) |
| FR-12 | UC-8, UC-11 | | |

미커버 FR/AC 없음 — FR-01~12, AC-1~11 전부 ≥1 UC 에 매핑됨.

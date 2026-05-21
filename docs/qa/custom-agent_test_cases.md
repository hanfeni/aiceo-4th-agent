# Test Cases: 하네스 에이전트 생성 탭 + 동적 커스텀 에이전트 메뉴

> Based on [PRD](../PRD.md) §4 (FR-33~FR-39, NFR-23~NFR-26, AC-37~AC-43, AD-19~AD-21) and [Use Cases](../use-cases/custom-agent_use_cases.md) (UC-51~UC-55)
> 원본 스펙: [requirements.md](../../requirements.md), 코드 생성 하드 규칙: [CLAUDE.md](../../CLAUDE.md) (R1~R8)
> feature-slug: `custom-agent-builder` · 작성일: 2026-05-22 KST · 상태: Draft · 유형: CREATE

---

## 문서 규약

- 본 문서는 use-case 문서의 **모든 시나리오 노드**(UC-N / UC-N-AF* / UC-N-EF* / UC-N-EC*)를
  ≥1 개 테스트 케이스로 매핑한다. 매핑 컨벤션: `UC-51 → TC-51.1`, `UC-51-AF1 → TC-51.x`,
  `UC-51-EF1 → TC-51.x`, `UC-51-EC1 → TC-51.x` (한 UC 하위 노드는 TC-NN.<순번> 으로 연속 부여).
- 산문은 한국어, 식별자·환경변수·이벤트명·패키지명·파일경로는 영어 원형 유지.
- **Type 분류**:
  - `unit` — vitest, LLM 호출 없음. Zod 검증·slug/id 검증·selection 매핑·customAgentStore CRUD 는
    순수 함수/모킹으로 검증(NFR-25/AC-43). fs(better-sqlite3 + `.data/agents.json`)는 임시 디렉토리·
    globalThis 캐시 리셋으로 격리.
  - `integration` — route handler(`/api/harness/agents`) + 실제 customAgentStore + selection 필터
    경유. LLM 비호출. 챗 그래프는 모킹.
  - `e2e` — Playwright, **실 LLM API** 호출(non-deterministic). requirements.md `[E2E 테스트 작성 규칙]`
    강제: "정확히 N줄"/"특정 단어 포함" 어설션 금지, `retries: 1`, `reuseExistingServer: false`.
    챗 어설션은 (a) `/api/chat` 200 + `text/event-stream`, (b) 어시스턴트 버블 ≤15s visible,
    (c) 버블 innerText ≤60s non-empty, (d) conversationId 변경/유지 만 허용.
- **Priority**: `P0` = 핵심 happy path·보안·데이터 무결성(머지 차단). `P1` = 주요 대안/에러 흐름.
  `P2` = 엣지/UI 정합.
- **아키텍처 리뷰 반영(중요)**: AI-1 확정 — 본 기능은 **Prisma 미사용**. subagentStore 동형의
  **better-sqlite3 + JSON 파일 패턴(`.data/agents.json`)** + globalThis 캐시 싱글톤(R6)을 쓴다.
  PRD §4.7 의 "Prisma `CustomAgent` 테이블" 서술은 customAgentStore(JSON 영속)로 치환해 검증한다.
  id 는 SLUG_RE 호환(영문 소문자·숫자·하이픈, `assertValidSlug` 패턴 — AI-5). instruction 은
  instructionStore upsert 후 instructionId 로 저장(AI-3, 권장 옵션 a). POST 시 subagent/skill
  이름을 등록 목록과 대조해 미등록이면 400(AI-4).

---

## 1. 단위 — customAgentStore (CRUD · 검증 · 직렬화)

> 연계 FR-34/FR-39 / NFR-25/NFR-26 / AC-43 / DI-1·DI-2·DI-3 / AI-1·AI-4·AI-5

### TC-51.1: customAgentStore create → read 라운드트립
- **Type**: unit · **Priority**: P0 · **UC**: UC-51
- **Given**: 임시 `.data/` 디렉토리, globalThis 캐시 리셋된 customAgentStore. 등록 목록(subagentStore/skillStore)에 더미 항목 0개.
- **When**: `createCustomAgent({ name:"재무 분석가", description:"", instruction:"...", subagentNames:[], skillNames:[] })` 호출 후 `listCustomAgents()` / `getCustomAgent(id)` 조회.
- **Then**: 반환된 entry 에 SLUG_RE 호환 `id` 발급, `name`/`instruction` 입력대로 저장, `subagentNames`/`skillNames` = `[]`, `createdAt` 설정. `.data/agents.json` 파일에 1행 직렬화 기록. `listCustomAgents()` 길이 1, `getCustomAgent(id)` 가 동일 entry 반환.
- **Pass**: read 결과가 create 입력과 필드별 일치, JSON 파일에 영속.

### TC-51.2: id 형식 — assertValidSlug 패턴 거부
- **Type**: unit · **Priority**: P0 · **UC**: UC-51 (NFR-26/AC-43)
- **Given**: customAgentStore.
- **When**: id 후보로 `"../etc"`, `".env"`, `"한글이름"`, `"with space"`, `"a/b"`, `"~root"`, 빈 문자열, 65자 초과를 각각 검증(`assertValidSlug` 또는 store 발급 로직).
- **Then**: 전부 거부(throw 또는 정규화 후 SLUG_RE 통과 실패). 적법 입력(`"finance-bot"`, `"agent1"`)만 통과.
- **Pass**: path traversal·특수문자·과길이 전부 차단, 적법 slug 만 허용.

### TC-51.3: subagentNames/skillNames JSON 직렬화·역직렬화
- **Type**: unit · **Priority**: P0 · **UC**: UC-52 (DI-2/NFR-25)
- **Given**: customAgentStore, 등록 목록에 `sub-a`/`sub-b`(서브에이전트), `skill-x`(스킬) 존재(모킹).
- **When**: `createCustomAgent` 에 `subagentNames:["sub-a","sub-b"]`, `skillNames:["skill-x"]` 저장 → `.data/agents.json` 직접 읽기 → globalThis 캐시 리셋 → `getCustomAgent(id)` 재로드.
- **Then**: JSON 파일에 `subagentNames`/`skillNames` 가 JSON 문자열(또는 배열 컬럼)로 직렬화됨. 캐시 리셋 후 재로드 시 `string[]` 로 정확히 역직렬화(`["sub-a","sub-b"]`, `["skill-x"]`).
- **Pass**: 직렬화→역직렬화 라운드트립이 입력 배열과 동일.

### TC-51.4: 손상된 JSON graceful 처리
- **Type**: unit · **Priority**: P1 · **UC**: UC-55-EF1 (DI-1)
- **Given**: `.data/agents.json` 에 깨진 JSON 또는 비배열 작성, globalThis 캐시 미로드.
- **When**: `listCustomAgents()` 호출.
- **Then**: 예외 throw 0, 빈 배열 반환(subagentStore `ensureLoaded` 의 graceful 사상 계승). 손상 항목은 필터링.
- **Pass**: 손상 입력에 크래시 없이 빈/유효 목록 반환.

### TC-52.1: 미등록 subagent 이름 거부 로직(store 레벨)
- **Type**: unit · **Priority**: P0 · **UC**: UC-52-EF1 (NFR-26/AC-43/AI-4)
- **Given**: customAgentStore, 등록 목록(모킹)에 `sub-a` 만 존재.
- **When**: `createCustomAgent` 에 `subagentNames:["sub-a","존재하지않는것"]` 전달(또는 검증 함수 직접 호출).
- **Then**: 등록 목록 대조 → 미등록 `"존재하지않는것"` 으로 인해 throw(또는 거부). 행 생성 0.
- **Pass**: 등록 목록 밖 이름이 1개라도 있으면 거부, DB 행 미생성.

### TC-52.2: 미등록 skill 이름 거부 로직(store 레벨)
- **Type**: unit · **Priority**: P0 · **UC**: UC-52-EF1 (NFR-26/AC-43/AI-4)
- **Given**: customAgentStore, skillStore(모킹)에 `skill-x` 만 존재.
- **When**: `createCustomAgent` 에 `skillNames:["skill-x","unknown-skill"]` 전달.
- **Then**: 미등록 skill 거부, 행 생성 0.
- **Pass**: skill 등록 목록 밖 이름 거부.

### TC-52.3: 중복 이름 dedup/그대로 저장 동작 정합
- **Type**: unit · **Priority**: P2 · **UC**: UC-52-EC1
- **Given**: customAgentStore, 등록 목록에 `sub-a` 존재.
- **When**: `subagentNames:["sub-a","sub-a"]` 로 생성.
- **Then**: dedup 하거나 그대로 저장 — 어느 쪽이든 selection 매핑(`includes` 필터)에서 결과 동일. 저장·조회 시 예외 0.
- **Pass**: 중복 입력이 동작 정합을 깨지 않음.

### TC-54.1: deleteCustomAgent — 존재 id 제거
- **Type**: unit · **Priority**: P0 · **UC**: UC-54
- **Given**: customAgentStore, entry 1건 존재.
- **When**: `deleteCustomAgent(id)` 호출 후 `listCustomAgents()`.
- **Then**: 해당 행 제거, 목록 길이 0, `.data/agents.json` 갱신, `getCustomAgent(id)` = null/undefined.
- **Pass**: 삭제 후 조회 미적중, JSON 파일 반영.

### TC-54.2: deleteCustomAgent — 미존재 id idempotent
- **Type**: unit · **Priority**: P1 · **UC**: UC-54-EF1 (AC-42/DI-3)
- **Given**: customAgentStore, 빈 목록 또는 다른 id 만 존재.
- **When**: `deleteCustomAgent("gone")` 호출.
- **Then**: 예외 0, 조용히 통과(idempotent — subagentStore 사상 계승). 기존 목록 무변화.
- **Pass**: 미존재 id 삭제가 throw 없이 통과, 타 행 무영향.

### TC-54.3: deleteCustomAgent — path traversal id 거부
- **Type**: unit · **Priority**: P0 · **UC**: UC-54-EF3 (NFR-26)
- **Given**: customAgentStore.
- **When**: `deleteCustomAgent("../../etc/passwd")` 등 path traversal id 호출.
- **Then**: `assertValidSlug` 형식 거부(throw 400 매핑) 또는 미적중 idempotent 통과. 파일시스템/타 행 접근 0.
- **Pass**: traversal id 가 파일시스템에 도달하지 않음.

---

## 2. 단위 — POST/DELETE route Zod 검증 (LLM 비호출, 그래프 모킹)

> 연계 FR-34/FR-39 / AC-37/AC-43 / §1 AD-4 에러 패턴 / NFR-11(route mock 분기 0)

### TC-51.5: POST Zod — name 필수·빈값 거부
- **Type**: unit · **Priority**: P0 · **UC**: UC-51-EF1 (AC-43)
- **Given**: `/api/harness/agents` route handler 로드, customAgentStore 모킹.
- **When**: body `{ name:"", instruction:"x" }` 및 `{ instruction:"x" }`(name 누락) 및 `{ name:"   " }`(공백뿐) 각각 POST.
- **Then**: HTTP 400 + `{ error: "name(에이전트 이름)이 필요합니다." }`(§1 AD-4 패턴). store create 호출 0.
- **Pass**: name 빈/누락/공백 입력이 400, 행 미생성.

### TC-51.6: POST Zod — JSON 본문 아님 / 형식 오류
- **Type**: unit · **Priority**: P1 · **UC**: UC-51-EF2
- **Given**: route handler 로드.
- **When**: 비-JSON 본문 또는 `null`/배열 본문 POST.
- **Then**: HTTP 400 + `{ error }`. store 변화 0.
- **Pass**: 잘못된 본문이 400, 부수효과 0.

### TC-51.7: POST Zod — description 선택(생략 허용)
- **Type**: unit · **Priority**: P1 · **UC**: UC-51-AF2
- **Given**: route handler, store 모킹.
- **When**: body `{ name:"봇", instruction:"x" }`(description 미포함) POST.
- **Then**: HTTP 2xx, description 은 빈 문자열(`description ?? ""` 사상)로 저장. 정상 생성.
- **Pass**: description 생략이 정상 생성으로 이어짐.

### TC-51.8: POST Zod — 과길이 거부(name/description/instruction 상한)
- **Type**: unit · **Priority**: P0 · **UC**: UC-51-EC1 (NFR-26/보안)
- **Given**: route handler, 길이 상한 상수(subagentStore `MAX_*` 사상 계승).
- **When**: name·description·instruction 각각 상한 초과 문자열로 POST.
- **Then**: HTTP 400 + `{ error }`(폭주 방어). store create 호출 0.
- **Pass**: 각 필드 과길이 입력이 400, 행 미생성.

### TC-52.4: POST — subagentNames 미등록 거부(route 레벨)
- **Type**: unit · **Priority**: P0 · **UC**: UC-52-EF1 (AC-43/AI-4)
- **Given**: route handler, 등록 목록(subagentStore)에 `sub-a` 만 존재(모킹).
- **When**: body `{ name:"봇", instruction:"x", subagentNames:["존재하지않는것"], skillNames:[] }` POST(클라이언트 우회 모사).
- **Then**: HTTP 400 + `{ error }`(임의 신규 부여 0). store create 호출 0.
- **Pass**: 등록 목록 밖 subagent 이름이 400.

### TC-52.5: POST — subagentNames/skillNames 타입 위반 거부
- **Type**: unit · **Priority**: P1 · **UC**: UC-52-EF2
- **Given**: route handler.
- **When**: body `{ name:"봇", instruction:"x", subagentNames:"sub-a" }`(배열 아닌 문자열) POST.
- **Then**: Zod 거부 → HTTP 400 + `{ error }`.
- **Pass**: 배열 아닌 타입이 400.

### TC-51.9: POST — instruction 기본값(빈 문자열 허용 시) 정상 생성
- **Type**: unit · **Priority**: P1 · **UC**: UC-51-AF1
- **Given**: route handler, 확정된 Zod 스키마(instruction 선택 가정 — 구현 스키마 기준 분기).
- **When**: body `{ name:"봇" }`(instruction 미포함 또는 빈 문자열) POST.
- **Then**: 스키마가 선택이면 2xx + instructionId 가 §1 기본 systemPrompt 경로로 폴백(AD-3 옵션 a). 스키마가 필수면 본 TC 는 TC-51.5 형태 400 으로 전환.
- **Pass**: 구현 Zod 스키마와 정합(선택→2xx / 필수→400).

### TC-51.10: POST DB 쓰기 오류 → 500, 본문 비노출
- **Type**: unit · **Priority**: P1 · **UC**: UC-51-EF3 (DI-3)
- **Given**: route handler, customAgentStore.create 가 throw 하도록 모킹(디스크/락 모사).
- **When**: 정상 body POST.
- **Then**: HTTP 500 + `{ error: "에이전트를 저장하지 못했습니다." }`(스택은 서버 로그에만). 부분 생성 0.
- **Pass**: 500 + 일반 에러 메시지, 스택/내부정보 본문 비노출.

### TC-54.4: DELETE — id 누락 400
- **Type**: unit · **Priority**: P1 · **UC**: UC-54-EF2
- **Given**: route handler.
- **When**: `?id=` 없이 또는 body `{}` 로 DELETE.
- **Then**: HTTP 400 + `{ error: "id 가 필요합니다." }`(subagentStore DELETE 패턴 계승).
- **Pass**: id 누락이 400.

### TC-54.5: DELETE — 미존재 id idempotent(정책 명시)
- **Type**: unit · **Priority**: P0 · **UC**: UC-54-EF1 (AC-42)
- **Given**: route handler, store 빈 목록.
- **When**: `DELETE /api/harness/agents?id=gone`.
- **Then**: **정책 = idempotent 2xx** + `{ ok: true }`(subagentStore 삭제 사상 계승, 404 아님). store 무변화.
- **Pass**: 미존재 id 가 에러 없이 2xx(idempotent 통과).

### TC-54.6: DELETE — body `{id}` 방식 지원
- **Type**: unit · **Priority**: P2 · **UC**: UC-54-AF1
- **Given**: route handler.
- **When**: `?id=` 쿼리 대신 body `{ id }` 로 DELETE.
- **Then**: 쿼리 방식과 동일 동작(2xx + 행 제거).
- **Pass**: 두 입력 방식이 동등 동작.

### TC-54.7: DELETE — path traversal id 안전 처리
- **Type**: unit · **Priority**: P0 · **UC**: UC-54-EF3 (NFR-26)
- **Given**: route handler.
- **When**: `?id=..%2F..%2Fetc` 등 traversal id DELETE.
- **Then**: 형식 거부(400) 또는 미적중 idempotent 2xx. 파일시스템/타 행 접근 0.
- **Pass**: traversal id 가 파일시스템·타 행에 도달 0.

---

## 3. 통합 — store + route + selection 필터 (LLM 비호출)

> 연계 FR-36/AC-40 / R2 불변 / NFR-25 / AI-2·AI-3

### TC-51.11: POST → GET 목록 확인 → DELETE → GET 비어있음
- **Type**: integration · **Priority**: P0 · **UC**: UC-51 + UC-54 + UC-55 (CRUD 라운드트립)
- **Given**: 임시 `.data/` , 실제 customAgentStore, route handler. 등록 목록에 더미 subagent/skill.
- **When**: (1) `POST /api/harness/agents` 정상 body → 2xx + `{ id }`. (2) `GET /api/harness/agents` → 목록에 해당 id 포함. (3) `DELETE ?id=<id>` → 2xx. (4) `GET` 재호출.
- **Then**: 생성 후 GET 에 1건, 삭제 후 GET 에 0건. `.data/agents.json` 가 각 단계 반영.
- **Pass**: 생성→조회→삭제→조회 전 단계 정합.

### TC-52.6: selection 필터 — subagentNames 로 buildHarnessConfig 호출 시 올바른 서브에이전트만 포함
- **Type**: integration · **Priority**: P0 · **UC**: UC-52 (AC-40/R2/FR-36)
- **Given**: HARNESS_SUBAGENTS 내장 + 커스텀 서브에이전트 다수 등록(`sub-a`,`sub-b`,`sub-c`). custom agent 의 `subagentNames:["sub-a","sub-b"]`.
- **When**: 그 조합을 `selection.subagents` 로 매핑해 `buildHarnessConfig(env, ..., { subagents:["sub-a","sub-b"] })` 호출.
- **Then**: 반환 `HarnessConfig.subagents` 에 `sub-a`,`sub-b` 만 포함(`sub-c`·내장 미선택분 제외 — registry.ts `selection.subagents!.includes(s.name)` 필터). selection.subagents=null 이면 전체(회귀 0) 포함.
- **Pass**: selection 배열에 명시한 서브에이전트만 config 에 포함.

### TC-52.7: selection 필터 — skillNames 매핑 (skills selection)
- **Type**: integration · **Priority**: P0 · **UC**: UC-52 (AC-40/R2/FR-36)
- **Given**: skillStore 에 스킬 등록, filesystem 토글 ON(스킬 의존성 충족), custom agent `skillNames:["skill-x"]`.
- **When**: `buildHarnessConfig(env, ..., { skills:["skill-x"] })` 호출.
- **Then**: `resolveSkillSources` 가 빈 배열 아닌 selection 으로 스킬 활성(`config.skills.enabled=true`). 빈 배열(`skills:[]`) 이면 전부 끔(`enabled=false`).
- **Pass**: skill selection 이 registry 의 기존 skills 경로로 정확히 흡수.

### TC-52.8: selection 토글 회귀 0 — R2 불변식(diff 검증)
- **Type**: integration(manual-gate 병행) · **Priority**: P0 · **UC**: 횡단(NFR-24/AC-40)
- **Given**: 본 기능 머지 후 코드베이스.
- **When**: `HARNESS_PLANNING=false` / `tools` `[]` / `subagents` `[]` / filesystem soft toggle 적용 후 `agent.ts`·`registry.ts`·`/api/chat/route.ts` git diff 확인. selection 파라미터 시그니처 변경 확인.
- **Then**: 세 파일 git diff **0 줄**. registry.ts `buildHarnessConfig` 시그니처(selection 파라미터) 변경 0.
- **Pass**: 토글 3종 적용 시 핵심 3파일 diff 0 줄.

### TC-53.1: instruction upsert → instructionId 로 getSystemPromptBody 조회 성공
- **Type**: integration · **Priority**: P0 · **UC**: UC-53 (AI-3/FR-36)
- **Given**: instructionStore, customAgentStore. POST 시 instruction 텍스트를 instructionStore upsert 후 instructionId 로 저장(AI-3 권장 옵션 a).
- **When**: `POST /api/harness/agents` 로 instruction="너는 재무 전문가다" 생성 → 저장된 instructionId 로 `getSystemPromptBody(instructionId)` 조회.
- **Then**: instructionStore 에 본문 upsert 됨, instructionId 로 systemPrompt 본문 정확히 복원. 챗 시 §1 systemPrompt 경로(AD-1 buildAgentOptions)로 주입 가능.
- **Pass**: instruction → instructionId → 본문 조회 라운드트립 성공.

### TC-53.2: 빈 instruction → 기본 systemPrompt 폴백
- **Type**: integration · **Priority**: P1 · **UC**: UC-53-AF3 / UC-51-AF1
- **Given**: customAgentStore, 빈 instruction 으로 생성된 에이전트.
- **When**: 그 에이전트로 chat body 구성(instructionId 없음/빈 본문).
- **Then**: §1 기본 systemPrompt 경로 적용(AD-1). 챗 정상 동작(모킹 그래프로 token 흐름 확인).
- **Pass**: instruction 비어도 기본 프롬프트로 챗 가능.

### TC-55.1: GET 목록 — 멀티선택 후보 일치
- **Type**: integration · **Priority**: P1 · **UC**: UC-52 (AC-37)
- **Given**: subagentStore/skillStore 에 등록 항목, customAgentStore.
- **When**: AgentBuilder 가 받는 후보 소스(서브에이전트/스킬 목록 API 또는 GET)를 조회.
- **Then**: 후보 목록이 현재 등록된 서브에이전트(내장+커스텀)·스킬 목록과 정확히 일치(AC-37). stale 후보 없음.
- **Pass**: 멀티선택 후보 = 등록 목록.

---

## 4. E2E — 주요 흐름 (실 LLM)

> 연계 FR-33/35/37/38 / AC-37·39·41·42 / §1 챗 동작(AC-5) / non-deterministic 어설션 규칙

### TC-51.12: CREATE 탭 생성 → 사이드바 표시 → 클릭 → 챗 동작 (UC-51 전체 흐름)
- **Type**: e2e · **Priority**: P0 · **UC**: UC-51 (AC-37/AC-39/AC-41)
- **Given**: `./run-dev.sh` 기동(3000), active provider key 유효, `/harness` 진입, 빈 customAgentStore.
- **When**: (1) 우측 "에이전트 생성(CREATE)" 탭 클릭 → `AgentBuilder` 렌더. (2) name="재무 분석가", instruction 입력, 서브에이전트·스킬 미선택. (3) "생성" 클릭. (4) 사이드바 "나의 에이전트" 그룹의 새 항목 클릭 → `/custom-agent/[id]`. (5) 챗 입력 "안녕" 전송.
- **Then**: `POST /api/harness/agents` 2xx. 사이드바에 새 항목 새로고침 없이 등장(router.refresh). 챗 페이지 헤더에 name 표시. `POST /api/chat` 200 + `text/event-stream`, 어시스턴트 버블 ≤15s visible, innerText ≤60s non-empty.
- **Pass**: 생성→사이드바 등장→클릭→챗 토큰 스트림(visible/non-empty) 전 단계 통과.

### TC-52.9: 서브에이전트+스킬 선택 후 생성 → 챗에서 해당 조합만 활성 (UC-52)
- **Type**: e2e · **Priority**: P0 · **UC**: UC-52 (AC-40)
- **Given**: subagentStore 에 1개+, skillStore 에 1개+ 등록. `/harness` CREATE 탭.
- **When**: name 입력, 서브에이전트 1개·스킬 1개 멀티선택 후 생성 → 사이드바 항목 클릭 → 챗에서 도구/위임 유발 입력 전송.
- **Then**: 생성 2xx, `subagentNames`/`skillNames` 가 입력 조합으로 저장. 챗 `/api/chat` 200 + event-stream, 응답 ≤60s non-empty. (selection 단위 검증은 TC-52.6/52.7 로 보강 — e2e 는 non-empty 만 어설션.)
- **Pass**: 조합 선택 생성 후 챗이 정상 응답(non-empty), 단위 TC 로 selection 정합 보강.

### TC-53.3: 멀티턴 — 동일 페이지 연속 대화 (UC-53-AF2)
- **Type**: e2e · **Priority**: P1 · **UC**: UC-53-AF2 (§1 R3)
- **Given**: TC-51.12 로 생성된 에이전트 챗 페이지 진입, 1턴 성공(conversationId 설정).
- **When**: 동일 페이지에서 직전 발화 참조형 2턴 전송.
- **Then**: 2턴 버블 ≤15s visible, innerText ≤60s non-empty, conversationId **변경 없음**(checkpointer thread_id 공유). 수동 history 누적 0.
- **Pass**: 멀티턴 응답 non-empty, conversationId 불변.

### TC-53.4: 미존재 id 직접 접근 → 404 (UC-53-EF1)
- **Type**: e2e · **Priority**: P0 · **UC**: UC-53-EF1 (AC-39)
- **Given**: `/custom-agent/nonexistent-agent` 미생성 id.
- **When**: 해당 URL 직접 진입.
- **Then**: Server Component 조회 null → `notFound()` → 404 페이지 렌더.
- **Pass**: 미존재 id 가 404.

### TC-53.5: path traversal id 직접 접근 → 404 (UC-53-EF2)
- **Type**: e2e · **Priority**: P0 · **UC**: UC-53-EF2 (NFR-26)
- **Given**: `/custom-agent/..%2F..%2Fetc%2Fpasswd` 등 traversal URL.
- **When**: 직접 진입.
- **Then**: id 형식 위반 → 조회 미적중/형식 거부 → 404. 파일시스템 접근 0.
- **Pass**: traversal id 가 404, 파일시스템 미접근.

### TC-54.8: 삭제 → 사이드바 즉시 제거 (UC-54)
- **Type**: e2e · **Priority**: P0 · **UC**: UC-54 (AC-42/FR-38)
- **Given**: 생성된 커스텀 에이전트 1건, 사이드바에 표시 중.
- **When**: 삭제 액션 실행(`DELETE /api/harness/agents`) → `router.refresh()`.
- **Then**: `DELETE` 2xx, 사이드바 "나의 에이전트" 그룹에서 해당 항목 즉시 사라짐(새로고침 없이). 마지막 1개 삭제 시 그룹 빈 상태/미렌더.
- **Pass**: 삭제 후 사이드바 항목 즉시 제거.

### TC-53.6: 삭제된 에이전트 URL 직접 접근 → 404 (UC-53-EC1)
- **Type**: e2e · **Priority**: P1 · **UC**: UC-53-EC1 (UC-54 연계)
- **Given**: TC-54.8 로 삭제된 에이전트 id.
- **When**: 그 `/custom-agent/[id]` URL 직접 진입.
- **Then**: 조회 null → 404.
- **Pass**: 삭제 후 URL 접근이 404.

---

## 5. E2E/통합 — 사이드바 동적 표시 (UC-55)

> 연계 FR-37/FR-38 / AC-41 / AD-20(Server Component DB fetch, client 번들 미유입)

### TC-55.2: 정적 3그룹 보존 + "나의 에이전트" 그룹 동적 렌더
- **Type**: e2e · **Priority**: P0 · **UC**: UC-55 (FR-37/AC-41)
- **Given**: 커스텀 에이전트 1건+ 존재.
- **When**: 페이지 로드 → `AgentNav` Server Component 렌더.
- **Then**: 기존 3개 정적 그룹(AI 에이전트 / 에이전트 실습 A·B·C / 검색·라벨링 실습) 무손상 표시 + "나의 에이전트" 그룹(AGENT_ACCENT 보라)에 DB 항목 렌더. 각 href = `/custom-agent/[id]`, 라벨 = name.
- **Pass**: 정적 3그룹 + 동적 그룹 모두 렌더.

### TC-55.3: 커스텀 에이전트 0개 — 그룹 미렌더/빈 상태
- **Type**: e2e · **Priority**: P1 · **UC**: UC-55-AF1
- **Given**: 빈 customAgentStore.
- **When**: 페이지 로드.
- **Then**: "나의 에이전트" 그룹 미렌더(또는 빈 상태 안내). 정적 3그룹만 표시.
- **Pass**: 0개 시 동적 그룹 미표시, 정적 그룹 정상.

### TC-55.4: active 강조 — 현재 경로 일치 시 NavLink 강조
- **Type**: e2e · **Priority**: P2 · **UC**: UC-55 (AC-41)
- **Given**: 커스텀 에이전트 항목 존재, `/custom-agent/[id]` 진입.
- **When**: 사이드바 렌더 + 현재 경로 확인.
- **Then**: NavLink Client 조각(usePathname)이 경로 정확 일치 항목을 active 강조. 다른 항목 비강조.
- **Pass**: 현재 경로 항목만 active.

### TC-55.5: AD-20 — Prisma/DB 가 client 번들에 미유입
- **Type**: integration(manual-gate 병행) · **Priority**: P1 · **UC**: UC-55 (AD-20/NFR-13)
- **Given**: 빌드 산출물(`.next/`).
- **When**: client 번들에 customAgentStore/better-sqlite3/fs 모듈 import 흔적 grep. AgentNav 의 Server/Client 분할 확인.
- **Then**: DB fetch 는 Server Component 에서만, Client 조각은 usePathname active 강조만. client 번들에 DB/fs 모듈 0 matches.
- **Pass**: DB 접근 코드가 client 번들에 미유입.

### TC-55.6: DB fetch 오류 — 사이드바 폴백(전체 크래시 0)
- **Type**: integration · **Priority**: P1 · **UC**: UC-55-EF1 (DI-1)
- **Given**: customAgentStore.listCustomAgents 가 throw 하도록 모킹.
- **When**: `AgentNav` Server Component 렌더.
- **Then**: "나의 에이전트" 그룹 빈 상태 폴백(또는 error boundary), 정적 3그룹은 여전히 렌더. 사이드바 전체 크래시 0.
- **Pass**: DB 오류가 사이드바 전체를 무너뜨리지 않음.

### TC-55.7: 다수(20+) 커스텀 에이전트 표시
- **Type**: e2e · **Priority**: P2 · **UC**: UC-55-EC2
- **Given**: 20개 이상 커스텀 에이전트 생성.
- **When**: 사이드바 렌더.
- **Then**: 전체 목록 렌더, 사이드바 스크롤로 수용, 레이아웃 미파손.
- **Pass**: 다수 항목이 스크롤로 정상 표시.

### TC-55.8: 아주 긴 이름 — ellipsis/clip
- **Type**: e2e · **Priority**: P2 · **UC**: UC-55-EC1
- **Given**: 매우 긴 name 의 커스텀 에이전트.
- **When**: 사이드바 렌더.
- **Then**: 행 레이아웃 미파손(ellipsis/clip), 데이터 정합 무관.
- **Pass**: 긴 이름이 레이아웃을 깨지 않음.

---

## 6. 보안 — 횡단 (NFR-26)

> 연계 NFR-26 / AC-43 / §1 보안(키 비노출)

### TC-SEC.1: id path traversal 종합 거부
- **Type**: unit · **Priority**: P0 · **UC**: 횡단(UC-51/53/54)
- **Given**: customAgentStore + route handler.
- **When**: id/슬러그 입력으로 `'../'`, `'../../etc/passwd'`, `'.env'`, `'한글'`, `'with space'`, `'a/b'`, `'~'`, `'..%2F'`(URL 인코딩) 전체 케이스 적용(create id 발급·delete·route 조회).
- **Then**: 전부 SLUG_RE/assertValidSlug 거부(400) 또는 미적중(404/idempotent). 파일시스템 경로 조작 0.
- **Pass**: 모든 traversal/특수문자/한글/공백 입력 차단.

### TC-SEC.2: 미등록 subagent/skill 신규 부여 0
- **Type**: unit · **Priority**: P0 · **UC**: UC-52-EF1 (AI-4)
- **Given**: route handler, 등록 목록 모킹.
- **When**: 등록 목록 밖 subagent·skill 이름을 body 로 직접 전송(클라이언트 우회).
- **Then**: 400 거부, store create 0, subagentStore/skillStore 신규 부여 0.
- **Pass**: 임의 신규 부여 0(등록 목록 내로 한정).

### TC-SEC.3: instruction/description 길이 상한 거부
- **Type**: unit · **Priority**: P0 · **UC**: UC-51-EC1
- **Given**: route handler, 길이 상한 상수.
- **When**: instruction·description 상한 초과 문자열 POST.
- **Then**: 400 + `{ error }`. 프롬프트 폭주 방어, 행 미생성.
- **Pass**: 과길이 instruction/description 거부.

### TC-SEC.4: API 키 client 비노출
- **Type**: integration(manual-gate 병행) · **Priority**: P0 · **UC**: 횡단(FR-07/§1 보안)
- **Given**: 빌드 산출물 + 챗 페이지 주입 props.
- **When**: `.next/static/` 에서 `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` grep. `/custom-agent/[id]` 페이지가 클라이언트에 주입하는 props 확인.
- **Then**: 키 0 matches. 챗 페이지에 provider/model 만 주입(키 제외 — FR-07).
- **Pass**: API 키가 client 번들·주입 props 에 0.

---

## 7. 데이터 무결성 — 횡단 (DI-1·DI-2·DI-3)

### TC-DI.1: agents.json 과 checkpointer SQLite 파일·스키마 분리
- **Type**: integration · **Priority**: P0 · **UC**: 횡단(NFR-23/DI-1)
- **Given**: 커스텀 에이전트 생성 + 챗 멀티턴(checkpointer 영속).
- **When**: `.data/agents.json`(에이전트 정의)와 `.data/checkpoints.*`(대화) 파일 경로·내용 확인.
- **Then**: 두 영속체가 별도 파일. 에이전트 삭제가 checkpointer 대화 기록을 건드리지 않음(역도 동일). 상호 오염 0.
- **Pass**: 에이전트 정의 DB 와 대화 checkpointer 가 파일 분리, 무간섭.

### TC-DI.2: 부분 실패 0 — 단일 INSERT / idempotent DELETE
- **Type**: integration · **Priority**: P1 · **UC**: 횡단(DI-3)
- **Given**: customAgentStore.
- **When**: 생성 중 persist 오류 모사 + 동시 중복 삭제(같은 id 2회 — UC-54-EC2).
- **Then**: 생성은 전부-아니면-전무(중간 상태 노출 0). 중복 삭제는 첫 요청 삭제·둘째 idempotent 2xx. 에러 0.
- **Pass**: 부분 생성 0, 중복 삭제 idempotent.

### TC-DI.3: 생성 후 router.refresh 실패해도 DB 정합 유지
- **Type**: integration · **Priority**: P2 · **UC**: UC-51-EC3
- **Given**: 생성 POST 성공, 클라이언트 refresh 실패 모사.
- **When**: 수동 새로고침(서버 fetch 재실행).
- **Then**: DB 행은 이미 생성됨 → 수동 새로고침 시 사이드바에 항목 등장(서버 fetch 가 진실원). 데이터 정합 유지.
- **Pass**: refresh 실패가 DB 정합에 영향 0, 수동 새로고침으로 복구.

---

## 8. 챗 본문 누출 차단 — 횡단 (§1 R5/FR-09 회귀)

### TC-53.7: thinking/reasoning·서브에이전트 출력 본문 누출 0
- **Type**: e2e + unit(chunkFilter) · **Priority**: P1 · **UC**: UC-53-EC2 (§1 R5/FR-09)
- **Given**: 서브에이전트 부여된 커스텀 에이전트(TC-52.9 산물)의 챗.
- **When**: 추론·도구/위임 유발 입력 전송.
- **Then**: 응답 본문에 thinking/reasoning/redacted_thinking·subagent 노드 출력 누출 0(chunkFilter 격리 — §1 단위 TC 로 보강). 챗 응답 non-empty.
- **Pass**: 본문에 사고/서브에이전트 출력 미노출(단위 chunkFilter TC 로 검증, e2e 는 non-empty).

### TC-53.8: 전체 조합 에이전트 챗 — 새 분기 0
- **Type**: integration · **Priority**: P2 · **UC**: UC-53-EC3 / UC-52-AF3
- **Given**: 모든 서브에이전트·스킬을 선택한 커스텀 에이전트.
- **When**: 그 selection 으로 `buildHarnessConfig` 호출 + 챗(모킹 그래프).
- **Then**: §1 챗 그래프가 selection 으로 전체 조합 흡수 — 새 if 분기·새 합성 경로 0. config 정상 생성.
- **Pass**: 전체 조합도 기존 selection 경로로 처리, 신규 분기 0.

---

## 부록: UC ↔ TC 매핑 커버리지

| UC 노드 | TC |
|---|---|
| UC-51 (primary) | TC-51.1, TC-51.11, TC-51.12 |
| UC-51-AF1 (instruction 기본값) | TC-51.9, TC-53.2 |
| UC-51-AF2 (description 생략) | TC-51.7 |
| UC-51-EF1 (이름 빈값) | TC-51.5 |
| UC-51-EF2 (JSON 형식 오류) | TC-51.6 |
| UC-51-EF3 (DB 쓰기 오류) | TC-51.10 |
| UC-51-EC1 (과길이) | TC-51.8, TC-SEC.3 |
| UC-51-EC2 (앞뒤 공백) | TC-51.5(공백뿐→빈값) |
| UC-51-EC3 (refresh 실패) | TC-DI.3 |
| UC-52 (primary) | TC-51.3, TC-52.6, TC-52.7, TC-52.9, TC-55.1 |
| UC-52-AF1/AF2 (한쪽만 선택) | TC-52.6, TC-52.7 |
| UC-52-AF3 (전부 선택) | TC-53.8 |
| UC-52-EF1 (미허용 이름) | TC-52.1, TC-52.2, TC-52.4, TC-SEC.2 |
| UC-52-EF2 (타입 위반) | TC-52.5 |
| UC-52-EF3 (DB 오류) | TC-51.10 |
| UC-52-EC1 (중복 이름) | TC-52.3 |
| UC-52-EC2 (stale 선택) | TC-52.1/52.4 (서버 검증 진실원) |
| UC-53 (primary) | TC-51.12, TC-53.1 |
| UC-53-AF1 (조합 없는 에이전트) | TC-53.2 |
| UC-53-AF2 (멀티턴) | TC-53.3 |
| UC-53-AF3 (instruction 기본값) | TC-53.2 |
| UC-53-EF1 (미존재 id) | TC-53.4 |
| UC-53-EF2 (traversal id) | TC-53.5, TC-SEC.1 |
| UC-53-EF3 (챗 LLM 오류) | §1 SSE error 계약 재사용(본 기능 변경 0) |
| UC-53-EC1 (삭제된 id 접근) | TC-53.6 |
| UC-53-EC2 (본문 누출) | TC-53.7 |
| UC-53-EC3 (전체 조합 챗) | TC-53.8 |
| UC-54 (primary) | TC-54.1, TC-54.8 |
| UC-54-AF1 (body {id}) | TC-54.6 |
| UC-54-EF1 (미존재 idempotent) | TC-54.2, TC-54.5 |
| UC-54-EF2 (id 누락) | TC-54.4 |
| UC-54-EF3 (traversal) | TC-54.3, TC-54.7, TC-SEC.1 |
| UC-54-EF4 (DB 삭제 오류) | TC-51.10 사상(500 패턴) |
| UC-54-EC1 (삭제 중 챗 열림) | TC-53.6 |
| UC-54-EC2 (동시 중복 삭제) | TC-DI.2 |
| UC-55 (primary) | TC-55.2 |
| UC-55-AF1 (0개) | TC-55.3 |
| UC-55-AF2 (생성 즉시 반영) | TC-51.12 |
| UC-55-AF3 (삭제 즉시 반영) | TC-54.8 |
| UC-55-EF1 (DB fetch 오류) | TC-55.6, TC-51.4 |
| UC-55-EC1 (긴 이름) | TC-55.8 |
| UC-55-EC2 (다수 항목) | TC-55.7 |
| UC-55-EC3 (동시 생성 후 refresh) | TC-DI.1/DI.3(서버 fetch 진실원) |
| 횡단 — R2 토글 회귀 0 | TC-52.8 |
| 횡단 — selection 매핑 | TC-52.6, TC-52.7 |
| 횡단 — 보안(키/길이/식별자) | TC-SEC.1~4 |
| 횡단 — 데이터 무결성 | TC-DI.1~3 |

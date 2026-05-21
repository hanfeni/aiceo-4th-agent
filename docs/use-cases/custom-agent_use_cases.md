# Use Cases: 하네스 에이전트 생성 탭 + 동적 커스텀 에이전트 메뉴

> Based on [PRD](../PRD.md) §4 (FR-33~FR-39, NFR-23~NFR-26, AC-37~AC-43, AD-19~AD-21)
> feature-slug: `custom-agent-builder`
>
> UC 번호는 PRD §3 (UC-41~UC-48) 이후 전역 연속으로 **UC-51** 부터 부여한다.
> 본 문서는 E2E 테스트의 단일 진실원(single source of truth)이다. QA planner 가 이 문서를 읽어
> 테스트 케이스를 도출한다.

## Actors

- **사용자 (CEO 수강생 / 강사)**: 워크벤치 CREATE 탭에서 커스텀 에이전트를 만들고, 사이드바에서
  접근하고, 삭제한다. 신뢰 경계 내(instruction = 시스템 프롬프트 주입) 입력 주체.
- **시스템**: Next.js 앱(서버 컴포넌트 + API 라우트 + Prisma/SQLite `.data/agents.db` + §1 챗 그래프).

## 용어

- **selection**: `{ skills?: string[]|null, subagents?: string[]|null }` — registry.ts
  `buildHarnessConfig` 의 기존 파라미터. 커스텀 에이전트의 조합을 이 채널로만 주입한다(R2/AD-19).
- **등록 목록**: subagentStore(내장 + 커스텀 서브에이전트)·skillStore(스킬) 의 현재 목록.
  커스텀 에이전트가 부여할 수 있는 서브에이전트·스킬은 이 목록 내로 한정한다(NFR-26).
- **SLUG_RE/UUID**: id 형식 제약 — path traversal(`..`/`/`/`~`) 거부(NFR-26).

---

## UC-51: 에이전트 생성 (기본 흐름 — 이름 + 인스트럭션만)

**Actor**: 사용자
**Preconditions**:
- 사용자가 `/harness` 워크벤치에 진입해 있다.
- 우측 탭에 "에이전트 생성(CREATE)" 탭이 렌더되어 있다(FR-33).
- 서버 env 에 provider/model 이 설정되어 있다(키는 클라이언트 비노출 — FR-07).
**Trigger**: 사용자가 CREATE 탭에서 이름·인스트럭션을 입력하고 "생성" 버튼을 누른다.

### Primary Flow (Happy Path)
1. 사용자가 CREATE 탭을 클릭한다 → `AgentBuilder` 컴포넌트가 렌더된다.
2. `AgentBuilder` 가 마운트 시 서브에이전트(내장+커스텀)·스킬 등록 목록을 서버에서 받아 멀티선택 후보를 채운다.
3. 사용자가 `name` 입력(예: "재무 분석가"), `instruction` 입력(시스템 프롬프트 텍스트)을 한다. `description` 은 비워두거나 짧게 입력한다.
4. 사용자가 서브에이전트·스킬은 아무것도 선택하지 않는다(빈 배열).
5. "생성" 버튼 클릭 → 클라이언트가 `POST /api/harness/agents` 로 `{ name, description, instruction, subagents: [], skills: [] }` 를 전송한다.
6. 라우트가 Zod 로 입력을 검증한다(필수 필드 충족, name 비빈값, 길이 상한 통과).
7. 라우트가 URL-safe `id`(slug 또는 `crypto.randomUUID()`)를 발급하고 Prisma 로 `.data/agents.db` 의 `CustomAgent` 테이블에 1행 INSERT 한다. `subagents`/`skills` 는 JSON 문자열(`"[]"`)로 직렬화 저장.
8. 라우트가 HTTP 2xx + `{ id, name, ... }` JSON 을 반환한다.
9. 클라이언트가 `router.refresh()` 를 호출해 Server Component `AgentNav` 를 재실행(DB 재fetch)한다(FR-38).
10. 사이드바 "나의 에이전트" 그룹에 새 항목이 새로고침 없이 나타난다.

**Postconditions**:
- `.data/agents.db` 의 `CustomAgent` 에 행 1건 추가(`name`/`description`/`instruction` 입력대로, `subagents`/`skills` = `"[]"`, `createdAt` = 생성 시각).
- 사이드바 "나의 에이전트" 그룹에 해당 에이전트 항목이 표시된다.
- `/custom-agent/[id]` 로 접근 가능해진다(UC-53).
- §1 챗 그래프·checkpointer·SSE 계약·하네스 토글 메커니즘 변경 0(R2/R3/R5/R6/R7).

### Alternative Flows
- **UC-51-AF1: 인스트럭션 기본값** — 사용자가 instruction 을 비운 채 생성한다.
  1. 단계 3에서 instruction 입력을 생략한다(빈 문자열 또는 미입력).
  2. PRD 4.7 스키마상 `instruction` 은 String 컬럼 — 빈 문자열 저장 허용 시 §1 systemPrompt 기본 경로를 따른다(AD-1 `buildAgentOptions`).
  3. 정상 생성(2xx). 챗 시 §1 기본 시스템 프롬프트가 적용된다.
  - (NOTE: instruction 필수/선택 여부는 Zod 스키마 확정 사항 — 필수면 EF-2 로, 선택이면 본 AF 로 분기. QA 는 구현 Zod 스키마 기준으로 검증.)
- **UC-51-AF2: description 생략** — description 미입력 시 빈 문자열로 저장하고 정상 생성한다(subagentStore 의 `description ?? ""` 사상 계승).

### Error Flows
- **UC-51-EF1: 이름 빈값** — name 이 빈 문자열/공백뿐인 입력.
  1. "생성" 버튼 클릭 → `POST /api/harness/agents` 전송.
  2. Zod 검증 실패 → 시스템이 HTTP 400 + `{ error: "name(에이전트 이름)이 필요합니다." }`(§1 AD-4 패턴) 반환.
  3. 클라이언트는 에러 메시지를 표시하고 DB 행 추가는 0. 사이드바 변화 없음.
- **UC-51-EF2: JSON 본문 아님 / 형식 오류** — 잘못된 본문 전송 시 시스템이 400 + `{ error }` 반환, DB 변화 0.
- **UC-51-EF3: DB 쓰기 오류** — Prisma INSERT 가 예외(디스크/락/스키마 오류).
  1. 라우트가 예외를 catch 한다.
  2. 시스템이 HTTP 500 + `{ error: "에이전트를 저장하지 못했습니다." }` 반환(스택은 서버 로그에만, 본문 비노출).
  3. 클라이언트가 에러 표시. `router.refresh()` 미실행 또는 실행해도 새 항목 없음(행 미생성). 부분 생성 0(트랜잭션 단위 INSERT).

### Edge Cases
- **UC-51-EC1: 아주 긴 이름/인스트럭션** — name·description·instruction 이 길이 상한(NFR-26) 초과.
  - 시스템이 Zod 길이 검증으로 거부 → HTTP 400 + `{ error }`. 폭주 방어. DB 행 추가 0.
- **UC-51-EC2: 이름 앞뒤 공백** — `"  재무  "` 입력 시 trim 후 저장 여부는 구현 정책. 빈값이 되면 EF1.
- **UC-51-EC3: 생성 직후 router.refresh 실패** — 네트워크/렌더 오류로 사이드바 미갱신.
  - DB 행은 이미 생성됨. 수동 새로고침 시 항목이 나타난다(서버 fetch 가 진실원). 데이터 정합 유지.

### Data Requirements
- **Input**: `{ name: string(필수, 비빈값, 상한), description: string(선택, 상한), instruction: string(상한), subagents: string[]=[], skills: string[]=[] }`.
- **Output**: `{ id, name, description, instruction, subagents:[], skills:[], createdAt }` JSON(직렬화형 — subagents/skills 가 `string[]`).
- **Side Effects**: `.data/agents.db` `CustomAgent` 1행 INSERT. checkpointer SQLite(`.data/checkpoints.*`) 무변경(파일 분리 — NFR-23). 외부 호출/LLM 호출 0.

---

## UC-52: 에이전트 생성 (서브에이전트 + 스킬 선택 포함)

**Actor**: 사용자
**Preconditions**:
- UC-51 의 전제 + subagentStore 에 1개 이상 서브에이전트, skillStore 에 1개 이상 스킬이 등록되어 있다.
**Trigger**: 사용자가 이름·인스트럭션 + 서브에이전트·스킬을 멀티선택하고 "생성" 을 누른다.

### Primary Flow (Happy Path)
1. CREATE 탭 진입 → `AgentBuilder` 가 등록 목록(서브에이전트 내장+커스텀, 스킬)을 멀티선택 후보로 표시한다(AC-37: 후보가 등록 목록과 일치).
2. 사용자가 name="리서치 봇", instruction 입력.
3. 사용자가 서브에이전트 2개·스킬 1개를 선택(체크).
4. "생성" 클릭 → `POST /api/harness/agents` 로 `{ name, description, instruction, subagents: ["sub-a","sub-b"], skills: ["skill-x"] }` 전송.
5. 라우트가 Zod 검증 + **선택값이 등록 목록 내인지 검증**(미허용 이름 거부 — NFR-26). 통과 시 id 발급.
6. Prisma 로 INSERT — `subagents`=`'["sub-a","sub-b"]'`, `skills`=`'["skill-x"]'`(JSON 직렬화 컬럼).
7. 2xx + `{ id, ..., subagents:["sub-a","sub-b"], skills:["skill-x"] }` 반환.
8. 클라이언트 `router.refresh()` → 사이드바 새 항목 표시.

**Postconditions**:
- `CustomAgent` 행에 선택 조합이 JSON 으로 저장된다(AC-38).
- UC-53 챗 시 그 조합이 `buildHarnessConfig` selection 으로 주입되어 그 서브에이전트·스킬만 부여된다(AC-40/R2/AD-19).

### Alternative Flows
- **UC-52-AF1: 서브에이전트만 선택(스킬 0)** — `subagents:[...]`, `skills:[]`. 정상 생성. 챗 시 skills selection 은 빈 배열 → 스킬 미부여.
- **UC-52-AF2: 스킬만 선택(서브에이전트 0)** — `subagents:[]`, `skills:[...]`. 정상 생성.
- **UC-52-AF3: 전부 선택(서브에이전트·스킬 모두 전체 체크)** — 등록된 모든 서브에이전트·스킬을 선택.
  1. 모든 후보 체크 후 생성.
  2. 정상 INSERT — 큰 JSON 배열 저장.
  3. 챗 시 selection 으로 전체 조합 부여(UC-53). (Edge: UC-52-EC2 참조 — 부여 가능 최대치.)

### Error Flows
- **UC-52-EF1: 미허용 서브에이전트/스킬 이름** — 등록 목록에 없는 이름을 body 로 직접 전송(클라이언트 우회/stale 후보).
  1. `POST /api/harness/agents` 에 `subagents:["존재하지않는것"]` 전송.
  2. 라우트가 등록 목록 대조 → 시스템이 HTTP 400 + `{ error }` 반환(임의 신규 부여 0 — NFR-26).
  3. DB 행 추가 0. (AC-43: 미허용 이름 거부 검증.)
- **UC-52-EF2: subagents/skills 가 배열이 아님** — `subagents: "sub-a"`(문자열) 등 타입 위반 → Zod 거부 → 400.
- **UC-52-EF3: DB 쓰기 오류** — UC-51-EF3 과 동일(500, 행 미생성).

### Edge Cases
- **UC-52-EC1: 중복 이름의 서브에이전트/스킬 선택** — 같은 이름을 배열에 2번 포함 시 dedup 또는 그대로 저장 — selection 매핑에서 `includes` 필터라 결과 동일(registry.ts 의 `selection.subagents!.includes(s.name)`). 동작 정합 유지.
- **UC-52-EC2: 등록 목록 동적 변경 후 stale 선택** — 생성 폼을 연 뒤 다른 탭에서 서브에이전트를 삭제하면, 생성 시점에 그 이름이 등록 목록 밖이 되어 EF1(400)로 거부된다(서버 검증이 진실원).

### Data Requirements
- **Input**: UC-51 입력 + `subagents: string[]`, `skills: string[]`(각 원소는 등록 목록 내 이름).
- **Output**: 생성된 `CustomAgent`(subagents/skills 가 입력 배열).
- **Side Effects**: `CustomAgent` 1행 INSERT(JSON 직렬화 조합). subagentStore/skillStore 무변경(조합만 참조 — Out of Scope: 신규 부여 0).

---

## UC-53: 생성된 에이전트로 챗 대화

**Actor**: 사용자
**Preconditions**:
- UC-51 또는 UC-52 로 `CustomAgent` 행(id 보유)이 존재한다.
**Trigger**: 사용자가 사이드바 "나의 에이전트" 항목 클릭 또는 `/custom-agent/[id]` URL 직접 진입.

### Primary Flow (Happy Path)
1. 사용자가 사이드바 항목 클릭 → `/custom-agent/[id]` 로 네비게이션.
2. Server Component `page.tsx` 가 `params.id`(Next 16 — Promise, await)를 받는다.
3. Prisma 로 `CustomAgent` 를 id 조회 → 존재 확인.
4. 서버가 그 에이전트의 selection(subagents/skills) + instruction + 서버 env provider/model(키 제외 — FR-07)을 클라이언트 챗 패널(`WorkspacePanel` 동형/재사용)에 주입한다.
5. 챗 페이지 헤더에 에이전트 name/description 표시. 본문은 §1 챗 패널(MessageList + ChatInput + ModelPicker §2).
6. 사용자가 메시지 입력 → `POST /api/chat`(본문 변경 0 — §1.6/§2.6) 으로 selection + instruction 을 body 로 전달.
7. 서버가 §1 의 기존 selection 처리 경로(registry.ts `buildHarnessConfig`)로 흡수 — 그 조합만 부여된 챗 그래프로 응답을 SSE 스트리밍.
8. 응답이 §1 챗 동작(15초 내 visible, 60초 내 non-empty — §1 AC-5)을 만족하며 토큰이 스트림된다.

**Postconditions**:
- 대화가 checkpointer(thread_id = conversationId)에 영속(§1 R3). `.data/agents.db` 는 무변경(정의는 읽기 전용 참조).
- 새 그래프 캐시 키·새 checkpointer·새 SSE 타입 추가 0(Out of Scope §4.10).

### Alternative Flows
- **UC-53-AF1: 서브에이전트/스킬 없는 에이전트(UC-51 산물) 챗** — selection 의 subagents/skills 가 빈 배열 → 메인 에이전트 + 기본 인스트럭션으로 동작. 위임/스킬 미사용. 정상 챗.
- **UC-53-AF2: 멀티턴 대화** — 동일 페이지에서 연속 메시지 → checkpointer thread_id 공유로 히스토리 누적(§1 R3, 수동 누적 0).
- **UC-53-AF3: 인스트럭션 기본값 에이전트(UC-51-AF1 산물)** — instruction 빈 문자열 → §1 기본 systemPrompt 적용.

### Error Flows
- **UC-53-EF1: 미존재 id 접근** — `/custom-agent/nonexistent` 직접 진입.
  1. Server Component 가 Prisma 조회 → null.
  2. `notFound()` 호출 → 404 페이지 렌더(AC-39).
- **UC-53-EF2: path traversal id** — `/custom-agent/..%2F..%2Fetc` 등.
  1. id 가 SLUG_RE/UUID 형식 위반 → 조회 미적중 또는 형식 거부 → 404(NFR-26). 파일시스템 접근 0.
- **UC-53-EF3: 챗 LLM/네트워크 오류** — `POST /api/chat` 처리 중 provider 오류/타임아웃.
  1. §1 SSE error 이벤트(AD-7 7종 중 error)로 클라이언트에 전달.
  2. 챗 패널이 에러 표시. `CustomAgent` 정의는 무영향. (계약은 §1 그대로 — 본 기능이 변경 0.)

### Edge Cases
- **UC-53-EC1: 이미 삭제된 에이전트 URL 직접 접근** — UC-54 로 삭제된 id 로 진입.
  1. Prisma 조회 → null → `notFound()` 404(AC-42 와 정합).
- **UC-53-EC2: thinking/reasoning·서브에이전트 출력 누출 차단** — 서브에이전트 부여된 에이전트(UC-52)의 챗에서 thinking/reasoning/redacted_thinking 및 subagent 노드 출력은 본문에 누출되지 않는다(§1 R5/FR-09 — chunkFilter 격리).
- **UC-53-EC3: 전체 조합 에이전트(UC-52-AF3) 챗** — 모든 서브에이전트·스킬 부여 시에도 §1 챗 그래프가 selection 으로 흡수 — 새 분기 0. 응답 정상(부하만 증가).

### Data Requirements
- **Input**: URL `id`(path param). 챗 메시지(ChatInput). selection + instruction(서버가 DB 에서 로드해 body 주입).
- **Output**: SSE 토큰 스트림(§1 AD-7 7종 이벤트). 챗 페이지 헤더 name/description.
- **Side Effects**: checkpointer 대화 영속(§1). `.data/agents.db` read-only. selection 은 요청별 입력(상태 모델 추가 0).

---

## UC-54: 에이전트 삭제

**Actor**: 사용자
**Preconditions**:
- 삭제할 `CustomAgent` 행(id)이 존재한다. 사용자가 `/harness` 탭(또는 삭제 UI 가 있는 위치)에 있다.
**Trigger**: 사용자가 커스텀 에이전트의 "삭제" 액션을 실행한다.

### Primary Flow (Happy Path)
1. 사용자가 삭제 대상 에이전트의 삭제 버튼 클릭(필요 시 확인 절차).
2. 클라이언트가 `DELETE /api/harness/agents`(`?id=` 또는 body `{id}`) 전송.
3. 라우트가 id 형식(SLUG_RE/UUID)을 검증하고 Prisma 로 `CustomAgent` 행을 삭제한다.
4. 시스템이 HTTP 2xx + `{ ok: true }`(또는 동등) 반환.
5. 클라이언트가 `router.refresh()` 호출 → `AgentNav` 재fetch.
6. 사이드바 "나의 에이전트" 그룹에서 해당 항목이 사라진다(FR-38). 마지막 1개 삭제 시 그룹이 빈 상태(UC-55-AF1)가 된다.

**Postconditions**:
- `.data/agents.db` `CustomAgent` 행 제거(AC-42).
- `/custom-agent/[id]` 가 이후 404(UC-53-EC1).
- 사이드바에서 항목 제거. checkpointer SQLite 무변경(대화 기록은 별도 파일 — NFR-23).

### Alternative Flows
- **UC-54-AF1: body `{id}` 방식** — `?id=` 쿼리 대신 body 로 id 전달(라우트가 두 방식 지원). 동작 동일.

### Error Flows
- **UC-54-EF1: 미존재 id 삭제(idempotent)** — 이미 삭제됐거나 없는 id 삭제 요청.
  1. `DELETE /api/harness/agents?id=gone`.
  2. Prisma delete 가 0행 영향 → 시스템이 **에러 없이 2xx 통과**(idempotent — subagentStore/skillStore 삭제 사상 계승, AC-42).
  3. 사이드바 변화 없음.
- **UC-54-EF2: id 누락** — `?id=` 없이 호출 → HTTP 400 + `{ error: "id 가 필요합니다." }`(subagentStore DELETE 패턴 계승).
- **UC-54-EF3: path traversal id** — id 에 `..`/`/`/`~` 포함 → 형식 검증 거부(400) 또는 미적중 idempotent 통과. 파일시스템/타 행 접근 0(NFR-26).
- **UC-54-EF4: DB 삭제 오류** — Prisma 예외 → 500 + `{ error }`(본문 비노출). 행 잔존, 사이드바 무변화.

### Edge Cases
- **UC-54-EC1: 삭제 중 같은 에이전트 챗 열린 상태** — 다른 탭에서 `/custom-agent/[id]` 챗 중 삭제.
  1. 삭제 후 그 페이지 새로고침/재진입 시 404(UC-53-EC1). 진행 중 SSE 스트림은 §1 계약대로 종료(본 기능 무관).
- **UC-54-EC2: 동시 중복 삭제** — 같은 id 를 두 번 빠르게 삭제 → 첫 요청 삭제, 둘째는 idempotent 2xx(EF1). 에러 0.

### Data Requirements
- **Input**: `id`(쿼리 또는 body, SLUG_RE/UUID 형식).
- **Output**: `{ ok: true }`(또는 2xx 빈 응답).
- **Side Effects**: `CustomAgent` 1행 DELETE(idempotent). 외부 호출 0.

---

## UC-55: 사이드바 동적 메뉴 표시

**Actor**: 사용자, 시스템
**Preconditions**: 앱이 로드되고 `AgentNav` Server Component 가 렌더된다.
**Trigger**: 페이지 로드 또는 `router.refresh()`(생성 UC-51/52 / 삭제 UC-54 후).

### Primary Flow (Happy Path)
1. `AgentNav` 가 **Server Component(async)** 로 실행되어 Prisma 로 `CustomAgent` 목록을 fetch 한다(AD-20).
2. 기존 3개 정적 그룹(AI 에이전트 / 에이전트 실습 A·B·C / 검색·라벨링 실습)을 그대로 렌더한다(FR-37: 정적 그룹 보존).
3. `CustomAgent` 가 1개 이상이면 **"나의 에이전트" 그룹**(AGENT_ACCENT 보라)을 추가로 렌더한다.
4. 각 커스텀 항목의 href = `/custom-agent/[id]`, 라벨 = `name`.
5. 현재 경로가 `/custom-agent/[id]` 와 정확 일치하면 **NavLink Client 조각**(usePathname 만)이 그 항목을 active 강조한다(AC-41).
6. Server 에서 DB fetch, Client 조각은 active 강조만 — Prisma/DB 가 client 번들에 유입되지 않는다(AD-20/NFR-13 사상).

**Postconditions**:
- 사이드바에 DB 의 커스텀 에이전트가 "나의 에이전트" 그룹으로 표시된다.
- 정적 3그룹은 무손상.

### Alternative Flows
- **UC-55-AF1: 커스텀 에이전트 0개** — `CustomAgent` 가 비어 있으면 "나의 에이전트" 그룹을 렌더하지 않거나 빈 상태 안내를 표시한다(FR-37). 정적 3그룹만 표시.
- **UC-55-AF2: 생성 직후 즉시 반영** — UC-51/52 생성 POST 성공 → `router.refresh()` → 본 UC Primary Flow 재실행 → 새 항목이 새로고침 없이 나타난다(AC-41/FR-38).
- **UC-55-AF3: 삭제 직후 즉시 반영** — UC-54 삭제 → `router.refresh()` → 재fetch → 항목 사라짐(FR-38).

### Error Flows
- **UC-55-EF1: DB fetch 오류** — Prisma 조회가 예외(파일 없음/락).
  1. Server Component 가 오류를 만난다.
  2. 시스템이 "나의 에이전트" 그룹을 빈 상태로 폴백하거나 에러 경계로 처리(정적 3그룹은 여전히 렌더). 사이드바 전체 크래시 0이 바람직(구현 정책 — QA 검증 항목).

### Edge Cases
- **UC-55-EC1: 아주 긴 이름의 항목** — name 이 길어도 사이드바 행 레이아웃이 깨지지 않게 ellipsis/clip(UI 정책). 데이터 정합엔 무관.
- **UC-55-EC2: 다수(예: 20+개) 커스텀 에이전트** — 그룹이 길어져도 사이드바 스크롤로 수용. fetch 는 전체 목록(또는 요약 필드) — 성능 상한은 NFR 범위.
- **UC-55-EC3: 동시 생성 후 refresh** — 두 사용자/탭이 거의 동시에 생성 후 각자 refresh → 각 Server fetch 가 그 시점 DB 스냅샷을 읽어 양쪽 항목 모두 표시(DB 가 진실원, 마지막 fetch 가 최신).

### Data Requirements
- **Input**: 없음(Server Component 가 Prisma 직접 조회). 현재 경로(Client 조각의 usePathname).
- **Output**: 렌더된 "나의 에이전트" 그룹(항목 = `{ name, href:/custom-agent/[id] }`), active 강조 상태.
- **Side Effects**: DB read-only. 클라이언트 번들에 Prisma 미유입(AD-20).

---

## 횡단 관심사 (Cross-Cutting — E2E/단위 테스트 진실원)

### 인증/권한
- 본 기능은 신뢰 경계 내(사용자 = 강사) 입력으로 취급한다(NFR-26). 별도 role/auth 분기는 §4 범위 밖.
  instruction 이 시스템 프롬프트로 주입되므로 길이 상한만 적용(폭주 방어), 콘텐츠 신뢰는 강사 책임.

### 데이터 무결성
- **DI-1**: `CustomAgent` 영속은 `.data/agents.db`(Prisma+better-sqlite3) — checkpointer SQLite(`.data/checkpoints.*`)와 **파일·스키마 분리**(NFR-23). 두 DB 가 서로 오염 0.
- **DI-2**: `subagents`/`skills` 는 SQLite 배열 미지원으로 JSON 문자열 컬럼. 읽을 때 파싱해 `string[]` selection 인자로 매핑(NFR-25 — 순수 매핑 함수로 격리, LLM 비호출 단위 테스트 가능).
- **DI-3**: 부분 실패 0 — 생성은 단일 INSERT, 삭제는 idempotent DELETE. 트랜잭션 중간 상태 노출 0.

### R2/NFR-24 토글 회귀 0 (불변식 — AC-40)
- 본 기능 머지 후에도 §1 AC-4 / §2 AC-19 토글 3종(`HARNESS_PLANNING=false` / `tools` `[]` / `subagents` `[]` / filesystem soft toggle) 적용 시 `agent.ts`·`registry.ts`·`/api/chat` `route.ts` 의 git diff 가 **0 줄**이어야 한다. selection 파라미터는 이미 registry.ts 에 존재(시그니처 변경 0).

### 테스트 가능성 (NFR-25 — LLM 분리, AC-43)
- 다음은 LLM 비호출 순수 함수/모킹으로 단위 테스트 가능해야 한다:
  1. Zod 입력 검증(필수 필드 누락·빈 name·과길이 거부).
  2. id 발급/형식 검증(SLUG_RE/UUID, path traversal 거부).
  3. selection 매핑(`CustomAgent` row 의 JSON subagents/skills → `buildHarnessConfig` selection 인자 `string[]`).
  4. 미허용 서브에이전트·스킬 이름(등록 목록 밖) 거부.
- Prisma 호출은 테스트에서 모킹. route.ts 본문에 mock/하네스 토글 분기 추가 0(NFR-11/R2).

### 보안 (NFR-26)
- id 는 SLUG_RE/UUID 형식만 허용 → path traversal 원천 차단.
- description/instruction 길이 상한.
- 부여 가능 서브에이전트·스킬은 등록 목록 내로 한정(임의 신규 부여 0).
- API 키는 서버 전용(`NEXT_PUBLIC_` 금지 — §1 보안). 챗 페이지에 provider/model 만 주입(키 제외 — FR-07).

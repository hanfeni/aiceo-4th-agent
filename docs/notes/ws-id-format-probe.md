# web_search id 포맷 + 그룹 키 실측 (R8 — 구현 전 기록)

작성: 2026-05-19 / 목적: web_search ServerTool 멀티스텝 사고패널 그룹화
의 **그룹 키** 확정. Plan Critic C1("16자 prefix 가정 근거 0, OpenAI id
는 opaque token") 해소.

## 실측 방법

WS_RAW_PROBE=1 dev 서버로 curl `/api/chat` 다수 호출 → 서버 stderr
(`/tmp/aiceo-dev*.log`)의 `[WS_RAW_PROBE] tool_outputs=[{...}]` 덤프
분석. `chunkFilter.ts:379` `id: typeof o.id==="string" ? o.id : ""`.

## 실측 결과

### id 포맷

- web_search_call 의 id 길이 **일정 53자** (`ws_` 3 + 50). 포맷 일관.
- 예: `ws_058ca13b75d3013a006a0bf8c792cc8197a1a83cfaf2edb9fb`
  - `ws_` + 16자(`058ca13b75d3013a`) + `006a0bf8`(시각/시퀀스 추정)
    + 나머지 호출별 고유.
- 같은 응답의 모든 web_search_call 이 동일 16자(`058ca13b75d3013a`)
  공유 관측. **그러나** 16자 경계가 OpenAI 보장 계약이라는 근거 없음
  (Responses API id 는 문서상 opaque). → **id 파싱으로 그룹 키
  삼지 않는다**(R8 — 비공개 포맷 단정 금지, C1 수용).
- citation 청크는 `tool_outputs=undefined` + id 없음(별도 경로).

### 스트림 도착 순서 — 불안정 (Plan Critic 대안 기각)

서버 로그에서 prefix 가 **연속하지 않고 인터리빙** 관측
(058×3 → 0bd×1 → 07f×1 → 0dee×1 → 0bd×1 …). 이는 curl 다수를 거의
동시에 날려 **여러 응답 스트림이 서버 로그에서 섞인** 것. "연속
web_search_call = 한 그룹" 휴리스틱은 불안정 → 기각.

## 그룹 키 결론 (id/순서 비의존 — 가장 견고)

- `route.ts`: 1 POST = 1 ReadableStream = 1 conversationId(한 사용자
  요청). `store.startStream` 1 send = 1 parseSseStream 루프.
- 따라서 **한 메시지(ChatMessage)의 thinkingSteps 는 정의상 한 사용자
  요청의 청크만** 받는다(서버 로그 인터리빙은 *여러 curl 동시*일 때만
  — 각 클라이언트 reducer 는 자기 스트림 청크만 소비).
- → **그룹 키 = "같은 메시지의 thinkingSteps 안에서 name==='web_search'
  인 tool step 전부 = 1 그룹"**. id prefix 파싱 0, 스트림 순서 의존 0,
  OpenAI 비공개 포맷 의존 0.

  **(설계 근거 — 실측 아님, Plan Critic 2차 항목1 정정)**: "모델이 한
  답변 내 web_search 를 의도로 안 나눔" 은 관측이 아니라 추론이었다.
  그러나 그룹 키를 "name==='web_search' 전부 1그룹" 으로 잡으면 모델이
  의도를 나누든 말든 결과 동일 → 이 추론은 정당화에 불필요. id/순서/
  포맷 비의존이 가장 견고하므로 name 그룹 채택(R8 정신).

## action.type 실측 (R8 — docs/notes 정식 기록)

WS_RAW_PROBE 전체 로그 집계: search 19 / open_page 8 / find_in_page 1.

| type | RAW 필드 (실측) |
|---|---|
| search | `{type:"search", queries:[...], query:"..."}` |
| open_page | `{type:"open_page", url:"https://..."}` |
| find_in_page | `{type:"find_in_page", pattern:"Consolidated Revenue", url:"https://..."}` |

→ find_in_page 필드명 = `pattern`/`url` **실측 확정**(이전엔 로그엔
있었으나 미기록 = R8 위반이었음, 본 표로 해소). 단 find_in_page 는
1건뿐 — 드묾. **하드코딩 대신 graceful passthrough 채택**(아래).

## 함의 (구현 설계 — Plan Critic 2차 반영)

- **args 포맷: type 외 필드를 통째 보존(하드코딩 금지, R8)**.
  `{actions:[{type, ...나머지필드}]}` — search 면 queries/query,
  open_page 면 url, find_in_page 면 pattern/url 이 자동 보존. 미래
  새 action.type 도 무수정 대응(Plan Critic 7-b 보강안 채택).
- reduceToolCall: 함수 **진입 직후** `delta.name==="web_search"` 면
  전용 그룹 머지 후 early-return. 그 외(task/current_time)는 기존
  코드 완전 무변경(Plan Critic 2차 항목2 — "delta.id 경로 그대로"는
  부정확, early-return 분기로 정정). 그룹 step.id = 첫 action id 유지
  (ThinkingPanel key 안정 — 항목2). 동일 action 재수신 시 same-ref
  반환(멱등 가드 — 항목6, 중복 청크 부풀음 차단).
- reduceToolResult: 기존 "모든 web_search step citation" 로직이 그룹
  step 1개에 자연 작동. thinkingSteps.test.ts web_search 전제 테스트는
  it 단위 분류 후 재작성(C2 — 비-web_search 불변 케이스 제외).
- **replay 영향(Plan Critic 2차 항목4 — 치명 누락 보완)**: replay.ts
  가 같은 reduceToolCall/Result 재생 → 그룹화 자동 전파(라이브=히스
  토리 일치, 의도상 양호). conversationReplay 에 web_search 다중 action
  → 1 그룹 복원 검증 테스트 추가 필수.
- find_in_page.pattern UI 표시: 사용자 결정(투명성 우선). R5 경계 —
  pattern 은 모델 추론 산물에 가까우나 사용자 노출 선택. 본 노트 기록.

## 교차 순서 — 사용자 결정 (Plan Critic 2차 7-a 해소)

**결정: (B) 항상 1그룹 (교차 무시)** — 사용자 컨펌(2026-05-19).
`reasoning → web_search(a) → task → web_search(b)` 에서 b 가 와도
기존 name==='web_search' 그룹 step(a 위치)에 머지. 그룹은 **첫
web_search 위치에 고정**, task 보다 늦은 검색도 그 위치에 합쳐짐.

→ **thinkingSteps 교차보존 원칙을 web_search 에 한해 의도적으로
폐기**(사용자 결정 — "1항목으로 묶기" 우선). reasoning↔task↔
current_time 교차보존은 불변(Slice E). 이 비대칭은 reducer 주석에
명시(미래 혼란 차단). reducer 단순화: web_search step 위치 불변 →
"교차 시 분할" 경계 로직 불필요.

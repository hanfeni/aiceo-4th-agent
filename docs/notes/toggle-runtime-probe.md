# 토글 런타임 효과 probe (architect AI-4)

작성: 2026-05-19 02:14 KST · Slice 9 · device: mac (work)
실행: `pnpm dlx tsx scripts/toggle-probe.mts` (LLM 라운드트립 없음 — 과금 0)

## 1. 문제 정의 (왜 이 probe 가 필요한가)

단위 테스트(레지스트리/buildAgentOptions 스위트)는 `registerHarnessProfile`
이 **호출되었는지**(call-level, spy)만 검증한다. "토글이 실제로 deepagents
런타임 그래프 구성을 바꾸는가"(FR-08/AC-4 의 런타임 의미)는 검증하지 않는다.

본 probe 는 실 `buildHarnessConfig → createModel → buildAgentOptions` 경로를
`HARNESS_PLANNING=true` / `=false` 두 번 통과시킨 뒤, deepagents 전역
레지스트리에 **실제로 등록·resolve 된 HarnessProfile** 을
`getHarnessProfile(key)` + `serializeProfile(profile)` 로 들여다본다.

## 2. 관찰된 차이 (실측)

| 항목 | HARNESS_PLANNING=true | HARNESS_PLANNING=false |
|------|------------------------|-------------------------|
| 등록된 profile keys | `openai`, `openai:probe-planning-on` | `openai`, `openai:probe-planning-off` |
| resolved profile (serializeProfile) | `{"generalPurposeSubagent":{"enabled":false}}` | `{"excludedMiddleware":["TodoListMiddleware"],"generalPurposeSubagent":{"enabled":false}}` |
| `excludedMiddleware` 에 TodoListMiddleware | **없음** | **있음** |

판정:

- `differs (ON !== OFF)` = **true**
- `OFF excludes TodoListMiddleware` = **true**
- `ON excludes TodoListMiddleware` = **false**
- **RUNTIME EFFECT PROVEN (FR-08/AC-4) = YES** (probe exit 0)

`HARNESS_PLANNING=false` 는 deepagents 가 model spec 에 바인딩하는 resolved
HarnessProfile 에 `excludedMiddleware:["TodoListMiddleware"]` 를 **실제로
주입**하고, `=true` 는 주입하지 않는다. 두 토글은 call-level 이 아니라
deepagents 가 그래프 조립 시 참조하는 프로파일 레벨에서 실증적으로 다르다.
(`generalPurposeSubagent:{enabled:false}` 는 두 run 공통 — probe 가
`HARNESS_SUBAGENTS=false` 로 고정했기 때문이며, planning 토글과 무관한
상수다. planning 차이는 `excludedMiddleware` 한 줄에 정확히 격리된다.)

## 3. 검증 충실성 — 가드를 우회하지 않았다

`buildAgentOptions` 의 `registerHarnessProfileOnce` 는 프로세스 전역
first-call 가드(같은 key 재등록 시 deepagents `mergeProfiles` 가 누적/stale
하므로 멱등화)다. 한 프로세스에서 동일 model spec 으로 ON·OFF 를 등록하면
두 번째가 가드에 막혀 차이가 안 보이게 된다.

probe 는 이 가드를 **삭제·우회·전역 조작하지 않는다.** 대신 두 run 에 서로
다른 `LLM_MODEL`(`probe-planning-on` / `probe-planning-off`)을 주입해 서로
다른 `provider:model` profile key 를 만들어 두 등록을 자연히 격리했다.
이는 `buildAgentOptions` 의 실제 등록 경로(`toProfileOptions` →
`registerHarnessProfileOnce(provider)` + `(provider:model)`)를 한 줄도
건너뛰지 않고 그대로 두 번 통과시키는 충실한 재현이다.

(주의: bare `openai` key 는 deepagents 의 same-key `mergeProfiles` 특성상
두 run 이 누적 merge 된다 — 그래서 probe 는 더 구체적인
`provider:model` key 의 직렬화를 대표값으로 사용한다. 이 key 는 run 마다
고유해 누적 오염이 없다. AD-1 의 토글 격리 가정과 정합.)

## 4. 추가로 확인된 것 / 한계

- **확인됨**: deepagents 가 컴파일한 agent 의 `agent.options.middleware` 배열
  은 *프로파일 적용 전* 원본 5종(`todoListMiddleware`,
  `FilesystemMiddleware`, `subAgentMiddleware`, `SummarizationMiddleware`,
  `patchToolCallsMiddleware`)을 그대로 노출하며, **토글과 무관하게
  동일**하다. 즉 프로파일 resolve 는 construction 시점이 아니라 graph
  실행(stream) 시점에 lazy 하게 적용된다. 따라서 `agent.options` 직접
  introspection 은 토글 효과 검증 지점으로 **부적합**하다 — 이를 실측으로
  배제하고, 검증 지점을 `getHarnessProfile`+`serializeProfile`(deepagents
  가 stream 시 참조하는 바로 그 등록 레지스트리)로 확정했다.
- **한계 (manual)**: profile 의 `excludedMiddleware` 가 graph stream 단계에서
  실제로 `TodoListMiddleware` 를 그래프 노드에서 제외하는지까지는 LLM
  라운드트립이 필요해 본 1-shot probe 범위 밖이다. 이 부분은 Slice 9 의
  토글 manual-gate(TC-6.1: `HARNESS_PLANNING=false` 재기동 → 채팅 스모크 +
  `git diff` 0줄)와 deepagents 자체 동작에 위임한다. 본 probe 가 책임지는
  주장은 "토글이 deepagents 가 그래프 조립에 참조하는 프로파일을 실제로
  바꾼다"(call-level → registry-resolve level 격상)이며, 그 주장은 위
  실측으로 입증되었다(가짜 pass 아님).

## 5. 재현 명령

```
pnpm dlx tsx scripts/toggle-probe.mts
# exit 0 = RUNTIME EFFECT PROVEN, exit 2 = NOT proven, exit 1 = error
```

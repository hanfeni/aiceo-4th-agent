# 도구/TASK 병렬 호출 실측 (R8 — 코드+런타임 확인)

작성: 2026-05-19 / 목적: "에이전트(도구/TASK)가 동시에 호출되는지
(하나 끝나고 호출하면 병렬 아님)" 사용자 검증 요청.

## 결론

**일반 도구·TASK(서브에이전트) 모두 병렬 호출 가능 — 런타임 실증.**
병렬의 주체는 LLM(한 응답에 multi tool_calls 방출). LangGraph
ToolNode 가 `Promise.all` 로 동시 실행. 인프라가 강제하는 게 아니라
LLM 이 "독립 작업"으로 판단할 때 발생.

## 코드 실측 (설치본 — 학습지식/웹 추측 아님)

- `@langchain/langgraph/dist/prebuilt/tool_node.js:184`:
  `outputs = await Promise.all(aiMessage.tool_calls?.filter(...)
   .map((call) => this.runTool(call, config)) ?? [])`
  주석(12행): "tool calls are requested, they will be run in parallel"
- `deepagents/dist/index.js:1325` "reducer enables concurrent
  updates from parallel subagents" / 1350 "ReducedValue for files
  to allow concurrent updates from parallel subagents" / 시스템
  프롬프트 예시 2006/2029/2039 "Uses the task tool in parallel".
  → TASK 도 동일 ToolNode 경로 + 병렬 state reducer 1급 지원.

## 런타임 실측 (dev + PARALLEL_PROBE 타임스탬프)

질의: "3가지를 각각 웹검색해서 동시에 — 삼성/SK하이닉스/네이버
주가, 독립적이니 병렬로." (web_search ClientTool 로 테스트 —
사용자 'web_search 가 테스트하기 좋음').

PARALLEL_PROBE 캡처(ms epoch, on_tool_start/end):

```
t=…099444  start  call_GGAb…   ┐ 3개 start 1ms 이내 동시
t=…099445  start  call_3w9Z…   ├ (LLM multi tool_calls →
t=…099445  start  call_Ltsk…   ┘  ToolNode Promise.all)
t=…103260  end    call_GGAb…   ┐ 첫 end 는 start 보다 ~3.8s 후.
t=…104427  end    call_3w9Z…   ├ 즉 첫 도구 끝나기 전에 3개
t=…104598  end    call_Ltsk…   ┘ 모두 시작 = 병렬 확정
t=…107802  start  call_SR9C…   ┐ 2차 배치도 3개 동시 start
t=…107803  start  call_GO6J…   ├ (LLM 이 1차 결과 보고 또
t=…107803  start  call_xrQK…   ┘  병렬 3개)
t=…111207  end    call_GO6J…
t=…111334  end    call_xrQK…
t=…111711  end    call_SR9C…
```

판정(사용자 기준 "하나 끝나고 호출 = 병렬 아님"):
- 패턴이 `start×3 → end×3` (직렬이면 start→end→start→end).
- 첫 `on_tool_end`(…103260)가 2·3번째 `on_tool_start`(…445)보다
  **뒤** → 첫 도구 종료 전 동시 호출 = **병렬 맞음**.

## 우리 코드 정합 (이미 병렬 대응)

- `streamNamespace.ts` TaskTrackState: "한 턴 3개 동시 위임에서
  마지막 1개만 완료 처리되는 한계 실측 → FIFO 큐" — 병렬 task
  완료 추적 이미 구현(이전 세션 subagent-probe taskCalls 3).
- 사고 패널은 병렬 호출 시 각 step 개별 표시(reduceToolCall id별
  분리). web_search ClientTool OUT 은 streamMode "tools"
  on_tool_end 로 채움(앞 세션 수정). → 추가 작업 불요.

## 비고

- 스크린샷에서 task 1개만 보였던 건 LLM 이 단일 호출 선택한 것
  (병렬 불가가 아님). 독립 작업 명시 시 LLM 이 multi tool_calls
  → 병렬 발동 확인됨.
- 검증용 임시 PARALLEL_PROBE 는 제거(agent.ts git diff 0 — 원복).
  코드 변경 없는 순수 조사.

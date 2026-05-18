# Scratchpad

## Feature: LangGraph DeepAgents(JS) 하네스 + 스트리밍 챗 에이전트

## Branch: feat/deepagents-chat-harness (base: main)

## Status: implementing wave 2 (slice 2,3 병렬) — Wave 1 complete

## Context
- 스펙: requirements.md / 생성규칙: CLAUDE.md(R1~R8) / 폐기: prompt-sample.md
- bootstrap 산출: docs/PRD.md(§1.10 AD-1~AD-6), docs/use-cases/(24 UC),
  docs/qa/(132 TC), docs/plan.md, docs/notes/deepagents-api-probe.md(실측 확정)
- Architecture Review: PASS + AD-1~6
- BLOCKING(미들웨어 비활성) → 실측 해소 + 사용자 승인. filesystem=soft toggle 확정(AD-6)
- 핵심 불변식: 하네스 토글 4종(planning/filesystem soft/tools/subagents) 시
  agent.ts·route.ts diff 0줄. 변환은 buildAgentOptions.ts 격리(AD-1·AD-6-3).

## Plan

### Wave 1
- [x] Slice 1: 스캐폴드 + 의존성 + U2~U5 실측 — 35faaa5

### Wave 2 (병렬 — Files 교집합 0) [COMPLETE]
- [x] Slice 2: 타입 + Zustand 스토어 — b19c73c (14 TC)
- [x] Slice 3: chunkFilter + sseStreamParser + systemPrompt — 602b567 (38 TC)
- 통합 검증: 전체 vitest 52/52, tsc 0, eslint 0, build exit 0

### Wave 3 [COMPLETE]
- [x] Slice 4: model + checkpointer(AD-2 lazy) + tools/subagents — b8c59cf
  (14 TC, 누적 66/66, eslint 0, tsc 0; Done: provider throw/키국한/.data ignored)

### Wave 4 (병렬 — Files 교집합 0)
- [ ] Slice 5: registry + buildAgentOptions(AD-1/6) + agent 싱글톤(AD-3)
- [ ] Slice 7: ChatMarkdown rehype-raw→sanitize (AD-5d)

### Wave 5 (병렬 — Files 교집합 0)
- [ ] Slice 6: API Route SSE + Zod(AD-4) + cancel(AD-5a)
- [ ] Slice 8: 채팅 UI 조립 (ChatInput/MessageList/ChatPanel/useChat/레이아웃)

### Wave 6
- [ ] Slice 9: 통합 검증 + 보안/품질 merge-ready 게이트 + E2E

## Completed
- bootstrap 파이프라인 6단계 (PRD→UseCase→Architecture→QA→Plan→Git/scratchpad)
- R8 실측: requirements.md/PRD/probe note 개정 (filesystem soft toggle, AD-6)
- feat/deepagents-chat-harness 브랜치 + .gitignore 생성
- Slice 1 (35faaa5): Next 16 스캐폴드 + 의존성 + U2~U5 실측 확정
  - 환경: provider=openai, LLM_MODEL=gpt-5.4-mini (사용자 확정, 1토큰 실증 통과)
  - U2 streamMode "messages"=[AIMessageChunk,meta] 튜플
  - U3 content=string(gpt-5.4-mini는 thinking 블록 미발생; chunkFilter는
    배열 케이스도 방어적 유지 — provider 추상화)
  - U4 출처노드 메타키=langgraph_node(메인="model_request")
  - U5 checkpointer=SqliteSaver.fromConnString(@langchain/langgraph-checkpoint-sqlite);
    checkpointer:true는 root graph 불가, @langchain/langgraph 직접 import 불가
  - R1: @langchain/core 1.1.46 단일트리, build/eslint 0
  - Deviation: better-sqlite3 빌드승인(Rule3), eslint anon export(Rule1),
    키 부재→사용자 escalate(Rule4)

## Notes (다음 슬라이스 입력)
- chunkFilter(S3): content string→빈문자열 스킵, 배열→type==="text"만
  (thinking/reasoning/redacted 제거), langgraph_node==="model_request"만 통과
- checkpointer(S4): sqlite=SqliteSaver.fromConnString(path),
  memory=fromConnString(":memory:"), AD-2 lazy
- CLAUDE.md "@langchain/langgraph import 가능" 문구는 pnpm strict서 거짓 —
  본 프로젝트는 langgraph 본체 직접 import 안 함(설계 무영향, S4~5 경계 준수)
- docs/notes/dev-environment-survey.md = 사용자 소유 파일(내가 안 만듦, 커밋 제외)

## Blockers
(없음 — 미들웨어 비활성 BLOCKING 은 실측+사용자승인으로 해소)

# Scratchpad

## Feature: LangGraph DeepAgents(JS) 하네스 + 스트리밍 챗 에이전트

## Branch: feat/deepagents-chat-harness (base: main)

## Status: bootstrapping complete → ready for implementing wave 1 slice 1/9

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
- [ ] Slice 1: 스캐폴드 + 의존성 설치 + 잔여 U2~U5 실측 (pre-work GATE)

### Wave 2 (병렬 — Files 교집합 0)
- [ ] Slice 2: 타입 + Zustand 스토어 (순수)
- [ ] Slice 3: 순수 함수 chunkFilter + sseStreamParser + systemPrompt

### Wave 3
- [ ] Slice 4: 하네스 model + checkpointer(AD-2 lazy) + tools/subagents 슬롯

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

## Blockers
(없음 — 미들웨어 비활성 BLOCKING 은 실측+사용자승인으로 해소)

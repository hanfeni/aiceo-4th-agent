# Scratchpad

## Feature(이 세션): web_search ServerTool→ClientTool 완전 교체
## Branch: feat/web-search-clienttool
## Status: ★완료★ 7슬라이스 + 보안수정 + dev실측 + vault기록 DONE
## Commits(7): 3d6a021 S1/S4그룹화(베이스라인) · Slice1 정제순수함수 ·
##   Slice2 OpenAI직호출(openai@6.38승격) · d8a5e9e Slice3 ClientTool교체 ·
##   e0ead59 Slice4+5 ServerTool dead 1017줄삭제(R2 1회예외) ·
##   516ef10 Slice6 UI/문서정합 · [보안] meta분리 번들누출차단
## 결과: web_search ClientTool 이 OpenAI Responses 직호출→내부 N검색
##   정제 string 1개로 메인LLM 반환(dartTool 동형). 전체회귀 804/804,
##   web-search tsc0/eslint clean. dev실측: 도구 OUT→LLM 출처인용 정상
##   (curl: 2026-05-18 AP News URL 인용 확인 — 사용자 요구 충족).
## 보안: Plan Critic 항목8 실현(클라이언트 번들 openai SDK 누출) →
##   webSearchTool.meta.ts/webSearcher.meta.ts 경량분리, import 그래프
##   단절 증명. 실키값 미포함이었으나 서버코드 노출 차단.
## 미해결(무관): searchlab/ensure-infra.ts:158 빌드 타입에러 — 다른
##   세션 미커밋(?? untracked), 내 7커밋 무관. 무관코드 미수정(CLAUDE.md).
##   → 전체 pnpm build 막힘(web-search 무관). 보안검증은 import그래프로 대체.
## push 보류(사용자 지시 없음). vault Themes/aiceo-4th-agent/
##   websearch-tool.md + daily 2026-05-19 기록 완료.
## Plan: /Users/macmini_mg/.claude/plans/starry-zooming-stallman.md
## 미커밋 무관: DART 등 이전세션 70+파일(손대지 않음 — 멀티세션 공유트리)

---

## Feature: DART 기업 펀더멘털 분석 AI 이식 (medigate-manager → 이 프로젝트)

## Branch: feat/web-search-clienttool (멀티세션 워킹트리 공유로 외부
##   세션이 브랜치 전환·커밋. D1~D7 은 양 브랜치 공통조상에 보존,
##   D9(dce8697) 는 이 브랜치 단독. DART 커밋 체인 선형 온전 — 머지 무관)

## Status: ★D1~D14 DONE★ (DART 펀더멘털 분석 이식 완결 — merge-ready PASS)
## Commits: D1 4fad429/D3 3347da9/D2 d3daaef/D4 55b8b9d/D5 d0431a7/
##   D6 7c90b19/D7 b5099ff/D9 dce8697/D10 9a511ff/D11 ca9e0e3/D12 0fa271d
##   D14a 030c3f7(SseEvent stage+라우트 emit)/D14b ae0b792(React Flow
##   노드-엣지 시각화 — DartPipelineGraph/dartStageNodes, progress배너
##   폐지→상시 노드캔버스, @xyflow mock ResizeObserver 회피, stage전이
##   테스트 재작성. 검증: tsc0/전체842green(2연속)/build PASS)
## D13: merge-ready 게이트 PASS(tsc0/DART233green/TC-48.3 키누출0/
##   R1단일트리/DART범위격리) + PRD §3 개정(prd-writer: §3.0~3.10
##   in-place, OPEN-3 무효화, FR-20/21/26 재서술). 코드변경 0(순수
##   게이트+문서) → 별도 커밋 없음. vault PRD 는 git 외부.
## ★ D14 (사용자 HITL 2026-05-19 — 교육용 인터랙티브 시각화) ★
- 사용자 요구: DART 메뉴에 노드-엣지 단계 시각화(교육생용). LLM
  단계 강조 + 노드 클릭 시 입력 프롬프트+아웃풋 확인.
- 확정: React Flow 라이브러리 도입(사용자 결정 — CLAUDE.md 불필요
  패키지 예외). 5단계(기업식별→DART수집→압축→LLM분석→완료).
  라우트 SSE 확장(단계별 stage 이벤트 — corpCode/압축컨텍스트/
  LLM system+human, SseEvent 타입 확장). reasoning 은 비노출 유지
  (R5 — 입력프롬프트는 우리 산출물이라 노출 안전, LLM 내부사고만 차단).
- D14 = D11 라우트 SSE 확장 + SseEvent 타입 + D12 UI 재작(React
  Flow). 자율개발 파이프라인(부트스트랩 문서→테스트→구현).

## ★ 아키텍처 재설계 (사용자 HITL 2026-05-19 — OPEN-3 실측 반증) ★
- D8 OPEN-3 실측 결과: "삼성전자 분석" 입력 시 메인 에이전트가
  dart-analyst subagent 에 위임 안 함(taskCalls=0, DART 경로 미사용,
  직접 web_search). subagent 자율위임 전제 = 반증.
- 사용자 재정의: "DEEP AGENT(자율) 아님 — medigate 동형 **고정흐름
  에이전트**. LLM 만 OpenAI. 진입점 = **전용 API 라우트**(고정
  파이프라인, LLM 위임 0)."
- architect 재검토 PASS: 전용 DART 라우트 = 하네스 요소 아님(R2
  적용 외, 챗 하네스 불변). D6/D7 폐기, D2~D5 백엔드 src/lib/dart
  변경 0 재활용. dartPrompts → src/lib/dart/prompts.ts(R100 이동).
- D9 폐기 완결(dce8697): dartAnalyst/dartTool/dartAnalyst.test/
  dartTool.test 삭제, index 등록 제거, registry.test 2→1 회귀.
  (선행 삭제·rename 은 외부 thinking-panel 커밋 3d6a021 에 휩쓸려
  함께 커밋 — 사용자 '현재 상태 수용', 코드 결과 정합.)

## 재설계 신규 슬라이스 D10~D13
- [ ] D10 ← NEXT: src/lib/dart/analyze-pipeline.ts —
      collectDartContext(구 dartTool 본문 7c90b19 에서 git show 추출:
      searchCompany→getCompanyInfo→상장/비상장분기→
      getMultiYear/employees/shareholders/dividends or
      getUnlistedCompanyDisclosureContext→formatDartContext) +
      buildDartAnalysisQuery(medigate ai-analysis/route.ts 1529행
      추출, gemini/auth/TokenUsage/contextItems/annualYears 폐기).
      순수/IO 분리 단위테스트. R8: getFullCompanyData·OPEN-4 스키마
- [ ] D11: src/app/api/dart/analyze/route.ts — zod(corpName,
      perspective 8종=AnalysisPerspective 재사용), SSE(chat route
      badRequest/encodeSse/cancel 동형), **R7 최상단 runtime=nodejs
      +force-dynamic**, createModel(env,body.model) 재사용,
      getFullSystemPrompt+getTaskInstruction. R5 책임 이전: OpenAI
      reasoning 블록 본문 token 보간 금지(R8 런타임 실측)
- [ ] D12: 전용 폼 UI(corpName 입력+8관점 선택+SSE 결과,
      ChatMarkdown/sanitize 재사용) + AgentNav 사이드바 메뉴 등록
- [ ] D13: PRD §3 개정(§3.6 엔드포인트노출/§3.9 standalone해제/
      §3.10 OPEN-3 무효화, FR-20/21/26 재서술) + use-case/QA 재정렬
      + grep게이트(gemini/perplexity/kis/dartTool/dartAnalyst 0,
      DART_API_KEY .next/static 0) + merge-ready

## medigate ai-analysis/route.ts 이식/폐기 (D10~D11 지침)
- 이식: handleDartAnalysis 2단계 골격(349~452), buildDartAnalysisQuery
  (1529~1559, contextItems/annualYears 인자 제거), PERSPECTIVE_LABELS
  8개만, sendProgress→SseEvent 재인코딩
- 폐기: handleIntegrated/CrossValidation/Competitor, handlePerplexity
  Search, generateTextStream(gemini)→createModel, auth/session,
  TokenUsageService, stockCode/실시간시세, NextRequest/Response→
  Response/ReadableStream, medigate collectDartContext 다중수집
  (1차는 구 dartTool 간결흐름 — OPEN-4 부담 최소)

## Context
- 출처: medigate-manager 의 삭제된 DART 주식 AI (커밋 44cf758 에서 미사용
  제거, 삭제 직전 = 10fb7f4). 추출 원본 34 .ts = `.design-handoff/
  dart-source/src/` (참조 SSOT, **복사 금지** — STRUCTURAL 항목은 재작성)
- 사용자 HITL 4건 확정: ①전체이식(AI분석 1진입점+필요백엔드 전부)
  ②모델 OpenAI 고정(gemini.ts 폐기, createModel 재사용) ③Perplexity 폐기
  (8관점 프롬프트→subagent systemPrompt, 정성근거→기존 webSearchTool)
  ④KIS 제거(실시간 시세 미이식). 추가 ⑤계획변경: 사용자 노출=8관점 AI
  분석 1개만(standalone 조회 기능 0), 백엔드는 전부. ⑥KRX 제외(R8 실측 —
  원본서 KRX 고아, 사용자 확정)
- bootstrap 산출(vault specs/aiceo-4th-agent/docs/):
  PRD §3(FR-20~27/NFR-16~20/AC-21~30, §3.9 비목표 §3.10 OPEN 확정),
  use-cases dart-fundamental-analysis(UC-41~48, 54노드),
  qa dart-fundamental-analysis(TC-41~48, 65), plan.md §3(D1~D8)
- Architecture Review: **PASS 조건부** (STRUCTURAL 5개 슬라이스 강제 반영)
  - 확정 디렉토리: src/lib/dart/{api,ratelimit,indicators,trend,disclosure}/
    + context-formatter.ts + dart-api.service.ts ; src/types/dart/ 4분리 ;
    harness/tools/dartTool.ts + harness/subagents/{dartAnalyst,dartPrompts}.ts
  - 전 파일 ≤420줄(1000 상한 안전), 의존 단방향 순환0
  - dartTool 은 SubagentSpec.tools 직접주입만(HARNESS_TOOLS 미등록 — R5 격리)

## 핵심 불변식 (위반 = 설계 실패)
- R2: dartAnalyst/dartTool 추가 후 agent.ts/route.ts/registry.ts/
  buildAgentOptions.ts/chunkFilter.ts/streamNamespace.ts **git diff 본문
  0줄** (webSearcher.ts 동형 — D6/D8 게이트 자동단언)
- R5/FR-26: subagent 본문 누출 0 = 기존 isSubagentNamespace 차단(신규 필터 0)
- R8 구현 중 실측: OPEN-4(DART 응답 스키마 D1)·OPEN-3(subagent 사고채널
  메타 D6). 충돌 시 임의변경 금지 → 사용자 보고 + PRD 개정
- 폐기 grep 0: auth(/gemini/@google/generative-ai/TokenUsageService/
  perplexity/kis/next/server(DART)/krx — DART 경로 0 (D8 게이트)

## STRUCTURAL Action Item (PASS 조건 — 원본 그대로 복사 금지)
1. OPEN-1 rate-limiter 인메모리 재구현(globalThis·R6, limiter 시그니처
   불변) — D3. 원본 store sql.js 복사 금지
2. 대형 4파일+프롬프트 기능축 분리(≤420) — D1·D2·D3·D4·D7
3. OPEN-5 context-formatter 순수 신설(analysis.service 통째 금지,
   format*Data만) — D5
4. gemini 절단 = disclosure 요약모드(summarizeDisclosureForAI) 미이식 — D4
5. R2/R5 동형성 게이트(6파일 diff 본문 0) — D6+D8

## Plan (8 slice, TDD — tests→impl→verify→commit, 1슬=1커밋)
Wave: D1 → {D2,D3} → D4 → D5 → {D6,D7} → D8

- [x] D1 [Wave D1] 타입 4분리 + OPEN-4 실측 — 4fad429 (22 test green)
- 실행순서 재정렬(사용자 HITL 2026-05-19, R8): D2→rate-limiter import
  의존 발견 → **D3 먼저 → D2**. plan Wave 구조 유지, 실행만 D3→D2.
- [x] D3 [Wave D2] rate-limiter 인메모리(OPEN-1 c) + 지표 6분리 —
      3347da9 (65 test green, sql.js 0, computeIndicator 중복단일화)
- [x] D2 [Wave D2] DART API 6분리(api/) + snake→camel + jszip 정식
      의존 — d3daaef (16 green, 키단일·SSRF·FR-27 폐기 0)
- [ ] D4 [Wave D3] 트렌드 5분리(trend/) + 공시파서(보안 zip-slip·XML폭탄)
      + 요약모드 절단(STRUCTURAL #4)  ← NEXT
- [ ] D5 [Wave D4] OPEN-5 context-formatter 압축 레이어 신설(순수)
- [ ] D6 [Wave D5] dartTool 어댑터 + R2/R5 동형성 게이트 + OPEN-3 실측(R8)
- [ ] D7 [Wave D5] dartAnalyst subagent + 8관점 dartPrompts + 관점-항목 매핑
- [ ] D8 [Wave D6] 통합검증 + 동형성/폐기종속/1000줄/키 grep + E2E

## ⚠ 스코프 확장 보류 (사용자 HITL 2026-05-19 — D7 완료 후 처리)
- 사용자 결정: 사이드바에 **DART 전용 메뉴 + 전용 폼 UI**(medigate
  DartDashboard 수준 — 기업검색·관점선택·결과카드·차트) 추가.
- 이는 PRD §3.9 비목표 2개를 뒤집음: ①standalone 사용자기능 금지
  ②API 라우트 미노출. 전용 폼 UI 는 브라우저→서버 API 라우트 필수
  (medigate /api/dart/** 패턴 회귀). architect R2/R5 동형성 전제
  (webSearcher 동형, UI diff 0)도 변경됨 — DART 가 subagent **이자**
  독립 API 진입점이 됨.
- 진행 순서 확정: **백엔드(D2~D7) 먼저 완성 → 챗에서 동작 검증 →
  그 다음** PRD §3.8/3.9 재정렬 + use-case UI 플로우 + QA TC +
  architect 재검토(R2/R5 영향) + 신규 UI 슬라이스(D9~D11: API라우트/
  페이지셸/검색·관점폼/결과카드·차트) 추가. D7 완료 시 이 블록 처리.
- 원본 UI 참조: .design-handoff/dart-source 에 컴포넌트 없음(미추출)
  — 필요 시 medigate 삭제커밋 44cf758^ 에서 DartDashboard.tsx(1762)/
  CompanySearch(293)/AIAnalysisModal(1887)/ChartTab(604) 재추출.

## D1 결정·산출 (4fad429)
- OPEN-4 실측(R8): raw=snake_case(thstrm_amount) vs 도메인=camelCase
  (thstrmAmount)는 **원본의 의도된 매핑** — 스펙 위반 아님. snake→camel
  변환은 D2 api/client.ts 책임. PRD 개정 불요. dart-api-probe.md §2 =
  D2 매핑 정답지(실측 raw 키 목록, 픽스처 재사용).
- DART_API_KEY = medigate-manager .env 에서 .env.local 로 이관(40hex,
  gitignored 확인, staged diff 실키 0건 — 보안 게이트 통과).
- 스코프 정합화(사용자 HITL): 원본 growth UI 함수 8개 중 순수 5개
  (getIndicatorDeltaConfig/getChangeUnit/shouldShowGrowth/
  formatGrowthRate/formatGrowthFull/extractGrowthRate)는 indicators.ts
  이식, Tailwind UI 3개(getGrowthColorClass*·formatGrowthForTable) 제외
  확정. 테스트 단언을 "라인수 하한"→"심볼 보존+결정성"으로 정정
  (라인수는 UI 제거로 정당히 감소 — 잘못된 프록시였음).
- 전 파일 ≤340줄(architect ≤420 예산 충족). 원본 1374 단일 → 5파일 935.

## Blockers
- (D1 무관) thinkingToggle.ts:92 throw "reduceAuto: not implemented
  — TODO(USER)" → thinkingToggle.test.ts 10 FAIL. 세션 시작부터
  untracked 스텁(이전 세션 미완, 사용자 TODO). CLAUDE.md 무관코드
  수정금지 → 손 안 댐. D1 회귀 아님(D1 도입 전부터 존재).

## Notes (다음 슬라이스 입력)
- 이식 원본 참조: .design-handoff/dart-source/src/ (medigate 삭제직전 트리)
  - indicator-calculator.ts 1386 / trend.service.ts 1114 / dart-api.ts 1234
    / types/dart.ts 1374 → 전부 기능축 분리 대상(원본 복사 금지)
  - perplexity.ts/gemini.ts/kis-api.ts = 폐기(이식 안 함)
  - analysis.service.ts format*Data() = OPEN-5 압축 레이어 SSOT(gemini 동반
    이라 통째 금지, format 함수만 추출)
  - dart-analysis-prompts.ts 726 = 8관점 systemPrompt SSOT, PERPLEXITY 섹션
    (493~726) 제거 후 ~480
- 패턴 예제(살아있음): harness/subagents/webSearcher.ts(subagent 1=파일1),
  subagents/index.ts(HARNESS_SUBAGENTS +1줄), model.ts(createModel ChatOpenAI)
- 미커밋 무관 작업(이전 세션, 손대지 않음): thinking-panel 브랜치 변경분
  34개 + agent.ts subgraphs 잔여 타입에러(보고만)

---

## Archive (완료 — 컨텍스트 압축 대상)

### Feature: LangGraph DeepAgents 하네스 + 스트리밍 챗 — MERGE READY (feat/deepagents-chat-harness)
- Wave 1~6 (9/9 슬라이스) + 사고 패널. merge-ready 8게이트 PASS. origin push 완료.
- 35faaa5 스캐폴드/실측 · b19c73c 타입+스토어 · 602b567 chunkFilter+SSE파서 ·
  b8c59cf model+checkpointer · dcb4e86+b8d13aa registry+buildAgentOptions+agent ·
  4ca20ec ChatMarkdown sanitize · 05c4625 API SSE+Zod · 2ac1344 채팅 UI ·
  29438fa~ merge-ready. 204/204 test, tsc/eslint/build 0.
- 실측 확정: provider=openai LLM_MODEL=gpt-5.4-mini, streamMode "messages"=
  [AIMessageChunk,meta] 튜플, content=string(thinking 미발생), checkpointer=
  SqliteSaver.fromConnString(@langchain/langgraph-checkpoint-sqlite),
  filesystem=soft toggle(AD-6). @langchain/core 1.1.46 단일트리(R1).

### Feature: 과거 대화 호출 (conversation history) — DONE + E2E PASS
- 4슬라이스: checkpointer globalThis 싱글톤 / conversations replay+list+group /
  GET /api/conversations+[id] / store.loadConversation + ConversationHistory.tsx.
- 131/131 test, tsc/eslint 0. E2E: 복원후 이어쓰기 thread 연속성 실증.
- better-sqlite3@^12.10.0 + @types 직접의존(transitive→명시).
- 발견: dev SQLite 공유상태(기능결함 아님, API↔DB 항상 일치).

### Feature: 하네스 요소 확인 페이지 /harness — DONE (커밋 보류)
- 4슬라이스(S0~S3): probe / lib/harness-introspect/view.ts 순수함수 /
  (main)/harness/page.tsx+HarnessView.tsx / layout.tsx AGENT_ITEMS +1.
- harness 92/92 test, tsc/eslint 0. C2 핵심 실증: .data 삭제 후 /harness
  3회 → SQLite 미생성. 사이드바 메뉴+5섹션 육안 정상.
- Blocker(무관, 이전 세션 잔여): agent.ts:161 subgraphs:true 타입에러 —
  손 안 댐(CLAUDE.md 무관코드 수정금지), 사용자 보고.

# 개발 코드 환경 사양 — 전수 조사

> 조사일: 2026-05-19 01:00 KST · 조사 방식: 런타임/lockfile/node_modules 직접 실측
> 브랜치: `feat/deepagents-chat-harness` · 마지막 커밋: af4b4fd (기획 산출물 부트스트랩)

---

## 1. 런타임 환경

| 항목 | 값 |
|---|---|
| OS | Darwin 25.4.0 (macOS 26.4.1) |
| Arch | arm64 (Apple Silicon) |
| Node | v24.3.0 |
| npm | 11.5.2 |
| pnpm | 10.29.2 (패키지 매니저로 사용) |
| Shell | /bin/zsh |
| Timezone | KST (+0900) |

## 2. 프로젝트 메타

- name: `aiceo-4th-agent` · version: 0.1.0 · `"type": "module"` (ESM)
- 빌드 도구 체인: **Next.js 16 (App Router) + TypeScript strict + Vitest + Playwright + Tailwind v4**
- node_modules 총 26개 top-level 패키지 설치 완료
- git: 부트스트랩 커밋 1개 존재, 현재 package.json/lockfile 수정 상태(M)

## 3. 설치된 의존성 (node_modules 실측 = package.json 핀과 일치)

### dependencies (런타임)

| 패키지 | 설치 버전 | 비고 |
|---|---|---|
| deepagents | 1.10.2 | 에이전트 하네스 (핵심) |
| langchain | 1.4.0 | |
| @langchain/core | 1.1.46 | **R1 단일 정렬 기준점** |
| @langchain/anthropic | 1.3.29 | Anthropic provider |
| @langchain/openai | 1.4.5 | OpenAI provider (FR-10 스위칭) |
| @langchain/langgraph-checkpoint-sqlite | 1.0.1 | H3 멀티턴 영속화 (R7 nodejs 강제 원인) |
| next | 16.2.6 | App Router |
| react / react-dom | 19.2.6 | |
| zustand | 5.0.13 | 클라이언트 상태 |
| react-markdown | 10.1.0 | 챗 렌더링 |
| remark-gfm | 4.0.1 | GFM |
| rehype-raw | 7.0.0 | |
| rehype-sanitize | 6.0.0 | XSS 방어 (보안) |
| lucide-react | 1.16.0 | 아이콘 |
| clsx | 2.1.1 | className 유틸 |
| zod | 4.4.3 | **deepagents ^4 와 메이저 정렬 (R1)** |

### devDependencies (빌드/테스트/품질)

| 패키지 | 설치 버전 | 용도 |
|---|---|---|
| typescript | 5.9.3 | strict mode |
| eslint | 9.39.4 | flat config |
| eslint-config-next | 16.2.6 | next 린트 |
| vitest | 4.1.6 | 단위 테스트 |
| @vitest/coverage-v8 | 4.1.6 | 커버리지 |
| @vitejs/plugin-react | 6.0.2 | |
| @testing-library/react | 16.3.2 | 컴포넌트 테스트 |
| jsdom | 29.1.1 | DOM 환경 |
| @playwright/test | 1.60.0 | E2E |
| tailwindcss | 4.3.0 | |
| @tailwindcss/postcss | 4.3.0 | Tailwind v4 PostCSS |
| @types/node | 24.12.4 | |
| @types/react / @types/react-dom | 19.2.14 / 19.2.3 | |

### 전이 의존(중요, 직접 추가 안 함 — 규약 준수)

- `@langchain/langgraph` **1.3.0** — top-level 아님, deepagents 트리에서만 해석.
  (CLAUDE.md 13–14행 "package.json 에 직접 추가 금지" 준수)
- `@langchain/langgraph-checkpoint` 1.0.2, `@langchain/langgraph-sdk` 1.9.2

## 4. 설정 파일 (모두 존재)

| 파일 | 핵심 내용 |
|---|---|
| `tsconfig.json` | strict, target ES2022, moduleResolution bundler, `@/*`→`./src/*`, e2e 제외 |
| `next.config.ts` | `serverExternalPackages: [deepagents, @langchain/langgraph-checkpoint-sqlite]` (R7) |
| `vitest.config.ts` | 23줄 (jsdom 환경 추정) |
| `playwright.config.ts` | 19줄 |
| `eslint.config.mjs` | 13줄 (flat config) |
| `postcss.config.mjs` | 8줄 (Tailwind v4) |
| `run-dev.sh` | 45줄 (로컬 서버 실행 스크립트 — CLAUDE.md 규약대로 루트에 존재) |
| `.gitignore` | node_modules / .next / **.data/** (checkpointer) / **.env*** (서버키) / coverage 등록 |
| `.env.example` | LLM_PROVIDER, 하네스 토글(HARNESS_*), CHECKPOINTER_SQLITE_PATH 정의 |

## 5. 절대 규칙(R) 검증 결과

| 규칙 | 상태 | 근거 |
|---|---|---|
| **R1** @langchain/core 단일 정렬 | ✅ PASS | 전 트리 `@langchain/core 1.1.46` 단일. zod `4.4.3` 단일(^4 정렬) |
| **R7** route nodejs 런타임 | ✅ 사전 대비 | next.config.ts `serverExternalPackages` 설정됨 (route.ts 는 미작성) |
| langgraph 직접 추가 금지 | ✅ PASS | 1.3.0 전이 의존으로만 존재 |
| 빌드 건강성 | ✅ PASS | `tsc --noEmit` exit 0 |

## 6. 현재 소스 코드 상태 (구현 진행도)

```
src/
  app/
    layout.tsx          ← 존재
    page.tsx            ← 존재
    globals.css         ← 존재
    (main)/chat/page.tsx ← 존재
```

- **UI 골격(App Router 페이지)만 존재.** 핵심 백엔드 미작성:
  - `src/lib/agent/harness/registry.ts` (R2) — **없음**
  - `src/app/api/.../route.ts` (R7) — **없음**
  - `src/lib/agent/utils/chunkFilter.ts` (R5) — **없음**
  - checkpointer / agent.ts — **없음**
- 기획 산출물은 완비: docs/PRD.md, docs/plan.md,
  docs/use-cases/, docs/qa/, docs/notes/deepagents-api-probe.md

## 6.5. 패키지 최신화 결과 (2026-05-19, 사용자 지시 "전부 최신 강제")

조사 시점 구버전 3종을 메이저 업그레이드 후 풀 검증:

| 패키지 | 변경 전 | 변경 후 | tsc | eslint | build | 최종 |
|---|---|---|---|---|---|---|
| typescript | 5.9.3 | **6.0.3** | ✅ | ✅ | ✅ | **유지** |
| @types/node | 24.12.4 | **25.9.0** | ✅ | — | ✅ | **유지** (런타임 Node 24 와 메이저 불일치하나 tsc/build 통과 — 모니터링) |
| eslint | 9.39.4 | 10.4.0 → **^9.39.4 롤백** | — | ❌→✅ | — | **롤백** |

- **eslint 10 롤백 사유**: `eslint-plugin-react@7.37.5` / `-jsx-a11y` / `-react-hooks`
  (모두 `eslint-config-next@16` 전이 의존)가 eslint 10 의 변경된 rule context
  API(`contextOrFilename.getFilename` 제거) 와 비호환. `eslint .` 실행이
  `TypeError` 로 크래시. 우리 코드 문제 아님 — 생태계 플러그인 미성숙
  (error-recovery Rule 4). 사용자 컨펌 후 9.x 최신으로 롤백.
- **풀 검증 (롤백 후)**: `tsc --noEmit` exit 0 / `eslint .` exit 0 /
  `next build` Compiled successfully + 자체 TS 검증 통과 + 4 정적 페이지.
  `vitest run` exit 1 = "No test files found" (테스트 미작성, 구현 단계 아님 — 정상).
- TypeScript 6 메이저가 Next 16 빌드 자체 TS 검증까지 통과함을 빌드 출력으로 실증.

## 7. 종합 판정

**환경 셋업 단계 = 완료. 핵심 구현 = 미착수.**

- 패키지·설정·빌드 체인 전부 준비됨, 절대 규칙(R1/R7/langgraph) 사전 충족.
- 기획 4종 문서 완비 (`/bootstrap-feature` 산출물).
- 다음 단계: `/implement-slice` 로 harness/registry → agent → route → chunkFilter
  순 TDD 구현 (CLAUDE.md 자율 워크플로우).
- 미실측 잔여(api-probe §5): streamMode 인자, chunk content type 문자열,
  subagent 메타 키, checkpointer boolean 의미 — 구현 직전 실측 필요.

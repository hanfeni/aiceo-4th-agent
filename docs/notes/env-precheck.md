# 환경 사전 점검 — 실측 기록

> Slice 1 (Wave 1) pre-work. 실측일: 2026-05-19 KST
> 모든 값은 학습 지식이 아닌 실제 명령 실행 결과 (R8).

## 1. 런타임 버전 (실측)

| 항목 | 요구 | 실측값 | 판정 |
|------|------|--------|------|
| Node.js | 20 LTS+ | **v24.3.0** | ✅ (Next 16 / LangChain v1 모두 Node 24 지원) |
| pnpm | 10+ | **10.29.2** | ✅ |

※ plan.md 는 "Node 20 LTS+" 가정이었으나 실제 런타임은 v24.3.0.
  상위 호환이므로 문제없음. 학습 지식 아닌 실측값으로 확정.

## 2. LLM 프로바이더 / 키 (HARD PRECONDITION — 충족)

| 항목 | 값 |
|------|-----|
| LLM_PROVIDER | **openai** (사용자 제공 키가 OpenAI) |
| LLM_MODEL | **gpt-5.4-mini** (사용자 확정) |
| 키 위치 | `.env.local` (gitignored — `git check-ignore` 확인됨, 커밋 안 됨) |
| 키 환경변수 | `OPENAI_API_KEY` (서버 전용, NEXT_PUBLIC_ 아님) |

## 3. 모델 호출 실증 (curl, R8 — 학습 지식 의존 금지)

### (a) 모델 등록 여부 — OpenAI /v1/models
- 이 키 접근 가능 모델 **총 130개** (Tier 높은 키).
- gpt-5 계열 38종 전부 포함 (`gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`,
  `gpt-5-mini`, `gpt-5-nano` 등), gpt-4.1/4o 계열, o1/o3/o4 추론계열 포함.
- **`gpt-5.4-mini` 등록 확인됨** → 사용 결정.

> 주의: 1차 probe 에서 grep 패턴 협소로 "gpt-5 없음" 오판 →
> 2차 전수 분류로 반증·정정. R8 실측 원칙이 작동한 사례(probe note §0
> 와 동일 교훈).

### (b) 1토큰 실제 호출 (소액 과금)
```
model=gpt-5.4-mini-2026-03-17  finish=stop
usage={prompt_tokens:7, completion_tokens:12, total_tokens:19,
       completion_tokens_details:{reasoning_tokens:0, ...}}
```
- 정상 응답. **GPT-5 계열은 `max_tokens` 아닌 `max_completion_tokens`**
  사용 (요구사항 명시 함정 — curl 검증 시 준수함).
- 짧은 입력("hi")이라 `reasoning_tokens:0`. → 추론 토큰 누출(함정 4)은
  U2~U5 probe 에서 "추론 유발 입력"으로 재현·검증 예정.
- gpt-4o-mini 로도 교차 1토큰 실증 통과 (provider 추상화 sanity).

## 4. 포트 점유 (실측)

- 3000 (Next.js dev): Slice 1 빌드 단계에선 dev 미기동.
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` → 점유 없음 (build only).
- OpenCode 4096 포트 개념 폐기 (deepagents 인프로세스 — 별도 서버 없음).

## 5. 빌드 / 린트 / 의존성 정합 (실측)

| 검증 | 명령 | 결과 |
|------|------|------|
| 의존성 설치 | `pnpm install` | Done (15.9s) |
| 네이티브 빌드 | better-sqlite3 .node | ✅ 빌드됨 (`pnpm.onlyBuiltDependencies` 명시 승인 — H3 SQLite 체크포인터 전제) |
| **R1 단일 트리** | `pnpm why @langchain/core` | **@langchain/core 1.1.46 distinct=1** ✅ |
| zod 정렬 | `pnpm why zod` | zod 4.4.3 단일 ✅ |
| @langchain/langgraph 직접핀 | grep package.json | 0 (deepagents 트리 해석 — 규약 준수) ✅ |
| 빌드 | `pnpm build` | exit 0, 라우트 `/`·`/_not-found`·`/chat` 정적 생성 ✅ |
| 린트 | `pnpm exec eslint .` | 0 problems ✅ (flat config 직접 export, FlatCompat 미사용 — 함정 9) |

## 6. Deviation 기록 (error-recovery)

- **Rule 3 (Auto-Resolve, 1 retry):** better-sqlite3/sharp/unrs-resolver
  빌드 스크립트가 pnpm 보안정책으로 ignored → `package.json`
  `pnpm.onlyBuiltDependencies` 로 명시 승인 후 재설치. H3 체크포인터의
  네이티브 바인딩 전제라 해결 필수였음.
- **Rule 1 (free):** eslint.config.mjs 익명 export 경고 → named const
  후 export 로 정정 (0 problem).
- **Rule 4 (escalate):** active provider 키 부재 → 사용자에게 요청,
  OpenAI 키 수령 후 재개 (임의 대체 안 함 — requirements.md 규칙 준수).

## 결론

환경 사전 점검 **전 항목 충족**. HARD PRECONDITION(키), R1 정합,
빌드/린트 0 에러 확인. U2~U5 실 LLM probe(deepagents + ChatOpenAI
gpt-5.4-mini) 진행 가능.

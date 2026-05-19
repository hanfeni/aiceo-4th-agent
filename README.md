# aiceo-4th-agent

> LangGraph DeepAgents(JS) 기반 LLM 챗 에이전트 + RAG / Text-to-SQL / GraphRAG 비교 실습 앱

AICEO 4기 교육용 프로젝트입니다. 하나의 챗 에이전트 하네스 위에서
다음 실습을 한 곳에서 다룹니다:

- **LLM 챗** — DeepAgents 하네스(planning / filesystem / subagents / checkpointer)
  기반 멀티턴 대화, 토큰 스트리밍, 사고(reasoning) 패널
- **검색 실습 (search-lab)** — OpenSearch 색인 → 벡터/키워드 검색
- **온톨로지 실습 (graph-lab)** — 같은 데이터(SEC EDGAR 13F)를
  RAG / Text-to-SQL / GraphRAG **3방식으로 동시 비교**.
  기관-종목 보유는 멀티홉 추론이라 GraphRAG 우월성이 선명히 드러납니다.

> 📂 상세 스펙·설계 산출물(PRD, 요구사항, 실측 노트 등)은 코드 트리
> 최소화를 위해 별도 아카이브로 이관됐습니다. 코드 생성 가드 규칙은
> [`CLAUDE.md`](CLAUDE.md)를 참조하세요.

---

## 🚀 빠른 시작 (교육생용)

이 프로젝트는 **바이브코딩으로 셋업**합니다. 아래 ["셋업 프롬프트"](#-셋업-프롬프트-복사해서-붙여넣으세요)
전체를 복사해 **Claude Code** 또는 **Cursor** 에 그대로 붙여넣으면,
clone → 설치 → API 키 입력 → 인프라 자동 준비 → 서버 기동 → 그래프 구축까지
**AI가 끝까지 진행**합니다.

### 사전 준비물

**본인 OpenAI API 키 1개**만 미리 준비하세요. 나머지 도구는 AI가
점검 후 없으면 직접 설치·최신화합니다.

| 항목 | 준비 주체 | 비고 |
|---|---|---|
| OpenAI API 키 | **교육생 (필수 사전 발급)** | <https://platform.openai.com/api-keys> |
| Git / Node 20+ / pnpm 10+ | AI 자동 점검·설치 | 없거나 구버전이면 AI가 설치/업그레이드 |
| Docker Desktop | AI 자동 점검·설치 | 미설치 시 설치, 데몬 꺼짐 시 자동 기동 |
| OpenSearch / Neo4j | AI 자동 기동 | 컨테이너 사전 기동 (별도 설치 불필요) |

> ⚠️ OpenAI API 키는 **교육생 본인 키**를 사용합니다 (사용량은 각자 과금).
> 키는 `.env.local` 에 넣으며, 이 파일은 `.gitignore` 에 등록되어
> **깃에 올라가지 않습니다** — 안심하고 입력하세요.
> GUI 권한 승인 창이나 브라우저 버튼 클릭처럼 **사람만 할 수 있는 일**만
> AI가 그때그때 요청합니다.

### 권장 환경

- ✅ **macOS / Linux** — 모든 실습(챗·검색·온톨로지) 정상 동작
- ⚠️ **Windows** — 챗·검색은 정상이나, 온톨로지(graph-lab)의 Neo4j
  자동 기동은 현재 macOS/Linux 기준입니다. graph-lab 실패 시 강사에게 문의하세요.

---

## 📋 셋업 프롬프트 (복사해서 붙여넣으세요)

아래 코드블록 **전체를 복사**해서 Claude Code(또는 Cursor)에 그대로 붙여넣으세요.

```text
당신은 셋업 자동화 엔지니어입니다. 사용자에게 "직접 설치하세요"라고 떠넘기지 말고, 점검 후 누락·구버전이면 당신이 직접 명령을 실행해 설치·최신화하세요. 각 단계 결과를 확인하며 끝까지 자동 진행하고, 정말 사람만 할 수 있는 일(브라우저 클릭, GUI 권한 승인, API 키 발급)만 사용자에게 요청하세요. 막히면 그 단계에서 멈추고 무엇이 문제인지 한국어로 설명한 뒤 해결을 도와주세요.

[프로젝트] aiceo-4th-agent — LangGraph DeepAgents 기반 LLM 챗 + RAG/Text-to-SQL/GraphRAG 비교 실습 앱.
[OS 자동 감지] uname -s 등으로 macOS / Linux / Windows 를 먼저 판별하고, 이후 모든 설치 명령을 그 OS에 맞게 선택하세요.

[1단계 · 필수 도구 점검 후 직접 설치/최신화]
아래를 하나씩 점검하고, 없거나 버전 미달이면 "안내"가 아니라 당신이 직접 설치 명령을 실행하세요:
- git : 없으면 설치 (macOS `brew install git` / Linux 패키지매니저 / Windows `winget install Git.Git`).
- Node.js : `node --version` 이 20 미만이거나 없으면 설치/업그레이드 (macOS `brew install node` / Linux nvm 또는 패키지매니저 / Windows `winget install OpenJS.NodeJS.LTS`).
- pnpm : `pnpm --version` 이 10 미만이거나 없으면 `corepack enable && corepack prepare pnpm@latest --activate` 실행 후 재확인.
- Docker : `docker --version` 으로 설치 확인, `docker info` 로 데몬 실행 확인.
  · 미설치 → macOS `brew install --cask docker`, Windows `winget install Docker.DockerDesktop`, Linux 는 공식 스크립트(get.docker.com) 안내 후 가능하면 설치.
  · 설치됐으나 데몬 꺼짐 → macOS `open -a Docker`, Windows Docker Desktop 실행, 그 후 `docker info` 가 성공할 때까지 최대 60초 폴링.
  · GUI 권한 승인 창이 뜨면 그것만 사용자에게 "승인 버튼을 눌러주세요"라고 요청.
homebrew 가 macOS 에 없고 설치가 필요하면 먼저 brew 부터 설치(공식 스크립트)한 뒤 진행하세요.

[2단계 · 리포 클론]
이미 이 폴더가 git 리포면 건너뜁니다. 아니면 `git clone https://github.com/hanfeni/aiceo-4th-agent.git` 후 `cd aiceo-4th-agent`. 이후 모든 명령은 이 폴더 안에서 실행합니다.

[3단계 · 의존성 설치]
`pnpm install` 실행. better-sqlite3 등 네이티브 빌드가 포함되어 수 분 걸릴 수 있습니다. 실패 시 로그를 읽고 원인을 직접 해결한 뒤 재시도하세요.

[4단계 · API 키 설정 (.env.local 생성) — 사람만 할 수 있는 일]
1. `.env.example` 을 `.env.local` 로 복사: `cp .env.example .env.local`
2. `.env.local` 의 두 키 플레이스홀더를 사용자 본인의 실제 키로 교체하라고 요청하세요 (키 발급·입력은 사람만 가능):
   - `OPENAI_API_KEY=` → 본인 OpenAI 키 (형식 예 `sk-proj-실제키값`). 챗·전체 동작 필수.
   - `DART_API_KEY=` → DART 분석 실습용. <https://opendart.fss.or.kr> 에서 이메일 인증으로 무료 발급(수 분). DART 메뉴를 안 쓰면 비워둬도 다른 메뉴는 정상이나, 실습 범위에 DART가 있으면 발급을 요청하세요.
   - 나머지 줄(LLM_PROVIDER=openai, LLM_MODEL=gpt-5.4-mini, HARNESS_* 등)은 그대로 둡니다.
3. `.env.local` 은 .gitignore 에 등록돼 커밋되지 않으니 안심하라고 알려주세요.
4. `grep '^OPENAI_API_KEY=sk-' .env.local` 으로 OpenAI 키가 채워졌는지 확인하고, 비어 있으면 채워질 때까지 여기서 대기하세요(다음 단계에서 서버가 중단됨). DART 키는 `grep '^DART_API_KEY=' .env.local` 로 placeholder(XXXX)가 아닌 실제 값인지 확인하되, DART 실습 예정이 아니면 경고만 남기고 진행합니다.

[5단계 · 인프라 사전 준비 (당신이 직접 컨테이너까지 띄움)]
교육생이 메뉴 버튼을 누르기 전에, 인프라를 미리 기동해 클릭이 즉시 성공하도록 만드세요. 1단계에서 Docker 데몬이 이미 떠 있어야 합니다.
- OpenSearch : `./run-opensearch.sh` (Windows 는 `powershell -ExecutionPolicy Bypass -File run-opensearch.ps1`) 를 직접 실행. 이 스크립트가 Docker 보장→컨테이너→Nori 까지 처리합니다. 실패해도 검색 메뉴만 영향이니 로그를 남기고 다음으로 진행.
- Neo4j : `./run-neo4j.sh` (Windows 는 run-neo4j.ps1 — 없으면 그 사실을 보고하고 건너뜀) 를 직접 실행. 이 스크립트가 Docker 미설치 시 자동 설치, 데몬 꺼짐 시 자동 기동, Neo4j 컨테이너 기동·헬스대기까지 모두 처리합니다. "Neo4j 준비 완료" 로그가 나올 때까지 기다리세요.
스크립트가 GUI 권한/수동 Docker 실행을 요구하면 그 부분만 사용자에게 요청하고, 해결되면 같은 스크립트를 다시 실행하세요.

[6단계 · 서버 기동]
`./run-dev.sh` (Windows `powershell -ExecutionPolicy Bypass -File run-dev.ps1`) 실행. 포트 정리·캐시 제거·의존성 점검·OpenSearch 보장·브라우저 자동 오픈이 내장돼 있습니다(5단계에서 OpenSearch 가 이미 떠 있으면 즉시 통과). 잠시 후 http://localhost:3000 이 자동으로 열립니다. 이 명령은 서버가 떠 있는 동안 계속 실행 상태로 둡니다(종료 금지).

[7단계 · 그래프 구축 — 사람만 할 수 있는 일(브라우저 클릭)]
인프라는 5단계에서 이미 준비됐습니다. 사용자에게 브라우저에서 좌측 메뉴 **온톨로지(graph-lab)** → **"그래프 구축"** 버튼을 한 번 눌러달라고 요청하세요(브라우저 클릭은 당신이 못 하는 유일한 단계). 클릭하면 앱이 GitHub 공개 데이터(SEC EDGAR 13F 서브셋)를 받아 Neo4j 에 적재하고 진행 로그를 실시간 표시합니다. "✓ 완료" 가 뜨면 RAG / Text-to-SQL / GraphRAG 3방식 비교가 가능합니다. 만약 5단계에서 Neo4j 준비에 실패했었다면, 이 버튼이 Docker→Neo4j 자동 기동을 한 번 더 시도하므로 실패 시 Docker 상태를 확인하고 버튼 재클릭을 요청하세요.

[완료 기준]
- http://localhost:3000 접속 시 챗 UI가 뜬다
- 챗에 메시지를 보내면 LLM 응답이 스트리밍된다 (API 키 정상)
- graph-lab "그래프 구축" 완료 후 3방식 비교가 동작한다
각 단계 완료 시 ✓ 표시하고, 모두 끝나면 "셋업 완료 — 실습을 시작하세요"라고 한국어로 마무리하세요.
```

---

## 🛠 수동 셋업 (프롬프트 없이 직접)

바이브코딩 도구 없이 직접 진행할 경우:

```bash
# 1. 클론
git clone https://github.com/hanfeni/aiceo-4th-agent.git
cd aiceo-4th-agent

# 2. 의존성 설치 (네이티브 빌드 포함, 수 분 소요)
pnpm install

# 3. API 키 설정 — .env.example 을 복사한 뒤 본인 키 입력
cp .env.example .env.local
#   .env.local 을 열어 OPENAI_API_KEY= 의 sk-proj-XXXX... 를
#   본인 OpenAI 키로 교체. 나머지 줄은 그대로 둔다.

# 4. 서버 기동 (OpenSearch 자동 기동 + 브라우저 자동 오픈)
./run-dev.sh                                              # macOS / Linux
# powershell -ExecutionPolicy Bypass -File run-dev.ps1    # Windows

# 5. 브라우저에서 graph-lab 메뉴 → "그래프 구축" 버튼 클릭
#    (Neo4j 컨테이너 + SEC EDGAR 데이터 자동 적재)
```

---

## 🧩 인프라 자동 기동 구조 (참고)

이 프로젝트는 무거운 인프라를 **필요한 시점에만** 자동으로 띄웁니다 —
교육생은 별도 설치가 필요 없습니다.

| 인프라 | 사전 설치 | 기동 시점 | 담당 |
|---|---|---|---|
| **OpenSearch** | ❌ 불필요 | `run-dev.sh` 부팅 시 (eager) | `run-opensearch.sh` |
| **Neo4j** | ❌ 불필요 | graph-lab "그래프 구축" 버튼 클릭 시 (lazy) | `run-neo4j.sh` |
| **Docker** | ⚠️ 권장 | — | 없으면 macOS는 자동 설치 시도 |
| **데이터(SEC EDGAR)** | ❌ 불필요 | 그래프 구축 시 GitHub raw 에서 fetch | 자기완결 |

→ "그래프 구축" 버튼 = **Docker 보장 → Neo4j 컨테이너 자동 기동 →
데이터 자동 적재** 한 번에 처리. Docker만 실행돼 있으면 클릭 한 번이면 됩니다.

---

## ❓ 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `run-dev.sh` 가 키 없음으로 중단 | `.env.local` 의 `OPENAI_API_KEY` 가 비어 있음 → 본인 키 입력 |
| graph-lab 그래프 구축 `HTTP 4xx/5xx` | Docker Desktop 미실행 → 실행 후 메뉴바 아이콘 'running' 확인하고 버튼 재클릭 |
| 첫 그래프 구축이 느림 | Neo4j 콜드 스타트(1~3분)는 정상 — 진행 로그를 기다리세요 |
| 포트 3000 충돌 | `run-dev.sh` 가 자동으로 점유 프로세스를 정리합니다 (재실행) |
| pnpm 버전 낮음 | `corepack enable && corepack prepare pnpm@latest --activate` |
| Windows graph-lab 실패 | 현재 graph-lab Neo4j 자동 기동은 macOS/Linux 기준 — 강사 문의 |

---

## 📁 프로젝트 구조 (요약)

```text
src/
  app/
    (main)/chat/        챗 UI 페이지
    (main)/graph-lab/   온톨로지 비교 실습 페이지
    api/graph-lab/       그래프 구축·비교·상태·샘플·리셋 API (SSE)
  lib/
    agent/harness/       하네스 요소 토글 단일 지점 (registry.ts)
    graphlab/            Neo4j 클라이언트·인프라 보장·적재·3방식 비교
run-dev.sh / run-dev.ps1            로컬 서버 실행 (캐시정리·포트kill 내장)
run-opensearch.sh / run-neo4j.sh    인프라 자동 기동 스크립트
CLAUDE.md                           코드 생성 가드 규칙 (R1~R8)
```

> 설계 규칙·요구사항 상세는 [`CLAUDE.md`](CLAUDE.md) 및 별도 산출물 아카이브 참조.

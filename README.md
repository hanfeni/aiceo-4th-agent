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

이 프로젝트는 **바이브코딩으로 셋업**합니다. 코딩에이전트
(**Claude Code** / **Cursor** / **Antigravity** 등)에 아래 한 줄만 붙여넣으면
clone → 설치 → API 키 입력 → 인프라 자동 준비 → 서버 기동 → 그래프 구축까지
**AI가 끝까지 진행**합니다.

### 가장 간단한 방법 — 한 줄 프롬프트

빈 폴더에서 코딩에이전트에 아래 한 줄을 붙여넣으세요(아직 clone 전이어도 됩니다):

```text
공개 깃허브 리포 https://github.com/hanfeni/aiceo-4th-agent 의 README.md 를
원문 그대로 읽고, 거기 적힌 셋업 절차를 내 OS에 맞게 끝까지 실행해줘.
사람만 할 수 있는 일(OpenAI 키 입력·브라우저의 "그래프 구축" 클릭)만 나한테 요청해.
```

> 세밀하게 제어하고 싶으면 아래 ["셋업 프롬프트"](#-셋업-프롬프트-복사해서-붙여넣으세요)
> 전문을 대신 복사해 붙여넣어도 됩니다.

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
- ✅ **Windows** — 챗·검색·온톨로지(graph-lab) 모두 지원. graph-lab 의
  Neo4j 자동 기동은 `run-neo4j.ps1` 이 처리합니다. 실패 시 Docker Desktop
  실행 여부를 확인하고 "그래프 구축" 버튼을 재클릭하세요.

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
- Neo4j : `./run-neo4j.sh` (Windows 는 `powershell -ExecutionPolicy Bypass -File run-neo4j.ps1`) 를 직접 실행. 이 스크립트가 Docker 미설치 시 자동 설치, 데몬 꺼짐 시 자동 기동, Neo4j 컨테이너 기동·헬스대기까지 모두 처리합니다. "Neo4j 준비 완료" 로그가 나올 때까지 기다리세요.
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

## ✅ 셋업 검증 프롬프트 (제대로 깔렸는지 확인)

셋업이 끝난 뒤 **"내가 제대로 설치한 게 맞나?"** 가 불안하면, 코딩에이전트에 아래
프롬프트를 붙여넣으세요. 항목별로 점검하고, 문제가 있으면 에이전트가 원인을
설명한 뒤 **직접 수리**까지 시도합니다(사람만 할 수 있는 일만 요청).

```text
당신은 셋업 검증 엔지니어입니다. aiceo-4th-agent 가 제대로 설치·동작하는지
아래 항목을 하나씩 점검하고, 각 항목에 ✅(정상)/⚠️(주의)/❌(실패) 를 표시하세요.
❌ 또는 ⚠️ 가 나오면 "안내"가 아니라 당신이 직접 원인을 진단하고 수리 명령을
실행해 고친 뒤 다시 점검하세요. 정말 사람만 할 수 있는 일(OpenAI 키 입력,
브라우저 "그래프 구축" 클릭, GUI 권한 승인)만 나에게 요청하세요. 마지막에
한국어로 "검증 결과 요약"을 표로 보여주세요.

[1. 도구 버전]
- node --version 이 v20 이상인가
- pnpm --version 이 10 이상인가
- docker info 가 성공하는가(데몬 실행 중). 실패면 Docker Desktop을 띄우고 재확인.

[2. 리포·의존성]
- 현재 폴더가 aiceo-4th-agent git 리포인가(git rev-parse 로 확인)
- node_modules 가 있고 pnpm install 이 완료 상태인가. 아니면 pnpm install 재실행.

[3. 환경변수(.env.local)]
- .env.local 파일이 존재하는가
- grep '^OPENAI_API_KEY=sk-' .env.local 로 OpenAI 키가 실제 값으로 채워졌는가
  (placeholder 인 sk-proj-XXXX 면 ❌ — 본인 키 입력을 나에게 요청)
- LLM_MODEL 줄이 .env.example 과 일치하는가(임의로 바꾸지 않았는가)

[4. 인프라 컨테이너]
- docker ps 에 OpenSearch 컨테이너가 떠 있는가. 없으면 ./run-opensearch.sh 실행.
- docker ps 에 Neo4j 컨테이너가 떠 있는가. 없으면 ./run-neo4j.sh 실행
  (Windows 는 powershell -ExecutionPolicy Bypass -File run-neo4j.ps1).

[5. 서버]
- http://localhost:3000 이 200 으로 응답하는가(curl -s -o /dev/null -w '%{http_code}'
  http://localhost:3000). 안 뜨면 ./run-dev.sh 가 실행 중인지 확인하고, 아니면 띄우기.

[6. 핵심 기능 — 사람 1회 협조]
- 챗: 브라우저 챗에 "안녕"을 보내 LLM 응답이 스트리밍되는지 나에게 확인 요청
  (응답이 없으면 [3]의 OpenAI 키와 [5]의 서버 로그를 다시 점검).
- graph-lab: 좌측 "온톨로지(graph-lab)" → "그래프 구축" 이 "✓ 완료" 인지,
  아직이면 클릭을 나에게 요청. 완료 후 RAG/Text-to-SQL/GraphRAG 3방식 비교가
  결과를 내는지 확인.

[판정]
- 1~6 이 모두 ✅ 면 "검증 완료 — 실습을 시작해도 됩니다" 라고 한국어로 마무리.
- ❌ 가 남아 있으면 무엇이 왜 막혔는지, 다음에 무엇을 하면 되는지 한국어로 설명.
```

> 자주 나오는 결과: OpenAI 키 미입력(❌ [3]) → 키 입력 후 `run-dev.sh` 재시작 /
> graph-lab 미구축(⚠️ [6]) → "그래프 구축" 버튼 클릭(첫 구축 1~3분 정상).

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
| Windows graph-lab 실패 | Docker Desktop 실행 확인 후 "그래프 구축" 재클릭 — `run-neo4j.ps1` 이 Neo4j 자동 기동을 처리. 그래도 안 되면 강사 문의 |

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

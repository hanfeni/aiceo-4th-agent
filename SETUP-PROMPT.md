# 교육생 배포용 바이브코딩 셋업 프롬프트

> 아래 코드블록 **전체를 복사**해서 Claude Code(또는 Cursor)에 그대로 붙여넣으세요.
> clone → 설치 → API 키 입력 → 인프라 자동 준비 → 서버 기동 → 그래프 구축까지
> AI가 끝까지 진행합니다. **사전 준비물은 본인 OpenAI API 키 1개뿐** —
> Git·Node·pnpm·Docker·Neo4j·OpenSearch는 AI가 점검 후 없으면 직접 설치/최신화합니다.

---

```text
당신은 셋업 자동화 엔지니어입니다. 사용자에게 "직접 설치하세요"라고 떠넘기지 말고, 점검 후 누락·구버전이면 당신이 직접 명령을 실행해 설치·최신화하세요. 각 단계 결과를 확인하며 끝까지 자동 진행하고, 정말 사람만 할 수 있는 일(GUI 권한 승인, API 키 발급)만 사용자에게 요청하세요. 막히면 그 단계에서 멈추고 무엇이 문제인지 한국어로 설명한 뒤 해결을 도와주세요.

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
이미 이 폴더가 git 리포면 건너뜁니다. 아니면 클론을 진행하세요. 클론 전에 **어느 폴더에 받을지 사용자에게 먼저 확인하세요** (예: `~/Documents`, `~/Desktop`, 홈 디렉토리 등). 위치를 지정하지 않았으면 반드시 물어보고 진행합니다. 확인 후 지정 폴더로 이동해 `git clone https://github.com/hanfeni/aiceo-4th-agent.git` 실행 후 `cd aiceo-4th-agent`. 이후 모든 명령은 이 폴더 안에서 실행합니다.

[2-B단계 · 교육 하네스 설정 (.claude/ 초기화)]
클론 완료 후 당신이 직접 아래 두 파일을 생성하세요. 이 파일들은 수강생이 앱 사용법을 물을 때 당신이 참조하는 지식베이스입니다.

mkdir -p .claude/docs

파일 1: .claude/CLAUDE.md 에 아래 내용을 append (기존 내용 보존, 맨 아래에 추가):
---
## 수강생 질문 응답 (교육 하네스)

수강생이 앱 사용법·실습 방법·메뉴 기능을 물으면 반드시
.claude/docs/lecture-guide.md 를 먼저 읽고 그 내용을 기반으로 답한다.
- "이 메뉴가 뭐예요?", "어떻게 써요?", "실습 순서가 어떻게 돼요?" → lecture-guide.md 참조
- 설명 수준: 수강생은 CEO 직급이며 코딩 경험이 없거나 적다. 기술 용어는 비유와 함께 설명하고 명령어는 "복붙하면 됩니다" 형태로 제시한다.
- 실습 막힘 대응: 에러를 보여주면 원인을 한국어로 설명하고 수리 명령을 직접 실행한다. "알아서 해보세요" 금지.
- 모든 수강생 소통은 한국어로 한다. 에러 메시지·코드는 그대로 유지.
---

파일 2: .claude/docs/lecture-guide.md (신규 생성):
---
# aiceo-4th-agent 앱 가이드 — AICEO 4기 2회차 실습

이 문서는 수강생이 코딩에이전트에게 앱 사용법을 물을 때 에이전트가 참조하는 단일 지식베이스다.

## 강의 개요

서울대 빅데이터 AI CEO 4기 — 하네스 & 에이전트 실습 시리즈 2회차 (5/22).
핵심 메시지: 에이전트 스펙트럼은 고정형↔자율형 연속선. CEO도 에이전트 한 개 정도는 직접 만들 수 있어야 한다. 고정형(예측가능·저렴·디버깅 쉬움) ↔ 자율형(유연·비싸·관측 어려움), 둘의 혼합이 실전 답.

## 앱 메뉴 구성 & 사용법

### 챗 에이전트 (/chat)
LangGraph DeepAgents 기반 멀티턴 LLM 챗. 사고(reasoning) 패널 포함.
- 우측 상단 드롭다운으로 검색 도메인·SQL 도메인 선택 가능
- 미선택 = 순수 챗 / 선택 = 자율형 에이전트(LLM이 검색·SQL 도구 스스로 호출)
- 실습 질문 예시: "강남구 주변 카페 많은 동네 알려줘"(상권 도메인), "뱅가드 보유 상위 종목 10개"(graph-lab 구축 후)

### 하네스 구성 (/harness)
에이전트 요소(planning / filesystem / subagents / checkpointer / tools) 토글 UI.
켜고 끄면서 에이전트 행동 변화 관찰. planning ON → 에이전트가 먼저 계획 수립 후 실행.

### 도메인 색인 (/index-lab)
OpenSearch에 문서를 색인하는 메뉴. 검색 실습의 전제 단계.
순서: 도메인 선택 → 청크 크기·겹침 설정 → 색인 시작 → 검색 실습으로 이동.

### 검색 실습 (/search-lab)
색인된 문서를 3방식으로 검색·비교.
- 렉시컬(BM25): 키워드 정확 매칭 — 법조문, 고유명사에 유리
- 벡터(의미검색): 동의어·문맥 이해 — "친환경 정책" = "녹색 성장"
- 하이브리드: BM25+벡터+rerank — 실전 기본값
RAG 모드 전환 시 검색 결과를 LLM이 해석해 답변 생성.

### 온톨로지 실습 (/graph-lab)
같은 데이터(SEC EDGAR 13F)를 RAG / Text-to-SQL / GraphRAG 3방식 동시 비교.
GraphRAG는 "MS와 NVIDIA를 동시 보유한 기관" 같은 멀티홉 관계 질문에서 압도적 우월.

### DART 기업분석 (/dart)
금융감독원 DART API 연동. DART_API_KEY 필요(없으면 이 메뉴만 비활성).

## 권장 실습 순서
챗 에이전트 → 도메인 색인 → 검색 실습 → 온톨로지 실습 → 하네스 구성

## 도메인별 직군 매핑
상권: 유통·금융·제조 / 정책브리핑: 전직군·법률·공공 / 의료(약가): 의료·제약 / 금융(국민연금): 금융·투자 / 법률(법령·판례): 법률·회계

## 자주 묻는 질문
Q. 색인이 안 되어 있으면 검색이 안 되나요? → 네. /index-lab에서 먼저 색인하세요.
Q. graph-lab이 느린데 정상인가요? → 첫 구축 시 1~3분 정상입니다.
Q. DART 메뉴가 회색인데? → .env.local에 DART_API_KEY 미입력. opendart.fss.or.kr 무료 발급.
Q. 모르는 것이 있으면? → 코딩에이전트에게 "graph-lab 어떻게 써요?", "검색 3방식 차이가 뭐예요?" 등 자유롭게 질문하세요.
---

[3단계 · 의존성 설치]
`pnpm install` 실행. better-sqlite3 등 네이티브 빌드가 포함되어 수 분 걸릴 수 있습니다. 실패 시 로그를 읽고 원인을 직접 해결한 뒤 재시도하세요.

[4단계 · API 키 설정 (.env.local 생성) — 사람만 할 수 있는 일]
1. `.env.example` 을 `.env.local` 로 복사: `cp .env.example .env.local`
2. `.env.local` 의 두 키 플레이스홀더를 사용자 본인의 실제 키로 교체하라고 요청하세요 (키 발급·입력은 사람만 가능):
   - `OPENAI_API_KEY=` → 본인 OpenAI 키 (형식 예 `sk-proj-실제키값`). 챗·전체 동작 필수.
   - `DART_API_KEY=` → DART 분석 실습용. <https://opendart.fss.or.kr> 에서 이메일 인증으로 무료 발급(수 분). DART 메뉴를 안 쓰면 비워둬도 다른 메뉴는 정상이나, 실습 범위에 DART가 있으면 발급을 요청하세요.
   - 나머지 줄(LLM_PROVIDER=openai, LLM_MODEL=gpt-5.4-mini, HARNESS_* 등)은 그대로 둡니다.
3. `.env.local` 은 .gitignore 에 등록돼 커밋되지 않으니 안심하라고 알려주세요.
4. 키 입력 후 **2단계 더블체크**를 반드시 수행하세요 (오타 1글자로 인증 실패 방지):
   - 형식 확인: `grep '^OPENAI_API_KEY=sk-' .env.local` → 출력이 없으면 키가 비었거나 `sk-` 로 시작하지 않음 → 재입력 요청.
   - 길이 확인: `grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2 | tr -d '\n' | wc -c` → OpenAI 키는 보통 **51자 이상**. 50자 미만이면 잘린 키일 가능성 높음 → 사용자에게 원본 키 전체를 다시 붙여넣으라고 요청.
   - 두 검사 모두 통과한 뒤에만 다음 단계로 진행합니다.
   - DART 키는 `grep '^DART_API_KEY=' .env.local` 로 placeholder(XXXX)가 아닌 실제 값인지 확인하되, DART 실습 예정이 아니면 경고만 남기고 진행합니다.

[5단계 · 인프라 사전 준비 (당신이 직접 컨테이너까지 띄움)]
인프라를 미리 기동하세요. 1단계에서 Docker 데몬이 이미 떠 있어야 합니다.
- OpenSearch : `./run-opensearch.sh` (Windows 는 `powershell -ExecutionPolicy Bypass -File run-opensearch.ps1`) 를 직접 실행. 이 스크립트가 Docker 보장→컨테이너→Nori 까지 처리합니다. 실패해도 검색 메뉴만 영향이니 로그를 남기고 다음으로 진행.
- Neo4j : `./run-neo4j.sh` (Windows 는 `powershell -ExecutionPolicy Bypass -File run-neo4j.ps1`) 를 직접 실행. 이 스크립트가 Docker 미설치 시 자동 설치, 데몬 꺼짐 시 자동 기동, Neo4j 컨테이너 기동·헬스대기까지 모두 처리합니다. "Neo4j 준비 완료" 로그가 나올 때까지 기다리세요.
스크립트가 GUI 권한/수동 Docker 실행을 요구하면 그 부분만 사용자에게 요청하고, 해결되면 같은 스크립트를 다시 실행하세요.

[6단계 · 서버 기동]
`./run-dev.sh` (Windows `powershell -ExecutionPolicy Bypass -File run-dev.ps1`) 실행. 포트 정리·캐시 제거·의존성 점검·OpenSearch 보장·브라우저 자동 오픈이 내장돼 있습니다(5단계에서 OpenSearch 가 이미 떠 있으면 즉시 통과). 잠시 후 http://localhost:3000 이 자동으로 열립니다. 이 명령은 서버가 떠 있는 동안 계속 실행 상태로 둡니다(종료 금지).

[7단계 · 그래프 구축 — 당신이 직접 API 호출]
인프라는 5단계에서 이미 준비됐습니다. 서버가 뜬 뒤 당신이 직접 아래 명령으로 그래프 구축 API 를 호출하세요:
`curl -s -N -X POST http://localhost:3000/api/graph-lab/build`
SSE 스트림이 흘러나오며 Neo4j 기동 → SEC EDGAR 데이터 적재 과정을 로그로 보여줍니다. `load_done` 이 나오면 완료입니다. 실패 시(`load_error`) Docker Desktop 실행 여부를 확인하고 curl 을 재실행하세요.

[8단계 · 챗 API 동작 확인 — OpenAI 키 최종 검증]
그래프 구축이 완료된 뒤 아래 curl 로 챗 API 를 직접 호출해 스트리밍 응답이 오는지 확인하세요:
`curl -s -N -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"query":"안녕"}'`
`data:` 로 시작하는 SSE 이벤트가 흘러나오면 OpenAI 키와 LLM 연결이 정상입니다. 아무 응답이 없거나 `{"error":...}` 가 오면 `.env.local` 의 `OPENAI_API_KEY` 를 4단계 더블체크로 재확인하세요.

[9단계 · 온보딩 안내 출력]
모든 검증이 완료되면 아래 내용을 한국어로 출력하세요:

---
✅ 셋업 완료 — 실습을 시작할 수 있습니다!

앱 주소: http://localhost:3000

메뉴 안내:
- 챗 에이전트: LLM과 멀티턴 대화. 우측 상단 드롭다운으로 검색/SQL 도구를 연결하면 자율형 에이전트로 전환됩니다.
- 도메인 색인: 검색 실습 전 먼저 이 메뉴에서 자기 직군에 맞는 도메인을 색인하세요.
- 검색 실습: BM25 / 벡터 / 하이브리드 3방식을 같은 질문으로 비교하세요.
- 온톨로지 실습: 같은 질문을 RAG / Text-to-SQL / GraphRAG 3패널로 동시 비교합니다.
- 하네스 구성: 에이전트 요소를 켜고 끄면서 동작 차이를 관찰하세요.

권장 실습 순서: 챗 → 도메인 색인 → 검색 실습 → 온톨로지 실습 → 하네스 구성

📌 앱 사용 중 궁금한 것이 생기면 — 이 설치 창 말고 **Claude Code 새 탭(Ctrl+T / Cmd+T)** 을 열어서 바로 물어보세요.
설치 때 에이전트 설정이 완료돼 있어서 앱 사용법을 바로 안내해 드릴 수 있습니다.

질문 예시:
- "챗 에이전트에서 도메인을 선택하면 뭐가 달라져요?"
- "검색 실습에서 BM25, 벡터, 하이브리드 차이가 뭐예요?"
- "도메인 색인을 먼저 해야 하나요?"
- "graph-lab이 느린데 정상인가요?"
- "하네스 구성에서 planning을 켜면 어떻게 달라져요?"
- "DART 메뉴가 회색인데 왜 그런가요?"
- "실습 순서를 추천해 주세요. 저는 금융업 종사자입니다."
- 에러가 나면 스크린샷이나 에러 메시지를 그대로 붙여넣기만 하면 됩니다.
---

[완료 기준]
- http://localhost:3000 접속 시 챗 UI가 뜬다
- curl 챗 API 호출 시 SSE 이벤트가 스트리밍된다 (OpenAI 키 정상)
- graph-lab 구축 완료 후 3방식 비교가 동작한다
각 단계 완료 시 ✓ 표시하고, 9단계 온보딩 메시지를 출력한 뒤 마무리하세요.
```

---

## 강사용 메모 (교육생에게 공유하지 않음)

| 항목 | 내용 |
|---|---|
| **clone URL** | `https://github.com/hanfeni/aiceo-4th-agent.git` (public) |
| **AI가 직접 처리** | git/node/pnpm/docker 점검·설치·최신화, OpenSearch·Neo4j 컨테이너 사전 기동 |
| **사람만 가능(AI 요청)** | OpenAI 키 발급·입력, GUI 권한 승인 |
| **인프라 자동화 실체** | `run-neo4j.sh`의 `ensure_docker()`가 Docker 미설치 brew 자동설치·데몬 자동기동을 이미 구현 — 프롬프트는 스크립트를 트리거만 |
| **HARD 전제** | OpenAI 키 미입력 시 `run-dev.sh` 6단계에서 즉시 중단 (의도된 가드) |
| **데이터** | 리포에 번들 안 함. GitHub raw(`hanfeni/aiceo-4th-training`)에서 fetch — 인터넷만 되면 자기완결 |
| **Windows 지원** | `run-neo4j.ps1` 추가로 Windows graph-lab 지원(2026-05-20 실측). 실패 시 Docker Desktop 실행 확인 후 curl 재실행 |
| **7단계 완전 자동화** | `POST /api/graph-lab/build` 는 인증 없는 순수 HTTP 엔드포인트 → curl 한 번으로 브라우저 클릭과 동일 효과. 사람 개입 0 |

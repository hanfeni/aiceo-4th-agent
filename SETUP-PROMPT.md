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
  · **첫 설치 직후 첫 기동(중요)**: Docker Desktop 은 처음 실행할 때 GUI 에서 사람이 직접 통과해야 하는 관문이 있어, 이걸 끝내기 전엔 `docker info` 가 계속 실패한다(데몬이 안 뜸). `open -a Docker` 후 폴링이 60초 넘게 실패하고 `docker info` 에러가 "데몬 미응답/소켓 없음" 류이면, 자동 진행을 멈추고 사용자에게 아래를 순서대로 처리하라고 한국어로 또박또박 안내하라(이건 사람만 할 수 있는 일):
      1. 서비스 약관(Service Agreement) 화면 → `Accept` 클릭
      2. 추천/기본 설정 화면 → `Finish` 또는 `Continue`
      3. macOS 시스템 권한 요청 다이얼로그 → 비밀번호 입력 후 `OK`
      4. 로그인(Sign in) 유도 화면 → 계정 없이 `Skip` / `Continue without signing in` 가능
    안내 후 사용자가 "끝났다"고 하거나 메뉴바 고래 아이콘이 `running` 이 되면, `docker info` 를 다시 확인하고 정상이면 자동 진행을 이어가라. (이미 동의를 마친 환경이면 이 관문은 안 뜨고 곧장 데몬이 뜬다 — 그땐 그냥 통과.)
  · 그 외 GUI 권한 승인 창이 뜨면 그것만 사용자에게 "승인 버튼을 눌러주세요"라고 요청.
homebrew 가 macOS 에 없고 설치가 필요하면 먼저 brew 부터 설치(공식 스크립트)한 뒤 진행하세요.

[2단계 · 리포 클론]
이미 이 폴더가 git 리포면 건너뜁니다. 아니면 클론을 진행하세요. 클론 전에 **어느 폴더에 받을지 사용자에게 먼저 확인하세요** (예: `~/Documents`, `~/Desktop`, 홈 디렉토리 등). 위치를 지정하지 않았으면 반드시 물어보고 진행합니다. 확인 후 지정 폴더로 이동해 `git clone https://github.com/hanfeni/aiceo-4th-agent.git` 실행 후 `cd aiceo-4th-agent`. 이후 모든 명령은 이 폴더 안에서 실행합니다.

[2-B단계 · 교육 하네스 설정 (.claude/ 초기화)]
클론 완료 후 당신이 직접 아래 두 파일을 생성하세요. 이 파일들은 수강생이 앱 사용법을 물을 때 당신이 참조하는 지식베이스입니다.

mkdir -p .claude/docs

파일 1: .claude/CLAUDE.md 에 아래 내용을 append (기존 내용 보존, 맨 아래에 추가):
---
## 수강생 질문 응답 (교육 하네스)

수강생이 앱 사용법·실습 방법·메뉴 기능을 물으면:
1. 먼저 .claude/docs/lecture-guide.md 를 읽어 큰 맥락(메뉴 구성·실습 순서·강의 의도)을 잡는다.
2. **단순 설명을 넘는 질문(왜 이렇게 동작하나, 옵션값이 정확히 뭔가, 에러 원인은 무엇인가)은 lecture-guide 만 믿지 말고 실제 코드를 함께 분석해 답한다.** lecture-guide 는 요약본이라 세부가 코드와 다를 수 있다. 항상 코드가 정답이다.
   - 메뉴/라우트 = src/app/(main)/<menu>/page.tsx + src/components/<menu>/*View.tsx
   - 네비게이션 항목·라벨·순서 = src/app/(main)/AgentNav.tsx
   - API 동작 = src/app/api/<route>/route.ts
   - 도메인·데이터 소스 = searchlab/domains.ts, sqllab/domains.ts, graphlab/config.ts
   - 옵션값(청크 크기·문서 수·검색방식 등)은 해당 View.tsx 의 상수 배열에서 실제 값을 읽어 답한다(추정 금지).
3. 코드와 lecture-guide 가 충돌하면 코드를 신뢰하고, 그 사실을 수강생에게 한 줄로 알려준다.
- 설명 수준: 수강생은 CEO 직급이며 코딩 경험이 없거나 적다. 기술 용어는 비유와 함께 설명하고 명령어는 "복붙하면 됩니다" 형태로 제시한다.
- 실습 막힘 대응: 에러를 보여주면 원인을 한국어로 설명하고 수리 명령을 직접 실행한다. "알아서 해보세요" 금지.
- 모든 수강생 소통은 한국어로 한다. 에러 메시지·코드는 그대로 유지.
---

파일 2: .claude/docs/lecture-guide.md (신규 생성):
> 아래는 코드 분석 기준 요약이다. 세부가 의심되면 위 지침대로 코드를 직접 확인할 것.
---
# aiceo-4th-agent 앱 가이드 — AICEO 4기 2회차 실습

이 문서는 수강생이 코딩에이전트에게 앱 사용법을 물을 때 에이전트가 참조하는 지식베이스다.
세부 동작·옵션값은 실제 코드(AgentNav.tsx, 각 View.tsx, api/route.ts)가 최종 근거다.

## 강의 개요

서울대 빅데이터 AI CEO 4기 — 하네스 & 에이전트 실습 시리즈 2회차 (5/22).
핵심 메시지: 에이전트 스펙트럼은 고정형↔자율형 연속선. CEO도 에이전트 한 개 정도는 직접 만들 수 있어야 한다. 고정형(예측가능·저렴·디버깅 쉬움) ↔ 자율형(유연·비싸·관측 어려움), 둘의 혼합이 실전 답.

## 앱 메뉴 구성 (사이드바, 2그룹 8메뉴)

네비게이션 정의: src/app/(main)/AgentNav.tsx. 루트 "/" 는 /chat 으로 redirect.

**그룹 A — AI 에이전트**: 챗 에이전트(/chat) · 하네스 구성(/harness) · DART 기업분석(/dart)
**그룹 B — 검색·라벨링 실습**: 도메인 색인(/index-lab) · 데이터 적재(/data-load) · 메타 라벨링 실습(/meta-lab) · 검색 실습(/search-lab) · 온톨로지 실습(/graph-lab) · 저장소 탐색기(/store-explorer)

### 챗 에이전트 (/chat)
deepagents 그래프 기반 SSE 스트리밍 멀티턴 챗. 우측 상단 드롭다운 3개:
- 모델(gpt-5.5 / gpt-5.4 / gpt-5.4-mini, 기본 gpt-5.4-mini) / 인덱스검색(안함+5도메인, 색인 안 된 건 비활성) / 데이터조회 SQL(안함+5도메인, 미적재 선택 시 자동 적재)
- 도구 미선택=순수 챗(고정형) / 선택=자율형 에이전트(LLM이 도구를 스스로 호출)
- ⚠️ 인덱스검색·SQL 도메인 변경 시 세션 리프레시(진행 중 대화 초기화)

### 하네스 구성 (/harness)
현재 챗에 적용된 하네스 요소(Skill/Subagent/도구/시스템 인스트럭션/토글)를 읽기 전용 표시. 토글은 env(HARNESS_*)로 제어, 이 화면은 현황 확인용.

### DART 기업분석 (/dart)
DART 공시 기반 8관점 분석(고정 파이프라인). 기업명+관점 선택→SSE 리포트.
⚠️ 메뉴는 항상 활성. DART_API_KEY 미설정이면 분석 실행 시점에 에러(진입은 됨). opendart.fss.or.kr 무료 발급.

### 도메인 색인 (/index-lab)
도메인 문서를 OpenSearch에 색인. 검색 실습·챗 인덱스검색의 전제.
옵션: 도메인5택1 / Nori분해(mixed·discrete·none) / 임베딩(3-small·3-large) / 문서수(100·300·500·1000, 기본300) / 청크크기(0=안함(기본)·200·500·1000·2000·5000) / overlap(100·200·500·1000).

### 데이터 적재 (/data-load)
도메인 CSV→SQLite 테이블 적재. Text-to-SQL 실습 전제. 옵션은 행수 상한(1000·5000·10000·20000).

### 메타 라벨링 실습 (/meta-lab)
LLM이 분류 메타 생성 + 시스템 인스트럭션 노출. 작업4종(메타 라벨링/스키마 발굴/올인원/올인원 색인). 문서수 1·3·5·10(기본3).

### 검색 실습 (/search-lab)
색인 인덱스를 검색·RAG·Text-to-SQL로 비교.
- 렉시컬(BM25·Nori): 키워드 매칭(BM25 프리셋 균형·타이틀중심·본문중심)
- 벡터(임베딩): 의미 유사도
- 하이브리드: 렉시컬+벡터(결합방식 default/rrf)
- 작업4종: 검색/RAG/Text-to-SQL/Text-to-SQL with Chart. 결과수 5·10·20·50(RAG는 10건 제한).

### 온톨로지 실습 (/graph-lab)
SEC EDGAR 13F-HR(2025Q3, 기관 약 64개)를 Neo4j 적재 후 RAG/Text-to-SQL/GraphRAG 3패널 동시 비교. 사용 전 그래프 구축 필수(셋업 중 curl 자동 완료).
GraphRAG는 "MS와 NVIDIA를 동시 보유한 기관" 같은 멀티홉 질문에서 압도적 우월.
⚠️ Neo4j는 Docker 자동 보장. Docker Desktop 미실행 시 "Neo4j 준비 실패".

### 저장소 탐색기 (/store-explorer)
앱이 보유한 모든 내부 저장소(OpenSearch 색인 searchlab-* + SQLite 테이블 sqllab_*)를 한 화면에서 3단계 드릴다운(목록→문서/행→상세). 인덱스/테이블 클릭→문서·행 열람, 항목별 삭제/초기화(확인 모달). 백엔드는 기존 색인/적재 API 재사용(신규 저장소 0). OpenSearch 미기동이면 색인 섹션만 안내·SQLite 섹션은 정상.

## 5개 도메인 & 직군
상권(sangkwon): 유통·소상공인 / 의료·제약(medical): 의료·제약 / 금융·연금(finance): 금융·투자 / 법률·법령(legal): 법률·규제 / 정책·거버넌스(policy): 공공·정책
데이터: GitHub raw(hanfeni/aiceo-4th-training/main/poc/data/<domain>). 검색=jsonl, SQL=csv, graph-lab=sec-edgar.

## 권장 실습 순서
챗 에이전트 → 도메인 색인 → 검색 실습 → (데이터 적재 →) 온톨로지 실습 → 하네스 구성

## 자주 묻는 질문
Q. 색인 안 하면 검색 안 되나요? → 네. /index-lab 먼저 색인(챗 인덱스검색도 동일).
Q. graph-lab이 느린데? → 첫 구축 시 1~3분 정상.
Q. DART가 에러나요. → DART_API_KEY 미입력이면 실행 시 에러. opendart.fss.or.kr 무료 발급.
Q. 챗에서 도메인 선택하면? → 도구 미선택=고정형 ↔ 선택=자율형 차이 체감.
Q. 더 정확한 답을 원하면? → 에이전트가 코드를 직접 분석해 답해드립니다. "이 옵션 값이 정확히 뭐예요?"처럼 물어보세요.
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
스크립트가 GUI 권한/수동 Docker 실행을 요구하면 그 부분만 사용자에게 요청하고, 해결되면 같은 스크립트를 다시 실행하세요. 특히 **Docker 를 이번에 처음 설치한 경우** 이 스크립트의 데몬 대기(최대 180초)가 첫 기동 동의 관문 때문에 타임아웃될 수 있습니다 — 그러면 1단계의 동의 4관문(약관 Accept → 기본설정 → 시스템 권한 → 로그인 Skip)을 사용자가 끝내도록 안내한 뒤, 고래 아이콘이 `running` 이 되면 같은 스크립트를 다시 실행하세요.

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
| **사람만 가능(AI 요청)** | OpenAI 키 발급·입력, GUI 권한 승인, **Docker Desktop 첫 설치 시 동의 관문**(약관 Accept → 기본설정 → macOS 권한 → 로그인 Skip). AI 는 `docker info` 폴링 실패가 길어지면 멈추고 이 4관문을 안내 |
| **인프라 자동화 실체** | `run-neo4j.sh`의 `ensure_docker()`가 Docker 미설치 brew 자동설치·데몬 자동기동을 이미 구현 — 프롬프트는 스크립트를 트리거만 |
| **HARD 전제** | OpenAI 키 미입력 시 `run-dev.sh` 6단계에서 즉시 중단 (의도된 가드) |
| **데이터** | 리포에 번들 안 함. GitHub raw(`hanfeni/aiceo-4th-training`)에서 fetch — 인터넷만 되면 자기완결 |
| **Windows 지원** | `run-neo4j.ps1` 추가로 Windows graph-lab 지원(2026-05-20 실측). 실패 시 Docker Desktop 실행 확인 후 curl 재실행 |
| **7단계 완전 자동화** | `POST /api/graph-lab/build` 는 인증 없는 순수 HTTP 엔드포인트 → curl 한 번으로 브라우저 클릭과 동일 효과. 사람 개입 0 |

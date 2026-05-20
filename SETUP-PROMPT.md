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

[완료 기준]
- http://localhost:3000 접속 시 챗 UI가 뜬다
- 챗에 메시지를 보내면 LLM 응답이 스트리밍된다 (API 키 정상)
- graph-lab "그래프 구축" 완료 후 3방식 비교가 동작한다
각 단계 완료 시 ✓ 표시하고, 모두 끝나면 "셋업 완료 — 실습을 시작하세요"라고 한국어로 마무리하세요.
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

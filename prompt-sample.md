OpenCode SDK + GPT-5.4 mini 기반 SSE 스트리밍 채팅 웹앱을 Next.js 16 으로 개발한다.
크리티컬한 이슈가 아니라면 사용자에게 묻지 말고 다음 단계를 자동으로 진행.
docs/notes/ 에 각 단계 결과를 기록한다.
가능한 비동기 병렬 작업을 진행해 완료를 빠르게 수행한다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[전제: 이 가이드는 처음 설치부터 시작하는 사용자 기준]

이 프로젝트는 실제 OpenAI API 만 호출한다. 모킹 경로 없음.

[검증 철학]

* "한 번 성공" 은 보장이 아니다. 모든 stateful 경로는 반드시 "연속 2회 이상",

  "여러 유형의 입력" 으로 검증한다.

* 모델 출력은 입력에 따라 "생성되는 이벤트 종류 자체가 달라질 수 있다".

  probe 시나리오는 짧은 인사뿐 아니라 최소 1개의 "추론이 필요한 입력"을 포함해야 한다.

* 사고 과정은 출력에서 제외되는지 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[환경 사전 점검 — 코드 작성 전 반드시 완료]
결과를 docs/notes/env-precheck.md 에 기록.


1. OPENAI_API_KEY 존재 확인 (HARD PRECONDITION):

* .env 또는 .env.local 에 OPENAI_API_KEY=sk-... 필수
* 없으면 즉시 멈추고 사용자에게 요청

1. OpenCode CLI 설치 확인:

     opencode --version 2>/dev/null || echo "NOT_INSTALLED"

* 1.4.0 이상이면 그대로 진행
* 1.4.0 미만이거나 미설치면 공식 설치 스크립트 사용:

       curl -fsSL https://opencode.ai/install | bash
     Homebrew 설치도 가능하지만 사용자 환경에 따라 다르므로 가정하지 말 것.


1. 모델 호출 가능 여부는 "실증"으로만 판단 — 학습 지식 의존 금지:

   이 프로젝트의 모델명은 "openai/gpt-5.4-mini" 로 고정이다.
   모델의 "존재 여부" 를 LLM 의 학습 컷오프 기준으로 판단해서 blocking 하지 마라.
   반드시 아래 검증 스크립트로 실증한다:

     # (a) OpenAI API 에 모델 등록 여부
     curl -sS https://api.openai.com/v1/models \
       -H "Authorization: Bearer $OPENAI_API_KEY" | \
       python3 -c "import json,sys; d=json.load(sys.stdin); ids=[m['id'] for m in d.get('data',[])]; print('found' if 'gpt-5.4-mini' in ids else 'missing')"

     # (b) 실제 호출 1토큰 테스트 (1~2원 과금)
     curl -sS https://api.openai.com/v1/chat/completions \
       -H "Authorization: Bearer $OPENAI_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{"model":"gpt-5.4-mini","messages":[{"role":"user","content":"hi"}],"max_completion_tokens":5}' \
       | python3 -m json.tool | head -20


* (a) 와 (b) 모두 성공하면 진행
* (a) 에서 missing 이거나 (b) 에서 에러면 사용자에게 보고:

       "[모델 검증 실패] OpenAI API 응답: <에러 본문 그대로>. 계속하려면 모델 ID 확인 필요."
     임의 대체 금지. 사용자 결정 대기.

* GPT-5 계열은 max_tokens 가 아닌 max_completion_tokens 를 사용한다는 점에 유의.

1. 포트 점유 상태:

     lsof -nP -iTCP:3000,4096 -sTCP:LISTEN

* 3000: Next.js dev 기본 포트
* 4096: OpenCode 서버 (createOpencode 가 자동 스폰)
* 점유 중이면 PID 확인 후 kill -9. pkill 패턴 매칭 금지 (실패 가능)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[고정 스택 — 정확히 이 버전·라이브러리]

패키지 매니저: pnpm 10+
런타임:       Next.js 16.2.2 (App Router) + React 19.2.4 + TypeScript strict
AI SDK:       @opencode-ai/sdk ^1.4.0, @opencode-ai/plugin ^1.4.0
모델:         openai/gpt-5.4-mini
상태관리:     zustand ^5
스타일:       tailwindcss ^4 + @tailwindcss/postcss ^4
마크다운:     react-markdown ^10 + remark-gfm ^4 + rehype-raw ^7 + rehype-sanitize ^6
              (rehype-raw 뒤에 rehype-sanitize 체인 — LLM 출력 XSS 방어)
아이콘:       lucide-react
유틸:         clsx, zod ^4
단위 테스트:  vitest ^4 + @testing-library/react ^16 + jsdom + @vitest/coverage-v8
E2E:          @playwright/test ^1.59
린트:         eslint ^9 + eslint-config-next 16.2.2

[설치 금지]

* openai (OpenCode SDK 가 내부 처리)
* next-auth (인증 없음)
* framer-motion, antd, uuid (미사용)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[★ 이 프로젝트 고유의 함정 — 반드시 지킬 것 ★]

◆ 함정 1: 이벤트 구독 순서
   session.prompt() 를 먼저 호출하면 이벤트를 놓친다. 반드시:
     const { stream } = await client.event.subscribe();   // ① 구독 먼저
     client.session.prompt({ ... }).catch(console.error);  // ② 비동기 프롬프트
     for await (const event of stream) { ... }             // ③ 이벤트 처리

◆ 함정 2: event.subscribe() 반환값은 AsyncIterable 이 아니다
   잘못: for await (const e of await client.event.subscribe()) { ... }
   옳음: const { stream } = await client.event.subscribe();
         for await (const e of stream) { ... }

◆ 함정 3: 실제 스트리밍 이벤트 타입은 "message.part.delta"
   "message.part.updated" 만 처리하면 텍스트를 못 받는다.
     message.part.delta   → props.field='text', props.delta='청크' (텍스트 스트리밍의 핵심)
     session.idle         → 스트리밍 완료 (루프 종료)
     session.error        → 에러
   구현 전 반드시 실제 이벤트를 full JSON 으로 찍어서 확인할 것.

◆ 함정 4: 세션 ID 필터링 누락
   event.subscribe() 는 글로벌 스트림. 다른 세션 이벤트도 섞여 온다.
     const evtSessionId = props?.sessionID;
     if (evtSessionId && evtSessionId !== sessionId) continue;

◆ 함정 5: OpenCode 서버 싱글톤
   createOpencode() 를 매 요청마다 호출하면 포트 4096 충돌.
   모듈 레벨 싱글톤으로 1회만 생성:
     let opencodeClient: OpencodeClient | null = null;
     async function getClient() {
       if (opencodeClient) return opencodeClient;
       const { client } = await createOpencode({ config: { model: MODEL_ID } });
       opencodeClient = client;
       return client;
     }

◆ 함정 6: 멀티턴은 conversationHistory 수동 전달이 아니다
   OpenCode SDK 에 conversationHistory 파라미터 없음.
   같은 sessionId 로 session.prompt() 반복 호출 → OpenCode 가 SQLite 에 히스토리 자동 저장/로드.
     // 첫 메시지
     const result = await client.session.create({ body: { title: '...' } });
     const sessionId = result.data.id;
     // 이후 메시지: 같은 sessionId 재사용
     await client.session.prompt({
       path: { id: sessionId },
       body: {
         parts: [{ type:'text', text: query }],
         model: { providerID, modelID },
         system: systemPrompt,
       },
     });

◆ 함정 7: dev 서버 재시작 시 포트 정리 + 캐시 삭제
     lsof -t -iTCP:3000 -sTCP:LISTEN | xargs -r kill -9
     lsof -t -iTCP:4096 -sTCP:LISTEN | xargs -r kill -9
     rm -rf .next
     sleep 2
   생략하면 "변경 사항이 반영 안 되는" 허위 단서로 시간 낭비.

◆ 함정 8: 디버그 로그는 full JSON dump
   console.log('[evt]', JSON.stringify(event).slice(0, 300))  ← 금지
   중요한 필드가 경계 뒤에 있으면 오진한다. 로그가 길면 /tmp/debug.jsonl 에 append.

◆ 함정 9: Next.js 16 에서 next lint 제거됨
   package.json 의 lint 스크립트는 eslint . 로 쓴다.
   eslint-config-next 16 은 flat config 를 직접 export:
     import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
     import nextTs from "eslint-config-next/typescript";
     export default [...nextCoreWebVitals, ...nextTs, globalIgnores([".next/", "out/"])];
   FlatCompat 사용 금지 (circular structure JSON 에러).

◆ 함정 10: Next.js 16 route handler
   OpenCode SDK 는 child_process 를 쓰므로 edge runtime 불가.
   route.ts 최상단에:
     export const runtime = "nodejs";
     export const dynamic = "force-dynamic";

◆ 함정 11: Next.js dev 의 HMR 은 모듈 레벨 싱글톤을 리셋한다
`let clientPromise = null` 같은 모듈 변수는 dev 모드에서 route 핸들러가
재평가되면 초기화된다. 같은 프로세스 안에서 OpenCode 서버를 두 번 스폰하게
되고, 두 번째 스폰은 이전 인스턴스가 점유한 포트 4096 bind 에 실패한다.
증상: 첫 요청은 200, 두 번째부터 500 + 본문 "fetch failed".
OpenCode 로그(~/.local/share/opencode/log/*.log) 에 "Failed to start server
on port 4096" 기록.

해결: 싱글톤을 globalThis 에 고정한다. Next.js 의 Prisma/DB 클라이언트
공식 패턴과 동일:

const g = globalThis as unknown as { __opencode?: { client?: Promise<…> } };
if (!g.__opencode) g.__opencode = {};
// 이후 g.__opencode.client 에 Promise 저장

production(`next start`) 에선 모듈 재평가가 없어 `let` 도 되지만,
globalThis 패턴은 양쪽에서 모두 안전하므로 기본값으로 사용할 것.

◆ 함정 12: message.part.delta 의 field === "text" 만으로는 "사용자 답변"과
"모델 내부 사고(reasoning)" 를 구분할 수 없다
GPT-5 계열은 최종 답변 전에 `reasoning` 파트를 생성할 수 있고, OpenCode 는
reasoning 파트의 토큰도 똑같이 message.part.delta { field:"text", ... } 로
방출한다. field 만 체크하면 "Responding in Korean / I need to..." 같은
내부 추론이 UI 로 흘러나온다.

올바른 필터:
1) message.part.updated 이벤트를 먼저 수집해 partID → part.type 맵 구성
2) message.part.delta 수신 시 해당 partID 의 part.type 이 "text" 일 때만
UI 로 yield. "reasoning", "step-start", "step-finish", "tool" 등은 전부 버림
3) partID 가 먼저 등장할 가능성이 낮지만 안전을 위해 맵에 없으면 "일단 보류"
또는 "text 로 간주" 중 정책을 선택. 이 프로젝트는 "text 로 간주"

probe 스크립트에서 이 함정을 재현하려면 의도적으로 "생각이 필요한 질문"
(예: "3자리 수 곱셈 답만 알려줘") 을 최소 1회 포함할 것. "안녕" 같은 프롬프트로
probe 했다가는 reasoning 이벤트가 발생하지 않아 함정이 드러나지 않는다.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Mock 경로 금지]

* route.ts 에 E2E_MOCK / MOCK_MODE 분기 금지
* playwright.config.ts 에 E2E_MOCK=1 prefix 금지
* 테스트에서 "deterministic 응답" 가정 금지

단, vitest 단위 테스트는 vi.mock('@opencode-ai/sdk') 로 외부 의존성 모킹 필수
(그렇지 않으면 테스트가 실제 서버 스폰 + 과금).
route.ts 본문에는 mock 분기가 존재하면 안 된다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[디렉토리 구조 — 정확히 이대로]

src/
  app/
    layout.tsx                 루트 레이아웃
    page.tsx                   / → /chat 리다이렉트
    globals.css                Tailwind CSS
    (main)/
      layout.tsx               사이드바 + 헤더 (인라인, 분리 금지)
      chat/
        page.tsx               /chat 페이지
        HeaderControls.tsx     모델 표시 + 새 대화 버튼
    api/chat/route.ts          POST /api/chat SSE
  components/
    chat/
      ChatPanel.tsx            메인 채팅 (MessageList + ChatInput 직접 조합)
      useChat.ts               채팅 훅 (API + 스토어 + 세션)
    common/
      BaseChat/
        ChatInput.tsx          입력창 (Enter 전송, Shift+Enter 줄바꿈)
        MessageList.tsx        메시지 목록 (자동 스크롤)
      ChatMarkdown.tsx         마크다운 + 코드 복사 + rehype-sanitize
  lib/
    opencode/
      agent.ts                 OpenCode SDK 에이전트 + 어댑터
      prompts/
        systemPrompt.ts        시스템 프롬프트
    agent/utils/
      sseStreamParser.ts       클라이언트측 SSE 파서
  store/
    index.ts                   Zustand 스토어 팩토리 + 싱글톤 (단일 파일)
  types/
    index.ts                   타입 정의 (단일 파일)

tests/e2e/                 Playwright 테스트
opencode.json                  OpenCode SDK 설정
playwright.config.ts           baseURL: http://localhost:3000
vitest.config.ts

[디렉토리 원칙]

* 작은 관련 파일은 합친다 (types/index.ts, store/index.ts 단일 파일)
* re-export 전용 index 파일 만들지 말 것 (직접 import)
* Sidebar/Header/PageHeader 는 (main)/layout.tsx 와 chat/page.tsx 에 인라인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[환경 파일]

.env 또는 .env.local:
  OPENAI_API_KEY=sk-...

opencode.json (기본 — OpenCode 1.4.0 이상에서 네이티브 동작):
  {
    "$schema": "https://opencode.ai/config.json",
    "model": "openai/gpt-5.4-mini"
  }

opencode.json (fallback — 위가 동작 안 하면 커스텀 네임스페이스):
  {
    "$schema": "https://opencode.ai/config.json",
    "model": "openai-custom/gpt-5.4-mini",
    "provider": {
      "openai-custom": {
        "npm": "@ai-sdk/openai",
        "name": "OpenAI (custom)",
        "options": { "apiKey": "{env:OPENAI_API_KEY}" },
        "models": {
          "gpt-5.4-mini": {
            "name": "GPT-5.4 mini",
            "limit": { "context": 400000, "output": 128000 }
          }
        }
      }
    }
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[npm scripts]
dev             next dev                            (포트 3000)
build           next build
start           next start
lint            eslint .                            (next lint 제거됨)
test            vitest run
test:watch      vitest
test:coverage   vitest run --coverage
test:e2e        playwright test
test:e2e:ui     playwright test --ui

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기능 요구사항]

FR-01  POST /api/chat SSE 스트리밍 응답                    Must
FR-02  OpenCode SDK 세션 기반 멀티턴 대화                  Must
FR-03  채팅 메시지 입력 + 전송 (Enter)                     Must
FR-04  어시스턴트 응답 스트리밍 표시                       Must
FR-05  마크다운 렌더링 (코드 복사 + XSS 방어)              Must
FR-06  새 대화 버튼 (세션 리셋)                            Must
FR-07  모델 표시 (GPT-5.4 mini)                           Should

[비기능]

* 첫 SSE 청크: warm 3초, cold start 15초 이내
* 빌드/린트 에러 0
* TypeScript strict
* 단일 파일 1000줄 초과 금지
* OPENAI_API_KEY 는 클라이언트 번들에 절대 포함 금지
* LLM 마크다운 출력은 rehype-sanitize 필수

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[구현 가이드]

[코드 작성 전 pre-work]

1. pnpm install 후 node_modules/@opencode-ai/sdk/dist/ 의 .d.ts 를 읽어

   다음 타입 확인:

    * createOpencode, OpencodeClient
    * SessionCreateData, SessionPromptData
    * EventSubscribeResponses 의 ServerSentEventsResult

       → 반환값에서 .stream 을 꺼내야 AsyncGenerator 접근

1. 간단한 node 스크립트로 createOpencode() → event.subscribe() →

   session.prompt() 실행 후 실제 이벤트 3~5개를 full JSON 으로 기록.
   결과를 docs/notes/opencode-live-events.md 에 저장.
   타입 정의와 실제 방출이 다를 수 있으므로 실제 방출 기준으로 구현.

[구현 순서]

1. 타입: src/types/index.ts

   ChatMessage, MessageEvent, DoneEvent, ErrorEvent, SessionEvent, SdkAgentEvent


1. 스토어: src/store/index.ts

   상태: messages, sessionId, isStreaming, error
   액션: addMessage, appendToLastAssistant, setSessionId, setStreaming,
         finalizeLastAssistant, setError, resetChat
   팩토리 + 싱글톤 인스턴스 + useChatStore 훅 한 파일에.


1. SSE 파서: src/lib/agent/utils/sseStreamParser.ts

   fetch response body reader → \n\n 분리 → data: 라인 파싱 → SdkAgentEvent yield


1. 시스템 프롬프트: src/lib/opencode/prompts/systemPrompt.ts

   간단한 한국어 챗봇 역할 (기존 레퍼런스 소스 잔재 금지)


1. OpenCode 에이전트: src/lib/opencode/agent.ts

* createOpencode 싱글톤
* getOrCreateSession(sessionId?): 있으면 재사용, 없으면 생성
* createQueryProcess({ query, systemPrompt, sessionId? }): Promise<{ stream, sessionId }>
    * 세션 확보
    * 이벤트 구독 먼저
    * 프롬프트 전송 (비동기)
    * 이벤트 스트림 → SdkAgentEvent 로 매핑 yield

1. API Route: src/app/api/chat/route.ts

* export const runtime = "nodejs"
* export const dynamic = "force-dynamic"
* Zod 로 { query: string, sessionId?: string } 검증
* createQueryProcess 호출
* 첫 SSE 이벤트로 { type: 'session', sessionId } 전송 (프론트가 저장)
* 이후 이벤트를 SSE 로 forward
* ReadableStream.cancel() 핸들러로 client disconnect 대응

1. 채팅 UI:
    1. UI는 기본 라이트 모드로 구현한다. 

* ChatInput: textarea + Send 버튼, Enter 전송 / Shift+Enter 줄바꿈
* MessageList: user/assistant 구분, 자동 스크롤, 스트리밍 커서
* ChatMarkdown: react-markdown + remark-gfm + rehype-raw + rehype-sanitize,

     코드 블록 복사 버튼 + 언어 라벨

* ChatPanel: MessageList + ChatInput 직접 조합 (BaseChat 래퍼 금지)
* useChat: fetch + SSE 파싱 + 스토어 업데이트
    * type==='session' → setSessionId
    * type==='message' → appendToLastAssistant
    * type==='done' → break
    * finally 블록에서 setStreaming(false) + finalizeLastAssistant() 반드시 호출

1. 레이아웃:

* (main)/layout.tsx: Sidebar (로고 + "채팅" 링크) + Header (고정 이메일 표시) 인라인
* chat/page.tsx: 페이지 헤더 + ChatPanel
* HeaderControls: "GPT-5.4 mini" 표시 + "새 대화" 버튼 (resetChat)

[단위 테스트 (필수)]

* SSE 파서 (5~7 TC): 정상/불완전 청크/빈 body/JSON 파싱 실패/멀티 이벤트
* 스토어 (5 TC): 초기 상태/addMessage/appendToLastAssistant/setSessionId/resetChat
* 시스템 프롬프트 (3~4 TC): 역할 정의/한국어 규칙/레퍼런스 잔재 없음

[SDK 모킹 규칙]
vi.mock 의 경로는 agent.ts 가 import 하는 경로와 정확히 동일해야 한다:
  vi.mock('@opencode-ai/sdk', () => { ... })

[막힘 탈출 정책]
테스트 실패 시 가설 3개를 순차 검증. 3개가 모두 반증되면 즉시 보고:
  "시도한 가설 N개, 각 반증 결과, 다음 방향 후보 1~2개, 추가 정보 요청"
4번째 가설을 혼자 세우지 말 것.

[UI 추가 판단 정책]
스펙에 명시되지 않은 UI 요소(아이콘, 스피너, 배지, 카운터 등)를 추가하고
싶다는 판단이 들면 — 구현하지 말고 "추가 제안: <요소>, 이유: <why>"
형태로 docs/notes/ui-suggestions.md 에 기록만 하고 넘어간다.

[실제 실행 검증 — TDD 완료 후 필수]

1. lsof -t -iTCP:3000,4096 -sTCP:LISTEN | xargs -r kill -9

   rm -rf .next && sleep 2

1. pnpm dev (포트 3000)
2. curl 로 /api/chat 에 "안녕" 전송 → 15초 이내 실제 SSE 청크 수신 확인
3. 같은 sessionId 로 두 번째 메시지 → 멀티턴 맥락 유지 확인 (FR-02)
4. pnpm test:e2e 실행 → 모든 시나리오 통과
5. 실패 시 ~/.local/share/opencode/log/<날짜>.log 확인

[자주 나오는 에러와 해결]

* "ProviderModelNotFoundError: openai/gpt-5.4-mini"

  → OpenCode CLI 구버전. 공식 installer 로 업데이트 또는 opencode.json 의
    커스텀 네임스페이스 fallback 사용

* "400 Unsupported parameter: 'max_tokens'"

  → OpenAI SDK 직접 호출 중. OpenCode SDK 로 전환 (max_completion_tokens 는 OpenCode
    내부에서 처리)

* 어시스턴트 메시지가 비어있고 스트리밍 커서만 표시

  → message.part.delta 를 처리하지 않고 updated 만 처리하는 중. 함정 3 참고

* 전송 후 입력란이 disabled 고착

  → finally 에서 finalizeLastAssistant() 호출 누락

[E2E 테스트 작성 규칙]
real API 는 non-deterministic:

* "정확히 N 줄" / "특정 단어 포함" 어설션 금지
* 대신:
* /api/chat: 200 + text/event-stream
* 어시스턴트 버블이 15초 안에 visible
* 버블 innerText 가 60초 안에 비어있지 않음
* 새 대화 버튼 클릭 후 메시지 0개
* Playwright test.use({ retries: 1 }) — rate limit 흡수
* webServer: pnpm dev, baseURL: http://localhost:3000
* reuseExistingServer: false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[보안]

* OPENAI_API_KEY 가 클라이언트 번들에 포함되지 않는지 확인:

    grep -rl "OPENAI_API_KEY" .next/static/   → 0 matches
    grep -rE "sk-[A-Za-z0-9_-]{20,}" .next/static/ → 0 matches

* pnpm audit --prod 실행

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[보고]
각 단계 종료 시 특별한 문제 없으면, 알아서 다음 단계 바로 시작. 

[작업 종료 시 정리]
  lsof -t -iTCP:3000,4096 -sTCP:LISTEN | xargs -r kill -9
orphan opencode serve 프로세스가 PPID=1 로 남으면 다음 세션에서 포트 충돌.

# Live Stream Events Probe — U2~U5 실측 확정

> Slice 1 (Wave 1) pre-work. 실측일: 2026-05-19 KST
> 도구: `scripts/probe.mts` (deepagents 1.10.2 + @langchain/openai
> ChatOpenAI gpt-5.4-mini + SqliteSaver). 실 LLM 2턴 호출(소액 과금).
> raw: /tmp/probe-out.jsonl (15 records). 학습/추정 아님 — 실제 청크 JSON.

## U2 — graph.stream() / streamMode (확정)

```ts
const stream = await agent.stream(
  { messages: [{ role: "user", content: text }] },
  { configurable: { thread_id }, streamMode: "messages" },
);
for await (const part of stream) { /* part = [AIMessageChunk, metadata] */ }
```

- `streamMode: "messages"` → 각 part 는 **2-튜플 배열** `[msg, meta]`.
  - `part[0]` = 직렬화된 `AIMessageChunk`
    (`part[0].kwargs.content`, `.id`, `.tool_call_chunks`,
    `.additional_kwargs`, `.response_metadata`).
  - `part[1]` = 메타데이터 객체 (langgraph_node 등 — U4).
- streamMode 는 RunnableConfig 의 키로 전달(별도 인자 아님). 멀티모드
  배열도 가능하나 텍스트 토큰엔 "messages" 단일로 충분.

## U3 — AIMessageChunk content 형태 (확정 — 중요)

gpt-5.4-mini + ChatOpenAI 조합 실측:

| 관측 | 값 |
|------|-----|
| `content` 타입 | **string** (블록 배열 아님) |
| 빈 청크 | 다수 — `content: ""` (스트림 시작/종료/툴 경계 마커) |
| thinking/reasoning 블록 | **미발생** (`additional_kwargs: {}`, reasoning_tokens=0) |
| 텍스트 청크 예 | `"안"`, `"녕하세요"`, `"."` / `"497"` |

→ **함정 4(thinking 블록 배열 누출)는 OpenAI gpt-5.4-mini 경로에선
   재현되지 않음.** 블록 배열 content 는 Anthropic thinking 또는 OpenAI
   reasoning 모델(o3/o4 계열)에서 발생. 본 프로젝트 기본(gpt-5.4-mini)에선
   content 가 항상 string.

→ `chunkFilter` (Slice 3) 설계 입력:
   1) `content` 가 string 이면 그대로, 빈 문자열("")은 스킵.
   2) `content` 가 배열이면(다른 provider/모델 대비) `type==="text"`
      블록만 통과, `thinking`/`reasoning`/`redacted_thinking` 제거 (R5
      방어적 유지 — provider 추상화라 anthropic/o3 전환 가능).
   3) `tool_call_chunks` 비어있지 않으면 본문에서 제외.

## U4 — 출처 노드 식별 메타데이터 키 (확정)

`part[1]` 메타데이터의 핵심 키:

| 키 | 값(실측) | 용도 |
|----|---------|------|
| `langgraph_node` | `"model_request"` | **메인 답변 노드 식별** |
| `thread_id` | `"probe-thread-1"` | 멀티턴 스레드 |
| `langgraph_step` | 3 | 그래프 스텝 |
| `langgraph_checkpoint_ns` | `model_request:<uuid>` | 체크포인트 ns |
| `ls_provider` / `ls_model_name` | `openai` / `gpt-5.4-mini` | 모델 메타 |

→ **함정 5(subagent 누출) 차단 설계 입력 (Slice 3/5):**
   메인 어시스턴트 텍스트는 `meta.langgraph_node === "model_request"`
   인 청크만. subagent 실행 시 다른 node 값(예: subagent task 노드)을
   가지므로 그 외 node 의 텍스트는 UI 본문에서 제외.
   (subagents:[] + GP disabled 기본이라 초기엔 model_request 만 나오나,
   필터는 node 화이트리스트로 견고하게.)

## U5 — checkpointer 주입 (확정 — 중요)

실측 과정에서 3가지 함정 발견·해소:

1. `import { MemorySaver } from "@langchain/langgraph"` →
   **ERR_MODULE_NOT_FOUND** (pnpm strict node_modules — @langchain/langgraph
   는 deepagents 트리에서만 해석, 앱이 직접 import 불가).
2. `createDeepAgent({ checkpointer: true })` →
   **"checkpointer: true cannot be used for root graphs"**
   (boolean 은 subagent 그래프 전용).
3. **확정 경로:** root graph 멀티턴엔 실제 saver 인스턴스 필요.
   ```ts
   import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
   const checkpointer = SqliteSaver.fromConnString(path); // path 또는 ":memory:"
   createDeepAgent({ model, systemPrompt, checkpointer });
   ```
   - `@langchain/langgraph-checkpoint-sqlite` 는 package.json 직접 의존
     → 정상 해석 (R 규약 위반 아님: langgraph 본체가 아니라 sqlite
     체크포인터 패키지).
   - `SqliteSaver` API (실측 .d.ts):
     - `constructor(db: Database, serde?)`
     - `static fromConnString(connStringOrLocalPath: string): SqliteSaver`
   - better-sqlite3 네이티브 바인딩 필요 (env-precheck §5 에서 빌드 확인).

→ **Slice 4 `harness/checkpointer.ts` 설계 입력:**
   - sqlite: `SqliteSaver.fromConnString(CHECKPOINTER_SQLITE_PATH)`
   - memory: `SqliteSaver.fromConnString(":memory:")`
     (별도 MemorySaver import 불가하므로 in-memory sqlite 로 통일 —
     이게 AD-6-5 "checkpointer:boolean 의미" 의 실측 답)
   - AD-2 lazy: `./.data/` 디렉토리 생성·파일 핸들 오픈을 최초 사용까지
     지연 (fromConnString 호출 시점 제어).

## 멀티턴 + 스트리밍 동작 검증

- 같은 `thread_id: "probe-thread-1"` 로 2턴 호출 → 정상 (TURN_END
  chunkCount: greeting 6, reasoning 4, DONE ok).
- gpt-5.4-mini 가 "17 곱하기 24 더하기 89" → `497` 응답
  (17×24=408, +89=497 — 정답). 멀티턴+checkpointer+streaming 실동작 확인.
- streamMode "messages" 로 토큰이 실제로 흐름 확인 (R4 충족).

## requirements.md / CLAUDE.md 와의 충돌·정합

| 항목 | 스펙 | 실측 | 조치 |
|------|------|------|------|
| streamMode | R4 "messages" | "messages" config 키 확인 | 일치 |
| content 블록 thinking | R5/함정4 블록 배열 | OpenAI gpt-5.4-mini 는 string | chunkFilter 는 양쪽 다 방어(provider 추상화) |
| @langchain/langgraph 직접 import | CLAUDE.md "import 가능" | **불가**(pnpm strict) | CLAUDE.md 해당 문구는 sqlite 체크포인터 패키지로 대체 — Slice 4 는 langgraph 직접 import 안 함 |
| checkpointer:boolean | AD-6-5 미실측 | root graph 불가, sqlite saver 필요 | checkpointer.ts 는 SqliteSaver(:memory: 포함) |

→ CLAUDE.md "@langchain/langgraph import 는 deepagents 트리에서 해석"
  문구는 **앱 코드 직접 import 기준으론 거짓**(pnpm strict). 단 본
  프로젝트는 langgraph 본체를 직접 import 할 일이 없고(체크포인터는
  -checkpoint-sqlite, 그래프는 deepagents 반환), 설계상 무영향.
  Slice 4~5 에서 이 경계 준수.

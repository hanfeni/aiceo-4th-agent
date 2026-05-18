# deepagents API Probe — 실측 확정본

> 출처: `node_modules/deepagents/dist/index.d.ts` (3960행) 직접 실측
> 설치 버전: **deepagents 1.10.2** / langchain 1.4.0 / @langchain/core 1.1.46 / @langchain/anthropic 1.3.29
> 실측일: 2026-05-19 (KST) · Node v24.3.0 · pnpm 10.29.2
> 상태: **실측 확정.** 웹 1차 조사의 일부 결론을 실측이 반증함(아래 §0).

---

## 0. 웹 조사 vs 실측 — 가설 검증/반증 기록

| 가설 (웹 조사 기반) | 실측 결과 | 판정 |
|---|---|---|
| "JS는 빌트인 미들웨어 비활성화 미지원 (메인테이너 Not at this time, 2026-03-30)" | 1.10.2에 `HarnessProfile.excludedMiddleware` + `registerHarnessProfile` 존재 | **반증됨** (구버전/포럼 시점 기준 답변이었음) |
| `systemPrompt` 옵션 키 사용 (CLAUDE.md 정정) | `CreateDeepAgentParams.systemPrompt?: string \| SystemMessage` 확인 | **검증됨** |
| `tools`/`subagents` 기본 `[]` | 제네릭 기본 `readonly []` 확인 | **검증됨** |
| `checkpointer` 옵션으로 H3 주입 | `checkpointer?: BaseCheckpointSaver \| boolean` 확인 | **검증됨** |
| filesystem/subagent 도 끌 수 있다 | **불가** — `REQUIRED_MIDDLEWARE_NAMES` scaffolding, 제외 시도 시 throw | **부분 반증** |

> 교훈: CLAUDE.md R8(학습/웹 지식 단정 금지, 실측)이 정확히 작동한 사례.
> 웹 결론만 믿었으면 잘못된 우회안을 채택할 뻔함.

## 1. createDeepAgent 옵션 키 (verbatim, CreateDeepAgentParams 3064–3167)

```ts
model?: BaseLanguageModel | string;          // default claude-sonnet-4-5-20250929
tools?: TTools | StructuredTool[];           // default []
systemPrompt?: string | SystemMessage;       // base prompt 와 결합됨
middleware?: TMiddleware;                     // "표준 미들웨어 뒤에" 추가 (additive)
subagents?: TSubagents;                       // default []
responseFormat?: TResponse;
contextSchema?: ContextSchema;
checkpointer?: BaseCheckpointSaver | boolean; // H3 멀티턴
store?: BaseStore;
backend?: AnyBackendProtocol | ((cfg)=>...); // filesystem 백엔드 (기본 StateBackend)
interruptOn?: Record<string, boolean | InterruptOnConfig>;
name?: string;
memory?: string[];                            // AGENTS.md 경로
skills?: string[];
permissions?: FilesystemPermission[];         // ls/read/write/edit/glob/grep 권한
streamTransformers?: TStreamTransformers;
```

→ **`harnessProfile` 옵션은 CreateDeepAgentParams 에 없다.** 프로파일은 별도
   레지스트리(`registerHarnessProfile`)로 주입되고, **model spec 문자열로 매칭**된다.

## 2. 빌트인 하네스 요소 (확정)

createDeepAgent 호출 시 자동 부착되는 미들웨어 (JSDoc 3174–3176:
"filesystem, tasks, subagents, summarization"):

| 빌트인 미들웨어 | 도구 | requirements.md | 끌 수 있나? |
|---|---|---|---|
| `TodoListMiddleware` | `write_todos` | H1 Planning | ✅ **가능** (excludedMiddleware) |
| `FilesystemMiddleware` | `ls/read_file/write_file/edit_file` | H2-a FS | ❌ **불가** (REQUIRED scaffolding) |
| `SubAgentMiddleware` | `task` | H2-b Subagents | ❌ **불가** (REQUIRED scaffolding) |
| `SummarizationMiddleware` | (자동 압축) | (스펙 미명시) | ✅ 가능 (REQUIRED 아님) |

`REQUIRED_MIDDLEWARE_NAMES` (3402–3409 JSDoc verbatim):
> "Middleware names that provide essential agent capabilities and **cannot
> be excluded** via `excludedMiddleware`. FilesystemMiddleware backs all
> built-in file tools... SubAgentMiddleware backs the `task` tool..."
> `excludedMiddleware` 에 이 이름을 넣으면 **construction time 에 throw**.

## 3. 빌트인 토글 메커니즘 (확정)

### 3-A. 미들웨어 제거 = HarnessProfile.excludedMiddleware (TodoList/Summarization)

```ts
import { registerHarnessProfile } from "deepagents";

// model spec key 로 등록. createDeepAgent({ model }) 의 model 문자열과 매칭.
registerHarnessProfile("anthropic:claude-sonnet-4-5-20250929", {
  excludedMiddleware: ["TodoListMiddleware"],  // .name 매칭, planning off
  // excludedMiddleware: ["FilesystemMiddleware"]  // ← throw! (REQUIRED)
});
```

- `getHarnessProfile(spec)`: exact → provider-prefix → merge → undefined.
- 등록은 **additive merge** (provider base + model override).
- `createHarnessProfile(opts)` 로 frozen profile 선생성도 가능.
- JSON/YAML 외부 설정: `harnessProfileConfigSchema` (zod `.strict()`),
  `parseHarnessProfileConfig`, `serializeProfile`.

### 3-B. 도구 가시성 제거 = excludedTools (미들웨어는 남기고 도구만 숨김)

```ts
registerHarnessProfile("anthropic:...", { excludedTools: ["write_todos"] });
```
→ filesystem/subagent 미들웨어는 못 끄지만, **개별 도구(ls, task 등)를
   최종 tool set 에서 필터링**하는 건 가능 (tool-injecting 미들웨어 이후 동작).

### 3-C. GP 서브에이전트 비활성 = generalPurposeSubagent.enabled:false

```ts
registerHarnessProfile("anthropic:...", {
  generalPurposeSubagent: { enabled: false },  // 자동 추가 GP subagent 끔
});
```

### 3-D. HarnessProfileOptions 전체 (3452–3521 verbatim)

```ts
interface HarnessProfileOptions {
  baseSystemPrompt?: string;                  // BASE_AGENT_PROMPT 교체
  systemPromptSuffix?: string;                // base 뒤 \n\n 추가 (모델별 튜닝 주력)
  toolDescriptionOverrides?: Record<string,string>;
  excludedTools?: string[];                   // default []
  excludedMiddleware?: string[];              // default [] (REQUIRED 제외 시 throw)
  extraMiddleware?: AgentMiddleware[] | (() => AgentMiddleware[]);
  generalPurposeSubagent?: { enabled?: boolean; description?: string; systemPrompt?: string };
}
```

## 4. requirements.md FR-08 / CLAUDE.md R2 영향 (재평가)

| 스펙 요구 | 달성 수단 | 가능 |
|---|---|---|
| H1 planning off | `excludedMiddleware:["TodoListMiddleware"]` | ✅ 표준 API |
| H2-a filesystem off (미들웨어 제거) | — REQUIRED, 불가 | ❌ |
| H2-a filesystem 도구 숨김 | `excludedTools:["ls","read_file","write_file","edit_file"]` | ✅ (대안) |
| H2-b subagents off | `subagents:[]` + `generalPurposeSubagent.enabled:false` (+`excludedTools:["task"]`) | ✅ |
| H4 tools 비우기 | `tools:[]` | ✅ |

→ **결론: planning/subagents/tools 토글은 표준 API 로 완전 달성.**
   filesystem 만 "미들웨어 자체 제거"는 불가하나, **도구 가시성 제거
   (`excludedTools`)로 사실상 동등한 off** 달성 가능.
   레지스트리(`harness/registry.ts`)는 `buildHarnessConfig(env)` 결과를
   ① `subagents`/`tools`/`checkpointer` → createDeepAgent 옵션,
   ② `excludedMiddleware`/`excludedTools`/`generalPurposeSubagent`
      → `registerHarnessProfile(modelSpec, …)` 호출
   두 경로로 분기 주입하면 R2 의 "agent.ts/route.ts diff 0줄" 달성 가능.

## 5. 아직 미실측 (후속 pre-work)

- [ ] streamMode "messages" 인자 정확 형태 (R4) — graph.stream API 시그니처
- [ ] AIMessageChunk content 블록 type 문자열 (R5) — "text"/"thinking" 등 실제 값
- [ ] subagent 노드 출력 식별 메타데이터 키 (R5) — streamTransformer/subagent 메타
- [ ] checkpointer 주입: `checkpointer: BaseCheckpointSaver | boolean` 의 boolean 의미
- [ ] @langchain/langgraph-checkpoint-sqlite 패키지 — 별도 설치 필요 여부 (현재 미설치)

## 6. R1 정렬 검증 (통과)

`pnpm why @langchain/core`: 전 의존(@langchain/anthropic, deepagents,
@langchain/langgraph 1.3.0, langgraph-checkpoint 1.0.2, langchain 1.4.0)에서
**@langchain/core 1.1.46 단일 트리**. AIMessageChunk instanceof 안전.
`@langchain/langgraph`는 deepagents dependency 로 자동 해석 (직접 추가 안 함, R 규약 준수).

## 7. 출처

- 1차(웹): docs.langchain.com/oss/javascript/deepagents/*, npm, deepwiki,
  forum.langchain.com (removing-some-default-middleware/3283), GH Discussion #655
- 2차(실측, 확정): `node_modules/deepagents/dist/index.d.ts` @ 1.10.2

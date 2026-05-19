# 하네스 introspect — 도구/서브에이전트 메타 구조 실측 (R8)

작성: 2026-05-19 / 대상: /harness 페이지(하네스 요소 확인) 구현 선행 probe

## 1. HarnessConfig 실 필드 (src/types/index.ts:128, registry.ts:111)

```
{
  planning:   { enabled: boolean }
  filesystem: { enabled: boolean }
  subagents:  SubagentSpec[]              // 직렬화 가능
  tools:      (ClientTool|ServerTool)[]   // ⚠ 구조 상이 (아래 2)
  checkpointer: unknown                   // ⚠ SqliteSaver Proxy — touch 금지
  skills:     { enabled, sources: string[], backend: unknown } // ⚠ backend = FilesystemBackend, touch 금지
}
```

- **C2 위험 확정**: `checkpointer` 는 Proxy(checkpointer.ts:56). get-trap 이
  임의 프로퍼티 접근에 `ensure()`→`mkdirSync`+`SqliteSaver.fromConnString`
  실행(checkpointer.ts:47-50). `JSON.stringify(config)` 가 순회하면
  **SQLite 파일 생성** = AD-2 lazy 위반.
- **결론**: introspect 는 `buildHarnessConfig` 를 호출하지 않는다. view 는
  안전 필드만 받는 순수 함수. checkpointer/backend 는 HarnessView 타입에서
  **필드 자체 배제**(화이트리스트). 토글 boolean 은 env 로 재계산.

## 2. 도구 메타 (ClientTool vs ServerTool) — 구조 상이

### ClientTool: currentTimeTool (exampleTool.ts:21)
`tool(fn, { name, description, schema })` → StructuredTool. `.name`/
`.description`/`.schema`(zod) 는 public abstract 프로퍼티(@langchain/core
tools/index.d.ts:17-19). Proxy 아님(일반 객체) → C2 side-effect 위험 0.
- `.name` = `"current_time"`  ✅
- `.description` = `"현재 날짜와 시각을…"`  ✅
- `.schema` = zod 객체. **LLM 명세(parameters)** = 이 zod 를 JSON Schema
  로 변환한 것. zod v4(zod@4.4.3) 는 `z.toJSONSchema(schema)` 내장(v3 의
  zod-to-json-schema 별도 패키지 불요 — 추가 의존성 0). 실측 변환 결과:
  ```
  { "$schema":"...2020-12/schema", "type":"object",
    "properties": { "timezone": {
      "description":"IANA 타임존 (예: 'Asia/Seoul', 'UTC'). 미지정 시 KST.",
      "type":"string" } },
    "additionalProperties": false }
  ```
  → description(`.describe()`)까지 보존. 이게 LLM 이 도구 호출 시 보는
  "사용 설명서". `z.toJSONSchema` 는 순수 변환(view.ts 순수성 유지).
  변환 실패(비-zod schema 등) 시 graceful null.

### ServerTool: webSearchTool (webSearchTool.ts:59)
`openaiTools.webSearch({ search_context_size:"medium" })` →

**정정 실측 (이전 probe 누락 — 옵션 없는 경우만 봤음, R8 정직성):**
- `webSearch()` 반환 객체 = `{ type:"web_search", search_context_size:
  "medium" }` (옵션 줬을 때). keys 전체 = `type, filters, user_location,
  search_context_size`. 즉 **우리가 OpenAI 에 보내는 구성값이 도구
  객체 안에 그대로 있다** — 이전 "`{type}` 뿐" 은 옵션 미지정 케이스.
- **`.name`/`.description` 없음**(zod schema 없음 — LLM 입력 명세
  불가). 하지만 `type` 외 키 = **우리 구성값**(search_context_size 등)
  → ServerTool 도 "이 도구를 어떻게 구성했나" 표시 가능(사용자 요구).
- description: 도구 파일이 `webSearchToolDescription` export 추가하면
  ServerTool 도 "이 도구가 무엇인가" 설명 보유(FR-08 요소1개=파일1개,
  exampleTool 의 *DisplayName 과 동일 패턴 — 등록 지점 매핑).

추출 규칙(ServerTool): name=`.type`, kind="server", description=
HARNESS_TOOL_DESCRIPTIONS 매핑, configValues=`type` 제외 모든 키.

### 방어적 추출 규칙 (R8)
```
toolName = tool.name ?? tool.type ?? "(unknown)"
toolKind = tool.name ? "client" : (tool.type ? "server" : "unknown")
toolDesc = tool.description ?? null   // ServerTool 은 null
```

## 3. displayName 매핑 (자동 레지스트리 없음 — 명시 매핑 필요)

분산 named export:
- `currentTimeToolDisplayName = "현재 시각"` (exampleTool.ts:19)
- `webSearchToolDisplayName = "웹 검색"` (webSearchTool.ts:57)
- `webSearcherSubagentDisplayName = "웹 검색"` (webSearcher.ts:28)

도구 객체 ↔ displayName 자동 연결 레지스트리 **없음**. introspect 모듈이
직접 이 named export 들을 import 해 `name → displayName` Map 구성.
(tools/index.ts 수정 = "요소1개=파일1개" 영향 → introspect 가 읽기전용으로
displayName import 하는 게 R2/원칙 영향 0.)

## 4. SubagentSpec (types/index.ts:114)

```
{ name: string; description: string; systemPrompt: string; tools?: unknown[] }
```
- webSearcherSubagent.systemPrompt 본문에 `(PLACEHOLDER — 사용자가
  정책을 확정해 교체)` 포함 → introspect 가 `/PLACEHOLDER/` 매칭으로
  isPlaceholder 플래그 산출 → UI 배지(사용자 A2 결정).
- `tools: [webSearchTool]` = ServerTool 객체 → 직렬화 시 name/type 만
  추출(M2). 객체 그대로 노출 금지.

## 5. systemPrompt 보안 (M1)

`systemPrompt.ts` grep: `process.env` 참조 **0** (line 8 SYSTEM_PROMPT
상수 + line 23 getSystemPrompt 함수만). API 키 유입 경로 없음 → 전문
노출 안전(사용자 컨펌). 단 회귀 방지: systemPrompt.ts 에 "이 상수는
/harness 로 전문 노출됨 — 비밀/키 금지" 주석 추가(Slice 3).

## 6. 결론: 안전 추출 설계

- `view.ts`: `toHarnessView(config: HarnessConfig, systemPrompt: string,
  toolMetas: ToolMeta[]): HarnessView` — 순수, buildHarnessConfig 미호출.
- `HarnessView` 타입: checkpointer/backend 필드 **부재**(타입 레벨 배제).
- page.tsx(server): env 로 토글 재계산(핸들 미생성) + tools/subagents
  메타 추출 + getSystemPrompt() → toHarnessView → client props.
- 단위테스트: `JSON.stringify(view)` 에 'sqlite'/Proxy 부재 단언 +
  빈 토글(subagents[]/tools[]/skills off) 케이스.

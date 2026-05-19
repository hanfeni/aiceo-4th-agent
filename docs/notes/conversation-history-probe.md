# 대화 히스토리 — checkpoint BLOB 실측 (R8 준수)

작성: 2026-05-19 / 대상: `./.data/checkpoints.sqlite` (실 데이터 2 thread)

## 1. checkpoints 테이블 스키마 (실측)

```
CREATE TABLE checkpoints (
  thread_id TEXT NOT NULL,            -- = conversationId
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,        -- UUIDv6 (시간정렬 가능, ORDER BY 로 최신 판별)
  parent_checkpoint_id TEXT,
  type TEXT,                          -- 'json'
  checkpoint BLOB,                    -- 평문 JSON (UTF-8)
  metadata BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
```

- **timestamp 컬럼 없음.** 시각은 `checkpoint` BLOB 내부 `ts`(ISO), 정렬은 `checkpoint_id` UUIDv6 단조증가로 대체.
- thread별 **마지막** checkpoint(`ORDER BY checkpoint_id DESC LIMIT 1`)에 전체 누적 messages 보존.
  관측: messages 길이 추이 0→1→1→1→2→2 (마지막이 전체 대화).

## 2. checkpoint BLOB 구조 (실측)

top keys: `v, id, ts, channel_values, channel_versions, versions_seen`
`channel_values` keys: `messages, jumpTo, todos, files, _summarizationSessionId, _summarizationEvent, structuredResponse, __pregel_tasks`

### messages[] — LangChain serialized 형식

```
{ lc, type:"constructor", id:["langchain_core","messages","HumanMessage"|"AIMessageChunk"], kwargs:{...} }
```

- **역할 판별**: `msg.type`/`msg.role` 아님. **`msg.id` 배열 마지막 요소**
  (`"HumanMessage"` | `"AIMessageChunk"`)로 판별.
- **HumanMessage**: `kwargs.content` = string.
- **AIMessageChunk**: `kwargs.content` = **블록 배열**
  `[{type:"reasoning", reasoning, index}, {type:"text", text, index, annotations}]`
  - `kwargs.additional_kwargs.reasoning.summary[].text` = 사고 요약 텍스트
  - `kwargs.additional_kwargs.tool_outputs[]` = `{type:"web_search_call", status, action:{queries}}`
  - `kwargs.tool_calls[]` / `kwargs.response_metadata`(usage 포함)

## 3. 복원 범위 확정 (사용자 정책: "가능한 모두 복원")

복원 가능 = BLOB 에 보존된 모든 것:
- ✅ user/assistant 본문 (text 블록)
- ✅ 사고 패널: reasoning 텍스트(content reasoning 블록 + additional_kwargs.reasoning.summary)
- ✅ tool 호출/출력 (tool_outputs web_search, tool_calls)

## 4. 핵심 재사용 자산 (코드 추가 최소화)

checkpoint BLOB 의 AIMessageChunk = **스트리밍 청크와 동일 구조**.
기존 순수 함수 재생(replay)으로 복원 = 신규 파싱 로직 0:

- `src/lib/agent/utils/chunkFilter.ts`
  - `filterChunk(msg, meta)` → 본문 text
  - `extractThinking(msg, meta)` → reasoning 텍스트
  - `extractToolCalls(msg)` / `extractToolOutputs(msg)` → 도구
- `src/lib/agent/utils/thinkingSteps.ts`
  - `reduceReasoning / reduceToolCall / reduceToolResult` → thinkingSteps[] 누적
- 타입: `ChatMessage{role,content,thinkingSteps?}`, `ThinkingStep`(reasoning|tool)

## 5. Plan Critic 지적 해소 결론

- C2: checkpointer globalThis 싱글톤화 (사용자 컨펌). API 는 동일 인스턴스 공유.
- C4: messages[0] 단정 폐기. "첫 HumanMessage" + content 타입 분기(string|블록배열).
- C5: best-effort 전체 복원 (사용자 정책 변경). 기존 reducer 재생으로 구현.
- C7: 조회 유틸은 harness/ 밖(`src/lib/conversations/`). 그래프 비주입.
- C8: 순수 코어(rows→summary, replay) / DB 어댑터 분리. 코어는 better-sqlite3 import 0.
- C10: 빈 DB/테이블 부재 → sqlite_master 선검사 후 빈 배열 200.
- C3: :memory: 모드 → 빈 목록 + mode 플래그, UI 안내.

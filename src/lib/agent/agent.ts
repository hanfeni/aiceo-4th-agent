import { createDeepAgent } from "deepagents";
import type { SseEvent } from "@/types";
import { buildHarnessConfig, type HarnessEnv } from "./harness/registry";
import {
  type WorkspaceId,
  type HarnessOverrides,
} from "./harness/profiles";
import {
  getWorkspaceSelection,
  type WorkspaceSelection,
} from "./harness/workspaceSelectionStore";
import type { SearchDomain } from "@/lib/searchlab/domains";
import type { SqlDomain } from "@/lib/sqllab/domains";
import { tableInfo } from "@/lib/sqllab/db";
import { buildAgentOptions } from "./harness/buildAgentOptions";
import { createModel } from "./harness/model";
import { getSystemPromptBody } from "./prompts/instructions";
import {
  filterChunk,
  extractThinking,
  extractToolCalls,
  extractToolResult,
} from "./utils/chunkFilter";
import {
  normalizePart,
  isSubagentNamespace,
  initTaskTrack,
  trackTaskCompletion,
  drainPendingTasks,
  extractToolEventResult,
} from "./utils/streamNamespace";

/**
 * 컴파일된 LangGraph 그래프 싱글톤 + 스트리밍 진입점.
 *
 * R6/AD-3 — globalThis 에 그래프 **Promise** 를 메모이즈한다(resolved 그래프
 * 아님). dev HMR 로 모듈이 재평가돼도 globalThis 가 살아남아 멀티턴 상태가
 * 보존되고(R6), 동시 첫 요청(cold-start) 여러 개가 들어와도 createDeepAgent
 * 는 **최대 1회**만 호출된다(AD-3 — Promise 메모이즈로 중복 빌드 0).
 *
 * AD-1/R2 — 하네스 토글 분기는 buildHarnessConfig + buildAgentOptions 가
 * 전부 흡수한다. 이 파일에는 `if(toggleEnabled)` 가 한 줄도 없다. 토글을
 * 켜고 꺼도 이 파일 diff 는 0 줄이다(AC-4/NFR-6).
 *
 * R3 — 멀티턴은 checkpointer 주입 + configurable.thread_id 가 전부다.
 * conversationHistory 를 messages 에 수동 누적하지 않는다(중복 누적/컨텍스트
 * 오염 차단). 그래프 input.messages 에는 현재 turn query 만 들어간다.
 *
 * U2 — graph.stream(input, config) 의 streamMode 는 RunnableConfig 키
 * "messages". 각 part 는 [AIMessageChunk, meta] 2-튜플. chunkFilter 가
 * 본문 텍스트만 추출한다(R5/FR-09).
 */

// 실측: 컴파일 그래프의 .stream() 은 **Promise<IterableReadable
// Stream>** 을 반환한다. await 로 풀어야 for await 가 가능하다(await 누락 시
// "stream is not async iterable" 런타임 에러 — 단위 mock 은 async generator
// 라 await 없이도 통과해 이 형태 차이를 못 잡았다, architect AI-5).
// Slice D — 멀티모달: content 는 string(텍스트 only, 무회귀 경로) 또는
// LangChain v1 블록배열(R8 실측 — file-extract-probe). 이미지 있을 때만
// 배열, 없으면 기존 string(model-selection modelOverride 와 동일 무회귀).
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type DeepAgentGraph = {
  stream: (
    input: {
      messages: Array<{ role: string; content: string | ContentBlock[] }>;
    },
    config: {
      configurable: { thread_id: string };
      // ["messages","tools"] 다중 구독(R8 실측 — StreamMode 에 "tools"
      // 존재). "messages"=LLM 토큰(R4), "tools"=도구 라이프사이클
      // (on_tool_end.output = 메인 ClientTool 결과 — "messages" 미흐름 보완).
      streamMode: ["messages", "tools"];
      // subgraphs:true — 서브에이전트(task 위임) 청크를 스트림에 노출.
      // 실측(scripts/subagent-probe.mts): 없으면 부모 노드만(model_
      // request/tools), 주면 part 가 [namespace[], [msg,meta]] 3-튜플로
      // 서브에이전트 실행이 namespace 로 식별된다. FR-09 무손상:
      // filterChunk 가 계속 langgraph_node==="model_request" 만 본문
      // 통과 → 서브에이전트 본문 누출 0.
      subgraphs: true;
    },
  ) => Promise<AsyncIterable<unknown>>;
};

// AD-13 — 그래프 캐시는 모델별로 분리(단일 슬롯 → Map). 키는 모델 ID,
// model 미지정(env 경로)은 ENV_KEY sentinel. 화이트리스트 한정이라 엔트리는
// 모델 수(현 3)+env 1 = 최대 4 로 bound(Plan Critic C12 — 무한증가 0).
// R6 — Map 자체가 globalThis 에 박혀 HMR 재평가에도 멀티턴 보존.
type AgentGlobal = { graphByModel?: Map<string, Promise<DeepAgentGraph>> };

const g = globalThis as typeof globalThis & { __agent?: AgentGlobal };

const ENV_KEY = "__env__";

/**
 * 그래프를 1회 빌드한다. 분기 0줄 단일 호출(AD-1) — 토글 매핑은 전부
 * registry + buildAgentOptions 내부에 격리되어 있다. model 이 지정되면
 * createModel(env, model) 이 화이트리스트 검증 + provider 역산을 수행
 * (Plan Critic C1) — 이 파일엔 모델/토글 분기 0줄(R2 유지).
 */
function buildGraph(
  model?: string,
  idxDomain?: SearchDomain,
  sqlDomain?: SqlDomain,
  profileId?: WorkspaceId,
  graphDataset?: string,
  overrides?: HarnessOverrides,
  instructionId?: string,
): DeepAgentGraph {
  const env = process.env as unknown as HarnessEnv;
  // 워크스페이스(A/B/C) 스킬·서브에이전트 멀티선택 — profileId 기준으로
  // .data/ 영속 store 에서 조회(클라이언트 body 미경유 — 서버 단일 소스).
  // profileId 없으면(기존 /chat) 전체 선택(null) → 회귀 0.
  const selection: WorkspaceSelection = profileId
    ? getWorkspaceSelection(profileId)
    : { skills: null, subagents: null };
  // HarnessConfig.tools/checkpointer 는 R8 에 따라 느슨한 계약(unknown[]/
  // unknown)이다. deepagents 의 정밀 타입으로의 narrowing 은 이 단일 호출
  // 경계에서만 일어난다(model.ts 의 `as unknown as` 선례와 동일 패턴).
  // idx/sqlDomain/graphDataset/overrides 는 registry 가 흡수(미지정=기존
  // 도구셋·env 디폴트 — R2 0줄 유지). 이 파일엔 if(toggle) 0줄.
  // instructionId → 동적 시스템 인스트럭션 본문 선택(미지정=default).
  // selection → 스킬·서브에이전트 멀티선택 필터(미선택=전체).
  const options = buildAgentOptions(
    buildHarnessConfig(
      env,
      idxDomain,
      sqlDomain,
      overrides,
      graphDataset,
      selection,
    ),
    createModel(env, model),
    getSystemPromptBody(instructionId),
    // profileSig — 같은 모델 키에 서로 다른 GP 정책 재등록 허용. 토글이
    // 요청별이라 profileId+overrides+selection 시그니처를 합쳐 unique 로.
    graphSig(profileId, overrides, instructionId, selection),
  ) as unknown as Parameters<typeof createDeepAgent>[0];
  return createDeepAgent(options) as unknown as DeepAgentGraph;
}

/** 선택 목록(null=전체)을 결정적 문자열로. null 과 [] 를 구분(전체 vs 전부끔). */
function selList(list: string[] | null | undefined): string {
  if (list == null) return "*"; // 전체(기본)
  return [...list].sort().join(",");
}

/** profileId + 토글 오버라이드 + 인스트럭션 + 워크스페이스 선택을 안정적
 *  시그니처 문자열로(그래프 캐시 키·GP 재등록 sig 공용). 키 정렬로 결정성.
 *  selection 변경(스킬·서브에이전트 멀티선택) 시 다른 sig → 새 그래프. */
function graphSig(
  profileId?: WorkspaceId,
  overrides?: HarnessOverrides,
  instructionId?: string,
  selection?: WorkspaceSelection,
): string {
  const ov = overrides
    ? Object.keys(overrides)
        .sort()
        .map((k) => `${k}:${overrides[k as keyof HarnessOverrides] ? 1 : 0}`)
        .join(",")
    : "";
  // selection 은 전체(*)가 기본이라, 전체일 때는 sig 에 더하지 않아 기존
  // 캐시 키와 동일(회귀 0). 하나라도 선택되면 접미사 추가 → 새 그래프.
  const sel =
    selection && (selection.skills != null || selection.subagents != null)
      ? `sk:${selList(selection.skills)};sa:${selList(selection.subagents)}`
      : "";
  return (
    (profileId ?? "") +
    (ov ? `|ov:${ov}` : "") +
    (instructionId ? `|in:${instructionId}` : "") +
    (sel ? `|sel:${sel}` : "")
  );
}

/**
 * globalThis 에 고정된 모델별 그래프 Promise 를 반환한다(메모이즈).
 * 같은 모델 동시 진입 시 Promise 가 이미 박혀 있어 buildGraph 는 그 모델
 * 당 1회만 실행된다(AD-3 를 모델별로 유지). 다른 모델은 별도 엔트리.
 */
function getGraph(
  model?: string,
  idxDomain?: SearchDomain,
  sqlDomain?: SqlDomain,
  // SQL 도메인 적재 여부. 미적재→적재 전환 시 키가 달라져 새
  // 그래프(스키마 박힌 도구)를 빌드 → stale '미적재 도구' 영구
  // 잔존 결함 해소(사용자 결정 2026-05-19). 행수 아닌 boolean —
  // 재적재(행수 변화)는 스키마 불변이라 그래프 재빌드 불필요.
  sqlLoaded?: boolean,
  // 에이전트 프로필 id(A/B/C). 미지정=기존 /chat. 그래프 격리·thread
  // 정체성용(토글 자체는 overrides 가 결정). 지정 시 에이전트별 별도 그래프.
  profileId?: WorkspaceId,
  // 온톨로지 조회 도구 세션 데이터셋. 미지정=도구 없음(키 접미사 0,
  // 회귀 0). 지정 시 그 데이터셋 스키마 박힌 graph_query 도구 포함.
  graphDataset?: string,
  // 요청별 하네스 토글 오버라이드(에이전트 패널 4요소). 미지정=env
  // 디폴트(키 접미사 0, 회귀 0). 토글이 바뀌면 다른 키 → 새 그래프.
  overrides?: HarnessOverrides,
  // 동적 시스템 인스트럭션 id. 미지정=default. 변경 시 다른 키=새 그래프.
  instructionId?: string,
): Promise<DeepAgentGraph> {
  if (!g.__agent) g.__agent = {};
  if (!g.__agent.graphByModel) g.__agent.graphByModel = new Map();
  // 캐시 키에 idx/sqlDomain(+sql 적재상태) + profileId + graphDataset
  // + overrides 시그니처 + instructionId + 워크스페이스 선택 합성 — 변경
  // 시 다른 키 → 새 createDeepAgent= 세션 리프레시. 모두 없으면 키가
  // 기존과 동일(기존 챗 회귀 0). 선택은 PUT 으로 .data/ 에 저장된 뒤
  // 클라이언트가 resetChat → 다음 요청에서 이 sig 가 새 그래프를 만든다.
  const selection: WorkspaceSelection = profileId
    ? getWorkspaceSelection(profileId)
    : { skills: null, subagents: null };
  const sig = graphSig(profileId, overrides, instructionId, selection);
  const key =
    (model ?? ENV_KEY) +
    (idxDomain ? `|idx:${idxDomain}` : "") +
    (sqlDomain ? `|sql:${sqlDomain}|sl:${sqlLoaded ? 1 : 0}` : "") +
    (graphDataset ? `|gr:${graphDataset}` : "") +
    (sig ? `|sig:${sig}` : "");
  const cached = g.__agent.graphByModel.get(key);
  if (cached) return cached;
  const built = Promise.resolve().then(() =>
    buildGraph(
      model,
      idxDomain,
      sqlDomain,
      profileId,
      graphDataset,
      overrides,
      instructionId,
    ),
  );
  g.__agent.graphByModel.set(key, built);
  return built;
}

export interface CreateStreamArgs {
  query: string;
  conversationId: string;
  /** 런타임 선택 모델(화이트리스트). 미지정 시 서버 env 경로(FR-14/AD-12). */
  model?: string;
  /**
   * 멀티모달 이미지 base64 data URL 배열(Slice D). route zod 가 prefix
   * 화이트리스트·크기·개수를 이미 검증(E2/A1) — 여기선 신뢰. 비거나
   * 미지정이면 content 는 string(무회귀).
   */
  images?: string[];
  /**
   * 인덱스 검색 도구 세션 도메인(챗 우측 드롭다운). 지정 시 그
   * 도메인 바인딩 index_search 도구가 그래프에 포함된다. 변경하면
   * getGraph 캐시 키가 달라져 새 그래프=세션 리프레시(MCP 도구
   * 재인식 — 사용자 결정 2026-05-19). 미지정=기존 챗(도구 없음).
   */
  idxDomain?: SearchDomain;
  /**
   * 데이터 조회(SQL) 도구 세션 도메인. idxDomain 과 독립 — 지정
   * 시 그 도메인 sql_query 도구 포함. 변경 시 캐시 키 변경=세션
   * 리프레시. 미지정=도구 없음(회귀 0).
   */
  sqlDomain?: SqlDomain;
  /**
   * 에이전트 프로필 id(workspace1|2|3 = 에이전트 A/B/C). 그래프 격리·
   * thread 정체성용. 미지정=기존 /chat(회귀 0). 검증 SSOT 는 route zod.
   */
  profileId?: WorkspaceId;
  /**
   * 온톨로지 조회 도구 세션 데이터셋(챗 그래프 드롭다운). 지정 시 그
   * 데이터셋 바인딩 graph_query 도구 포함. 변경 시 캐시 키 변경=세션
   * 리프레시. 미지정=도구 없음(회귀 0). 검증 SSOT 는 route zod enum.
   * 수업1·3 연결: GRAPH_DATASETS SSOT 가 드롭다운·도구 단일 소스.
   */
  graphDataset?: string;
  /**
   * 요청별 하네스 토글 오버라이드(에이전트 패널 4요소 토글 상태).
   * 키 있으면 그 boolean 을 env 위에 강제. 미지정=env 디폴트(회귀 0).
   * 클라이언트가 현재 토글 상태를 채워 보낸다(사용자 결정 2026-05-20).
   */
  overrides?: HarnessOverrides;
  /**
   * 동적 시스템 인스트럭션 id(하네스 관리에서 만든 인스트럭션 선택).
   * 미지정=default 본문. 변경 시 캐시 키 변경=세션 리프레시.
   */
  instructionId?: string;
}

/**
 * 한 턴의 응답 토큰을 SseEvent 스트림으로 산출한다.
 *
 * thread/done/error 이벤트는 route.ts 가 경계에서 부착한다. 여기서는
 * 본문 토큰(`{type:'token'}`)만 yield 한다(관심사 분리).
 */
export async function createStream({
  query,
  conversationId,
  model,
  images,
  idxDomain,
  sqlDomain,
  profileId,
  graphDataset,
  overrides,
  instructionId,
}: CreateStreamArgs): Promise<AsyncGenerator<SseEvent>> {
  // SQL 도메인 선택 시 현재 적재 상태를 읽어 그래프 캐시 키에
  // 반영(미적재→적재 전환=다른 키=새 그래프=스키마 박힌 도구).
  // tableInfo 는 better-sqlite3 동기 호출(가벼움, 매 요청 1회).
  let sqlLoaded = false;
  if (sqlDomain) {
    try {
      sqlLoaded = tableInfo(sqlDomain) !== null;
    } catch {
      sqlLoaded = false; // 조회 실패 시 미적재 취급(graceful)
    }
  }
  const graph = await getGraph(
    model,
    idxDomain,
    sqlDomain,
    sqlLoaded,
    profileId,
    graphDataset,
    overrides,
    instructionId,
  );

  // 이미지 있으면 LangChain v1 블록배열, 없으면 string(무회귀). 이미지
  // 누적은 checkpointer 가 자동 보존(R3) — route zod 가 턴당 개수·크기를
  // 제한해 누적 폭발을 완화(A1, 사용자 HITL: 히스토리 유지 + 한도).
  const content: string | ContentBlock[] =
    images && images.length > 0
      ? [
          { type: "text", text: query },
          ...images.map(
            (url): ContentBlock => ({ type: "image_url", image_url: { url } }),
          ),
        ]
      : query;

  async function* gen(): AsyncGenerator<SseEvent> {
    // R3 — 현재 turn 입력만. 수동 conversationHistory 누적 없음.
    const stream = await graph.stream(
      { messages: [{ role: "user", content }] },
      {
        configurable: { thread_id: conversationId },
        // "messages"=LLM 토큰(R4) + "tools"=도구 실행 라이프사이클
        // (on_tool_end.output = ClientTool 결과 — 메인 ClientTool
        // ToolMessage 가 "messages" 에 안 흐르는 구조 보완. R8 실측:
        // StreamToolsOutput {event:on_tool_start|end|error, name, output}).
        streamMode: ["messages", "tools"],
        // 서브에이전트(task 위임) 진행을 사고 패널에 노출(실측 검증완료).
        subgraphs: true,
      },
    );

    // task(서브에이전트 위임) 완료 추적 상태. deepagents 가 task 완료를
    // tool_result 로 안 주므로(실측), 서브에이전트 namespace 탈출을
    // 감지해 task tool_result 를 합성한다 → 사고 패널 "에이전트 실행
    // 중"이 "완료"로 전환됨. 전이 판정은 순수 함수(streamNamespace).
    let taskTrack = initTaskTrack();

    for await (const rawPart of stream) {
      // subgraphs:true 로 part 형태가 2/3-튜플 양형 → 단일 형태로 정규화.
      // 기존 chunkFilter 5종 추출기는 정규화된 msg/meta 만 받으므로
      // 무수정 재사용(R5 격리 유지 — chunkFilter.ts diff 0줄).
      const { msg, meta, namespace, mode } = normalizePart(rawPart);
      const subChunk = isSubagentNamespace(namespace);

      // "tools" 모드 part — 도구 실행 라이프사이클(R8 실측). 메인
      // ClientTool(web_search 등) ToolMessage 는 "messages" 스트림에
      // 안 흐르므로(streamMode 한계) 이 채널의 on_tool_end.output
      // (= 우리 정제 string)을 tool_result 로 합성 → 사고 패널 OUT
      // 채움(이전 ServerTool citations 우회 대체). task 는 trackTask
      // Completion 별도 처리라 extractToolEventResult 가 skip(중복 0).
      // tool_call IN 은 기존 tool_call_chunks(messages)가 이미 채움.
      if (mode === "tools") {
        const te = extractToolEventResult(msg);
        if (te) {
          yield {
            type: "tool_result",
            id: te.id,
            name: te.name,
            result: te.result,
          };
        }
        continue; // tools part 는 chunkFilter 추출기 대상 아님(meta 無)
      }

      // task 완료 전이 판정(서브에이전트 진입 후 루트 복귀 = 완료).
      // 완료 시 task tool_result 합성 emit → reduceToolResult 가
      // "… 에이전트 완료"로 제목 전환(thinkingLabels.toolTitle).
      // args 보존으로 subagent_type 한글 라벨 유지(Slice J 정합).
      {
        const { next, completed } = trackTaskCompletion(
          taskTrack,
          subChunk,
          null,
        );
        taskTrack = next;
        if (completed) {
          yield {
            type: "tool_result",
            id: completed.id,
            name: "task",
            result: "에이전트가 작업을 완료했습니다",
          };
        }
      }

      // 서브에이전트(task 위임) 컨텍스트 청크는 메인 추출기로 흘리지
      // 않고 스킵한다. medigate-new 패턴: 서브에이전트의 진행은 그
      // 내부 토큰이 아니라 **메인이 emit 하는 task 도구 step**(아래
      // extractToolCalls 가 name="task" 로 잡음 → 클라이언트가
      // "web-searcher 에이전트 실행 중"으로 라벨)으로 표현한다. 즉
      // 서브에이전트 내부 본문/사고는 패널에 노출하지 않는다
      // (FR-09 무손상 + medigate UX 정합 — 패널 과부하 0).
      // subgraphs:true 자체는 유지해야 서브에이전트가 실제 실행된다.
      if (subChunk) {
        continue;
      }

      // ── 이하 메인(루트) 청크 — 기존 로직 무변경 ──
      // 사고 채널 — 본문과 분리(FR-09/R5: 본문 token 엔 thinking 0).
      const thinking = extractThinking(msg, meta);
      if (thinking !== null) {
        yield { type: "thinking", text: thinking };
      }
      // 도구 호출 IN — model_request 노드의 tool_call_chunk 델타.
      // id/name 은 첫 델타에만, args 는 점진 누적(클라이언트가 머지).
      const toolCalls = extractToolCalls(msg, meta);
      if (toolCalls) {
        for (const tc of toolCalls) {
          // task 위임 시작 → 완료 추적 등록(서브에이전트 탈출 시 마감).
          if (tc.name === "task" && tc.id) {
            taskTrack = trackTaskCompletion(taskTrack, false, {
              id: tc.id,
              name: "task",
              args: tc.args ?? "",
            }).next;
          }
          yield {
            type: "tool_call",
            id: tc.id ?? "",
            name: tc.name ?? "",
            args: tc.args ?? "",
          };
        }
      }
      // 도구 결과 OUT — tools 노드의 tool 메시지.
      const toolResult = extractToolResult(msg);
      if (toolResult) {
        yield {
          type: "tool_result",
          id: "",
          name: toolResult.name,
          result: toolResult.result,
        };
      }
      // (ServerTool 채널 제거 — web_search 가 ClientTool 로 교체되어
      // additional_kwargs.tool_outputs / content annotations 경로는
      // 완전 dead. web_search 는 이제 위 extractToolCalls/extractTool
      // Result 일반 ClientTool 경로로 흐른다 — dartTool 동형. R2 1회
      // 의도적 예외: ServerTool 미사용으로 호출부 영구 dead → 제거.)
      const text = filterChunk(msg, meta);
      if (text !== null) {
        yield { type: "token", text };
      }
    }

    // 스트림 종료 — 큐에 남은 진행 task 일괄 마감(마지막 task(들)는
    // 탈출 후 더는 루트 청크가 없어 큐에 잔류한다 → "에이전트 실행
    // 중"이 영구 미완으로 남는 것 방지). FIFO 순으로 완료 emit.
    for (const t of drainPendingTasks(taskTrack)) {
      yield {
        type: "tool_result",
        id: t.id,
        name: "task",
        result: "에이전트가 작업을 완료했습니다",
      };
    }
  }

  return gen();
}

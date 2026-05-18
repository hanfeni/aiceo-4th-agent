import { createDeepAgent } from "deepagents";
import type { SseEvent } from "@/types";
import { buildHarnessConfig, type HarnessEnv } from "./harness/registry";
import { buildAgentOptions } from "./harness/buildAgentOptions";
import { createModel } from "./harness/model";
import { getSystemPrompt } from "./prompts/systemPrompt";
import {
  filterChunk,
  extractThinking,
  extractToolCalls,
  extractToolResult,
  extractToolOutputs,
} from "./utils/chunkFilter";

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
 * U2 (docs/notes/live-stream-events.md) — graph.stream(input, config) 의
 * streamMode 는 RunnableConfig 키 "messages". 각 part 는 [AIMessageChunk,
 * meta] 2-튜플. chunkFilter 가 본문 텍스트만 추출한다(R5/FR-09).
 */

// 실측(node_modules/@langchain/langgraph pregel index.d.ts:111 + Slice 1
// scripts/probe.mts): 컴파일 그래프의 .stream() 은 **Promise<IterableReadable
// Stream>** 을 반환한다. await 로 풀어야 for await 가 가능하다(await 누락 시
// "stream is not async iterable" 런타임 에러 — 단위 mock 은 async generator
// 라 await 없이도 통과해 이 형태 차이를 못 잡았다, architect AI-5).
type DeepAgentGraph = {
  stream: (
    input: { messages: Array<{ role: string; content: string }> },
    config: {
      configurable: { thread_id: string };
      streamMode: "messages";
    },
  ) => Promise<AsyncIterable<unknown>>;
};

type AgentGlobal = { graph?: Promise<DeepAgentGraph> };

const g = globalThis as typeof globalThis & { __agent?: AgentGlobal };

/**
 * 그래프를 1회 빌드한다. 분기 0줄 단일 호출(AD-1) — 토글 매핑은 전부
 * registry + buildAgentOptions 내부에 격리되어 있다.
 */
function buildGraph(): DeepAgentGraph {
  const env = process.env as unknown as HarnessEnv;
  // HarnessConfig.tools/checkpointer 는 R8 에 따라 느슨한 계약(unknown[]/
  // unknown)이다. deepagents 의 정밀 타입으로의 narrowing 은 이 단일 호출
  // 경계에서만 일어난다(model.ts 의 `as unknown as` 선례와 동일 패턴).
  const options = buildAgentOptions(
    buildHarnessConfig(env),
    createModel(env),
    getSystemPrompt(),
  ) as unknown as Parameters<typeof createDeepAgent>[0];
  return createDeepAgent(options) as unknown as DeepAgentGraph;
}

/**
 * globalThis 에 고정된 그래프 Promise 를 반환한다(메모이즈).
 * 동시 진입 시 Promise 가 이미 박혀 있으므로 buildGraph 는 1회만 실행된다.
 */
function getGraph(): Promise<DeepAgentGraph> {
  if (!g.__agent) g.__agent = {};
  if (!g.__agent.graph) {
    g.__agent.graph = Promise.resolve().then(buildGraph);
  }
  return g.__agent.graph;
}

export interface CreateStreamArgs {
  query: string;
  conversationId: string;
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
}: CreateStreamArgs): Promise<AsyncGenerator<SseEvent>> {
  const graph = await getGraph();

  async function* gen(): AsyncGenerator<SseEvent> {
    // R3 — 현재 turn query 만. 수동 conversationHistory 누적 없음.
    const stream = await graph.stream(
      { messages: [{ role: "user", content: query }] },
      {
        configurable: { thread_id: conversationId },
        streamMode: "messages",
      },
    );

    for await (const part of stream) {
      // U2 — part = [AIMessageChunk(직렬화), meta] 2-튜플.
      const [msg, meta] = part as [unknown, unknown];
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
      // ServerTool(web_search 등) — ClientTool 과 다른 채널(additional_
      // kwargs.tool_outputs). IN(검색어)+OUT(상태)이 한 청크라 둘 다 emit.
      const toolOutputs = extractToolOutputs(msg, meta);
      if (toolOutputs) {
        for (const to of toolOutputs) {
          yield {
            type: "tool_call",
            id: to.id,
            name: to.name,
            args: to.args,
          };
          yield {
            type: "tool_result",
            id: to.id,
            name: to.name,
            result: to.result,
          };
        }
      }
      const text = filterChunk(msg, meta);
      if (text !== null) {
        yield { type: "token", text };
      }
    }
  }

  return gen();
}

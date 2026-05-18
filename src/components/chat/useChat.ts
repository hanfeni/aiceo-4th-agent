"use client";

import { useCallback } from "react";
import { chatStore } from "@/store";
import { parseSseStream } from "@/lib/agent/utils/sseStreamParser";
import type { SseEvent } from "@/types";

/**
 * useChat — `/api/chat` fetch + SSE 파싱 + 스토어 구동 (FR-03/04/06).
 *
 * 이벤트 매핑(PRD §1.8):
 *   thread → setConversationId
 *   token  → appendToLastAssistant
 *   done   → 수신 루프 종료
 *   error  → setError
 *
 * 회귀 가드(TC-20.4/AC-5): 정상·error·throw 어느 경로든 `finally` 에서
 * 반드시 setStreaming(false) + finalizeLastAssistant() 가 호출된다.
 * 누락 시 입력이 영구 잠긴다(UC-20-E1).
 *
 * AD-4(client side): 빈/공백 입력은 fetch 하지 않는다(서버 route 도 거부하나
 * 클라이언트에서 불필요한 요청을 0건으로 만든다 — UC-23).
 *
 * R3: conversationId 는 턴 간 재사용한다. body 에는 현재 query 만 싣고
 * conversationHistory 를 수동 누적하지 않는다(서버 checkpointer 가 thread_id
 * 로 히스토리를 자동 로드 — 중복 누적/컨텍스트 오염 차단).
 */

/** SSE raw 이벤트를 타입 가드로 좁힌다(파서는 unknown 을 yield). */
function asSseEvent(raw: unknown): SseEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const ev = raw as Record<string, unknown>;
  switch (ev.type) {
    case "thread":
      return typeof ev.conversationId === "string"
        ? { type: "thread", conversationId: ev.conversationId }
        : null;
    case "token":
      return typeof ev.text === "string"
        ? { type: "token", text: ev.text }
        : null;
    case "thinking":
      return typeof ev.text === "string"
        ? { type: "thinking", text: ev.text }
        : null;
    case "tool_call":
      return typeof ev.name === "string" || typeof ev.args === "string"
        ? {
            type: "tool_call",
            id: typeof ev.id === "string" ? ev.id : "",
            name: typeof ev.name === "string" ? ev.name : "",
            args: typeof ev.args === "string" ? ev.args : "",
          }
        : null;
    case "tool_result":
      return typeof ev.result === "string"
        ? {
            type: "tool_result",
            id: typeof ev.id === "string" ? ev.id : "",
            name: typeof ev.name === "string" ? ev.name : "tool",
            result: ev.result,
          }
        : null;
    case "done":
      return { type: "done" };
    case "error":
      return {
        type: "error",
        message:
          typeof ev.message === "string" ? ev.message : "알 수 없는 오류",
      };
    default:
      return null;
  }
}

export interface UseChatApi {
  /** 사용자 입력을 전송한다. trim 후 빈 값이면 아무 동작도 하지 않는다. */
  send: (input: string) => Promise<void>;
}

export function useChat(): UseChatApi {
  const send = useCallback(async (input: string): Promise<void> => {
    const query = input.trim();
    // AD-4(client) — 빈/공백 입력은 fetch 하지 않는다(UC-23, TC-23.1).
    if (query.length === 0) return;

    const store = chatStore.getState();
    if (store.isStreaming) return; // 중복 전송 방지(스트리밍 중 잠금)

    // user 메시지 + 빈 assistant 메시지를 먼저 넣고 스트리밍 시작.
    store.setError(null);
    store.addMessage({ role: "user", content: query });
    store.addMessage({ role: "assistant", content: "" });
    store.setStreaming(true);

    try {
      // R3 — body 에는 현재 query 만. conversationId 가 있으면 동봉(턴 재사용).
      const conversationId = chatStore.getState().conversationId;
      const body: { query: string; conversationId?: string } = { query };
      if (conversationId) body.conversationId = conversationId;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      // 비-200(AD-4: Zod/공백 거부 → 400 JSON {error}) 처리.
      if (!res.ok) {
        let message = `요청 실패 (HTTP ${res.status})`;
        try {
          const data = (await res.json()) as { error?: unknown };
          if (typeof data.error === "string") message = data.error;
        } catch {
          /* JSON 아님 — 기본 메시지 유지 */
        }
        chatStore.getState().setError(message);
        return;
      }

      // 정상 흐름: SSE 파싱 → 스토어 구동.
      for await (const raw of parseSseStream(res.body)) {
        const ev = asSseEvent(raw);
        if (!ev) continue;
        const s = chatStore.getState();
        if (ev.type === "thread") {
          s.setConversationId(ev.conversationId);
        } else if (ev.type === "token") {
          s.appendToLastAssistant(ev.text);
        } else if (ev.type === "thinking") {
          s.appendThinkingToLastAssistant(ev.text);
        } else if (ev.type === "tool_call") {
          s.appendToolCallToLastAssistant({
            id: ev.id,
            name: ev.name,
            args: ev.args,
          });
        } else if (ev.type === "tool_result") {
          s.setToolResultOnLastAssistant(ev.name, ev.result, ev.id);
        } else if (ev.type === "error") {
          s.setError(ev.message);
          break;
        } else if (ev.type === "done") {
          break;
        }
      }
    } catch (err) {
      // fetch/스트림 throw(네트워크 단절 등) → 에러 표면화(터미널 아님).
      const message = err instanceof Error ? err.message : String(err);
      chatStore.getState().setError(message);
    } finally {
      // TC-20.4 — 어떤 경로든 입력 잠금 해제 + finalize(누락 시 입력 고착).
      const s = chatStore.getState();
      s.setStreaming(false);
      s.finalizeLastAssistant();
    }
  }, []);

  return { send };
}

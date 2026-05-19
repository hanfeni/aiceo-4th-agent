"use client";

import { useCallback } from "react";
import { chatStore } from "@/store";
import { parseSseStream } from "@/lib/agent/utils/sseStreamParser";
import { parseCitationText } from "@/lib/agent/utils/chunkFilter";
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
  /**
   * 사용자 입력을 전송한다. trim 후 빈 값이면(첨부도 없으면) 무동작.
   * files: 첨부. 이미지는 base64 data URL 로 body.images, 텍스트/PDF/
   * DOCX 는 추출 텍스트를 query 에 합쳐 보낸다(백엔드 무변경).
   */
  send: (input: string, files?: File[]) => Promise<void>;
}

export function useChat(): UseChatApi {
  const send = useCallback(
    async (input: string, files?: File[]): Promise<void> => {
    const trimmed = input.trim();
    const hasFiles = !!files && files.length > 0;
    // AD-4(client) — 빈 입력 + 첨부 없으면 무동작. 첨부만 있으면 허용.
    if (trimmed.length === 0 && !hasFiles) return;

    const store = chatStore.getState();
    if (store.isStreaming) return; // 중복 전송 방지(스트리밍 중 잠금)

    // 첨부 처리(메시지 추가 전 — E3: 추출 실패 시 빈 버블이 남지 않게).
    // extractText/prepareAttachments 는 동적 import(prod 번들 제외 — D1).
    let query = trimmed;
    let images: string[] | undefined;
    const attachMeta: Array<{
      name: string;
      kind: "image" | "text";
      dataUrl?: string;
    }> = [];
    if (hasFiles) {
      try {
        const { classifyAttachment, fileToDataUrl } = await import(
          "@/lib/files/prepareAttachments"
        );
        const imgUrls: string[] = [];
        const extracted: string[] = [];
        for (const f of files!) {
          const kind = classifyAttachment(f);
          if (kind === "image") {
            const dataUrl = await fileToDataUrl(f);
            imgUrls.push(dataUrl);
            // 변환한 base64 를 썸네일용으로 재사용(추가 비용 0 — I1).
            attachMeta.push({ name: f.name, kind: "image", dataUrl });
          } else if (kind === "text") {
            const { extractTextFromFile } = await import(
              "@/lib/files/extractText"
            );
            const text = await extractTextFromFile(f);
            extracted.push(`--- ${f.name} ---\n${text}`);
            attachMeta.push({ name: f.name, kind: "text" });
          } else {
            throw new Error(`지원하지 않는 첨부: ${f.name}`);
          }
        }
        if (extracted.length > 0) {
          query = [query, ...extracted].filter((s) => s.length > 0).join("\n\n");
        }
        if (imgUrls.length > 0) images = imgUrls;
      } catch (e) {
        // E3 — 추출/변환 실패는 사용자에게 표면화하고 전송 중단(좀비 0).
        store.setError(
          e instanceof Error ? e.message : "첨부 처리에 실패했습니다.",
        );
        return;
      }
    }

    // user 메시지 + 빈 assistant 메시지를 먼저 넣고 스트리밍 시작.
    store.setError(null);
    store.addMessage({
      role: "user",
      content: trimmed,
      ...(attachMeta.length > 0 ? { attachments: attachMeta } : {}),
    });
    store.addMessage({ role: "assistant", content: "" });
    store.setStreaming(true);

    try {
      // R3 — body 에는 현재 turn 입력만. conversationId 있으면 동봉(턴 재사용).
      // FR-14/AD-15 — store.model 이 설정돼 있으면 model 동봉(빈 문자열은
      // 서버 env 경로로 위임 — 미동봉). 검증은 서버 zod enum 이 SSOT(C5).
      const { conversationId, model } = chatStore.getState();
      const body: {
        query: string;
        conversationId?: string;
        model?: string;
        images?: string[];
      } = { query };
      if (conversationId) body.conversationId = conversationId;
      if (model) body.model = model;
      if (images) body.images = images;

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
          // Slice M — 답변 본문 출력 중. 사고 패널 실시간 표시 숨김.
          s.setLastStreamEvent("token");
          s.appendToLastAssistant(ev.text);
        } else if (ev.type === "thinking") {
          // 출력 멈추고 사고 재개 → 사고 패널 다시 표시(동적).
          s.setLastStreamEvent("thinking");
          s.appendThinkingToLastAssistant(ev.text);
        } else if (ev.type === "tool_call") {
          s.setLastStreamEvent("tool");
          s.appendToolCallToLastAssistant({
            id: ev.id,
            name: ev.name,
            args: ev.args,
          });
        } else if (ev.type === "tool_result") {
          s.setLastStreamEvent("tool");
          s.setToolResultOnLastAssistant(ev.name, ev.result, ev.id);
          // web_search 결과 텍스트는 답변 하단 References 패널 데이터도
          // 겸한다(디자인 SourcesPanel). 사고패널 OUT(위)은 그대로 두고
          // 출처를 구조화해 추가 적재 — 출처 텍스트가 아니면 null → 무시.
          if (ev.name === "web_search") {
            const sources = parseCitationText(ev.result);
            if (sources) s.setSourcesOnLastAssistant(sources);
          }
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
      // Slice M — 스트림 종료(done/error/throw 모든 경로) → 게이트
      // 해제(null). 완료 후엔 사고 패널이 토글 열람 모드로(실시간 X).
      s.setLastStreamEvent(null);
      s.finalizeLastAssistant();
    }
  }, []);

  return { send };
}

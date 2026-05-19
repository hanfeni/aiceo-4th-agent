export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createModel } from "@/lib/agent/harness/model";
import { ALLOWED_MODELS } from "@/lib/agent/harness/models";
import {
  collectDartContext,
  buildDartAnalysisQuery,
  PERSPECTIVES,
} from "@/lib/dart/analyze-pipeline";
import { getFullSystemPrompt, getTaskInstruction } from "@/lib/dart/prompts";
import type { SseEvent } from "@/types";

/**
 * POST /api/dart/analyze — DART 8관점 펀더멘털 분석 (고정 흐름).
 *
 * medigate `ai-analysis/route.ts` 동형의 **고정 파이프라인** — LLM
 * 자율위임 0. deepagents 그래프를 타지 않는다(전용 라우트, 하네스
 * 요소 아님 — architect: R2 적용 외, 챗 하네스 불변).
 *
 * R7 — `@/lib/dart` 가 인메모리 ratelimit·jszip·fetch 의존 → edge
 *      불가. 최상단 runtime="nodejs"/dynamic="force-dynamic"(위 2줄,
 *      어떤 import 보다 먼저 — chat route 동형).
 * AD-4 동형 — zod 실패/빈 corpName → HTTP 400 JSON(SSE 아님).
 * AD-5(a) 동형 — encodeSse 단일 data 라인(JSON.stringify, raw 개행
 *      없음 → 프레임 위조 불가). cancel() 이 LLM 스트림 실제 중단.
 *
 * R5 책임 이전 (architect 핵심): 그래프를 안 타므로 chunkFilter
 * (langgraph_node 전제)를 못 쓴다. 라우트가 직접 AIMessageChunk
 * content 를 처리하되 chunkFilter 의 검증된 패턴을 동등 구현 —
 * content=string 이면 그대로, 배열이면 type==="text" 만, thinking/
 * reasoning/redacted_thinking 블록은 본문 token 에 보간 0(FR-09/R5).
 * gpt-5.4-mini 는 reasoning 거의 없으나(Slice 1 실측) 방어적 처리.
 */

// 고정흐름 본문 계약 — corpName + perspective 8종(D5/D10 SSOT).
// medigate 의 corpCode/analysisType/contextItems/annualYears/
// thinkingLevel 등은 폐기(고정흐름 — 데이터 범위는 코드 고정).
const bodySchema = z.object({
  corpName: z.string().max(120),
  perspective: z.enum(PERSPECTIVES),
  conversationId: z.string().optional(),
  model: z.enum(ALLOWED_MODELS).optional(),
});

/** AD-4 — 검증 실패는 SSE 아닌 JSON 400(chat route 동형). */
function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** AD-5(a) — SSE 한 프레임(chat route encodeSse 동형). */
function encodeSse(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

const NON_BODY_BLOCK_TYPES = new Set([
  "thinking",
  "reasoning",
  "redacted_thinking",
]);

/**
 * AIMessageChunk content → 본문 텍스트 (R5 — chunkFilter
 * extractTextFromBlocks 동등 로직, deepagents meta 비의존).
 * string 이면 그대로, 배열이면 type==="text" 만, reasoning 폐기.
 * 라이브 인스턴스는 msg.content, 직렬화형은 kwargs.content 방어.
 */
function chunkText(msg: unknown): string {
  const m = msg as { content?: unknown; kwargs?: { content?: unknown } };
  const content = m?.content ?? m?.kwargs?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: unknown; text?: unknown };
    const type = typeof b.type === "string" ? b.type : "";
    if (NON_BODY_BLOCK_TYPES.has(type)) continue; // reasoning 보간 0
    if (type === "text" && typeof b.text === "string") out += b.text;
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("요청 본문을 JSON 으로 파싱할 수 없습니다.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(
      "요청 본문이 올바르지 않습니다. { corpName: string, perspective: 8관점 enum } 형식이어야 합니다.",
    );
  }

  const corpNameInput = parsed.data.corpName.trim();
  if (corpNameInput.length === 0) {
    return badRequest("corpName 은 비어 있거나 공백만으로 구성될 수 없습니다.");
  }

  const { perspective } = parsed.data;
  const conversationId =
    parsed.data.conversationId ?? crypto.randomUUID();

  // 진행 중 LLM 스트림 핸들 (cancel() 이 .return() 으로 실제 중단).
  let llmStream:
    | AsyncGenerator<unknown>
    | { return?: (v?: unknown) => unknown }
    | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeSse({ type: "thread", conversationId }));
      try {
        // ── Step 1: DART 데이터 수집 (고정 — LLM 위임 0) ──
        controller.enqueue(
          encodeSse({
            type: "tool_call",
            id: "dart-collect",
            name: "dart_company_data",
            args: JSON.stringify({ corpName: corpNameInput, perspective }),
          }),
        );
        const ctx = await collectDartContext(corpNameInput, perspective);
        if (!ctx.ok) {
          // 식별 실패·비상장 공시 없음 등 — 안내문을 본문으로 전달.
          controller.enqueue(encodeSse({ type: "token", text: ctx.text }));
          controller.enqueue(encodeSse({ type: "done" }));
          return;
        }
        controller.enqueue(
          encodeSse({
            type: "tool_result",
            id: "dart-collect",
            name: "dart_company_data",
            result: `${ctx.corpName} 데이터 수집 완료 (corp_code=${ctx.corpCode})`,
          }),
        );

        // ── Step 2: OpenAI 8관점 분석 스트리밍 ──
        const model = createModel(
          process.env as Record<string, string | undefined>,
          parsed.data.model,
        );
        const system = getFullSystemPrompt(perspective);
        const human = buildDartAnalysisQuery(
          ctx.corpName,
          perspective,
          ctx.text,
          getTaskInstruction(perspective),
        );

        const s = await model.stream([
          new SystemMessage(system),
          new HumanMessage(human),
        ]);
        llmStream = s as unknown as AsyncGenerator<unknown>;
        for await (const chunk of s) {
          const text = chunkText(chunk);
          if (text) controller.enqueue(encodeSse({ type: "token", text }));
        }
        controller.enqueue(encodeSse({ type: "done" }));
      } catch (err) {
        // 보안(chat route 동형): SDK 에러 원문 비노출, 일반화 메시지만.
        console.error("[/api/dart/analyze] stream error:", err);
        controller.enqueue(
          encodeSse({
            type: "error",
            message:
              "분석 생성 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          }),
        );
      } finally {
        controller.close();
      }
    },
    async cancel() {
      // client disconnect → LLM 스트림 실제 중단(좀비 0 — chat route 동형).
      await (
        llmStream as { return?: (v?: unknown) => unknown } | undefined
      )?.return?.(undefined);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getCheckpointer, type CheckpointerEnv } from "@/lib/agent/harness/checkpointer";
import { getLatestCheckpointMessages } from "@/lib/conversations/list";
import { replayMessages } from "@/lib/conversations/replay";

/**
 * GET /api/conversations/[id] — 단건 대화 복원 (Slice 3 / Plan Critic C2·C5).
 *
 * [id] = thread_id(=conversationId). 해당 thread 의 최신 checkpoint messages
 * 를 꺼내(getLatestCheckpointMessages) ChatMessage[] 로 재생(replayMessages).
 * C5(전체 복원): replay 가 본문 + 사고 패널(reasoning/tool)을 기존 스트리밍
 * 추출기·리듀서로 재구성한다(신규 파싱 0).
 *
 * 응답 계약: { id, messages: ChatMessage[] }. 클라이언트는 messages 를
 * store.loadConversation(id, messages) 로 원자 적재(Slice 4 / C1).
 *
 * C10 — 없는 thread/테이블 부재 → messages:[] (200, 크래시 0).
 * R7 — runtime nodejs. AD-5(b) — id 는 thread_id 조회 파라미터로만 쓰이고
 *      파일 경로에 보간되지 않는다(better-sqlite3 prepared statement 바인딩
 *      — SQL injection·path traversal 0).
 */

function isMemoryBackend(env: CheckpointerEnv): boolean {
  return (env.HARNESS_CHECKPOINTER ?? "sqlite").trim().toLowerCase() === "memory";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  if (typeof id !== "string" || id.trim().length === 0) {
    return Response.json({ error: "대화 ID 가 올바르지 않습니다." }, { status: 400 });
  }

  const env = process.env as unknown as CheckpointerEnv;

  // :memory: 는 영속이 없어 복원 대상 자체가 없을 수 있다(빈 결과 200).
  if (isMemoryBackend(env)) {
    return Response.json({ id, messages: [] });
  }

  try {
    const saver = getCheckpointer(env); // 채팅과 공유 싱글톤(C2)
    const raw = getLatestCheckpointMessages(saver.db, id);
    const messages = replayMessages(raw); // 본문 + 사고 패널 전체 복원(C5)
    return Response.json({ id, messages });
  } catch (err) {
    console.error("[/api/conversations/[id]] restore error:", err);
    return Response.json(
      { id, messages: [], error: "대화를 복원하지 못했습니다." },
      { status: 200 },
    );
  }
}

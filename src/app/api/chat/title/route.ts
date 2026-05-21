export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { generateTitle } from "@/lib/agent/generateTitle";

/**
 * POST /api/chat/title — 첫 질의로 세션 제목 생성 (gpt-5.4-nano).
 *
 * 메인 챗 SSE(/api/chat)와 완전 별도. 클라이언트가 새 세션의 첫 질의를
 * 보낼 때 이 라우트를 병행 호출해 받은 제목으로 헤더 "새 대화" 텍스트를
 * 교체한다(store.conversationTitle).
 *
 * R7 — OpenAI fetch(네트워크)뿐이라 edge 도 가능하나, 프로젝트 라우트
 *      관례(nodejs)와 일관 유지. 입력은 query 1개(zod 검증).
 *
 * 실패 철학: generateTitle 가 키 없음·API 오류를 null 로 흡수한다.
 *      null 이면 200 + {title:null} 로 응답 → 클라이언트가 교체를
 *      건너뛰어 "새 대화" 유지(제목 실패가 챗을 막지 않음).
 */

const bodySchema = z.object({
  query: z.string().min(1).max(8000),
});

export async function POST(req: Request): Promise<Response> {
  let parsed: { query: string };
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const title = await generateTitle(parsed.query);
    return Response.json({ title });
  } catch (err) {
    // 보안(route.ts 선례): 상세는 서버 로그만. 제목 실패는 치명적이지
    // 않으므로 200 + null 로 응답(클라이언트가 "새 대화" 유지).
    console.error("[/api/chat/title] error:", err);
    return Response.json({ title: null });
  }
}

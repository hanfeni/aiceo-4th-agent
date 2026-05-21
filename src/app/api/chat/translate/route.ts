export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { translateThinking } from "@/lib/agent/translateThinking";

/**
 * POST /api/chat/translate — 사고 과정 텍스트 일괄 번역 (gpt-5.4-nano).
 *
 * 사고 패널(히스토리 모드)의 영어 reasoning 을 한 번에 한국어로 번역한다.
 * 입력 texts[] 와 같은 순서·개수의 translations[] 를 반환한다.
 *
 * R7 — OpenAI fetch(네트워크)뿐이라 edge 도 가능하나 프로젝트 관례(nodejs).
 *
 * 실패 철학: translateThinking 가 키 없음·오류·형식불일치를 null 로 흡수.
 *      null 이면 200 + {translations:null} → 클라이언트가 번역을 포기하고
 *      원문을 유지한다(번역 실패가 패널을 깨뜨리지 않음).
 */

const bodySchema = z.object({
  texts: z.array(z.string()).min(1).max(50),
});

export async function POST(req: Request): Promise<Response> {
  let parsed: { texts: string[] };
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const translations = await translateThinking(parsed.texts);
    return Response.json({ translations });
  } catch (err) {
    console.error("[/api/chat/translate] error:", err);
    return Response.json({ translations: null });
  }
}

/**
 * Nori 형태소 분석 — POST /api/search-lab/analyze
 *
 * 텍스트를 OpenSearch _analyze API 로 분석해 mixed/discrete/none
 * 세 가지 decompound_mode 결과를 한 번에 반환.
 * 검색 실습 IndexDocsModal 의 "Nori 토큰" 탭이 호출.
 * R7 nodejs (OpenSearch 클라이언트 node 전용).
 */

import { getSearchClient, toNoriMode, type DecompoundMode } from "@/lib/searchlab/client";

export const runtime = "nodejs";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 하나의 decompound_mode 로 텍스트를 분석해 토큰 문자열 배열 반환 */
async function analyzeWithMode(
  text: string,
  mode: DecompoundMode,
): Promise<string[]> {
  const client = getSearchClient();
  // SDK 타입이 NoriDecompoundMode 유니온으로 좁혀져 string 직접 할당 불가
  // → transport.request 로 raw HTTP 호출.
  const res = await client.transport.request({
    method: "POST",
    path: "/_analyze",
    body: {
      tokenizer: { type: "nori_tokenizer", decompound_mode: toNoriMode(mode) },
      filter: ["lowercase", "nori_part_of_speech"],
      text,
    },
  });
  const tokens = ((res.body as { tokens?: Array<{ token: string }> }).tokens ?? []);
  return tokens.map((t) => t.token);
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON 본문이 아닙니다." }, 400);
  }

  const text = typeof (body as { text?: unknown }).text === "string"
    ? ((body as { text: string }).text).slice(0, 2000)
    : null;
  if (!text || text.trim().length === 0) {
    return json({ error: "text 필드가 필요합니다." }, 400);
  }

  try {
    const modes = ["mixed", "discrete", "none"] as const;
    const [mixed, discrete, none] = await Promise.all(
      modes.map((mode) => analyzeWithMode(text, mode)),
    );
    return json({ mixed, discrete, none }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ECONNREFUSED|connect/i.test(msg)) {
      return json(
        { error: "OpenSearch 에 연결할 수 없습니다. Docker 실행 여부를 확인하세요." },
        503,
      );
    }
    return json({ error: "형태소 분석 실패", detail: msg.slice(0, 300) }, 500);
  }
}

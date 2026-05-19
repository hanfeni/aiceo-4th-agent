/**
 * 실습 인덱스 관리 — GET(목록) / DELETE(삭제).
 *
 * 보안: admin.ts 가 searchlab- prefix 만 다룬다(시스템/타 인덱스
 * 절대 노출·삭제 금지). DELETE 는 prefix 아닌 인덱스명 오면 403.
 * R7 nodejs (OpenSearch 클라이언트 node 전용).
 */

import { z } from "zod";
import {
  listSearchlabIndices,
  deleteSearchlabIndex,
  isSearchlabIndex,
} from "@/lib/searchlab/admin";

export const runtime = "nodejs";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function osDown(msg: string): boolean {
  return /ECONNREFUSED|connect|getaddrinfo/i.test(msg);
}

export async function GET(): Promise<Response> {
  try {
    const indices = await listSearchlabIndices();
    return json({ indices }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (osDown(msg)) {
      return json(
        { error: "OpenSearch 미기동 — ./run-opensearch.sh 먼저 실행", indices: [] },
        503,
      );
    }
    return json({ error: "인덱스 목록 조회 실패", detail: msg.slice(0, 300) }, 500);
  }
}

const deleteSchema = z.object({ index: z.string().min(1).max(200) });

export async function DELETE(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "JSON 본문이 아닙니다." }, 400);
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "요청 형식 오류" }, 400);
  }
  const { index } = parsed.data;
  // 방어선 1: prefix 외 즉시 403 (admin.ts 도 재검증 — 이중 방어).
  if (!isSearchlabIndex(index)) {
    return json(
      { error: `삭제 거부: ${index} 는 실습 인덱스(searchlab-)가 아닙니다.` },
      403,
    );
  }
  try {
    const r = await deleteSearchlabIndex(index);
    return json({ index, deleted: r.deleted }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (osDown(msg)) {
      return json({ error: "OpenSearch 미기동" }, 503);
    }
    return json({ error: "삭제 실패", detail: msg.slice(0, 300) }, 500);
  }
}

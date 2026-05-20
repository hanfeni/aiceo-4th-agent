/**
 * 로컬 CSV 업로드 적재 API — POST /api/sql-lab/upload (SSE).
 *
 * 고정 5개 도메인은 GitHub raw CSV 를 받지만, 이 라우트는 사용자가
 * 브라우저에서 고른 로컬 CSV 파일을 multipart 로 받아 동적 "custom"
 * 슬롯에 적재한다(loadCustomCsv). 적재 완료 시 동적 레지스트리에
 * 등록되어 데이터 적재 현황·챗 드롭다운에 custom 도메인이 등장한다.
 *
 * 보안:
 *  - 확장자 .csv 만 허용(임의 바이너리 차단).
 *  - 파일 크기 상한(MAX_UPLOAD_CSV_BYTES — 강의장 메모리 보호).
 *  - 테이블/DB 식별자는 placeholder(sqllab_custom / custom.db)로 고정
 *    — 사용자 입력(파일명·라벨)은 식별자에 절대 끼지 않는다.
 * R7 runtime=nodejs (better-sqlite3 네이티브).
 */

import { loadCustomCsv } from "@/lib/sqllab/load";
import { MAX_UPLOAD_CSV_BYTES } from "@/lib/files/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeSse(ev: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`);
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  // multipart/form-data — file(필수) + label(선택) + limit(선택).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("multipart/form-data 본문이 아닙니다.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("file 필드(CSV)가 없습니다.", 400);
  }
  // 확장자 검증(.csv 만). 대소문자 무시.
  if (!/\.csv$/i.test(file.name)) {
    return jsonError(".csv 확장자 파일만 업로드할 수 있습니다.", 400);
  }
  if (file.size > MAX_UPLOAD_CSV_BYTES) {
    return jsonError(
      `파일이 너무 큽니다(최대 ${Math.floor(
        MAX_UPLOAD_CSV_BYTES / 1024 / 1024,
      )}MB).`,
      413,
    );
  }
  if (file.size === 0) {
    return jsonError("빈 파일입니다.", 400);
  }

  const labelRaw = form.get("label");
  const label = typeof labelRaw === "string" ? labelRaw.slice(0, 60) : "";
  const limitRaw = form.get("limit");
  let limit: number | undefined;
  if (typeof limitRaw === "string" && limitRaw.trim()) {
    const n = Number(limitRaw);
    if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), 50000);
  }

  // 본문 디코드(UTF-8). BOM 은 parseCsv 가 처리한다.
  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return jsonError("파일을 읽을 수 없습니다.", 400);
  }

  const sourceFile = file.name;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of loadCustomCsv(
          csvText,
          sourceFile,
          label,
          limit,
        )) {
          controller.enqueue(encodeSse(ev));
        }
      } catch (e) {
        controller.enqueue(
          encodeSse({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        controller.close();
      }
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

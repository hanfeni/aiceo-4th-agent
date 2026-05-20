/**
 * 로컬 jsonl 업로드 색인 API — POST /api/search-lab/upload (SSE).
 *
 * 고정 5개 도메인은 GitHub raw jsonl 을 받지만, 이 라우트는 사용자가
 * 브라우저에서 고른 로컬 jsonl 파일을 multipart 로 받아 동적 "custom"
 * 슬롯에 색인한다. 업로드 본문을 직접 파싱(line split → JSON.parse)해
 * runIndexing 에 docs 로 주입(fetchCorpus 우회) → 색인 완료 시 동적
 * 레지스트리에 등록되어 검색 실습 도메인 목록·챗 인덱스검색 드롭다운에
 * custom 도메인이 등장한다. SQL 메뉴(sql-lab/upload)의 검색 버전.
 *
 * 제목 보강: title 이 빈 doc(파일 업로드는 클라가 title="" 로 보냄,
 * jsonl 도 title 누락 가능)은 색인 전 gpt-5.4-nano 로 본문에서 제목을
 * 추출해 채운다(extractTitle). 검색 BM25 title 가중(^3~^6)·임베딩 입력
 * 품질 향상. 추출 실패는 doc_id(파일명) 폴백 — 색인은 끊기지 않는다.
 *
 * 보안:
 *  - 확장자 .jsonl 만 허용(임의 바이너리 차단).
 *  - 파일 크기 상한(MAX_UPLOAD_CSV_BYTES — 강의장 메모리 보호. CSV 와
 *    동일 상한 재사용 — 별도 상수 불필요).
 *  - 인덱스 식별자는 searchlab-custom 으로 고정(domains.ts) — 사용자
 *    입력(파일명·라벨)은 식별자에 절대 끼지 않는다(path traversal·인덱스
 *    위조 차단).
 * R7 runtime=nodejs (OpenSearch 클라이언트 node 전용).
 */

import { runIndexing } from "@/lib/searchlab/index-run";
import {
  CUSTOM_SEARCH_DOMAIN,
  type CorpusDoc,
} from "@/lib/searchlab/domains";
import { registerCustomSearchDomain } from "@/lib/searchlab/dynamicDomains";
import { DECOMPOUND_MODES, EMBED_MODELS } from "@/lib/searchlab/client";
import { extractTitle } from "@/lib/searchlab/extractTitle";
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

/**
 * jsonl 본문을 CorpusDoc[] 로 파싱(line split → JSON.parse). 외부
 * 의존 없이 직접 처리(domains.fetchCorpus 와 동일 전략 — over-engineering
 * 회피). doc_id 누락 시 라인 번호로 보정(검색 hit 키 유일성 보장).
 * title/body 누락은 빈 문자열(색인은 되되 매칭 약함 — 학생이 데이터
 * 품질을 체감). 잘못된 JSON 라인은 throw(원인 명확).
 */
function parseJsonl(text: string): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(
        `${i + 1}번째 줄이 올바른 JSON 이 아닙니다 — jsonl(한 줄 = 한 JSON 문서) 형식인지 확인하세요.`,
      );
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new Error(`${i + 1}번째 줄이 JSON 객체가 아닙니다.`);
    }
    docs.push({
      doc_id: String(obj.doc_id ?? `doc-${i + 1}`),
      title: String(obj.title ?? ""),
      body: String(obj.body ?? ""),
      ...obj,
    });
  }
  return docs;
}

export async function POST(req: Request): Promise<Response> {
  // multipart/form-data — file(필수) + label/limit/색인파라미터(선택).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("multipart/form-data 본문이 아닙니다.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("file 필드(jsonl)가 없습니다.", 400);
  }
  // 확장자 검증(.jsonl 만). 대소문자 무시.
  if (!/\.jsonl$/i.test(file.name)) {
    return jsonError(".jsonl 확장자 파일만 업로드할 수 있습니다.", 400);
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
    if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), 2000);
  }

  // 색인 파라미터(IndexLabView 와 동일 — 미지정 = 기존 기본값).
  // 검증: enum/범위 밖이면 무시(undefined → runIndexing 디폴트).
  const decompoundRaw = form.get("decompoundMode");
  const decompoundMode =
    typeof decompoundRaw === "string" &&
    (DECOMPOUND_MODES as readonly string[]).includes(decompoundRaw)
      ? (decompoundRaw as (typeof DECOMPOUND_MODES)[number])
      : undefined;

  const embedRaw = form.get("embedModel");
  const embedModel =
    typeof embedRaw === "string" && embedRaw in EMBED_MODELS
      ? (embedRaw as keyof typeof EMBED_MODELS)
      : undefined;

  const csNum = Number(form.get("chunkSize"));
  const chunkSize =
    Number.isFinite(csNum) && csNum >= 0 && csNum <= 5000
      ? Math.floor(csNum)
      : undefined;
  const coNum = Number(form.get("chunkOverlap"));
  const chunkOverlap =
    Number.isFinite(coNum) && coNum >= 0 && coNum <= 1000
      ? Math.floor(coNum)
      : undefined;

  // 본문 디코드(UTF-8) → jsonl 파싱.
  let docs: CorpusDoc[];
  try {
    const text = await file.text();
    docs = parseJsonl(text);
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "파일을 읽을 수 없습니다.",
      400,
    );
  }
  if (docs.length === 0) {
    return jsonError("jsonl 에 문서가 없습니다.", 400);
  }

  const sourceFile = file.name;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let done = false;
      try {
        // 제목 보강: title 이 빈 doc 은 gpt-5.4-nano 로 본문에서 추출.
        // 실패(키 없음·API 오류·빈 응답)는 doc_id(=파일명) 로 폴백 —
        // 색인은 끊기지 않는다(사용자 결정). 클라가 파일 업로드 시
        // title="" 로 보내므로 여기서 채워진다.
        const needTitle = docs.filter((d) => !d.title?.trim());
        if (needTitle.length > 0) {
          controller.enqueue(
            encodeSse({
              type: "infra",
              text: `제목 추출 중 (gpt-5.4-nano, ${needTitle.length}건)…`,
            }),
          );
          for (const d of needTitle) {
            const extracted = await extractTitle(d.body);
            d.title = extracted ?? d.doc_id;
          }
        }
        for await (const ev of runIndexing({
          domain: CUSTOM_SEARCH_DOMAIN,
          docs,
          limit,
          decompoundMode,
          embedModel,
          chunkSize,
          ...(chunkSize && chunkSize > 0 ? { chunkOverlap } : {}),
        })) {
          if (ev.type === "done") done = true;
          controller.enqueue(encodeSse(ev));
        }
        // 색인 성공 시에만 레지스트리 등록(부분 실패 시 stale 방지).
        if (done) {
          registerCustomSearchDomain({
            label: label.trim() || sourceFile,
            sourceFile,
          });
          controller.enqueue(
            encodeSse({ type: "registered", label: label.trim() || sourceFile }),
          );
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

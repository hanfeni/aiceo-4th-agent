/**
 * sseStreamParser — 클라이언트측 SSE 파서 (FR-01 / AC-10).
 *
 * fetch 응답 body(ReadableStream)를 읽어 SSE 이벤트 경계("\n\n")로 분할하고,
 * 각 블록의 `data:` 라인을 JSON 파싱해 순서대로 yield 한다.
 *
 * 견고성 요구(TC-25.1~25.7):
 * - 정상 단일/멀티 이벤트(한 read 에 \n\n 다수) 순서 보존.
 * - 이벤트 경계 중간 절단 → 다음 read 와 결합(버퍼링).
 * - 빈 body / body=null → 0 이벤트, 크래시 없음.
 * - JSON 파싱 실패 라인은 graceful skip, 후속 이벤트 계속(throw 금지).
 * - 스트림 중단(부분 데이터 후 종료) → 버퍼 잔여 처리, 크래시 0.
 *
 * src/types 를 import 하지 않는다(Slice 2 와 병렬 — 결합 회피). 파싱된 raw
 * 객체를 unknown 으로 yield 한다. route/useChat(후속 슬라이스)가 타이핑한다.
 */

/** 파싱된 SSE 이벤트의 최소 형태(soft shape — 호출부에서 좁힌다). */
export interface ParsedSseEvent {
  type?: string;
  [key: string]: unknown;
}

/** "data:" 한 줄을 파싱해 객체를 반환. 실패 시 null(skip). */
function parseDataLine(line: string): ParsedSseEvent | null {
  // "data:" 접두 제거(공백 변형 허용: "data: " / "data:").
  const payload = line.slice(5).trimStart();
  if (payload.length === 0) return null;
  try {
    return JSON.parse(payload) as ParsedSseEvent;
  } catch {
    // JSON 파싱 실패 → graceful skip (throw 금지, TC-25.4).
    return null;
  }
}

/** SSE 블록(이벤트) 1개에서 data 라인들을 파싱해 순서대로 방출. */
function* parseBlock(block: string): Generator<ParsedSseEvent> {
  // CRLF 정규화 후 줄 단위 처리.
  for (const rawLine of block.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0 || line.startsWith(":")) continue; // 빈 줄/주석 skip
    if (line.startsWith("data:")) {
      const ev = parseDataLine(line);
      if (ev !== null) yield ev;
    }
    // event:/id:/retry: 등 다른 SSE 필드는 본 계약상 사용 안 함(무시).
  }
}

/**
 * SSE 스트림을 파싱해 이벤트를 순서대로 yield 하는 async generator.
 *
 * @param body fetch Response.body (ReadableStream) 또는 null.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array> | null | undefined,
): AsyncGenerator<ParsedSseEvent> {
  if (!body) return; // body 없음 → 0 이벤트(TC-25.3).

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        // CRLF 경계도 처리하기 위해 정규화 후 "\n\n" 으로 분할.
        buffer = buffer.replace(/\r\n/g, "\n");
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          yield* parseBlock(block);
        }
      }
    }
    // 스트림 종료: 디코더 flush + 버퍼 잔여 처리(trailing \n\n 없는 마지막
    // 이벤트 / 스트림 중단 — TC-25.7).
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      yield* parseBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

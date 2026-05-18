import { describe, it, expect } from "vitest";
import { parseSseStream } from "@/lib/agent/utils/sseStreamParser";

// sseStreamParser 단위 테스트 (LLM 비의존, 순수 파서 — FR-01/AC-10).
// 매핑: TC-25.1~25.7 / FR-01 / AC-10
// SSE: response body reader → "\n\n" 경계 분할 → "data:" 라인 JSON 파싱.
// 처리: 정상 청크 / 불완전 버퍼링 / 빈 body / JSON 실패 skip / 멀티 이벤트 /
//       thread 이벤트 / 스트림 중단(버퍼 잔여).

const enc = new TextEncoder();

/** Uint8Array 청크 배열을 ReadableStream 으로 감싸는 헬퍼. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const ev of parseSseStream(stream)) out.push(ev);
  return out;
}

describe("parseSseStream — 클라이언트 SSE 파서 (FR-01/AC-10)", () => {
  // TC-25.1 — 정상 단일 이벤트
  it("TC-25.1: 정상 단일 SSE token 이벤트를 파싱한다", async () => {
    const events = await collect(
      streamOf([`data: ${JSON.stringify({ type: "token", value: "안녕" })}\n\n`]),
    );
    expect(events).toEqual([{ type: "token", value: "안녕" }]);
  });

  // TC-25.6 — thread 이벤트
  it("TC-25.6: thread 이벤트({type:'thread',conversationId})를 파싱한다", async () => {
    const events = await collect(
      streamOf([`data: ${JSON.stringify({ type: "thread", conversationId: "c-1" })}\n\n`]),
    );
    expect(events).toEqual([{ type: "thread", conversationId: "c-1" }]);
  });

  // done 이벤트
  it("done 이벤트({type:'done'})를 파싱한다", async () => {
    const events = await collect(
      streamOf([`data: ${JSON.stringify({ type: "done" })}\n\n`]),
    );
    expect(events).toEqual([{ type: "done" }]);
  });

  // TC-25.2 — 불완전 청크 버퍼링
  it("TC-25.2: 이벤트 경계 중간 절단 → 다음 청크와 결합해 파싱(버퍼링)", async () => {
    const full = `data: ${JSON.stringify({ type: "token", value: "버퍼" })}\n\n`;
    const mid = Math.floor(full.length / 2);
    const events = await collect(streamOf([full.slice(0, mid), full.slice(mid)]));
    expect(events).toEqual([{ type: "token", value: "버퍼" }]);
  });

  it("TC-25.2: data 라인이 여러 read 에 걸쳐 와도 결합 후 1회 파싱", async () => {
    const events = await collect(
      streamOf([`data: {"type":"to`, `ken","value":"X"}`, `\n\n`]),
    );
    expect(events).toEqual([{ type: "token", value: "X" }]);
  });

  // TC-25.3 — 빈 body
  it("TC-25.3: 빈 body 는 크래시 없이 0 이벤트", async () => {
    const events = await collect(streamOf([]));
    expect(events).toEqual([]);
  });

  it("TC-25.3: 공백/빈 라인만 있는 body 도 0 이벤트", async () => {
    const events = await collect(streamOf(["\n\n", "   \n\n"]));
    expect(events).toEqual([]);
  });

  // TC-25.4 — JSON 파싱 실패 graceful skip + 후속 이벤트 계속
  it("TC-25.4: JSON 파싱 실패 라인은 skip 하고 후속 이벤트는 계속 파싱", async () => {
    const events = await collect(
      streamOf([
        `data: {not valid json}\n\n`,
        `data: ${JSON.stringify({ type: "token", value: "OK" })}\n\n`,
      ]),
    );
    expect(events).toEqual([{ type: "token", value: "OK" }]);
  });

  it("TC-25.4: 파싱 실패해도 throw 하지 않는다", async () => {
    await expect(collect(streamOf([`data: {{{\n\n`]))).resolves.toEqual([]);
  });

  // TC-25.5 — 한 청크에 멀티 이벤트
  it("TC-25.5: 한 read 에 \\n\\n 다수 → 모든 이벤트 순서대로 파싱", async () => {
    const chunk =
      `data: ${JSON.stringify({ type: "thread", conversationId: "c" })}\n\n` +
      `data: ${JSON.stringify({ type: "token", value: "1" })}\n\n` +
      `data: ${JSON.stringify({ type: "token", value: "2" })}\n\n` +
      `data: ${JSON.stringify({ type: "done" })}\n\n`;
    const events = await collect(streamOf([chunk]));
    expect(events).toEqual([
      { type: "thread", conversationId: "c" },
      { type: "token", value: "1" },
      { type: "token", value: "2" },
      { type: "done" },
    ]);
  });

  // TC-25.7 — 스트림 중단(부분 데이터 후 종료): 버퍼 잔여 처리, 크래시 0
  it("TC-25.7: 마지막 이벤트에 trailing \\n\\n 이 없어도 버퍼 잔여를 처리", async () => {
    const events = await collect(
      streamOf([`data: ${JSON.stringify({ type: "token", value: "끝" })}`]),
    );
    expect(events).toEqual([{ type: "token", value: "끝" }]);
  });

  it("TC-25.7: 부분 데이터(불완전 JSON) 후 종료 → 크래시 없이 무시", async () => {
    const events = await collect(streamOf([`data: {"type":"tok`]));
    expect(events).toEqual([]);
  });

  it("error 이벤트({type:'error',message})를 파싱한다", async () => {
    const events = await collect(
      streamOf([`data: ${JSON.stringify({ type: "error", message: "boom" })}\n\n`]),
    );
    expect(events).toEqual([{ type: "error", message: "boom" }]);
  });

  it("body 가 null 이면 0 이벤트(크래시 없음)", async () => {
    const events: unknown[] = [];
    for await (const ev of parseSseStream(null)) events.push(ev);
    expect(events).toEqual([]);
  });

  it("CRLF(\\r\\n\\r\\n) 경계와 'data:' 공백 변형도 처리", async () => {
    const events = await collect(
      streamOf([`data:${JSON.stringify({ type: "token", value: "Y" })}\r\n\r\n`]),
    );
    expect(events).toEqual([{ type: "token", value: "Y" }]);
  });
});

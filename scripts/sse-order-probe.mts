/**
 * SSE 이벤트 도착 **순서** 실측 probe (사고 순서 버그 진단용).
 * tests 아님 — 1회용 실측 도구(R8: 추측 구현 금지). 우리 실제
 * 하네스 createStream 을 통과시켜 SSE 이벤트를 도착 순서대로
 * 1줄씩(타입+요약) 로깅한다.
 *
 * 진단 가설: 스크린샷에서 '웹 검색 도구 완료'가 '질문 분석 중'
 * 보다 위에 나옴. agent.ts yield 순서/reducer 는 정상이므로,
 * OpenAI 가 web_search_call 을 먼저 던지고 reasoning summary 를
 * 나중에 흘리는지(검색 선행) 확인한다. 첫 thinking 이 첫
 * web_search tool_call 보다 **나중**이면 가설 확정.
 *
 * 실행: pnpm dlx tsx scripts/sse-order-probe.mts
 * 출력: /tmp/sse-order-probe.jsonl (seq 순서대로)
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createStream } from "../src/lib/agent/agent.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
process.env.HARNESS_CHECKPOINTER = "memory";

const OUT = "/tmp/sse-order-probe.jsonl";
writeFileSync(OUT, "");
const log = (obj: unknown) =>
  appendFileSync(OUT, JSON.stringify(obj) + "\n");

// 스크린샷과 동일 쿼리(web_search 단일 도구 경로 — deep research 아님).
const QUERY = "웹검색해서 삼성전자 최근 주가 확인";

try {
  log({ tag: "TURN_START", query: QUERY });
  const gen = await createStream({
    query: QUERY,
    conversationId: "sse-order-probe-1",
  });

  let seq = 0;
  // 같은 타입 연속은 1줄로 압축(thinking×80 노이즈 제거) — 단
  // 타입 전환 경계는 반드시 기록(순서 판정 핵심).
  let lastType = "";
  let runCount = 0;
  let firstThinkingSeq = -1;
  let firstWsCallSeq = -1;

  const flushRun = (): void => {
    if (lastType && runCount > 0) {
      log({ tag: "RUN", type: lastType, count: runCount });
    }
  };

  for await (const ev of gen) {
    seq++;
    const t = (ev as { type: string }).type;
    // 첫 thinking / 첫 web_search tool_call 의 seq 기록(가설 핵심).
    if (t === "thinking" && firstThinkingSeq < 0) firstThinkingSeq = seq;
    if (
      t === "tool_call" &&
      (ev as { name?: string }).name === "web_search" &&
      firstWsCallSeq < 0
    ) {
      firstWsCallSeq = seq;
    }
    // tool_call/tool_result 는 name+args head 도 기록(어떤 도구인지).
    if (t === "tool_call" || t === "tool_result") {
      flushRun();
      lastType = "";
      runCount = 0;
      const e = ev as { name?: string; args?: string; result?: string };
      log({
        tag: t.toUpperCase(),
        seq,
        name: e.name ?? "",
        argsHead: (e.args ?? "").slice(0, 80),
        resultHead: (e.result ?? "").slice(0, 60),
      });
      continue;
    }
    // thinking/token 연속은 압축.
    if (t === lastType) {
      runCount++;
    } else {
      flushRun();
      lastType = t;
      runCount = 1;
    }
  }
  flushRun();

  log({
    tag: "VERDICT",
    firstThinkingSeq,
    firstWsCallSeq,
    // 가설: web_search 가 thinking 보다 먼저면 검색 선행 확정.
    webSearchBeforeFirstThinking:
      firstWsCallSeq > 0 &&
      (firstThinkingSeq < 0 || firstWsCallSeq < firstThinkingSeq),
  });
  console.log("PROBE OK → /tmp/sse-order-probe.jsonl");
} catch (e) {
  log({ tag: "FATAL", error: e instanceof Error ? e.message : String(e) });
  console.log("PROBE FATAL:", e);
  process.exitCode = 1;
}

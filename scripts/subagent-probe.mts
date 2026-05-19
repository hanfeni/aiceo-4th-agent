/**
 * deep-web-research SSE 검증 probe (medigate-new Task step 방식).
 * tests 아님 — 1회용 실측 도구. agent.ts 의 실제 createStream() 을
 * 호출해 emit 되는 SseEvent 를 전부 수집한다(route HTTP 타임아웃 우회 —
 * 같은 코드 경로, 더 긴 허용시간).
 *
 * 결정적 검증 2가지:
 *  ① task tool_call/tool_result 흐름(medigate Task step 데이터원) 3건
 *  ② FR-09: token(본문) 이벤트에 서브에이전트 내부 텍스트 누출 0
 *     (isSubagentNamespace skip 이 동작하면 서브에이전트 본문이
 *      token 으로 안 샌다 — 본문은 메인 취합 결과만)
 *
 * 실행: pnpm dlx tsx scripts/subagent-probe.mts
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createStream } from "../src/lib/agent/agent.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
// 서브에이전트·스킬 강제 ON (검증 목적).
process.env.HARNESS_SUBAGENTS = "true";
process.env.HARNESS_SKILLS = "true";
process.env.HARNESS_FILESYSTEM = "true";
process.env.HARNESS_CHECKPOINTER = "memory";

const OUT = "/tmp/subagent-probe.jsonl";
writeFileSync(OUT, "");
const log = (tag: string, obj: unknown) =>
  appendFileSync(OUT, JSON.stringify({ tag, obj }) + "\n");

// 이벤트 타입별 집계 + 본문 토큰 전체 모음(FR-09 누출 검사용).
const counts: Record<string, number> = {};
const taskCallIds = new Set<string>();
const taskResultIds = new Set<string>();
let body = "";
const toolTitlesSeen = new Set<string>();

try {
  log("TURN_START", { q: "deep-web-research SSE 검증, medigate Task step" });
  const gen = await createStream({
    query:
      "deep web research 스킬로 'TypeScript 5 새 기능'을 3개 관점에서 가볍게 조사해 한 줄씩만 취합해줘. 짧게.",
    conversationId: "subagent-probe-1",
  });

  let n = 0;
  for await (const ev of gen) {
    n++;
    counts[ev.type] = (counts[ev.type] ?? 0) + 1;
    if (ev.type === "tool_call") {
      if (ev.name === "task" && ev.id) taskCallIds.add(ev.id);
    } else if (ev.type === "tool_result") {
      if (ev.name === "task" && ev.id) taskResultIds.add(ev.id);
      // 모든 tool_result 의 name 을 남긴다(task 완료가 어떤 name 으로
      // 오는지 — taskResults=0 갭 진단).
      log("TOOL_RESULT", {
        name: ev.name,
        id: (ev.id || "").slice(0, 16),
        resultHead: (ev.result || "").slice(0, 80),
      });
    } else if (ev.type === "token") {
      body += ev.text;
    }
    // tool_call name 도 전부 남긴다(task vs web_search 분포).
    if (ev.type === "tool_call" && ev.name) {
      log("TOOL_CALL", { name: ev.name, id: (ev.id || "").slice(0, 16) });
    }
  }

  log("COUNTS", counts);
  log("BODY_PREVIEW", { len: body.length, head: body.slice(0, 400) });

  // FR-09 누출 휴리스틱: 서브에이전트가 받은 검색 지시/내부 토큰의
  // 특징 문자열이 본문에 섞이면 누출. 메인 취합 결과만 있어야 함.
  // (결정적 단언이 아니라 지표 — 본문이 합리적 길이 + task 흐름이
  //  정상이면 skip 동작 강한 시사. 사람이 head 로 최종 판단.)
  log("VERDICT", {
    totalEvents: n,
    taskCalls: taskCallIds.size,
    taskResults: taskResultIds.size,
    hasBody: body.length > 0,
    bodyLen: body.length,
    eventTypes: Object.keys(counts),
    note:
      "taskCalls=3 + hasBody=true + token 에 서브에이전트 검색지시 미혼입이면 " +
      "medigate Task step 방식 + FR-09 무손상. BODY_PREVIEW 로 최종 확인.",
  });
  console.log("PROBE OK →", OUT);
} catch (e) {
  log("ERROR", { message: (e as Error).message });
  console.error("PROBE ERROR:", (e as Error).message);
  process.exit(1);
}

/**
 * OPEN-3 실측 probe (R8 — DART D8). tests 아님, 1회용 실측 도구.
 * subagent-probe.mts 와 동형이나 트리거를 dart-analyst 로 바꿔
 * dartAnalyst subagent 의 사고채널 메타(langgraph_node/subagent_type)
 * 와 본문 누출 0(R5/FR-26)을 실측한다.
 *
 * 검증 3가지:
 *  ① task tool_call/result 에 dart-analyst 위임이 잡히는가
 *  ② FR-26/R5: token(본문)에 dartTool 의 대용량/raw 출력·subagent
 *     내부 토큰 누출 0 (isSubagentNamespace 차단 — webSearcher 동형)
 *  ③ OPEN-3: subagent_type / namespace 실제 런타임 라벨값 덤프
 *     (architect 예측 "인터페이스 불변·상수 ≤1줄" 을 실측 확정)
 *
 * 실 OpenAI(reasoning) + 실 DART API 과금 (사용자 승인 — D8).
 * 실행: pnpm dlx tsx scripts/dart-open3-probe.mts
 */
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createStream } from "../src/lib/agent/agent.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
process.env.HARNESS_SUBAGENTS = "true";
process.env.HARNESS_FILESYSTEM = "true";
process.env.HARNESS_CHECKPOINTER = "memory";

const OUT = "/tmp/dart-open3-probe.jsonl";
writeFileSync(OUT, "");
const log = (tag: string, obj: unknown) =>
  appendFileSync(OUT, JSON.stringify({ tag, obj }) + "\n");

const counts: Record<string, number> = {};
const taskCallIds = new Set<string>();
const taskResultIds = new Set<string>();
const subagentTypes = new Set<string>();
const toolNames = new Set<string>();
let body = "";

try {
  log("TURN_START", { q: "삼성전자 재무건전성 분석 — dart-analyst 위임 실측" });
  const gen = await createStream({
    query:
      "삼성전자 재무건전성을 간단히 분석해줘. 핵심 등급과 근거 2~3줄이면 충분해.",
    conversationId: "dart-open3-probe-1",
  });

  let n = 0;
  for await (const ev of gen) {
    n++;
    counts[ev.type] = (counts[ev.type] ?? 0) + 1;

    if (ev.type === "tool_call") {
      if (ev.name) toolNames.add(ev.name);
      if (ev.name === "task" && ev.id) taskCallIds.add(ev.id);
      // task args 에 subagent_type 이 흐른다(deepagents) — OPEN-3 핵심
      const args = (ev as { args?: unknown }).args;
      if (args && typeof args === "object") {
        const st = (args as Record<string, unknown>).subagent_type;
        if (typeof st === "string") subagentTypes.add(st);
      }
      log("TOOL_CALL", {
        name: ev.name,
        id: (ev.id || "").slice(0, 16),
        args: (ev as { args?: unknown }).args,
      });
    } else if (ev.type === "tool_result") {
      if (ev.name === "task" && ev.id) taskResultIds.add(ev.id);
      log("TOOL_RESULT", {
        name: ev.name,
        id: (ev.id || "").slice(0, 16),
        resultHead: (ev.result || "").slice(0, 120),
      });
    } else if (ev.type === "token") {
      body += ev.text;
    }
  }

  log("COUNTS", counts);
  log("BODY_PREVIEW", { len: body.length, head: body.slice(0, 600) });

  // FR-26/R5 누출 휴리스틱: dartTool 반환 헤더("corp_code=")나
  // context-formatter 섹션 마커("### 재무"·"[20")가 본문에 그대로
  // 섞이면 subagent 출력이 누출된 것(메인 취합만 보여야 함).
  const leakMarkers = ["corp_code=", "### 재무", "### 주주", "DART 분석 데이터"];
  const leaked = leakMarkers.filter((m) => body.includes(m));

  log("VERDICT", {
    totalEvents: n,
    taskCalls: taskCallIds.size,
    taskResults: taskResultIds.size,
    subagentTypes: [...subagentTypes],
    toolNames: [...toolNames],
    hasBody: body.length > 0,
    bodyLen: body.length,
    eventTypes: Object.keys(counts),
    fr26LeakMarkersInBody: leaked,
    note:
      "taskCalls≥1 + subagentTypes 에 'dart-analyst' + leaked=[] 이면 " +
      "R5/FR-26 무손상(webSearcher 동형). subagentTypes 값이 OPEN-3 " +
      "실측 라벨 — docs/notes 기록 대상. BODY_PREVIEW 로 최종 확인.",
  });
  console.log("DART OPEN-3 PROBE OK →", OUT);
} catch (e) {
  log("ERROR", { message: (e as Error).message });
  console.error("PROBE ERROR:", (e as Error).message);
  process.exit(1);
}

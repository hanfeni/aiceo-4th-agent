import type { ThinkingStep } from "@/types";
import {
  reasoningTitle,
  toolTitle,
} from "@/lib/agent/utils/thinkingLabels";

/**
 * 사고 step 리듀서 — 순수 함수(LLM/React 무관, 단위 테스트 가능 NFR-11).
 *
 * reasoning 토큰과 tool 호출을 **단일 배열에 발생 순서대로** 누적해
 * 교차(사고→도구→사고→도구)를 보존한다. medigate-new useAgentService
 * 규칙 모방:
 *  - reasoning: 영문 reasoning 토큰을 **제목으로 파싱하지 않는다**
 *    (Slice F-redo — **bold** 파싱 폐기). 제목은 그 step 이 몇 번째
 *    reasoning 인지로 생성('질문 분석 중' / '결과 분석 중' —
 *    reasoningTitle). 영문 텍스트는 전부 content(본문). 직전이
 *    reasoning 이면 content 누적, tool 이 끼면 새 step(reasoning
 *    순번 +1 → '결과 분석').
 *  - tool: tool_call 시 새 tool step push(마지막이 reasoning 이어도
 *    — 교차 보존). tool_result 는 id 매칭 step 에 채움.
 */

/** steps 안의 reasoning step 개수(= 다음 reasoning 의 0-base 순번). */
function reasoningCount(steps: ThinkingStep[]): number {
  let n = 0;
  for (const s of steps) if (s.kind === "reasoning") n++;
  return n;
}

/**
 * 누적 content 에서 **새 bold 단락 경계**의 시작 인덱스를 찾는다.
 * 경계 = "닫힌 `**...**`" 가 content **선두가 아닌 위치**에서 시작.
 * (선두 bold 는 그 step 자체의 시작 — 분기 아님.) 닫히지 않은
 * 미완성 bold(`**Struc` 만)는 -1 반환(아직 보류 → 같은 step 누적,
 * 닫히는 다음 델타에서 소급 분기).
 *
 * trimStart 기준 첫 비공백이 `**` 면 그건 이 step 의 선두 제목이므로
 * 그 다음 `**...**` 부터가 경계. 그 외엔 첫 `**...**` 가 경계.
 */
function findBoldBoundary(content: string): number {
  const lead = content.length - content.trimStart().length;
  let searchFrom = lead;
  // 선두가 bold 면 그 닫는 ** 다음부터 탐색(선두 제목은 경계 아님).
  if (content.startsWith("**", lead)) {
    const leadClose = content.indexOf("**", lead + 2);
    if (leadClose === -1) return -1; // 선두 bold 미완성 — 경계 없음
    searchFrom = leadClose + 2;
  }
  const open = content.indexOf("**", searchFrom);
  if (open === -1) return -1;
  // 경계 후보의 닫는 ** 가 있어야 확정(없으면 미완성 → 보류).
  const close = content.indexOf("**", open + 2);
  if (close === -1) return -1;
  return open;
}

/**
 * reasoning 델타를 step 배열에 머지. 새 배열 반환(불변).
 *
 * Slice H — `**bold**` 를 step **경계 신호**로 사용(제목으로는 안 씀).
 * OpenAI reasoning summary 는 사고 단계마다 `**제목**\n\n본문` 을 주되
 * 경계 메타 이벤트가 없다. 직전 reasoning step 본문에 **새 bold 단락**
 * 이 나타나면 그 지점에서 새 step 으로 분기한다(liveMode 가 단계마다
 * 리플레이스 — 누적 버그 해소). 분기로 잘린 bold 텍스트는 **제목이
 * 아니라 새 step 의 content 앞에 그대로 둔다**(제목은 order 기반 한글).
 *
 * 직전이 reasoning 이 아니면(빈/ tool 뒤) 새 step + order 한글 제목.
 */
export function reduceReasoning(
  steps: ThinkingStep[],
  delta: string,
  nextOrder: number,
): ThinkingStep[] {
  const last = steps[steps.length - 1];

  if (last && last.kind === "reasoning") {
    const merged = last.content + delta;
    const boundary = findBoldBoundary(merged);
    // 새 bold 경계 발견 → 그 앞은 기존 step, 뒤는 새 step 으로 분기.
    if (boundary > 0) {
      const before = merged.slice(0, boundary).replace(/\s+$/, "");
      const after = merged.slice(boundary);
      const kept: ThinkingStep = { ...last, content: before };
      const head = steps.slice(0, -1).concat(kept);
      const order = reasoningCount(head); // 새 step 의 reasoning 순번
      return head.concat({
        kind: "reasoning",
        title: reasoningTitle(order, false),
        content: after,
        order: nextOrder,
      });
    }
    // 경계 없음(또는 선두 bold) → 같은 step 에 누적(제목 불변).
    const updated: ThinkingStep = { ...last, content: merged };
    return steps.slice(0, -1).concat(updated);
  }

  // 새 reasoning step (빈 배열 또는 직전이 tool — 교차 보존).
  // 제목 = 이 step 의 reasoning 순번(0=질문 분석, 이후=결과 분석).
  const order = reasoningCount(steps);
  return steps.concat({
    kind: "reasoning",
    title: reasoningTitle(order, false),
    content: delta,
    order: nextOrder,
  });
}

/**
 * tool_call 델타를 step 배열에 머지. id 매칭 step 갱신 또는 새 push.
 *
 * clock 주입(`now`): deepagents/LangGraph 는 서버 elapsed 를 안 주므로
 * tool_call 수신 시각을 클라이언트가 startedAt 에 기록한다. 인자로
 * 받아 reducer 의 순수성을 유지(테스트는 고정값 주입 — NFR-11).
 *
 * Slice E — 동일 도구도 **항상 개별 step**(count 그룹화 폐기). 사용자
 * 요구: 반복 web_search 를 묶지 말고 각 검색을 나눠서 보일 것. 새 id
 * 면 무조건 새 step → 검색마다 독립 IN/OUT/elapsed. 같은 id 후속
 * 델타만 그 step 에 args 누적(스트리밍 청크 보존).
 *
 * Slice R — web_search 도 Slice E 와 동일 경로(개별 step). 이전
 * 에이전트의 'web_search 1그룹 묶기(args.actions[] 누적)'는 폐기
 * (사용자 'N 묶지 말고 풀어버림'). web_search_call 전체 id 는
 * 호출마다 고유(ws-id-format-probe — ws_ + 공유16자 + 호출별
 * 고유)라 아래 delta.id 경로가 자동으로 개별 분리한다. 실시간엔
 * ThinkingPanel liveMode 가 마지막 step 만 표시 → 순차 리플레이스.
 */
export function reduceToolCall(
  steps: ThinkingStep[],
  delta: { id: string; name: string; args: string },
  nextOrder: number,
  now: number = Date.now(),
): ThinkingStep[] {
  if (delta.id) {
    const idx = steps.findIndex(
      (s) => s.kind === "tool" && s.id === delta.id,
    );
    if (idx >= 0) {
      const s = steps[idx];
      if (s.kind !== "tool") return steps;
      const nextName = delta.name || s.name;
      const nextArgs = s.args + delta.args;
      const updated: ThinkingStep = {
        ...s,
        name: nextName,
        // 진행 중 제목 갱신(완료 전 — toolResult 가 '완료'로 바꿈).
        // args 누적분 전달 → task 는 subagent_type 완성되면 제목 수렴.
        title: toolTitle(nextName, false, nextArgs),
        args: nextArgs,
      };
      return steps.slice(0, idx).concat(updated, steps.slice(idx + 1));
    }
    // Slice E — 새 id 는 무조건 새 step(동일 도구 그룹화 폐기).
    // 검색마다 독립 step → 각자 IN/OUT/elapsed 를 가진다.
    // 제목은 한글 안내문구('{한글라벨} 도구 실행 중' — medigate-new).
    // task 면 args.subagent_type 으로 '… 에이전트 실행 중'(Slice J).
    return steps.concat({
      kind: "tool",
      title: toolTitle(delta.name, false, delta.args),
      id: delta.id,
      name: delta.name,
      args: delta.args,
      startedAt: now,
      order: nextOrder,
    });
  }
  // id 없는 args 조각 — 마지막 tool step 에 이어붙임(스트리밍 델타).
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind === "tool") {
      const updated: ThinkingStep = { ...s, args: s.args + delta.args };
      return steps.slice(0, i).concat(updated, steps.slice(i + 1));
    }
  }
  return steps; // 매칭 tool step 없음 — 무시
}

/**
 * tool_result 를 name(또는 id) 매칭 tool step 의 result 에 채운다.
 *
 * elapsedMs: 매칭 step 에 startedAt 이 있으면 `now - startedAt` 로 IN→OUT
 * 소요시간을 계산(medigate IOPair elapsed 모방). startedAt 이 없는
 * 레거시 step 은 elapsedMs 미설정. now 는 주입(reducer 순수성 — NFR-11),
 * 미전달 시 Date.now() 기본값. 음수 방지(clock skew 가드).
 */
export function reduceToolResult(
  steps: ThinkingStep[],
  name: string,
  result: string,
  id?: string,
  now: number = Date.now(),
): ThinkingStep[] {
  // (web_search citations 다중채움 분기 제거 — ServerTool 전용이었음.
  //  web_search 가 ClientTool 로 교체되어 id 있는 tool_call→tool_result
  //  2단계 + 정제 string 안에 출처가 포함된다. web_search step 은 1개
  //  뿐이라 "모든 web_search step 에 동일 출처 채움"은 무의미 → 아래
  //  일반 id 매칭 경로로 자연 수렴(dartTool 동형). 비-web_search 경로
  //  무손상.)

  let idx = -1;
  if (id) {
    idx = steps.findIndex((s) => s.kind === "tool" && s.id === id);
  }
  if (idx < 0) {
    idx = steps.findIndex(
      (s) => s.kind === "tool" && s.name === name && s.result === undefined,
    );
  }
  if (idx < 0) return steps;
  const s = steps[idx];
  if (s.kind !== "tool") return steps;
  // Slice L — citations 우선(순서 의존 버그 수정). 이미 출처가
  // 채워진 step('참고 출처…')은 이후 status('검색 완료' 등)가 와도
  // 덮지 않는다(출처 영속, SSE 도착 순서 무관). citations→citations
  // 갱신(새 출처)은 허용. same-ref 반환 → store setState 스킵.
  const curIsCitation =
    typeof s.result === "string" && s.result.startsWith("참고 출처");
  const nextIsCitation = result.startsWith("참고 출처");
  if (curIsCitation && !nextIsCitation) return steps;
  const elapsedMs =
    s.startedAt !== undefined ? Math.max(0, now - s.startedAt) : undefined;
  // 완료 → 제목을 '… 도구 완료'(task 면 '… 에이전트 완료')로 전환.
  // s.args(완성된 args) 전달 → task subagent_type 라벨 보존(Slice J).
  const updated: ThinkingStep = {
    ...s,
    result,
    elapsedMs,
    title: toolTitle(s.name, true, s.args),
  };
  return steps.slice(0, idx).concat(updated, steps.slice(idx + 1));
}

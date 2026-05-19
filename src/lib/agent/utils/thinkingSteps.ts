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
 * reasoning 델타를 step 배열에 머지. 새 배열 반환(불변).
 * 영문 reasoning 은 가공 없이 content 에 누적. 제목은 reasoning 순번
 * 기반 한글 안내문구(medigate-new). 직전이 reasoning 이면 같은 step,
 * 아니면(빈/ tool 뒤) 새 step + 순번 기반 제목.
 */
export function reduceReasoning(
  steps: ThinkingStep[],
  delta: string,
  nextOrder: number,
): ThinkingStep[] {
  const last = steps[steps.length - 1];

  // 직전이 reasoning step → content 에 그대로 누적(제목 불변).
  if (last && last.kind === "reasoning") {
    const updated: ThinkingStep = { ...last, content: last.content + delta };
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
 * 요구: 반복 web_search 를 ×count 로 묶지 말고 각 검색을 나눠서 보일
 * 것. 새 id 면 무조건 새 step → 검색마다 독립 IN/OUT/elapsed. 같은 id
 * 후속 델타만 그 step 에 args 누적(스트리밍 청크 보존).
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
      const updated: ThinkingStep = {
        ...s,
        name: nextName,
        // 진행 중 제목 갱신(완료 전 — toolResult 가 '완료'로 바꿈).
        title: toolTitle(nextName, false),
        args: s.args + delta.args,
      };
      return steps.slice(0, idx).concat(updated, steps.slice(idx + 1));
    }
    // Slice E — 새 id 는 무조건 새 step(동일 도구 그룹화 폐기).
    // 검색마다 독립 step → 각자 IN/OUT/elapsed 를 가진다.
    // 제목은 한글 안내문구('{한글라벨} 도구 실행 중' — medigate-new).
    return steps.concat({
      kind: "tool",
      title: toolTitle(delta.name, false),
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
  const elapsedMs =
    s.startedAt !== undefined ? Math.max(0, now - s.startedAt) : undefined;
  // 완료 → 제목을 '{한글라벨} 도구 완료'로 전환(medigate-new 규칙).
  const updated: ThinkingStep = {
    ...s,
    result,
    elapsedMs,
    title: toolTitle(s.name, true),
  };
  return steps.slice(0, idx).concat(updated, steps.slice(idx + 1));
}

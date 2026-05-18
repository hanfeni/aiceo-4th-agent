import type { ThinkingStep } from "@/types";

/**
 * 사고 step 리듀서 — 순수 함수(LLM/React 무관, 단위 테스트 가능 NFR-11).
 *
 * reasoning 토큰과 tool 호출을 **단일 배열에 발생 순서대로** 누적해
 * 교차(사고→도구→사고→도구)를 보존한다. medigate-new agentSession.ts
 * thinkingSteps[] 빌드 규칙 모방:
 *  - reasoning: `**bold 제목**` 경계를 만나면 새 reasoning step
 *    (title=제목, content 는 제목 제외 본문). 같은 step 내 후속 토큰은
 *    content 누적. tool step 뒤에 reasoning 이 오면 항상 새 step(교차).
 *  - tool: tool_call 시 새 tool step push(마지막이 reasoning 이어도
 *    — 교차 보존). tool_result 는 id 매칭 step 에 채움.
 *
 * 토큰은 스트리밍이라 `**Chec` / `king**\n\nbody` 처럼 제목이 쪼개져
 * 온다. reasoning step 의 content 앞부분이 아직 ** 안에 있으면 제목
 * 미완성으로 보고 buffer, `**...**` 가 닫히면 title 확정 + 본문 분리.
 */

/** `**제목**\n\n본문...` 에서 (title, body) 분리. 미완성이면 title=null. */
function splitBoldTitle(text: string): {
  title: string | null;
  body: string;
} {
  const t = text.trimStart();
  if (!t.startsWith("**")) return { title: null, body: text };
  const close = t.indexOf("**", 2);
  if (close === -1) return { title: null, body: text }; // 아직 닫히지 않음(미완성)
  const title = t.slice(2, close).trim();
  const body = t.slice(close + 2).replace(/^\s*\n+/, "");
  return { title, body };
}

/** reasoning 델타를 step 배열에 머지(제목 경계 파싱). 새 배열 반환(불변). */
export function reduceReasoning(
  steps: ThinkingStep[],
  delta: string,
  nextOrder: number,
): ThinkingStep[] {
  const last = steps[steps.length - 1];

  // 직전이 reasoning step 이고 제목이 이미 확정됐으면 그 step 에 누적.
  if (last && last.kind === "reasoning" && last.title.length > 0) {
    const merged = last.content + delta;
    // 누적 본문에 새 ** 제목이 다시 등장하면(다음 단계) 새 step 으로 분기.
    const boldIdx = merged.indexOf("**");
    if (boldIdx > 0) {
      const before = merged.slice(0, boldIdx);
      const rest = merged.slice(boldIdx);
      const split = splitBoldTitle(rest);
      const updated: ThinkingStep = {
        ...last,
        content: before.replace(/\s+$/, ""),
      };
      const tail = steps.slice(0, -1).concat(updated);
      if (split.title !== null) {
        return tail.concat({
          kind: "reasoning",
          title: split.title,
          content: split.body,
          order: nextOrder,
        });
      }
      // 제목 미완성 — 임시 step(title 빈) 으로 buffer.
      return tail.concat({
        kind: "reasoning",
        title: "",
        content: rest,
        order: nextOrder,
      });
    }
    const updated: ThinkingStep = { ...last, content: merged };
    return steps.slice(0, -1).concat(updated);
  }

  // 직전이 제목 미완성 reasoning step(title="") → 버퍼에 이어붙여 재파싱.
  if (last && last.kind === "reasoning" && last.title.length === 0) {
    const split = splitBoldTitle(last.content + delta);
    const updated: ThinkingStep =
      split.title !== null
        ? { ...last, title: split.title, content: split.body }
        : { ...last, content: last.content + delta };
    return steps.slice(0, -1).concat(updated);
  }

  // 새 reasoning step (직전이 tool 이거나 비어있음 — 교차 보존).
  const split = splitBoldTitle(delta);
  return steps.concat({
    kind: "reasoning",
    title: split.title ?? "",
    content: split.title !== null ? split.body : delta,
    order: nextOrder,
  });
}

/** tool_call 델타를 step 배열에 머지. id 매칭 step 갱신 또는 새 push. */
export function reduceToolCall(
  steps: ThinkingStep[],
  delta: { id: string; name: string; args: string },
  nextOrder: number,
): ThinkingStep[] {
  if (delta.id) {
    const idx = steps.findIndex(
      (s) => s.kind === "tool" && s.id === delta.id,
    );
    if (idx >= 0) {
      const s = steps[idx];
      if (s.kind !== "tool") return steps;
      const updated: ThinkingStep = {
        ...s,
        name: delta.name || s.name,
        title: delta.name || s.title,
        args: s.args + delta.args,
      };
      return steps.slice(0, idx).concat(updated, steps.slice(idx + 1));
    }
    return steps.concat({
      kind: "tool",
      title: delta.name || "tool",
      id: delta.id,
      name: delta.name,
      args: delta.args,
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

/** tool_result 를 name(또는 id) 매칭 tool step 의 result 에 채움. */
export function reduceToolResult(
  steps: ThinkingStep[],
  name: string,
  result: string,
  id?: string,
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
  const updated: ThinkingStep = { ...s, result };
  return steps.slice(0, idx).concat(updated, steps.slice(idx + 1));
}

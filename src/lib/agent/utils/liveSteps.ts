import type { ThinkingStep } from "@/types";

/**
 * 라이브(스트리밍) 모드에서 사고 패널에 보일 step 을 선택한다
 * (순수 함수 — LLM/React/타이머 무관, 단위 테스트 가능 NFR-11).
 *
 * 사용자 확정 규칙(2026-05-19):
 *  1. 마지막 step = reasoning → 그 reasoning **1개만**. 도구 영역을
 *     즉시 리플레이스(병렬 도구가 떠 있어도 사고가 나오면 전환).
 *  2. 마지막 step = tool → 도구 영역. 다음을 합쳐 start 최근 3개:
 *     - 진행 중(result === undefined) tool
 *     - OUT 도착했지만 now - outSeenAt < gracePeriodMs 인 tool
 *       (결과를 잠시 보여준 뒤 페이드아웃 탈락 — 사용자 재결정)
 *  3. OUT grace 경과 tool 은 visible 제외(탈락). steps 배열 자체는
 *     불변 → 스트림 종료 후 히스토리 뷰에서 전체 누적 확인(보존).
 *
 * 병렬 도구 가시화: 이전엔 `[steps[last]]` 1개라 동시 시작한 N개가
 * 1개만 보였다(사용자 보고). 진행 중 tool 을 최대 3개까지 노출해
 * 병렬 실행을 시각화한다(앞선 PARALLEL_PROBE 실측 — 3개 동시 start).
 *
 * @param steps         전체 step 배열(불변 — 읽기만)
 * @param outSeenAt      tool step index → result 최초 감지 시각(ms).
 *                       컴포넌트가 추적해 주입(함수는 순수 유지).
 * @param now            현재 시각(ms). 컴포넌트가 주입(테스트 결정성).
 * @param gracePeriodMs  OUT 후 노출 유지 시간(기본 600 — 사용자 확정).
 * @returns 화면에 렌더할 step 부분집합(원본 순서 보존).
 */
const LIVE_TOOL_WINDOW = 3;
const DEFAULT_GRACE_MS = 600;

export function selectLiveSteps(
  steps: ThinkingStep[],
  outSeenAt: ReadonlyMap<number, number>,
  now: number,
  gracePeriodMs: number = DEFAULT_GRACE_MS,
): ThinkingStep[] {
  if (steps.length === 0) return [];

  const last = steps[steps.length - 1];

  // 규칙 1 — 마지막이 reasoning: 그 1개만(도구 영역 즉시 리플레이스).
  if (last.kind === "reasoning") {
    return [last];
  }

  // 규칙 2 — 마지막이 tool: 도구 영역. 표시 후보 = 진행 중 tool +
  // OUT 됐지만 grace 내 tool. (index 보존: outSeenAt 키와 매칭.)
  const candidates: { step: ThinkingStep; idx: number }[] = [];
  steps.forEach((s, idx) => {
    if (s.kind !== "tool") return;
    if (s.result === undefined) {
      candidates.push({ step: s, idx }); // 진행 중 — 항상 후보
      return;
    }
    // OUT 도착 — outSeenAt 미기록이면 방금 막 OUT(이번 렌더에 감지)
    // → grace 시작 전이므로 노출 유지(컴포넌트가 다음 틱에 기록).
    const seen = outSeenAt.get(idx);
    if (seen === undefined || now - seen < gracePeriodMs) {
      candidates.push({ step: s, idx }); // grace 내 — 잠시 노출
    }
    // grace 경과 → 탈락(후보 제외).
  });

  // start 최근 3개(슬라이딩). startedAt 없으면 배열 순서로 폴백.
  const ordered = candidates.slice().sort((a, b) => {
    const sa =
      a.step.kind === "tool" ? (a.step.startedAt ?? a.idx) : a.idx;
    const sb =
      b.step.kind === "tool" ? (b.step.startedAt ?? b.idx) : b.idx;
    return sa - sb;
  });
  const recent = ordered.slice(-LIVE_TOOL_WINDOW);

  // 원본 등장 순서로 복원(idx 오름차순) — 화면 순서 안정.
  return recent
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((c) => c.step);
}

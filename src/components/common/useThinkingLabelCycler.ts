"use client";

import { useEffect, useRef, useState } from "react";
import {
  initLabelState,
  nextLabelState,
  renderLabel,
  THINKING_FUN_LABELS,
  type LabelCyclerState,
} from "@/lib/agent/utils/thinkingLabelCycler";

/**
 * 타이핑 레이블 순환 훅 — 순수 상태머신(thinkingLabelCycler)을
 * setTimeout 으로 구동만 한다. 로직은 전부 순수 함수에 위임하므로
 * 이 훅은 "타이머 + ref 보관" 책임만 진다(테스트는 순수 함수 측에서).
 *
 * medigate-manager useThinkingLabelCycler 타이밍 모방:
 *  - 글자당 80ms (typing)
 *  - 레이블 완성 후 1500ms 대기(pausing) 뒤 다음 레이블
 *
 * React 규칙 준수: 난수 seed/상태 초기화는 effect 안에서만 수행하고,
 * setState 는 비동기 setTimeout 콜백(tick) 에서만 호출한다(render 중
 * impure 호출·effect 동기 setState 회피 — react-hooks/purity).
 *
 * @param isActive false 면 정지 + 빈 문자열(스트리밍 종료 시).
 * @returns 현재 표시할 텍스트(타이핑 중간 상태 포함).
 */

const CHAR_INTERVAL_MS = 80;
const PAUSE_AFTER_COMPLETE_MS = 1500;

export function useThinkingLabelCycler(isActive: boolean): string {
  const [displayText, setDisplayText] = useState("");
  const stateRef = useRef<LabelCyclerState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) return;

    // seed/상태 초기화는 effect 안에서(난수 = render 중 호출 금지).
    stateRef.current = initLabelState(
      Math.floor(Math.random() * THINKING_FUN_LABELS.length),
    );

    const tick = (): void => {
      const cur = stateRef.current ?? initLabelState(0);
      const next = nextLabelState(cur, Math.random());
      stateRef.current = next;
      setDisplayText(renderLabel(next));
      // pausing 진입 직후엔 완성형을 길게 노출(다음 tick 까지 PAUSE).
      const delay =
        next.phase === "pausing"
          ? PAUSE_AFTER_COMPLETE_MS
          : CHAR_INTERVAL_MS;
      timerRef.current = setTimeout(tick, delay);
    };

    timerRef.current = setTimeout(tick, CHAR_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // 정지 시 표시 초기화는 cleanup(비동기 경로)에서 — effect 본문
      // 동기 setState 회피. 다음 활성화 때 tick 이 다시 채운다.
      setDisplayText("");
    };
  }, [isActive]);

  return displayText;
}

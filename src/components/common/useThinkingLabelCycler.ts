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
 * 깜빡임 방지(사용자 보고): 순수 상태머신은 레이블 전환 찰나·첫
 * tick 전·charIdx 0 에서 **빈 문자열**을 만든다. 이 빈 값이
 * ThinkingPanel 의 폴백을 타면 라벨이 깜빡인다. 그래서 이 훅은
 * **빈 값일 땐 setState 자체를 호출하지 않는다** — displayText 는
 * 한 번 값이 들어간 뒤 절대 빈 문자열로 안 돌아간다(직전 레이블
 * 유지, ref 불필요·React 규칙 준수). cleanup 의 빈 문자열 리셋도
 * 제거(effect 재실행 시 깜빡임 원천 차단).
 *
 * @param isActive false 면 타이머 정지(표시값은 직전 유지 — 스트
 *   리밍 종료 시 ThinkingPanel 이 정적 라벨로 대체하므로 무해).
 * @returns 현재 표시할 텍스트(첫 tick 전만 빈 문자열, 이후 비지 않음).
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
      const rendered = renderLabel(next);
      // 빈 값(전환 찰나·charIdx 0)은 setState 자체를 건너뛴다 —
      // displayText 가 직전 레이블을 유지 → 깜빡임 0. ref 불요
      // (state 가 빈 값으로 안 돌아가므로 render 시 그대로 반환).
      if (rendered.length > 0) {
        setDisplayText(rendered);
      }
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
      // cleanup 에서 표시값을 비우지 않는다(effect 재실행 시
      // 빈 값 깜빡임 원인). 비활성화는 effect 본문 가드가 처리.
    };
  }, [isActive]);

  // 빈 값일 땐 tick 이 setState 를 건너뛰므로 displayText 는
  // 한 번 채워진 뒤 비지 않는다(직전 레이블 유지 — 깜빡임 0).
  return displayText;
}

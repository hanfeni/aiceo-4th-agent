import { describe, it, expect } from "vitest";
import {
  THINKING_FUN_LABELS,
  initLabelState,
  nextLabelState,
  renderLabel,
  type LabelCyclerState,
} from "@/lib/agent/utils/thinkingLabelCycler";

// 타이핑 레이블 순환 — 순수 상태머신 단위 테스트(타이머/React 비의존,
// NFR-11). 훅(useThinkingLabelCycler)은 이 reducer 를 setTimeout 으로
// 구동만 한다. medigate-manager useThinkingLabelCycler 의 typing/pausing
// 페이즈 머신을 결정론적으로 재현한다.
//
// 글자 단위 누적: "골" → "골똘" → … → "골똘히 생각 중" → (pause) → 다음.

describe("THINKING_FUN_LABELS — 레이블 목록", () => {
  it("비어있지 않고 모두 비어있지 않은 문자열", () => {
    expect(THINKING_FUN_LABELS.length).toBeGreaterThan(0);
    for (const l of THINKING_FUN_LABELS) {
      expect(typeof l).toBe("string");
      expect(l.length).toBeGreaterThan(0);
    }
  });
});

describe("initLabelState — 초기 상태", () => {
  it("seed=0 → labelIdx 0, charIdx 0, phase typing", () => {
    const s = initLabelState(0, THINKING_FUN_LABELS.length);
    expect(s).toMatchObject({ labelIdx: 0, charIdx: 0, phase: "typing" });
  });

  it("seed 가 범위를 벗어나면 modulo 로 안전하게 들어온다", () => {
    const n = THINKING_FUN_LABELS.length;
    const s = initLabelState(n + 3, n);
    expect(s.labelIdx).toBe(3 % n);
    expect(s.labelIdx).toBeGreaterThanOrEqual(0);
    expect(s.labelIdx).toBeLessThan(n);
  });
});

describe("renderLabel — 현재 표시 문자열(charIdx 만큼 잘라냄)", () => {
  it("typing 중 charIdx=2 → 레이블 앞 2글자", () => {
    const label = THINKING_FUN_LABELS[0];
    const s: LabelCyclerState = { labelIdx: 0, charIdx: 2, phase: "typing" };
    expect(renderLabel(s)).toBe(label.slice(0, 2));
  });

  it("charIdx=0 → 빈 문자열", () => {
    const s: LabelCyclerState = { labelIdx: 0, charIdx: 0, phase: "typing" };
    expect(renderLabel(s)).toBe("");
  });

  it("pausing 페이즈 → 레이블 전체(완성형 유지)", () => {
    const label = THINKING_FUN_LABELS[0];
    const s: LabelCyclerState = {
      labelIdx: 0,
      charIdx: label.length,
      phase: "pausing",
    };
    expect(renderLabel(s)).toBe(label);
  });
});

describe("nextLabelState — 타이핑→일시정지→다음 레이블 전이", () => {
  it("typing 중 charIdx < len → charIdx 만 +1, 같은 레이블", () => {
    const s: LabelCyclerState = { labelIdx: 0, charIdx: 1, phase: "typing" };
    const n = nextLabelState(s, 0.99);
    expect(n).toMatchObject({ labelIdx: 0, charIdx: 2, phase: "typing" });
  });

  it("typing 끝(charIdx === len) → pausing 으로 전이(charIdx 보존)", () => {
    const len = THINKING_FUN_LABELS[0].length;
    const s: LabelCyclerState = {
      labelIdx: 0,
      charIdx: len,
      phase: "typing",
    };
    const n = nextLabelState(s, 0.0);
    expect(n).toMatchObject({ phase: "pausing", labelIdx: 0, charIdx: len });
  });

  it("pausing → 다음 레이블로 리셋(charIdx 0, typing). rand 로 인덱스 선택", () => {
    const n = THINKING_FUN_LABELS.length;
    const s: LabelCyclerState = {
      labelIdx: 0,
      charIdx: THINKING_FUN_LABELS[0].length,
      phase: "pausing",
    };
    // rand=0 → 후보 0 이지만 직전과 같으므로 회피되어 다른 인덱스.
    const next = nextLabelState(s, 0);
    expect(next.charIdx).toBe(0);
    expect(next.phase).toBe("typing");
    expect(next.labelIdx).toBeGreaterThanOrEqual(0);
    expect(next.labelIdx).toBeLessThan(n);
  });

  it("pausing → 직전과 동일 레이블 회피(연속 중복 방지)", () => {
    const s: LabelCyclerState = {
      labelIdx: 2,
      charIdx: THINKING_FUN_LABELS[2].length,
      phase: "pausing",
    };
    // 여러 rand 값에 대해 항상 labelIdx !== 2.
    for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const n = nextLabelState(s, r);
      expect(n.labelIdx).not.toBe(2);
    }
  });

  it("순수성: 입력 state 객체를 변형하지 않는다(새 객체 반환)", () => {
    const s: LabelCyclerState = { labelIdx: 0, charIdx: 1, phase: "typing" };
    const frozen = Object.freeze({ ...s });
    const n = nextLabelState(frozen, 0.5);
    expect(n).not.toBe(frozen);
    expect(s).toMatchObject({ labelIdx: 0, charIdx: 1, phase: "typing" });
  });

  it("결정론: 같은 (state, rand) → 항상 같은 결과", () => {
    const s: LabelCyclerState = {
      labelIdx: 1,
      charIdx: THINKING_FUN_LABELS[1].length,
      phase: "pausing",
    };
    const a = nextLabelState(s, 0.42);
    const b = nextLabelState(s, 0.42);
    expect(a).toEqual(b);
  });
});

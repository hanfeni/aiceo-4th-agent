/**
 * 타이핑 레이블 순환 — 순수 상태머신(타이머/React 비의존, NFR-11).
 *
 * 스트리밍 중 정적 "진행 중…" 대신 글자 단위로 타이핑되는 재치 있는
 * 레이블을 순환시켜 체감 대기시간을 줄인다(medigate-manager
 * useThinkingLabelCycler 모방). 타이머 의존을 제거하기 위해 전이
 * 로직만 순수 함수로 분리 — 훅은 setTimeout 으로 tick 만 구동한다.
 *
 * 페이즈:
 *  - "typing":  charIdx 를 1 씩 증가(한 글자씩 노출). 레이블 끝에
 *               도달하면 "pausing" 으로 전이(완성형 1.5s 노출 의도).
 *  - "pausing": 다음 레이블을 rand 로 선택(직전과 동일 회피) 후
 *               charIdx 0 / "typing" 으로 리셋.
 *
 * rand 는 0..1 (보통 Math.random()). reducer 가 인자로 받아 결정론적
 * 단위 테스트가 가능하다.
 */

/** 순환 레이블 목록(medigate-manager streaming-labels THINKING_FUN_LABELS). */
export const THINKING_FUN_LABELS = [
  "골똘히 생각 중",
  "실마리 푸는 중",
  "짜맞추는 중",
  "답 빚는 중",
  "논리 직조 중",
  "우려내는 중",
  "생각 반죽 중",
  "뉴런 발화 중",
  "뇌 오버클럭 중",
  "전두엽 과부하 중",
  "아이디어 증류 중",
  "인사이트 채굴 중",
  "영감 낚시 중",
  "두뇌 워밍업 중",
  "답 조각 중",
  "생각 발효 중",
  "논리 용접 중",
  "사고 가속 중",
  "아이디어 소환 중",
  "해답 해킹 중",
] as const;

export type LabelPhase = "typing" | "pausing";

export interface LabelCyclerState {
  /** THINKING_FUN_LABELS 인덱스. */
  labelIdx: number;
  /** 현재 노출 글자 수(0..label.length). */
  charIdx: number;
  phase: LabelPhase;
}

/** 초기 상태. seed 는 시작 레이블 인덱스(범위 밖이면 modulo). */
export function initLabelState(
  seed: number,
  total: number = THINKING_FUN_LABELS.length,
): LabelCyclerState {
  const safe = total > 0 ? ((seed % total) + total) % total : 0;
  return { labelIdx: safe, charIdx: 0, phase: "typing" };
}

/** 현재 상태가 화면에 표시할 문자열(typing 은 charIdx 만큼 잘라냄). */
export function renderLabel(state: LabelCyclerState): string {
  const label = THINKING_FUN_LABELS[state.labelIdx] ?? "";
  if (state.phase === "pausing") return label;
  return label.slice(0, state.charIdx);
}

/**
 * 한 tick 전이. rand 0..1(다음 레이블 선택용, pausing 일 때만 사용).
 * 입력 state 를 변형하지 않고 새 객체를 반환(불변).
 */
export function nextLabelState(
  state: LabelCyclerState,
  rand: number,
): LabelCyclerState {
  const total = THINKING_FUN_LABELS.length;
  const label = THINKING_FUN_LABELS[state.labelIdx] ?? "";

  if (state.phase === "typing") {
    if (state.charIdx < label.length) {
      return { ...state, charIdx: state.charIdx + 1 };
    }
    // 레이블 완성 → 완성형 노출 유지하며 일시정지.
    return { ...state, phase: "pausing" };
  }

  // pausing → 다음 레이블 선택(직전과 동일 회피) 후 타이핑 재시작.
  let nextIdx = Math.floor(rand * total) % total;
  if (nextIdx === state.labelIdx && total > 1) {
    nextIdx = (nextIdx + 1) % total;
  }
  return { labelIdx: nextIdx, charIdx: 0, phase: "typing" };
}

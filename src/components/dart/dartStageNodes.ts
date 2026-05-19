/**
 * DART 고정 파이프라인 5단계 노드 메타 (순수 상수 — D14b).
 *
 * 교육용 노드-엣지 시각화의 정적 정의. React Flow 의존 0(순수
 * 데이터 — 단위 테스트 가능, LLM/IO 0). DartPipelineGraph 가 이
 * 상수 + 런타임 stage 상태(SseEvent stage 이벤트)로 노드를 구동.
 *
 * stage 번호는 SseEvent {type:"stage", stage:1..5} 와 1:1(D14a).
 * stage 4(OpenAI 8관점 분석)는 emphasis:true — 교육생이 "AI가
 * 여기서 일한다"를 인지하도록 시각 강조(사용자 HITL).
 */

/** 단계 진행 상태 (SseEvent stage.status + 미시작 'idle') */
export type StageStatus = "idle" | "running" | "done" | "error";

/**
 * 단계별 누적 입출력 (D14c 노드 클릭 패널 데이터원).
 *
 * DartAnalyzeView 가 SseEvent stage 이벤트(start.input + done.output)로
 * 합성·누적, DartStagePanel 이 선택 stage 의 이 값을 표시. 타입 전용
 * (이 파일 React 무의존 불변 — interface 는 컴파일타임 소거).
 */
export interface StageIO {
  status: StageStatus;
  /** 단계 입력 — 우리 산출물(기업명/압축컨텍스트/LLM system+human). */
  input?: string;
  /** 단계 출력 — corp_code/길이 또는 LLM 리포트 마크다운. */
  output?: string;
}

/** 6단계 노드 정적 메타 (웹검색 정성 단계 삽입 — 4 웹검색 / 5 LLM) */
export interface DartStageNodeMeta {
  /** SseEvent stage 번호(1..6) — 노드 식별자 겸용 */
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  /** 노드 표시 라벨(라우트 stage.label 과 일치) */
  label: string;
  /** 한 줄 교육 설명(노드 부제) */
  hint: string;
  /** LLM 단계 강조 여부(stage 4 만 true) */
  emphasis: boolean;
}

/** 고정 파이프라인 5단계 (라우트 emit 순서와 동일) */
export const DART_STAGE_NODES: readonly DartStageNodeMeta[] = [
  {
    stage: 1,
    label: "기업 식별",
    hint: "기업명 → DART corp_code 해석 (상장/비상장 분기)",
    emphasis: false,
  },
  {
    stage: 2,
    label: "DART 공시 수집",
    hint: "재무·인력·주주·배당 또는 비상장 공시 원문 수집",
    emphasis: false,
  },
  {
    stage: 3,
    label: "컨텍스트 압축",
    hint: "raw JSON 미진입 — 관점별 압축 텍스트 (OPEN-5)",
    emphasis: false,
  },
  {
    stage: 4,
    label: "OpenAI 8관점 분석",
    hint: "AI 단계 — system+분석쿼리 프롬프트로 리포트 생성",
    emphasis: true,
  },
  {
    stage: 5,
    label: "완료",
    hint: "분석 리포트 스트리밍 종료",
    emphasis: false,
  },
];

/** 단계 상태 → 노드 색 (교육 가독성 — 대기/진행/완료/실패) */
export function stageColor(status: StageStatus, emphasis: boolean): {
  border: string;
  bg: string;
  text: string;
} {
  if (status === "error") {
    return { border: "#dc2626", bg: "#fef2f2", text: "#991b1b" };
  }
  if (status === "done") {
    return { border: "#16a34a", bg: "#f0fdf4", text: "#166534" };
  }
  if (status === "running") {
    // LLM 단계는 진행 중 더 강한 강조(교육 — "AI 작동 중")
    return emphasis
      ? { border: "#7c3aed", bg: "#f5f3ff", text: "#5b21b6" }
      : { border: "#2563eb", bg: "#eff6ff", text: "#1e40af" };
  }
  // idle — LLM 단계는 대기 중에도 옅은 강조 테두리
  return emphasis
    ? { border: "#a78bfa", bg: "#faf5ff", text: "#6d28d9" }
    : { border: "#d4d4d8", bg: "#fafafa", text: "#71717a" };
}

/**
 * 파이프라인 노드-엣지 시각화 — 공용 타입·색 함수 (순수 데이터).
 *
 * DartPipelineGraph 가 DART 전용으로 만든 패턴을 도메인 무관 공용
 * 으로 추출(사용자 결정 2026-05-19 "범용 PipelineGraph"). React
 * 의존 0 — 단위 테스트 가능. DART(dartStageNodes)·메타랩
 * (metaStageNodes) 이 이 타입으로 자기 노드 배열을 정의하고
 * 공용 PipelineGraph 에 주입한다.
 */

/** 단계 진행 상태 (미시작 'idle' + running/done/error) */
export type StageStatus = "idle" | "running" | "done" | "error";

/** 케이스 1건 (스와이프 단위 — 발굴 1회차 / 분류 1문서) */
export interface StageCase {
  /** 케이스 라벨 (예: "발굴 3회차", "정책브리핑 …") */
  label: string;
  /** 케이스 본문 (LLM 결과 텍스트) */
  text: string;
}

/** 단계별 누적 입출력 (노드 클릭 모달/패널 데이터원) */
export interface StageIO {
  status: StageStatus;
  /** 단계 입력 — 시스템 인스트럭션·프롬프트·우리 산출물 */
  input?: string;
  /** 단계 출력 — LLM 결과·스키마·리포트 (케이스 평면화 join) */
  output?: string;
  /**
   * 케이스별 분리 결과 (발굴 ×10·실분류 5건만 채워짐).
   * 있으면 모달이 ◀ N/M ▶ 스와이프, 없으면 output 단일 표시.
   * 수렴·픽스 단계는 단일 결과라 미설정 — 기존 경로 그대로.
   */
  cases?: StageCase[];
}

/** 단계 노드 정적 메타 (도메인별 배열로 정의) */
export interface StageNodeMeta {
  /** 단계 번호(1..N) — 노드 식별자 겸용 */
  stage: number;
  /** 노드 표시 라벨 */
  label: string;
  /** 한 줄 설명(노드 부제) */
  hint: string;
  /** LLM/강조 단계 여부 — 시각 강조 */
  emphasis: boolean;
}

/** 단계 상태 → 노드 색 (대기/진행/완료/실패. DART 원본과 동일) */
export function stageColor(
  status: StageStatus,
  emphasis: boolean,
): { border: string; bg: string; text: string } {
  if (status === "error") {
    return { border: "#dc2626", bg: "#fef2f2", text: "#991b1b" };
  }
  if (status === "done") {
    return { border: "#16a34a", bg: "#f0fdf4", text: "#166534" };
  }
  if (status === "running") {
    return emphasis
      ? { border: "#7c3aed", bg: "#f5f3ff", text: "#5b21b6" }
      : { border: "#2563eb", bg: "#eff6ff", text: "#1e40af" };
  }
  return emphasis
    ? { border: "#a78bfa", bg: "#faf5ff", text: "#6d28d9" }
    : { border: "#d4d4d8", bg: "#fafafa", text: "#71717a" };
}

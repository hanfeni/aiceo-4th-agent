/**
 * 메타랩 올인원 — 5단계 노드 메타 (순수 상수).
 *
 * 사용자 결정 2026-05-19: 올인원에 한해 DART식 노드 그래프 시각화.
 * 공용 PipelineGraph 에 이 배열을 주입. dartStageNodes 패턴 동형
 * (React 의존 0). run.ts 의 phase.step 문자열 ↔ 여기 stage 번호를
 * 1:1 매핑(STEP_TO_STAGE) — 그래프 노드 상태 구동.
 *
 * 노드 클릭 → 모달에 그 단계 input/output(특히 인스트럭션·프롬프트).
 */

import type { StageNodeMeta } from "@/components/common/pipelineNodes";

/** run.ts phase.step → 노드 stage 번호 */
export const STEP_TO_STAGE: Record<string, number> = {
  discover: 1,
  converge: 2,
  fix: 3,
  classify: 4,
  metaindex: 5,
};

/** 올인원 5단계 (run.ts 진행 순서와 동일) */
export const META_STAGE_NODES: readonly StageNodeMeta[] = [
  {
    stage: 1,
    label: "스키마 발굴",
    hint: "20개씩 ×10회 병렬 — 비복원 샘플로 분류 체계 후보 제안",
    emphasis: true,
  },
  {
    stage: 2,
    label: "수렴",
    hint: "10개 발굴 결과를 LLM 이 종합 → 후보 라벨 선정",
    emphasis: true,
  },
  {
    stage: 3,
    label: "분류기 픽스",
    hint: "확정 스키마로 분류기 인스트럭션 동적 생성·고정",
    emphasis: false,
  },
  {
    stage: 4,
    label: "실분류",
    hint: "픽스된 분류기로 미사용 문서 5건 병렬 라벨링",
    emphasis: true,
  },
  {
    stage: 5,
    label: "메타 색인",
    hint: "분류기로 도메인 문서 메타 부착 → OpenSearch 동적 색인(검색 실습 메타 필터원)",
    emphasis: true,
  },
];

/** 단계별 입출력 (노드 클릭 모달 데이터원) */
export interface MetaStageIO {
  status: "idle" | "running" | "done" | "error";
  /** 입력 — 시스템 인스트럭션/프롬프트 + 우리 산출물 */
  input?: string;
  /** 출력 — LLM 결과/수렴 스키마/생성된 분류기 인스트럭션/분류 결과 */
  output?: string;
}

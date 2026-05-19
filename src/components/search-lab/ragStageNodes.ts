/**
 * RAG 실습 — 3단계 노드 메타 (순수 상수).
 *
 * 사용자 결정 2026-05-19: 검색 실습의 RAG 모드도 메타랩·DART 처럼
 * 노드 그래프로 시각화. "검색 → LLM 해석 → 완료" 3단계.
 * 공용 PipelineGraph 에 이 배열 주입(metaStageNodes 패턴 동형,
 * React 의존 0). rag.ts 의 stage step 문자열 ↔ stage 번호 1:1
 * (STEP_TO_STAGE) — 그래프 노드 상태 구동.
 *
 * 노드 클릭 → 모달에 그 단계 입출력(검색 근거 / 생성 답변).
 */

import type { StageNodeMeta } from "@/components/common/pipelineNodes";

/** rag.ts stage step → 노드 stage 번호 */
export const RAG_STEP_TO_STAGE: Record<string, number> = {
  retrieve: 1,
  generate: 2,
  done: 3,
};

/** RAG 3단계 (rag.ts 진행 순서와 동일) */
export const RAG_STAGE_NODES: readonly StageNodeMeta[] = [
  {
    stage: 1,
    label: "검색 (Retrieval)",
    hint: "선택 방식으로 top-N 문서 검색 — 답변 근거 수집",
    emphasis: false,
  },
  {
    stage: 2,
    label: "LLM 해석 (Generation)",
    hint: "검색 근거를 컨텍스트로 LLM 이 출처 기반 답변 생성",
    emphasis: true,
  },
  {
    stage: 3,
    label: "완료",
    hint: "근거 + 답변 확정",
    emphasis: false,
  },
];

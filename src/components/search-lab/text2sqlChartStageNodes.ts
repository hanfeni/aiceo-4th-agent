/**
 * Text-to-SQL with Chart 실습 — 5단계 노드 메타 (순수 상수).
 *
 * text2sqlStageNodes.ts(4단계)에 "차트화(LLM)" 단계를 execute 와
 * done 사이에 1개 추가한 버전. 기존 4단계 노드는 무변경(별도 모드).
 * text2sqlChart.ts 의 stage step ↔ stage 번호 1:1.
 *
 * 핵심 교육 포인트: execute(SQL 결과) 다음에 chart 노드가 와서
 * "에이전트가 데이터를 보고 차트 타입을 스스로 고른다"는 인과를
 * 학생이 노드로 본다(RAG 가 검색→LLM해석을 보여주는 것과 동형).
 */

import type { StageNodeMeta } from "@/components/common/pipelineNodes";

/** text2sqlChart.ts stage step → 노드 stage 번호 */
export const T2SC_STEP_TO_STAGE: Record<string, number> = {
  schema: 1,
  generate: 2,
  execute: 3,
  chart: 4,
  done: 5,
};

/** Text-to-SQL with Chart 5단계 (text2sqlChart.ts 진행 순서) */
export const T2SC_STAGE_NODES: readonly StageNodeMeta[] = [
  {
    stage: 1,
    label: "스키마 조회",
    hint: "적재된 테이블의 컬럼·샘플행을 LLM 컨텍스트로 추출",
    emphasis: false,
  },
  {
    stage: 2,
    label: "SQL 생성 (LLM)",
    hint: "스키마 + 질문 → SELECT (차트용: 범주+수치 함께 나오게)",
    emphasis: true,
  },
  {
    stage: 3,
    label: "SELECT 실행",
    hint: "안전 검증 후 SQLite 실행 — 차트 원천 데이터 확보",
    emphasis: false,
  },
  {
    stage: 4,
    label: "차트화 (LLM)",
    hint: "실행 결과를 LLM 에 재투입 → 차트 타입·축 스펙 JSON 생성",
    emphasis: true,
  },
  {
    stage: 5,
    label: "완료",
    hint: "검증 통과한 차트 스펙으로 Recharts 렌더",
    emphasis: false,
  },
];

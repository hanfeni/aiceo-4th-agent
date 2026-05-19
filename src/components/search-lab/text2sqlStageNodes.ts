/**
 * Text-to-SQL 실습 — 4단계 노드 메타 (순수 상수).
 *
 * RAG(ragStageNodes.ts)의 SQL 버전. 같은 PipelineGraph·StageModal
 * 에 주입(React 의존 0). text2sql.ts 의 stage step 문자열 ↔ stage
 * 번호 1:1 (T2S_STEP_TO_STAGE). 노드 클릭 → 모달에 단계 입출력
 * (스키마 / 생성 SQL / 실행 결과).
 *
 * RAG 는 3단계(검색→해석→완료)지만 Text-to-SQL 은 "스키마 조회"가
 * 별도 단계로 의미가 커서 4단계 — 학생이 "에이전트가 스키마를 보고
 * SQL 을 짠다"는 인과를 노드로 본다.
 */

import type { StageNodeMeta } from "@/components/common/pipelineNodes";

/** text2sql.ts stage step → 노드 stage 번호 */
export const T2S_STEP_TO_STAGE: Record<string, number> = {
  schema: 1,
  generate: 2,
  execute: 3,
  done: 4,
};

/** Text-to-SQL 4단계 (text2sql.ts 진행 순서와 동일) */
export const T2S_STAGE_NODES: readonly StageNodeMeta[] = [
  {
    stage: 1,
    label: "스키마 조회",
    hint: "적재된 테이블의 컬럼·샘플행을 LLM 에게 줄 컨텍스트로 추출",
    emphasis: false,
  },
  {
    stage: 2,
    label: "SQL 생성 (LLM)",
    hint: "스키마 + 자연어 질문 → SELECT 쿼리 생성 (읽기 전용 지시)",
    emphasis: true,
  },
  {
    stage: 3,
    label: "SELECT 실행",
    hint: "안전 검증(읽기 전용·단일문) 통과 후 SQLite 에서 실행",
    emphasis: false,
  },
  {
    stage: 4,
    label: "완료",
    hint: "생성 SQL + 결과 표 확정",
    emphasis: false,
  },
];

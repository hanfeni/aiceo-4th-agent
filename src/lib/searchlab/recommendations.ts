/**
 * 추천 질의 매트릭스 — 소스종류 × 도메인 (사용자 결정 2026-05-20).
 *
 * 핵심 원리(사용자 지적): 추천 질의는 ①도메인이 아니라 검색어
 * 모드가 결정하는 **데이터 소스**에 종속돼야 한다. 같은 도메인
 * 이라도 인덱스(OpenSearch)에 묻는 질문과 DB(테이블)에 묻는
 * 질문은 표현도 가능 여부도 완전히 다르기 때문:
 *   - index 계열(검색·RAG)  : 색인 문서 대상 자연어 질의
 *     ("~동향/이슈/요약" — 비정형 텍스트 검색·요약)
 *   - db 계열(Text-to-SQL·Chart): 테이블 대상 집계·필터 질의
 *     ("~별 건수/상위/분포" — GROUP BY·COUNT·정렬)
 *
 * SQL 계열 질의는 실 테이블 컬럼 실측(2026-05-20)에 근거 —
 * 추측한 컬럼이 아니라 실제 sqllab_* 테이블에 존재하는 컬럼만
 * 사용해 "실제 가능한 것"만 추천(사용자 요구의 핵심).
 *   - sangkwon: 상가업소번호/상호명/시도명/시군구명/
 *               상권업종대분류명/경도/위도 …
 *   - legal   : 소관부처명/법령분야명/공포일자/법령구분명/법령명 …
 */

import type { SearchDomain } from "./domains";

/** 검색어 모드 → 데이터 소스 종류. UI 의 ACTIONS id 와 정합. */
export type SourceKind = "index" | "db";

/**
 * 모드 id → 소스종류. 검색·RAG = 인덱스, Text-to-SQL 계열 = DB.
 * UI(SearchLabView ACTIONS)의 id: ""(검색)·rag·text2sql·
 * text2sql-chart. 빈 문자열(기본 검색)도 인덱스 계열.
 */
export function sourceKindOf(mode: string): SourceKind {
  return mode === "text2sql" || mode === "text2sql-chart"
    ? "db"
    : "index";
}

/** (소스종류 → 도메인 → 추천 질의 배열). 각 3개 내외. */
type RecMatrix = Record<SourceKind, Record<SearchDomain, string[]>>;

export const RECOMMENDATIONS: RecMatrix = {
  // ── 인덱스 계열: 색인 문서 대상 자연어 검색·요약 ──────────
  index: {
    sangkwon: [
      "소상공인 폐업률이 높은 업종은?",
      "상권 활성화 정책의 최근 동향 요약",
      "골목상권 지원 사업 핵심 내용",
    ],
    medical: [
      "최근 신약 허가 절차 변화",
      "제약 산업 규제 이슈 정리",
      "의료 수가 개편 관련 쟁점",
    ],
    finance: [
      "연금 개혁 논의의 핵심 쟁점은?",
      "고용 지표 최근 동향 요약",
      "금융 소비자 보호 제도 변화",
    ],
    legal: [
      "개인정보 보호 관련 최신 법령 요약",
      "노동법 개정 주요 내용",
      "행정 절차 관련 법적 쟁점",
    ],
    policy: [
      "디지털 거버넌스 정책 방향",
      "데이터 개방 정책 최근 이슈",
      "공공 혁신 추진 전략 요약",
    ],
  },
  // ── DB 계열: 실 테이블 컬럼 기반 집계·필터(실측 근거) ──────
  db: {
    sangkwon: [
      "시도별 업소 수 상위 10곳",
      "상권업종대분류별 업소 분포",
      "음식 업종이 가장 많은 시군구는?",
    ],
    medical: [
      // ── 학습 포인트 ──────────────────────────────────────
      // medical/finance/policy 의 DB 계열 질의는 해당 sqllab_*
      // 테이블이 적재되면 실 컬럼을 확인해 채우세요. 현재
      // 미적재(loaded=false)라 컬럼 미상 → 추측 질의 금지(R8).
      // 적재 후 /api/sql-lab/preview?domain=medical 의 columns
      // 를 보고 GROUP BY·COUNT 가능한 실제 질의 3개로.
      // ─────────────────────────────────────────────────────
      "(테이블 적재 후 실 컬럼 기반으로 작성)",
    ],
    finance: ["(테이블 적재 후 실 컬럼 기반으로 작성)"],
    legal: [
      "소관부처별 법령 수 상위 10개",
      "법령분야별 법령 분포",
      "최근 공포된 법령 목록",
    ],
    policy: ["(테이블 적재 후 실 컬럼 기반으로 작성)"],
  },
};

/**
 * 모드·도메인에 맞는 추천 질의. 데이터 소스에 실제 가능한 것만.
 * 미적재 도메인(플레이스홀더)은 호출부에서 disable 처리되므로
 * 여기선 정의된 배열을 그대로 반환(필터는 UI 책임).
 */
export function recommendationsFor(
  mode: string,
  domain: SearchDomain,
): string[] {
  return RECOMMENDATIONS[sourceKindOf(mode)][domain] ?? [];
}

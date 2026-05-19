/**
 * DART 공시 원문 파서 전용 타입 (모듈 로컬 — 사용자 HITL 2026-05-19).
 *
 * 이식 출처: medigate `types/disclosure.ts`(10fb7f4, 82줄). D1
 * `src/types/dart/securities.ts` 의 공시 타입과 **이름 같고 구조 다름**
 * (Table.rows: string[][] vs DisclosureTableCell[][]) → 충돌 회피로
 * parser 전용 세부 파싱 타입은 여기 로컬에 둔다(모듈 응집·이름 격리).
 * securities.ts 의 공시 타입은 상위 요약용으로 별개 유지.
 *
 * 단, 본 D4 는 분석 subagent 가 실제 쓰는 extractDisclosureFullText /
 * getUnlistedCompanyDisclosureContext 만 이식 — 섹션 트리/테이블
 * 파서(getDisclosureDocument 등 medigate UI 전용)는 미이식. 따라서
 * 현 시점 활성 타입은 SelectedDisclosureOption 만. 나머지 구조 타입은
 * UI 스코프 확장(D9~) 대비 정의만 보존.
 */

/** 공시 선택 옵션 (전문 모드만 — 요약 모드 STRUCTURAL #4 절단) */
export interface SelectedDisclosureOption {
  rceptNo: string;
  reportNm: string;
  rceptDt: string;
  /** STRUCTURAL #4: gemini 요약 제거 → 'full' 만 유효 */
  mode: "full";
}

/** 공시 원문 추출 결과 */
export interface DisclosureFullText {
  success: boolean;
  text: string;
  documentName?: string;
  charCount: number;
  error?: string;
}

/** 비상장사 공시 맥락 결과 */
export interface UnlistedDisclosureContext {
  success: boolean;
  context: string;
  disclosureCount: number;
  totalOriginalChars: number;
  totalSummaryChars: number;
  error?: string;
}

// ── UI 스코프 확장(D9~) 대비 보존 (현 D4 미사용) ──

export interface DisclosureSection {
  tocId: string;
  title: string;
  level: number;
  subSections?: DisclosureSection[];
}

export interface DisclosureTableCell {
  content: string;
  colspan?: number;
  rowspan?: number;
  isHeader?: boolean;
}

export interface DisclosureTable {
  rows: DisclosureTableCell[][];
  hasHeader: boolean;
}

export interface DisclosureDocument {
  rceptNo: string;
  documentName?: string;
  documentCode?: string;
  companyName?: string;
  sections?: DisclosureSection[];
  error?: string;
}

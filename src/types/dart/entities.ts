/**
 * DART 도메인 엔티티 타입 — 회사/재무/인력/지배구조/배당/공시 + API 응답.
 *
 * 이식 출처: medigate-manager `types/dart.ts`(삭제 직전 10fb7f4) 9~329행.
 * 원본 단일 1374줄을 기능축 4파일로 분리(STRUCTURAL #2 — 원본 복사 금지,
 * 재구성). 이 파일 = "조회 대상 엔티티 + API 봉투" 축.
 *
 * 모든 필드는 camelCase **도메인 타입**이다. DART OpenAPI 실응답은
 * snake_case(OPEN-4 실측, `docs/notes/dart-api-probe.md` §1) — snake→camel
 * 변환은 D2 `api/client.ts` 경계 책임. 이 타입은 변환 후 SSOT.
 */

// ==================== 기업 정보 ====================

/** DART 기업 기본 정보 */
export interface DartCompany {
  corpCode: string;      // 기업 고유번호
  corpName: string;      // 기업명
  stockCode?: string;    // 종목코드 (상장사만)
  corpCls?: string;      // 법인구분 (Y: 유가증권, K: 코스닥, N: 코넥스, E: 기타)
  modifyDate?: string;   // 최종 수정일
}

/** DART 기업 개황 정보 */
export interface DartCompanyInfo {
  corpCode: string;        // 기업 고유번호
  corpName: string;        // 기업명
  corpNameEng?: string;    // 영문명
  stockName?: string;      // 종목명
  stockCode?: string;      // 종목코드
  ceoName?: string;        // 대표자명
  corpCls?: string;        // 법인구분 (Y: 유가증권, K: 코스닥, N: 코넥스, E: 기타)
  jurirNo?: string;        // 법인등록번호
  bizrNo?: string;         // 사업자등록번호
  address?: string;        // 주소
  homeUrl?: string;        // 홈페이지
  irUrl?: string;          // IR 홈페이지
  phoneNo?: string;        // 전화번호
  faxNo?: string;          // 팩스번호
  industryCode?: string;   // 업종코드
  estDate?: string;        // 설립일
  accMonth?: string;       // 결산월
}

// ==================== 재무 정보 ====================

/** 재무제표 항목 (raw 응답은 snake_case — OPEN-4 §2, 변환 후 camelCase) */
export interface DartFinancialItem {
  rceptNo?: string;        // 접수번호
  reprtCode?: string;      // 보고서 코드
  bsnsYear?: string;       // 사업연도
  corpCode?: string;       // 고유번호
  sjDiv?: string;          // 재무제표구분 (BS, IS, CIS, CF)
  sjNm?: string;           // 재무제표명
  accountId?: string;      // 계정ID
  accountNm?: string;      // 계정명
  accountDetail?: string;  // 계정상세
  thstrmNm?: string;       // 당기명
  thstrmAmount?: string;   // 당기금액
  thstrmAddAmount?: string;// 당기누적금액 (분기보고서만 — OPEN-4 §2)
  frmtrmNm?: string;       // 전기명
  frmtrmAmount?: string;   // 전기금액
  frmtrmAddAmount?: string;// 전기누적금액 (분기보고서만)
  bfefrmtrmNm?: string;    // 전전기명
  bfefrmtrmAmount?: string;// 전전기금액
  ord?: string;            // 정렬순서
  currency?: string;       // 통화단위
}

/** 요약 재무 데이터 (분석 입력용) */
export interface FinancialSummary {
  year: number;
  quarter?: number;           // 분기 (1, 2, 3, 4)
  reportCode?: string;        // 보고서 코드
  revenue?: number;           // 매출액
  operatingProfit?: number;   // 영업이익
  netIncome?: number;         // 당기순이익
  totalAssets?: number;       // 총자산
  totalLiabilities?: number;  // 총부채
  totalEquity?: number;       // 자기자본
  debtRatio?: number;         // 부채비율
  roe?: number;               // ROE
  roa?: number;               // ROA
}

// ==================== 인력 정보 ====================

/** 직원 현황 */
export interface DartEmployee {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  foBbm?: string;             // 사업부문
  sexdstn?: string;           // 성별
  rgllbrCo?: string;          // 정규직 인원수
  rgllbrAbacptLabrrCo?: string; // 정규직 단시간근로자
  cnttkCo?: string;           // 계약직 인원수
  cnttkAbacptLabrrCo?: string;  // 계약직 단시간근로자
  sm?: string;                // 합계
  avrgCnwkSdytrn?: string;    // 평균근속연수
  fyerSalaryTotamt?: string;  // 연간급여총액
  janSalaryAm?: string;       // 1인평균급여액
  rm?: string;                // 비고
  stlmDt?: string;            // 결산기준일
}

/** 인력 요약 데이터 (분석 입력용) */
export interface WorkforceSummary {
  year: number;
  totalEmployees: number;
  maleCount?: number;
  femaleCount?: number;
  regularCount?: number;
  contractCount?: number;
  averageTenure?: number;     // 평균근속연수
  averageSalary?: number;     // 1인평균급여
}

// ==================== 지배구조 ====================

/** 최대주주 현황 */
export interface DartShareholder {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  nm?: string;                   // 성명
  relate?: string;               // 관계
  stockKnd?: string;             // 주식종류
  bsisPosesnStkCo?: string;      // 기초 주식수
  bsisPosnStkQota?: string;      // 기초 주식수 (별칭)
  bsisPosesnStkQotaRt?: string;  // 기초 지분율
  trmnPosessnStkCo?: string;     // 기말 주식수
  trmnPosnStkQota?: string;      // 기말 주식수 (별칭)
  trmnPosessnStkQotaRt?: string; // 기말 지분율
  rm?: string;                   // 비고
  stlmDt?: string;               // 결산기준일
}

/** 임원 현황 */
export interface DartExecutive {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  nm?: string;               // 성명
  sexdstn?: string;          // 성별
  birthYm?: string;          // 출생년월
  ofcps?: string;            // 직위
  rgistExctvAt?: string;     // 등기임원 여부
  fteAt?: string;            // 상근 여부
  chrgJob?: string;          // 담당업무
  mainCareer?: string;       // 주요경력
  mxmmShrholdrRelate?: string; // 최대주주와의 관계
  hffcPd?: string;           // 재직기간
  tenureEndOn?: string;      // 임기만료일
  stlmDt?: string;           // 결산기준일
  // 하위호환 필드
  ofcpsNm?: string;          // 직위 (별칭)
  chrgnJobNm?: string;       // 담당업무 (별칭)
  rm?: string;               // 비고
}

// ==================== 배당 정보 ====================

/** 배당 현황 */
export interface DartDividend {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  seType?: string;           // 구분 (단일 연도 응답)
  se?: string;               // 구분 (다년간 응답)
  stockKnd?: string;         // 주식종류
  thstrmNm?: string;         // 당기명
  thstrm?: string;           // 당기
  frmtrmNm?: string;         // 전기명
  frmtrm?: string;           // 전기
  lwfrNm?: string;           // 전전기명
  lwfr?: string;             // 전전기
  year?: number | string;    // 다년간 조회 시 연도
}

/** 배당 요약 데이터 (분석 입력용) */
export interface DividendSummary {
  year: number;
  dividendPerShare?: number;   // 주당 배당금
  dividendYield?: number;      // 배당수익률
  payoutRatio?: number;        // 배당성향
  totalDividend?: number;      // 총 배당금
}

// ==================== 공시 정보 ====================

/** 공시 목록 항목 */
export interface DartDisclosure {
  corpCode?: string;        // 기업 고유번호
  corpName?: string;        // 기업명
  corpCls?: string;         // 법인구분
  reportNm?: string;        // 보고서명
  rceptNo?: string;         // 접수번호
  flrNm?: string;           // 공시제출인명
  rceptDt?: string;         // 접수일자
  rm?: string;              // 비고
}

/** 공시 목록 결과 */
export interface DisclosureListResult {
  status?: string;
  message?: string;
  pageNo?: number;
  pageCount?: number;
  totalCount?: number;
  totalPage?: number;
  list?: DartDisclosure[];
}

// ==================== AI 분석 ====================

/** 기업 AI 분석 결과 */
export interface CompanyAnalysis {
  summary: string;          // 요약
  strengths: string[];      // 강점
  weaknesses: string[];     // 약점
  opportunities: string[];  // 기회
  threats: string[];        // 위협
  recommendation?: string;  // 투자 의견
  financialHighlights?: string; // 재무 하이라이트
  riskFactors?: string[];   // 리스크 요인
}

// ==================== API 응답 타입 ====================

/** DART API 공통 응답 봉투 (OPEN-4 §3: status="000" 정상) */
export interface DartApiResponse<T> {
  status: string;
  message: string;
  list?: T[];
}

/** 검색 결과 */
export interface SearchResult {
  companies: DartCompany[];
  totalCount: number;
}

/** 기업 종합 정보 (분석 subagent 의 1차 수집 결과) */
export interface CompanyFullInfo {
  companyInfo?: DartCompanyInfo;
  financials?: DartFinancialItem[];
  latestFinancials?: DartFinancialItem[];
  shareholders?: DartShareholder[];
  executives?: DartExecutive[];
  employees?: DartEmployee[];
  dividends?: DartDividend[];
  disclosures?: DartDisclosure[];
  annualYear?: string;
  latestYear?: string;
  latestReportCode?: string;
}

// ==================== 보고서 코드 ====================

/** 보고서 코드 타입 */
export type ReportCode = '11011' | '11012' | '11013' | '11014';

/** 보고서 코드 정보 */
export const REPORT_CODES: Record<ReportCode, { name: string; quarter: number }> = {
  '11011': { name: '사업보고서', quarter: 4 },     // Q4 (연간)
  '11012': { name: '반기보고서', quarter: 2 },     // Q2 (반기)
  '11013': { name: '1분기보고서', quarter: 1 },    // Q1
  '11014': { name: '3분기보고서', quarter: 3 },    // Q3
};

/** 법인구분 */
export const CORP_CLS_NAMES: Record<string, string> = {
  'Y': '유가증권',
  'K': '코스닥',
  'N': '코넥스',
  'E': '기타',
};

// ==================== 상태 관리 ====================

/** DART 페이지 상태 (멀티턴 컨텍스트 — 분석 subagent 내부) */
export interface DartPageState {
  selectedCompany: DartCompany | null;
  companyInfo: DartCompanyInfo | null;
  activeTab: 'financial' | 'workforce' | 'governance' | 'dividend' | 'disclosure';
  isLoading: boolean;
  error: string | null;
}

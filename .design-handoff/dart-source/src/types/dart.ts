/**
 * DART 기업정보 타입 정의
 * Agent 4 전용
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

/** 재무제표 항목 */
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
  thstrmAddAmount?: string;// 당기누적금액
  frmtrmNm?: string;       // 전기명
  frmtrmAmount?: string;   // 전기금액
  frmtrmAddAmount?: string;// 전기누적금액
  bfefrmtrmNm?: string;    // 전전기명
  bfefrmtrmAmount?: string;// 전전기금액
  ord?: string;            // 정렬순서
  currency?: string;       // 통화단위
}

/** 요약 재무 데이터 (차트용) */
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

/** 인력 요약 데이터 (차트용) */
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

/** 배당 요약 데이터 (차트용) */
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

// ==================== 트렌드 데이터 ====================

/** 트렌드 유형 */
export type TrendType = 'annual' | 'quarterly_unit' | 'quarterly_cumulative' | 'yearly_cumulative';

/** 트렌드 데이터 포인트 */
export interface TrendDataPoint {
  year: number;
  quarter?: number;
  period: string;           // "2024Q3", "2024H1", "2024"
  periodLabel: string;      // "2024년 3분기", "2024년 상반기", "2024년"
  value: number | null;
  amount?: number;          // 금액 (원)
  ratio?: number;           // 비율 (%)
  growthRate?: number;      // QoQ 성장률
  yoyRate?: number;         // YoY 성장률
}

/** 재무 트렌드 */
export interface DartFinancialTrend {
  indicator: string;        // 지표명
  indicatorKey: string;     // 지표 키 (영문)
  unit?: string;            // 단위
  dataSource: 'financial' | 'workforce' | 'governance' | 'dividend';
  trendType: TrendType;
  dataPoints: TrendDataPoint[];
}

// ==================== 가용 기간 ====================

/** 연도별 가용 보고서 */
export interface AvailableYear {
  year: number;
  q1Available: boolean;     // 11013
  q2Available: boolean;     // 11012 (반기)
  q3Available: boolean;     // 11014
  annualAvailable: boolean; // 11011 (Q4)
}

/** 기업 가용 기간 정보 */
export interface AvailablePeriods {
  corpCode: string;
  years: AvailableYear[];
  latestYear: number;
  latestQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
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

/** DART API 공통 응답 */
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

/** 기업 종합 정보 */
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

/** DART 페이지 상태 */
export interface DartPageState {
  selectedCompany: DartCompany | null;
  companyInfo: DartCompanyInfo | null;
  activeTab: 'financial' | 'workforce' | 'governance' | 'dividend' | 'disclosure';
  isLoading: boolean;
  error: string | null;
}

// 참고: 10개 메인 탭은 DartDashboard.tsx에서 직접 정의됨
// (공시/재무/주주/임원/직원/배당/차트/M&A/증권발행/감사의견)

// ==================== 재무 지표 ====================

/** 지표 그룹 */
export type IndicatorGroup =
  | 'core'          // 핵심
  | 'profitability' // 수익성
  | 'stability'     // 안정성
  | 'growth'        // 성장성
  | 'efficiency'    // 효율성
  | 'cashflow'      // 현금흐름
  | 'workforce'     // 인력
  | 'governance'    // 지배구조
  | 'dividend';     // 배당

/** 재무 지표 정의 */
export interface IndicatorDefinition {
  key: string;
  name: string;
  group: IndicatorGroup;
  unit: '%' | '배' | '원' | '명' | '년' | '회';
  description?: string;
  formula?: string;
}

/** 계산된 재무 지표 */
export interface CalculatedIndicator {
  key: string;
  name: string;
  value: number | null;
  unit: string;
  group: IndicatorGroup;
  prevValue?: number | null;  // 전기 값
  growthRate?: number | null; // QoQ/HoH 성장률 (전분기/전반기 대비)
  yoyRate?: number | null;    // YoY 성장률 (전년동기 대비)
}

/** 지표 계산 결과 */
export interface IndicatorResult {
  corpCode: string;
  year: number;
  quarter?: number;
  reportCode: string;
  indicators: CalculatedIndicator[];
  byGroup: Record<IndicatorGroup, CalculatedIndicator[]>;
}

// ==================== 자회사/증권/감사 ====================

/** 자회사 현황 */
export interface DartSubsidiary {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  // 오리지널 필드명 (medigatenews / DART API 기준)
  inv_prm?: string;                              // 피투자법인명
  invstmnt_purps?: string;                       // 출자목적
  frst_acqs_de?: string;                         // 최초취득일
  bsis_blce_qy?: string;                         // 기초주식수
  bsis_blce_qota_rt?: string;                    // 기초지분율
  bsis_blce_acntbk_amount?: string;              // 기초장부금액
  trmend_blce_qy?: string;                       // 기말주식수
  trmend_blce_qota_rt?: string;                  // 기말지분율
  trmend_blce_acntbk_amount?: string;            // 기말장부금액
  incrs_dcrs_acqs_dsps_qy?: string;              // 증감수량
  incrs_dcrs_acntbk_amount?: string;             // 증감장부금액
  gl_amount?: string;                            // 손익금액
  recent_bsns_year_fnnr_sttus_tot_assets?: string; // 피투자총자산
  recent_bsns_year_fnnr_sttus_thstrm_ntpf?: string; // 피투자당기손익
  rm?: string;                                   // 비고
  // 하위호환 필드 (기존 코드 호환)
  invstmntCorpNm?: string;     // 피투자회사명 (inv_prm 별칭)
  frstAqsYmd?: string;         // 최초취득일자 (frst_acqs_de 별칭)
  invstmntRt?: string;         // 지분비율 (trmend_blce_qota_rt 별칭)
  thstrmFcAqsAm?: string;      // 당기말 취득금액 (trmend_blce_acntbk_amount 별칭)
  thstrmFcBsisAsetVl?: string; // 당기말 자산가액 (recent_bsns_year_fnnr_sttus_tot_assets 별칭)
}

/** 감사의견 */
export interface DartAuditOpinion {
  rceptNo?: string;             // 접수번호 (DART 원문 링크용)
  corpCode?: string;
  corpName?: string;
  rceptDt?: string;             // 접수일자
  bsnsYear?: string;            // 사업연도 (예: "제55기(당기)")
  bsnsYearNum?: number;         // 사업연도 숫자 (예: 2023)
  reprtCode?: string;           // 보고서 코드
  // 오리지널 필드명 (medigatenews 기준)
  auditOpinion?: string;        // 감사의견 (적정/한정/부적정/의견거절)
  auditor?: string;             // 회계법인명
  stlmDt?: string;              // 결산기준일 (YYYY-MM-DD)
  emphsMatter?: string;         // 강조사항
  coreAdtMatter?: string;       // 핵심감사사항
  adtReprtSpcmntMatter?: string;// 감사보고서 특기사항
  // 하위호환 필드 (기존 코드 호환)
  audtrmNm?: string;            // 감사인명 (auditor 별칭)
  audtRptOpnnCtt?: string;      // 감사보고서 의견 내용 (auditOpinion 별칭)
  audtEmpsCtt?: string;         // 강조사항 (emphsMatter 별칭)
  coreAuditMatterCtt?: string;  // 핵심감사사항 (coreAdtMatter 별칭)
  opnionType?: string;          // 의견유형 (auditOpinion 별칭)
}

/** 유상증자 */
export interface DartPaidInCapitalIncrease {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  rceptDt?: string;            // 접수일자
  // 오리지널 DART API 필드명
  nstkOstkCnt?: string;        // 신주 보통주식수
  nstkEstkCnt?: string;        // 신주 우선주식수
  fvPs?: string;               // 1주당 액면가액
  bficTisstkOstk?: string;     // 증자전 발행주식총수 보통주
  bficTisstkEstk?: string;     // 증자전 발행주식총수 우선주
  fdppFclt?: string;           // 자금조달목적-시설자금
  fdppBsninh?: string;         // 자금조달목적-영업양수자금
  fdppOp?: string;             // 자금조달목적-운영자금
  fdppDtrp?: string;           // 자금조달목적-채무상환자금
  fdppOcsa?: string;           // 자금조달목적-타법인증권취득
  fdppEtc?: string;            // 자금조달목적-기타
  icMthn?: string;             // 증자방식
  sslAt?: string;              // 공모여부
  sslBgd?: string;             // 청약시작일
  sslEdd?: string;             // 청약종료일
  bddd?: string;               // 이사회결의일 (호환용)
  bdFta?: string | null;       // 사채총액 (호환용)
  rmCtt?: string;              // 비고
}

/** 전환사채 (CB) */
export interface DartConvertibleBond {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  rceptDt?: string;
  // 오리지널 DART API 필드명
  bddd?: string;               // 이사회결의일
  bdKnd?: string;              // 사채의 종류
  bdFta?: string;              // 사채의 권면총액
  bdIntrEx?: string;           // 만기이자율
  bdIntrSf?: string;           // 표면이자율
  bdMtd?: string;              // 사채만기일
  bdisMthn?: string;           // 발행방법
  cvRt?: string;               // 전환비율
  cvPrc?: string;              // 전환가액
  cvisstkKnd?: string;         // 전환대상 주식종류
  cvisstkCnt?: string;         // 전환대상 주식수
  cvisstkTisstkVs?: string;    // 발행주식총수 대비 비율
  cvrqpdBgd?: string;          // 전환청구기간 시작일
  cvrqpdEdd?: string;          // 전환청구기간 종료일
  fdppFclt?: string;           // 자금조달목적-시설자금
  fdppOp?: string;             // 자금조달목적-운영자금
  fdppDtrp?: string;           // 자금조달목적-채무상환자금
  fdppOcsa?: string;           // 자금조달목적-타법인증권취득
  fdppEtc?: string;            // 자금조달목적-기타
  sbd?: string;                // 청약일
  pymd?: string;               // 납입일
  bondNm?: string;             // 사채명 (하위호환)
  bondTotamt?: string;         // 사채총액 (하위호환)
  rmCtt?: string;              // 비고
}

/** 교환사채 (EB) */
export interface DartExchangeableBond {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  rceptDt?: string;
  // 오리지널 DART API 필드명
  bddd?: string;               // 이사회결의일
  bdKnd?: string;              // 사채의 종류
  bdFta?: string;              // 사채의 권면총액
  ovisFta?: string;            // 해외발행 권면총액
  ovisFtaCrn?: string;         // 해외발행 통화
  ovisSter?: string;           // 환율
  bdIntrEx?: string;           // 만기이자율
  bdIntrSf?: string;           // 표면이자율
  bdMtd?: string;              // 사채만기일
  bdisMthn?: string;           // 발행방법
  exRt?: string;               // 교환비율
  exPrc?: string;              // 교환가액
  extg?: string;               // 교환대상
  extgStkcnt?: string;         // 교환대상 주식수
  extgTisstkVs?: string;       // 발행주식총수 대비 비율
  exrqpdBgd?: string;          // 교환청구기간 시작일
  exrqpdEdd?: string;          // 교환청구기간 종료일
  fdppOp?: string;             // 자금조달목적-운영자금
  sbd?: string;                // 청약일
  pymd?: string;               // 납입일
  rmCtt?: string;              // 비고
}

/** 신주인수권부사채 (BW) */
export interface DartBondWithWarrant {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  rceptDt?: string;
  // 오리지널 DART API 필드명
  bddd?: string;               // 이사회결의일
  bdKnd?: string;              // 사채의 종류
  bdFta?: string;              // 사채의 권면총액
  bdIntrEx?: string;           // 만기이자율
  bdIntrSf?: string;           // 표면이자율
  bdMtd?: string;              // 사채만기일
  bdisMthn?: string;           // 발행방법
  exPrc?: string;              // 행사가액
  exisstkKnd?: string;         // 행사대상 주식종류
  exisstkCnt?: string;         // 행사대상 주식수
  exisstkTisstkVs?: string;    // 발행주식총수 대비 비율
  exrqpdBgd?: string;          // 행사청구기간 시작일
  exrqpdEdd?: string;          // 행사청구기간 종료일
  fdppFclt?: string;           // 자금조달목적-시설자금
  fdppOp?: string;             // 자금조달목적-운영자금
  sbd?: string;                // 청약일
  pymd?: string;               // 납입일
  rmCtt?: string;              // 비고
}

/** 증권발행 통합 타입 */
export type DartSecuritiesOffering =
  | { type: 'paidInCapital'; data: DartPaidInCapitalIncrease }
  | { type: 'convertibleBond'; data: DartConvertibleBond }
  | { type: 'exchangeableBond'; data: DartExchangeableBond }
  | { type: 'bondWithWarrant'; data: DartBondWithWarrant };

// ==================== 공시 문서 파싱 ====================

/** 공시 문서 섹션 */
export interface DisclosureSection {
  tocId: string;
  title: string;
  level: number;               // 1 또는 2
  subSections?: DisclosureSection[];
}

/** 공시 문서 테이블 */
export interface DisclosureTable {
  hasHeader: boolean;
  rows: string[][];
}

/** 공시 문서 섹션 내용 */
export interface DisclosureSectionContent {
  tocId: string;
  title: string;
  paragraphs: string[];
  tables: DisclosureTable[];
  error?: string;
}

/** 공시 문서 요약 */
export interface DisclosureSummary {
  revenue?: number;
  operatingProfit?: number;
  netIncome?: number;
  totalAssets?: number;
  totalEquity?: number;
  employeeCount?: number;
}

/** 공시 문서 전체 */
export interface DisclosureDocument {
  rceptNo: string;
  documentName: string;
  companyName: string;
  documentCode: string;
  formulaVersion: string;
  metadata: Record<string, string>;
  sections: DisclosureSection[];
  summary?: DisclosureSummary;
  error?: string;
}

// ==================== 지표 상수 ====================

/**
 * 지표별 데이터 가용성 매핑
 * - dataSource: 데이터 소스 타입 (financial/workforce/governance/dividend)
 * - annual: 연간 데이터 지원 여부 (true/false)
 * - quarterly: 분기 데이터 패턴 ('QF'=전분기, 'QH'=반기, false=미지원)
 * - cumulative: 누적 데이터 패턴 ('CF'=전분기, 'CP'=부분, false=미지원)
 * - latestPeriod: 대시보드 최신값 기준 ('quarterly'=최신분기, 'annual'=최신연간)
 */
export interface IndicatorDataAvailability {
  dataSource: 'financial' | 'workforce' | 'governance' | 'dividend';
  annual: boolean;
  quarterly: 'QF' | 'QH' | false;
  cumulative: 'CF' | 'CP' | false;
  latestPeriod: 'quarterly' | 'annual';
}

export const INDICATOR_DATA_AVAILABILITY: Record<string, IndicatorDataAvailability> = {
  // === 핵심(core) - 재무제표 API ===
  revenue:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: 'CF', latestPeriod: 'quarterly' },
  operatingIncome: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: 'CF', latestPeriod: 'quarterly' },
  netIncome:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: 'CP', latestPeriod: 'quarterly' },
  debtRatio:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  roe:             { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 수익성(profitability) - 재무제표 API ===
  grossProfitMargin:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  operatingProfitMargin: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  netProfitMargin:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  roa:                   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  eps:                   { dataSource: 'financial', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },

  // === 안정성(stability) - 재무제표 API ===
  currentRatio:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  quickRatio:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  interestCoverage: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  debtDependency:   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  netDebtRatio:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 성장성(growth) - 재무제표 API ===
  revenueGrowth:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  operatingIncomeGrowth: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  netIncomeGrowth:       { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  assetGrowth:           { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  equityGrowth:          { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 효율성(efficiency) - 재무제표 API ===
  assetTurnover:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  receivablesTurnover:   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  inventoryTurnover:     { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  payablesTurnover:      { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  tangibleAssetTurnover: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 현금흐름(cashflow) - 재무제표 API ===
  operatingCF: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  investingCF: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  financingCF: { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  fcf:         { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },
  cashRatio:   { dataSource: 'financial', annual: true, quarterly: 'QF', cumulative: false, latestPeriod: 'quarterly' },

  // === 인력(workforce) - 직원현황 API ===
  revenuePerEmployee: { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  avgSalary:          { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  regularRatio:       { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  avgTenure:          { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  genderRatio:        { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  employeeCount:      { dataSource: 'workforce', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },

  // === 지배구조(governance) - 주주/임원현황 API ===
  largestShareholderRatio: { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  relatedPartyRatio:       { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  executiveCount:          { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  outsideDirectorRatio:    { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },
  femaleExecutiveRatio:    { dataSource: 'governance', annual: true, quarterly: 'QH', cumulative: false, latestPeriod: 'quarterly' },

  // === 배당(dividend) - 배당정보 API ===
  dps:           { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  payoutRatio:   { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  dividendYield: { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
  totalDividend: { dataSource: 'dividend', annual: true, quarterly: false, cumulative: false, latestPeriod: 'annual' },
};

/**
 * 지표별 Delta 설정 조회
 * @returns { label: 'QoQ' | 'HoH' | 'YoY', rateField: 'growthRate' | 'yoyRate' }
 */
export function getIndicatorDeltaConfig(indicatorKey: string): { label: 'QoQ' | 'HoH' | 'YoY'; rateField: 'growthRate' | 'yoyRate' } {
  const availability = INDICATOR_DATA_AVAILABILITY[indicatorKey];

  if (!availability) {
    // 미등록 지표는 YoY 기본값
    return { label: 'YoY', rateField: 'yoyRate' };
  }

  const { quarterly, latestPeriod } = availability;

  // latestPeriod가 'quarterly'이고 분기 데이터가 있으면 QoQ 또는 HoH
  if (latestPeriod === 'quarterly' && quarterly) {
    const label = quarterly === 'QH' ? 'HoH' : 'QoQ';
    return { label, rateField: 'growthRate' };
  }

  // 그 외에는 YoY
  return { label: 'YoY', rateField: 'yoyRate' };
}

/** 지표 그룹 정보 */
export const INDICATOR_GROUPS: Record<IndicatorGroup, { name: string; description: string }> = {
  core: { name: '핵심', description: '부채비율, ROE 등 핵심 지표' },
  profitability: { name: '수익성', description: '매출총이익률, 영업이익률, 순이익률, ROA' },
  stability: { name: '안정성', description: '유동비율, 당좌비율, 이자보상배율' },
  growth: { name: '성장성', description: '매출/영업이익/순이익/자산/자본 성장률' },
  efficiency: { name: '효율성', description: '총자산/매출채권/재고자산/매입채무 회전율' },
  cashflow: { name: '현금흐름', description: '영업/투자/재무 현금흐름, FCF' },
  workforce: { name: '인력', description: '직원수, 평균급여, 정규직비율, 평균근속' },
  governance: { name: '지배구조', description: '최대주주지분, 사외이사비율, 여성임원비율' },
  dividend: { name: '배당', description: 'DPS, 배당성향, 배당수익률' },
};

// ==================== 지표 표시 설정 ====================

/** 값 타입 */
export type ValueType = 'amount' | 'percent' | 'times' | 'count' | 'years';

/** 성장률 의미 */
export type SignMeaning = 'higher_better' | 'lower_better' | 'neutral';

/** 성장률 표시 방식 */
export type GrowthDisplay = 'yoy' | 'qoq' | 'none';

/** 지표 표시 설정 */
export interface IndicatorDisplayConfig {
  label: string;
  description: string;
  formula: string;
  valueType: ValueType;
  unit: string;
  growthDisplay: GrowthDisplay;
  signMeaning: SignMeaning;
  changeUnit: string;  // '%' 또는 '%p'
}

/**
 * 지표별 표시 설정 매핑
 * Java 프로젝트 indicator-display-config.js 기반
 */
export const INDICATOR_DISPLAY_CONFIG: Record<string, IndicatorDisplayConfig> = {
  // ============================================================
  // 핵심 (core) - 5개
  // ============================================================
  revenue: {
    label: '매출액',
    description: '기업의 주된 영업활동에서 발생한 총 수익.',
    formula: '제품/서비스 판매 수익의 총합',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  operatingIncome: {
    label: '영업이익',
    description: '주된 영업활동에서 발생한 이익.',
    formula: '매출액 - 매출원가 - 판매비와관리비',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  netIncome: {
    label: '당기순이익',
    description: '모든 수익과 비용을 차감한 최종 이익.',
    formula: '영업이익 + 영업외수익 - 영업외비용 - 법인세비용',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  debtRatio: {
    label: '부채비율',
    description: '자기자본 대비 부채의 비율. 낮을수록 안정적.',
    formula: '(부채총계 ÷ 자본총계) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'lower_better',
    changeUnit: '%p'
  },
  roe: {
    label: 'ROE',
    description: '자기자본이익률. 주주 투자 대비 이익 창출 능력.',
    formula: '(당기순이익 ÷ 자본총계) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },

  // ============================================================
  // 수익성 (profitability) - 5개
  // ============================================================
  grossProfitMargin: {
    label: '매출총이익률',
    description: '매출액에서 매출원가를 차감한 이익의 비율.',
    formula: '(매출총이익 ÷ 매출액) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  operatingProfitMargin: {
    label: '영업이익률',
    description: '매출액 대비 영업이익의 비율.',
    formula: '(영업이익 ÷ 매출액) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  netProfitMargin: {
    label: '순이익률',
    description: '매출액 대비 당기순이익의 비율.',
    formula: '(당기순이익 ÷ 매출액) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  roa: {
    label: 'ROA',
    description: '총자산이익률. 자산 활용 효율성.',
    formula: '(당기순이익 ÷ 자산총계) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  eps: {
    label: 'EPS',
    description: '주당순이익.',
    formula: '당기순이익 ÷ 발행주식수',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },

  // ============================================================
  // 안정성 (stability) - 5개
  // ============================================================
  currentRatio: {
    label: '유동비율',
    description: '단기 채무 상환 능력.',
    formula: '(유동자산 ÷ 유동부채) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  quickRatio: {
    label: '당좌비율',
    description: '즉시 현금화 가능한 자산의 비율.',
    formula: '((유동자산 - 재고자산) ÷ 유동부채) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  interestCoverage: {
    label: '이자보상배율',
    description: '영업이익으로 이자비용 감당 능력.',
    formula: '영업이익 ÷ 이자비용',
    valueType: 'times',
    unit: '배',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  debtDependency: {
    label: '차입금의존도',
    description: '총자산 중 차입금 비율.',
    formula: '((단기+장기차입금+사채) ÷ 자산총계) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'lower_better',
    changeUnit: '%p'
  },
  netDebtRatio: {
    label: '순차입금비율',
    description: '순차입금의 자기자본 대비 비율.',
    formula: '((차입금 - 현금) ÷ 자본총계) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'lower_better',
    changeUnit: '%p'
  },

  // ============================================================
  // 성장성 (growth) - 5개
  // ============================================================
  revenueGrowth: {
    label: '매출 성장률',
    description: '매출액 증가율.',
    formula: '((당기 - 전기) ÷ |전기|) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  operatingIncomeGrowth: {
    label: '영업이익 성장률',
    description: '영업이익 증가율.',
    formula: '((당기 - 전기) ÷ |전기|) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  netIncomeGrowth: {
    label: '순이익 성장률',
    description: '당기순이익 증가율.',
    formula: '((당기 - 전기) ÷ |전기|) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  assetGrowth: {
    label: '자산 성장률',
    description: '총자산 증가율.',
    formula: '((당기 - 전기) ÷ |전기|) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  equityGrowth: {
    label: '자본 성장률',
    description: '자기자본 증가율.',
    formula: '((당기 - 전기) ÷ |전기|) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },

  // ============================================================
  // 효율성 (efficiency) - 5개
  // ============================================================
  assetTurnover: {
    label: '총자산회전율',
    description: '자산이 매출 창출에 기여하는 정도.',
    formula: '매출액 ÷ 평균 자산총계',
    valueType: 'times',
    unit: '회',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  receivablesTurnover: {
    label: '매출채권회전율',
    description: '매출채권 회수 효율성.',
    formula: '매출액 ÷ 평균 매출채권',
    valueType: 'times',
    unit: '회',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  inventoryTurnover: {
    label: '재고자산회전율',
    description: '재고 판매 효율성.',
    formula: '매출원가 ÷ 평균 재고자산',
    valueType: 'times',
    unit: '회',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  payablesTurnover: {
    label: '매입채무회전율',
    description: '매입채무 결제 빈도.',
    formula: '매출원가 ÷ 평균 매입채무',
    valueType: 'times',
    unit: '회',
    growthDisplay: 'yoy',
    signMeaning: 'neutral',
    changeUnit: '%'
  },
  tangibleAssetTurnover: {
    label: '유형자산회전율',
    description: '유형자산 활용 효율성.',
    formula: '매출액 ÷ 평균 유형자산',
    valueType: 'times',
    unit: '회',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },

  // ============================================================
  // 현금흐름 (cashflow) - 5개
  // ============================================================
  operatingCF: {
    label: '영업활동CF',
    description: '영업활동에서 발생한 현금흐름.',
    formula: '당기순이익 + 비현금비용 - 비현금수익 ± 운전자본 변동',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  investingCF: {
    label: '투자활동CF',
    description: '투자활동에서 발생한 현금흐름.',
    formula: '유형자산 취득/처분 + 투자자산 증감',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%'
  },
  financingCF: {
    label: '재무활동CF',
    description: '재무활동에서 발생한 현금흐름.',
    formula: '차입금 증감 + 유상증자 - 배당금 지급',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%'
  },
  fcf: {
    label: '잉여현금흐름',
    description: 'Free Cash Flow.',
    formula: '영업활동현금흐름 - 자본적지출(CAPEX)',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  cashRatio: {
    label: '현금보유비율',
    description: '총자산 중 현금 비율.',
    formula: '(현금 ÷ 자산총계) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%p'
  },

  // ============================================================
  // 인력 (workforce) - 6개
  // ============================================================
  employeeCount: {
    label: '직원 수',
    description: '총 직원 수.',
    formula: '정규직 + 계약직',
    valueType: 'count',
    unit: '명',
    growthDisplay: 'yoy',
    signMeaning: 'neutral',
    changeUnit: '%'
  },
  revenuePerEmployee: {
    label: '1인당 매출액',
    description: '직원 1인당 창출 매출액.',
    formula: '매출액 ÷ 총 직원수',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  avgSalary: {
    label: '평균 급여',
    description: '직원 1인당 평균 연봉.',
    formula: '급여총액 ÷ 총 직원수',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'neutral',
    changeUnit: '%'
  },
  regularRatio: {
    label: '정규직 비율',
    description: '전체 직원 중 정규직 비율.',
    formula: '(정규직 수 ÷ 총 직원수) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  avgTenure: {
    label: '평균 근속연수',
    description: '직원들의 평균 근속 기간.',
    formula: '전체 직원 근속연수 합계 ÷ 총 직원수',
    valueType: 'years',
    unit: '년',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  genderRatio: {
    label: '남성 비율',
    description: '전체 직원 중 남성 비율.',
    formula: '(남성 직원수 ÷ 총 직원수) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%p'
  },

  // ============================================================
  // 지배구조 (governance) - 5개
  // ============================================================
  largestShareholderRatio: {
    label: '최대주주 지분율',
    description: '최대주주 보유 지분 비율.',
    formula: '(최대주주 보유주식수 ÷ 발행주식총수) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%p'
  },
  relatedPartyRatio: {
    label: '특수관계인 합산',
    description: '최대주주와 특수관계인 지분 합계.',
    formula: '((최대주주 + 특수관계인) ÷ 발행주식총수) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%p'
  },
  executiveCount: {
    label: '임원 수',
    description: '등기임원 총 인원수.',
    formula: '등기이사 + 감사',
    valueType: 'count',
    unit: '명',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%'
  },
  outsideDirectorRatio: {
    label: '사외이사 비율',
    description: '전체 이사 중 사외이사 비율.',
    formula: '(사외이사 수 ÷ 전체 이사 수) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  femaleExecutiveRatio: {
    label: '여성임원 비율',
    description: '전체 임원 중 여성 비율.',
    formula: '(여성 임원수 ÷ 전체 임원수) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },

  // ============================================================
  // 배당 (dividend) - 4개
  // ============================================================
  dps: {
    label: '주당배당금',
    description: '주식 1주당 지급 배당금.',
    formula: '현금배당총액 ÷ 발행주식수',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  },
  payoutRatio: {
    label: '배당성향',
    description: '순이익 중 배당금 지급 비율.',
    formula: '(배당금총액 ÷ 당기순이익) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'neutral',
    changeUnit: '%p'
  },
  dividendYield: {
    label: '시가배당율',
    description: '현재 주가 대비 배당금 비율.',
    formula: '(주당배당금 ÷ 기말주가) × 100',
    valueType: 'percent',
    unit: '%',
    growthDisplay: 'none',
    signMeaning: 'higher_better',
    changeUnit: '%p'
  },
  totalDividend: {
    label: '현금배당총액',
    description: '해당 사업연도 현금배당 총액.',
    formula: '주당배당금 × 배당지급 대상 주식수',
    valueType: 'amount',
    unit: '원',
    growthDisplay: 'yoy',
    signMeaning: 'higher_better',
    changeUnit: '%'
  }
};

// ==================== 성장률 표시 유틸리티 ====================

/**
 * 성장률 표시 유틸리티 함수들
 * Java 프로젝트 growth-display.js 기반
 */

/**
 * 성장률 색상 클래스 반환
 * @param rate - 성장률
 * @param signMeaning - 의미 ('higher_better', 'lower_better', 'neutral')
 * @returns Tailwind 색상 클래스
 */
export function getGrowthColorClass(
  rate: number | null | undefined,
  signMeaning: SignMeaning = 'higher_better'
): string {
  if (rate === null || rate === undefined) return 'text-gray-400';

  const isPositive = rate >= 0;

  switch (signMeaning) {
    case 'higher_better':
      // 높을수록 좋음: 양수=빨강(좋음), 음수=파랑(나쁨)
      return isPositive ? 'text-red-500' : 'text-blue-500';
    case 'lower_better':
      // 낮을수록 좋음: 음수=빨강(좋음), 양수=파랑(나쁨)
      return isPositive ? 'text-blue-500' : 'text-red-500';
    case 'neutral':
    default:
      return 'text-gray-500';
  }
}

/**
 * 지표 ID 기반 색상 클래스 반환
 */
export function getGrowthColorClassByIndicator(
  rate: number | null | undefined,
  indicatorKey: string
): string {
  const config = INDICATOR_DISPLAY_CONFIG[indicatorKey];
  const signMeaning = config?.signMeaning || 'higher_better';
  return getGrowthColorClass(rate, signMeaning);
}

/**
 * 지표별 변화량 단위 반환
 */
export function getChangeUnit(indicatorKey: string): string {
  const config = INDICATOR_DISPLAY_CONFIG[indicatorKey];
  return config?.changeUnit || '%';
}

/**
 * 성장률 포맷팅
 * @param rate - 성장률
 * @param unit - 단위 ('%' 또는 '%p')
 * @param includeSign - 부호 포함 여부
 * @returns 포맷된 성장률 문자열
 */
export function formatGrowthRate(
  rate: number | null | undefined,
  unit: string = '%',
  includeSign: boolean = true
): string {
  if (rate === null || rate === undefined) return '-';
  const sign = includeSign && rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}${unit}`;
}

/**
 * 성장률 표시 전체 문자열 생성
 * @param rate - 성장률
 * @param indicatorKey - 지표 ID
 * @returns 전체 표시 문자열 (예: "YoY +5.2%")
 */
export function formatGrowthFull(
  rate: number | null | undefined,
  indicatorKey: string
): string {
  if (rate === null || rate === undefined) return '-';

  const { label } = getIndicatorDeltaConfig(indicatorKey);
  const unit = getChangeUnit(indicatorKey);
  const formatted = formatGrowthRate(rate, unit);

  return `${label} ${formatted}`;
}

/**
 * 성장률 표시 여부 확인
 */
export function shouldShowGrowth(indicatorKey: string): boolean {
  const config = INDICATOR_DISPLAY_CONFIG[indicatorKey];
  return config?.growthDisplay !== 'none';
}

/**
 * DataPoint에서 적절한 성장률 값 추출
 */
export function extractGrowthRate(
  dataPoint: TrendDataPoint | null,
  indicatorKey: string
): number | null {
  if (!dataPoint) return null;

  const { rateField } = getIndicatorDeltaConfig(indicatorKey);

  if (rateField === 'yoyRate') {
    // YoY 우선, 없으면 growthRate fallback
    return dataPoint.yoyRate ?? dataPoint.growthRate ?? null;
  }
  return dataPoint.growthRate ?? null;
}

/**
 * 테이블 셀용 성장률 표시
 */
export function formatGrowthForTable(
  rate: number | null | undefined,
  indicatorKey: string
): { text: string; colorClass: string } {
  if (rate === null || rate === undefined) {
    return { text: '-', colorClass: '' };
  }

  const unit = getChangeUnit(indicatorKey);
  const colorClass = getGrowthColorClassByIndicator(rate, indicatorKey);
  const text = formatGrowthRate(rate, unit);

  return { text, colorClass };
}

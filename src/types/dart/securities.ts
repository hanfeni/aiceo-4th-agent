/**
 * DART 자본거래 타입 — 자회사/감사의견/증권발행(CB·EB·BW·유상증자) +
 * 공시 원문 파싱 구조.
 *
 * 이식 출처: medigate-manager `types/dart.ts`(10fb7f4) 382~605행.
 * 기능축 분리(STRUCTURAL #2 — 원본 복사 금지). 이 파일 = "자본·증권
 * 이벤트 + 공시 문서 구조" 축. 증권발행 4종은 DART API 원본 필드명
 * (snake/축약형) 그대로 — 발행조건 파싱이 원본 키에 의존(별칭 병기).
 */

/** 자회사 현황 */
export interface DartSubsidiary {
  rceptNo?: string;
  corpCode?: string;
  corpName?: string;
  // 오리지널 필드명 (DART API 기준)
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
  // 하위호환 필드 (별칭)
  invstmntCorpNm?: string;     // 피투자회사명 (inv_prm 별칭)
  frstAqsYmd?: string;         // 최초취득일자 (frst_acqs_de 별칭)
  invstmntRt?: string;         // 지분비율 (trmend_blce_qota_rt 별칭)
  thstrmFcAqsAm?: string;      // 당기말 취득금액 (trmend_blce_acntbk_amount 별칭)
  thstrmFcBsisAsetVl?: string; // 당기말 자산가액 (..._tot_assets 별칭)
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
  // 오리지널 필드명
  auditOpinion?: string;        // 감사의견 (적정/한정/부적정/의견거절)
  auditor?: string;             // 회계법인명
  stlmDt?: string;              // 결산기준일 (YYYY-MM-DD)
  emphsMatter?: string;         // 강조사항
  coreAdtMatter?: string;       // 핵심감사사항
  adtReprtSpcmntMatter?: string;// 감사보고서 특기사항
  // 하위호환 필드 (별칭)
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

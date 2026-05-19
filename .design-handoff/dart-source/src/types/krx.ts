/**
 * KRX (KIND) 공시 타입 정의
 * kind.krx.co.kr 스크래핑 기반
 */

// ==================== 회사 정보 ====================

/** KRX 회사 검색 결과 */
export interface KrxCompany {
  comAttrTpCd: string;           // 회사속성유형코드
  repisusrtkornm: string;        // 대표발행인한글명
  kiscomcd: string;              // KISCOM 코드
  spotisutrdmkttpcd: string;     // 시장구분 (1=유가, 2=코스닥, 6=코넥스)
  isurcd: string;                // 발행사코드 (5자리)
  fssunqno: string;              // 금융감독원 고유번호 (=DART corpCode)
  secugrpId: string;             // 증권그룹ID
  repisusrtcd: string;           // 종목코드 (A포함, 예: A005930)
  comabbrv: string;              // 회사약칭
  repisusrtcd2: string;          // 종목코드 (6자리, 예: 005930)
  repisucd: string;              // ISIN코드 (예: KR7005930003)
  liststatcd: string;            // 상장상태코드
}

/** KRX 시장구분 */
export type KrxMarketType = '1' | '2' | '6' | '4' | '3';

/** KRX 시장구분 매핑 */
export const KRX_MARKET_MAP: Record<KrxMarketType, { name: string; dartCls: string }> = {
  '1': { name: '유가증권', dartCls: 'Y' },
  '2': { name: '코스닥', dartCls: 'K' },
  '6': { name: '코넥스', dartCls: 'N' },
  '4': { name: '채권', dartCls: '' },
  '3': { name: '파생', dartCls: '' },
};

/** DART → KRX 시장구분 변환 */
export const DART_TO_KRX_MARKET: Record<string, KrxMarketType> = {
  'Y': '1',
  'K': '2',
  'N': '6',
};

// ==================== 공시 정보 ====================

/** KRX 공시 항목 */
export interface KrxDisclosure {
  num: string;                   // 순번
  time: string;                  // 공시일시 (YYYY-MM-DD HH:mm)
  company: string;               // 회사명
  market: string;                // 시장구분 (유가/코스닥/코넥스)
  title: string;                 // 공시제목
  disclsNo: string;              // 공시번호 (acptNo)
  submitter: string;             // 제출인
}

/** KRX 공시 상세 문서 정보 */
export interface KrxDisclosureDetail {
  acptNo: string;                // 접수번호
  title: string;                 // 공시제목
  company: string;               // 회사명
  market: string;                // 시장구분
  submitter: string;             // 제출인
  time: string;                  // 공시일시
  // 문서 내용
  documents: KrxDocument[];      // 첨부 문서 목록
  content?: string;              // HTML 본문 내용 (메인 문서)
}

/** KRX 공시 미리보기 (파싱된 내용) */
export interface KrxDisclosurePreview {
  acptNo: string;                // 접수번호
  title: string;                 // 공시제목
  type: KrxDisclosureType;       // 공시 유형
  textContent: string;           // 정제된 텍스트 내용
  structuredData: Record<string, string>;  // 구조화된 데이터 (키-값)
  tables: KrxParsedTable[];      // 파싱된 테이블 데이터
  rawHtml?: string;              // 원본 HTML (필요시)
}

/** KRX 공시 유형 */
export type KrxDisclosureType =
  | 'market_warning'      // 투자경고/주의/위험종목
  | 'market_managed'      // 관리종목
  | 'market_delisting'    // 상장폐지
  | 'market_halt'         // 매매거래정지
  | 'periodic_report'     // 정기보고서
  | 'timely_disclosure'   // 수시공시
  | 'fair_disclosure'     // 공정공시
  | 'unknown';            // 기타

/** KRX 파싱된 테이블 */
export interface KrxParsedTable {
  headers: string[];
  rows: string[][];
}

/** KRX 첨부 문서 */
export interface KrxDocument {
  docNo: string;                 // 문서번호
  docNm: string;                 // 문서명
  docPath?: string;              // 문서 경로
  docLocPath?: string;           // 문서 로컬 경로 (PDF용)
}

/** KRX PDF 정보 */
export interface KrxPdfInfo {
  available: boolean;            // PDF 사용 가능 여부
  acptNo: string;                // 접수번호
  docNo: string;                 // 문서번호
  docLocPath?: string;           // 문서 로컬 경로
  docPath?: string;              // 문서 경로
  fileName?: string;             // 파일명
}

/** KRX 공시 검색 결과 */
export interface KrxDisclosureResult {
  total: number;                 // 전체 건수
  pageIndex: number;             // 현재 페이지
  pageSize: number;              // 페이지 크기
  disclosures: KrxDisclosure[];  // 공시 목록
}

// ==================== 공시유형 코드 ====================

/** 공시유형 카테고리 */
export type KrxDisclosureCategory =
  | 'timely'       // 수시공시 (disclosureTypeArr01)
  | 'market'       // 시장조치 (disclosureTypeArr02)
  | 'fair'         // 공정공시 (disclosureTypeArr03)
  | 'regular';     // 정기공시 (disclosureTypeArr05)

/** 수시공시 코드 (disclosureTypeArr01) */
export const KRX_TIMELY_DISCLOSURE_CODES = {
  '0113': '배당',
  '0145': '증자/감자',
  '0127': '영업양수도/분할/합병',
  '0143': '주주총회관련',
  '0119': '주식관련사채',
  '0134': '자기주식(신탁포함)',
  '0149': '최대/주요주주/계열회사변경',
  '0123': '소송',
  '0184': '기업가치 제고 계획',
} as const;

/** 시장조치 코드 (disclosureTypeArr02) */
export const KRX_MARKET_DISCLOSURE_CODES = {
  '0350': '관리종목',
  '0328': '상장폐지',
  '0342': '투자경고종목',
  '0343': '투자위험종목',
  '0341': '투자주의종목',
  '0311': '매매거래정지 및 정지해제',
  '0321': '신규/추가/변경/재상장',
} as const;

/** 공정공시 코드 (disclosureTypeArr03) */
export const KRX_FAIR_DISCLOSURE_CODES = {
  '0201': '장래사업계획 및 경영계획',
  '0202': '수시공시의무관련사항',
  '0203': '매출액 영업손익 등 전망/예측',
  '0204': '매출액 영업손익 등 영업실적',
  '0205': '결산실적공시예고',
  '0299': '기타',
} as const;

/** 정기공시 코드 (disclosureTypeArr05) */
export const KRX_REGULAR_DISCLOSURE_CODES = {
  '0501': '사업보고서',
  '0502': '반기보고서',
  '0503': '분기보고서',
  '0505': '감사보고서',
  '0507': '결합감사보고서',
  '0504': '등록법인결산서류',
  '0506': '연결감사보고서',
} as const;

/** 공시유형 필터 옵션 */
export interface KrxDisclosureTypeFilter {
  category: KrxDisclosureCategory;
  codes: string[];               // 선택된 코드들 (콤마로 연결)
}

// ==================== 검색 파라미터 ====================

/** KRX 공시 검색 파라미터 */
export interface KrxDisclosureSearchParams {
  // 필수
  searchCorpName: string;        // 회사명
  repIsuSrtCd: string;           // 종목코드 (A포함)
  isurCd: string;                // 발행사코드
  fromDate: string;              // 시작일 (YYYY-MM-DD)
  toDate: string;                // 종료일 (YYYY-MM-DD)

  // 페이지네이션
  pageIndex?: number;            // 페이지번호 (기본: 1)
  currentPageSize?: number;      // 페이지크기 (기본: 15)

  // 정렬
  orderMode?: '0' | '1';         // 정렬기준 (0: 시간, 1: 제목)
  orderStat?: 'D' | 'A';         // 정렬순서 (D: 내림차순, A: 오름차순)

  // 필터
  marketType?: KrxMarketType;    // 시장구분
  lastReport?: boolean;          // 최종보고서만

  // 공시유형 필터
  disclosureType01?: string;     // 수시공시 코드들 (콤마로 연결)
  disclosureType02?: string;     // 시장조치 코드들
  disclosureType03?: string;     // 공정공시 코드들
  disclosureType05?: string;     // 정기공시 코드들
}

// ==================== API 응답 ====================

/** KRX API 공통 응답 */
export interface KrxApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** KRX 회사 검색 응답 */
export type KrxCompanySearchResponse = KrxApiResponse<KrxCompany[]>;

/** KRX 공시 검색 응답 */
export type KrxDisclosureSearchResponse = KrxApiResponse<KrxDisclosureResult>;

// ==================== UI 필터 상태 ====================

/** KRX 공시 탭 필터 상태 */
export interface KrxDisclosureFilterState {
  period: '1m' | '3m' | '6m' | '1y' | '2y' | '3y' | 'custom';
  fromDate?: string;
  toDate?: string;
  category: KrxDisclosureCategory | 'all';
  codes: string[];               // 선택된 세부 코드들
  marketType: KrxMarketType | 'all';
  lastReportOnly: boolean;
  orderBy: 'time' | 'title';
  orderDir: 'desc' | 'asc';
}

/** 기본 필터 상태 */
export const DEFAULT_KRX_FILTER_STATE: KrxDisclosureFilterState = {
  period: '1y',
  category: 'all',
  codes: [],
  marketType: 'all',
  lastReportOnly: false,
  orderBy: 'time',
  orderDir: 'desc',
};

// ==================== 유틸리티 함수 ====================

/**
 * 기간 프리셋을 날짜 범위로 변환
 */
export function getPeriodDateRange(period: KrxDisclosureFilterState['period']): { fromDate: string; toDate: string } {
  const today = new Date();
  const toDate = today.toISOString().split('T')[0];

  const fromDate = new Date(today);
  switch (period) {
    case '1m':
      fromDate.setMonth(fromDate.getMonth() - 1);
      break;
    case '3m':
      fromDate.setMonth(fromDate.getMonth() - 3);
      break;
    case '6m':
      fromDate.setMonth(fromDate.getMonth() - 6);
      break;
    case '1y':
      fromDate.setFullYear(fromDate.getFullYear() - 1);
      break;
    case '2y':
      fromDate.setFullYear(fromDate.getFullYear() - 2);
      break;
    case '3y':
      fromDate.setFullYear(fromDate.getFullYear() - 3);
      break;
    default:
      fromDate.setFullYear(fromDate.getFullYear() - 1);
  }

  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate,
  };
}

/**
 * KRX 시장구분을 한글명으로 변환
 */
export function getKrxMarketName(marketCode: string): string {
  const market = KRX_MARKET_MAP[marketCode as KrxMarketType];
  return market?.name || '';
}

/**
 * DART corpCls를 KRX marketType으로 변환
 */
export function dartClsToKrxMarket(corpCls: string): KrxMarketType | undefined {
  return DART_TO_KRX_MARKET[corpCls];
}

/**
 * DART OpenAPI 클라이언트
 * Agent 4 전용
 *
 * OpenDART API 문서: https://opendart.fss.or.kr/
 */

import type {
  DartCompany,
  DartCompanyInfo,
  DartFinancialItem,
  DartEmployee,
  DartShareholder,
  DartExecutive,
  DartDividend,
  DartDisclosure,
  DisclosureListResult,
  DartApiResponse,
  ReportCode,
  DartSubsidiary,
  DartAuditOpinion,
  DartPaidInCapitalIncrease,
  DartConvertibleBond,
  DartExchangeableBond,
  DartBondWithWarrant,
  AvailablePeriods,
  AvailableYear,
} from '@/types/dart';
import {
  recordApiCallSync,
  reportConnectionErrorSync,
  canMakeRequest,
  getThrottleDelay,
  getRateLimitStateSync,
} from '@/lib/services/dart/rate-limiter';

const DART_API_URL = 'https://opendart.fss.or.kr/api';

// 기업코드 캐시 (메모리)
let corpCodeCache: Map<string, DartCompany> = new Map();
let corpNameIndex: Map<string, DartCompany[]> = new Map();
let cacheLoaded = false;

// ==================== API 응답 캐시 시스템 ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// 캐시 저장소 (endpoint별로 분리)
const apiCache = new Map<string, CacheEntry<unknown>>();

// ==================== API 호출 카운터 ====================

interface ApiCallStats {
  totalCalls: number;
  cacheHits: number;
  cacheMisses: number;
  startTime: number;
}

let apiCallStats: ApiCallStats = {
  totalCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: Date.now(),
};

/**
 * API 호출 통계 초기화
 */
export function resetApiCallStats(): void {
  apiCallStats = {
    totalCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now(),
  };
  console.log('[DART API] Stats reset');
}

/**
 * API 호출 통계 조회
 */
export function getApiCallStats(): ApiCallStats & { cacheHitRate: string; elapsed: string } {
  const elapsed = Date.now() - apiCallStats.startTime;
  const hitRate = apiCallStats.totalCalls > 0
    ? ((apiCallStats.cacheHits / apiCallStats.totalCalls) * 100).toFixed(1)
    : '0';

  return {
    ...apiCallStats,
    cacheHitRate: `${hitRate}%`,
    elapsed: `${(elapsed / 1000).toFixed(1)}s`,
  };
}

/**
 * API 호출 통계 로그 출력
 */
export function logApiCallStats(label: string = 'DART API Stats'): void {
  const stats = getApiCallStats();
  console.log(`[${label}] Total: ${stats.totalCalls}, Hits: ${stats.cacheHits}, Misses: ${stats.cacheMisses}, HitRate: ${stats.cacheHitRate}, Elapsed: ${stats.elapsed}`);
}

// 캐시 설정
const CACHE_CONFIG = {
  // 재무제표: 1시간 (자주 변경되지 않음)
  financialStatements: 60 * 60 * 1000,
  // 기업정보: 24시간
  companyInfo: 24 * 60 * 60 * 1000,
  // 공시목록: 10분 (자주 업데이트됨)
  disclosures: 10 * 60 * 1000,
  // 주주/임원/배당: 1시간
  corporateInfo: 60 * 60 * 1000,
  // 기본값: 30분
  default: 30 * 60 * 1000,
};

/**
 * 캐시 키 생성
 */
function createCacheKey(endpoint: string, params: Record<string, string>): string {
  const sortedParams = Object.keys(params)
    .filter(k => k !== 'crtfc_key') // API 키는 제외
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return `${endpoint}?${sortedParams}`;
}

/**
 * 캐시 TTL 결정
 */
function getCacheTTL(endpoint: string): number {
  if (endpoint.includes('fnltt') || endpoint.includes('Acnt')) {
    return CACHE_CONFIG.financialStatements;
  }
  if (endpoint === 'company.json') {
    return CACHE_CONFIG.companyInfo;
  }
  if (endpoint === 'list.json') {
    return CACHE_CONFIG.disclosures;
  }
  if (['hyslrSttus', 'exctvSttus', 'empSttus', 'alotMatter'].some(e => endpoint.includes(e))) {
    return CACHE_CONFIG.corporateInfo;
  }
  return CACHE_CONFIG.default;
}

/**
 * 캐시에서 데이터 조회
 */
function getFromCache<T>(key: string): T | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * 캐시에 데이터 저장
 */
function setToCache<T>(key: string, data: T, ttl: number): void {
  const now = Date.now();
  apiCache.set(key, {
    data,
    timestamp: now,
    expiresAt: now + ttl,
  });
}

/**
 * 캐시 통계 조회
 */
export function getDartCacheStats(): { size: number; keys: string[] } {
  return {
    size: apiCache.size,
    keys: Array.from(apiCache.keys()),
  };
}

/**
 * 캐시 클리어
 */
export function clearDartCache(): void {
  apiCache.clear();
  console.log('[DART Cache] Cache cleared');
}

/**
 * 만료된 캐시 정리
 */
export function cleanupExpiredCache(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of apiCache.entries()) {
    if (now > (entry as CacheEntry<unknown>).expiresAt) {
      apiCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[DART Cache] Cleaned ${cleaned} expired entries`);
  }
  return cleaned;
}

/**
 * API 키 가져오기
 */
function getApiKey(): string {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    throw new Error('DART_API_KEY is not configured');
  }
  return apiKey;
}

/**
 * DART API 호출 헬퍼 (캐싱 + Rate Limiting 적용)
 */
async function dartApiCall<T>(
  endpoint: string,
  params: Record<string, string>,
  useCache: boolean = true
): Promise<T> {
  // 캐시 키 생성 및 조회
  const cacheKey = createCacheKey(endpoint, params);

  if (useCache) {
    const cached = getFromCache<T>(cacheKey);
    if (cached) {
      // 캐시 히트 카운트
      apiCallStats.totalCalls++;
      apiCallStats.cacheHits++;
      console.log(`[DART Cache] HIT: ${endpoint}`);
      return cached;
    }
  }

  // Rate Limit 체크
  if (!canMakeRequest()) {
    const state = getRateLimitStateSync();
    throw new Error(
      state.isBlocked
        ? `DART API 차단됨: ${state.message}`
        : `DART API 호출 제한: ${state.message}`
    );
  }

  // Throttling (필요시 대기)
  const delay = getThrottleDelay();
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // 캐시 미스 카운트 (실제 API 호출)
  apiCallStats.totalCalls++;
  apiCallStats.cacheMisses++;

  // Rate Limiter에 호출 기록
  recordApiCallSync();

  const apiKey = getApiKey();
  const searchParams = new URLSearchParams({
    crtfc_key: apiKey,
    ...params,
  });

  const url = `${DART_API_URL}/${endpoint}?${searchParams}`;

  console.log(`[DART Cache] MISS: ${endpoint} - Fetching from API (Total: ${apiCallStats.totalCalls}, Hits: ${apiCallStats.cacheHits}, Misses: ${apiCallStats.cacheMisses})`);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`DART API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as T;

    // 캐시에 저장
    if (useCache) {
      const ttl = getCacheTTL(endpoint);
      setToCache(cacheKey, data, ttl);
    }

    return data;
  } catch (error) {
    // ECONNRESET 등 연결 오류 감지
    if (error instanceof Error) {
      reportConnectionErrorSync(error);
    }
    throw error;
  }
}

/**
 * 기업코드 XML 파싱
 */
function parseCorpCodeXml(xml: string): DartCompany[] {
  const companies: DartCompany[] = [];
  const corps = xml.split('<list>');

  for (const corp of corps) {
    if (corp.includes('<corp_code>')) {
      const corpCode = extractTag(corp, 'corp_code');
      const corpName = extractTag(corp, 'corp_name');
      const stockCode = extractTag(corp, 'stock_code');
      const corpCls = extractTag(corp, 'corp_cls'); // 법인구분: Y(유가증권), K(코스닥), N(코넥스), E(기타)
      const modifyDate = extractTag(corp, 'modify_date');

      if (corpCode && corpName) {
        companies.push({
          corpCode,
          corpName,
          stockCode: stockCode?.trim() || undefined,
          corpCls: corpCls?.trim() || undefined,
          modifyDate,
        });
      }
    }
  }

  return companies;
}

function extractTag(xml: string, tag: string): string | undefined {
  const start = xml.indexOf(`<${tag}>`);
  const end = xml.indexOf(`</${tag}>`);
  if (start >= 0 && end > start) {
    return xml.substring(start + tag.length + 2, end);
  }
  return undefined;
}

/**
 * 기업코드 목록 로드 (ZIP 파일에서)
 */
export async function loadCorpCodes(): Promise<void> {
  if (cacheLoaded && corpCodeCache.size > 0) {
    return;
  }

  try {
    const apiKey = getApiKey();
    const url = `${DART_API_URL}/corpCode.xml?crtfc_key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch corp codes: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // ZIP 파일 압축 해제 (브라우저/Node.js 호환을 위해 간단한 방식 사용)
    // 실제로는 서버에서 미리 캐시하거나 파일로 저장하는 것이 좋음
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    const xmlFile = Object.values(zip.files).find(f => f.name.endsWith('.xml'));
    if (!xmlFile) {
      throw new Error('XML file not found in ZIP');
    }

    const xmlContent = await xmlFile.async('string');
    const companies = parseCorpCodeXml(xmlContent);

    // 캐시 구축
    corpCodeCache.clear();
    corpNameIndex.clear();

    for (const company of companies) {
      corpCodeCache.set(company.corpCode, company);

      // 이름으로 검색할 수 있도록 인덱스 구축
      const nameLower = company.corpName.toLowerCase();
      const existing = corpNameIndex.get(nameLower) || [];
      existing.push(company);
      corpNameIndex.set(nameLower, existing);
    }

    cacheLoaded = true;
    console.log(`Loaded ${companies.length} companies from DART API`);
  } catch (error) {
    console.error('Failed to load corp codes:', error);
    throw error;
  }
}

/**
 * 기업 검색
 */
export async function searchCompanies(keyword: string): Promise<DartCompany[]> {
  // 캐시가 없으면 로드 시도
  if (!cacheLoaded || corpCodeCache.size === 0) {
    try {
      await loadCorpCodes();
    } catch {
      // 캐시 로드 실패 시 빈 배열 반환
      return [];
    }
  }

  const lowerKeyword = keyword.toLowerCase();
  const results: DartCompany[] = [];

  for (const company of corpCodeCache.values()) {
    // 기업명으로 검색
    if (company.corpName.toLowerCase().includes(lowerKeyword)) {
      results.push(company);
    }
    // 종목코드로 검색
    else if (company.stockCode && company.stockCode.includes(keyword)) {
      results.push(company);
    }
  }

  // 상장사 우선, 이름순 정렬
  results.sort((a, b) => {
    const aListed = !!a.stockCode;
    const bListed = !!b.stockCode;
    if (aListed !== bListed) {
      return aListed ? -1 : 1;
    }
    return a.corpName.localeCompare(b.corpName);
  });

  return results.slice(0, 20);
}

/**
 * 기업 개황 조회
 */
export async function getCompanyInfo(corpCode: string): Promise<DartCompanyInfo | null> {
  try {
    const response = await dartApiCall<Record<string, string>>('company.json', {
      corp_code: corpCode,
    });

    if (response.status !== '000') {
      console.warn(`Company info not found: ${response.message}`);
      return null;
    }

    return {
      corpCode: response.corp_code,
      corpName: response.corp_name,
      corpNameEng: response.corp_name_eng,
      stockName: response.stock_name,
      stockCode: response.stock_code,
      ceoName: response.ceo_nm,
      corpCls: response.corp_cls,
      jurirNo: response.jurir_no,
      bizrNo: response.bizr_no,
      address: response.adres,
      homeUrl: response.hm_url,
      irUrl: response.ir_url,
      phoneNo: response.phn_no,
      faxNo: response.fax_no,
      industryCode: response.induty_code,
      estDate: response.est_dt,
      accMonth: response.acc_mt,
    };
  } catch (error) {
    console.error(`Failed to get company info for ${corpCode}:`, error);
    return null;
  }
}

/**
 * 재무제표 응답 필드 변환 (snake_case → camelCase)
 */
function mapFinancialItem(item: Record<string, string>): DartFinancialItem {
  return {
    rceptNo: item.rcept_no,
    reprtCode: item.reprt_code,
    bsnsYear: item.bsns_year,
    corpCode: item.corp_code,
    sjDiv: item.sj_div,
    sjNm: item.sj_nm,
    accountId: item.account_id,
    accountNm: item.account_nm,
    accountDetail: item.account_detail,
    thstrmNm: item.thstrm_nm,
    thstrmAmount: item.thstrm_amount,
    thstrmAddAmount: item.thstrm_add_amount,
    frmtrmNm: item.frmtrm_nm,
    frmtrmAmount: item.frmtrm_amount,
    frmtrmAddAmount: item.frmtrm_add_amount,
    bfefrmtrmNm: item.bfefrmtrm_nm,
    bfefrmtrmAmount: item.bfefrmtrm_amount,
    ord: item.ord,
    currency: item.currency,
  };
}

/**
 * 재무제표 조회
 */
export async function getFinancialStatements(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartFinancialItem[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('fnlttSinglAcntAll.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
      fs_div: 'CFS', // 연결재무제표
    });

    if (response.status !== '000') {
      // 연결재무제표가 없으면 개별재무제표 조회
      const ofsResponse = await dartApiCall<DartApiResponse<Record<string, string>>>('fnlttSinglAcntAll.json', {
        corp_code: corpCode,
        bsns_year: year,
        reprt_code: reportCode,
        fs_div: 'OFS', // 개별재무제표
      });

      if (ofsResponse.status !== '000') {
        return [];
      }
      return (ofsResponse.list || []).map(mapFinancialItem);
    }

    return (response.list || []).map(mapFinancialItem);
  } catch (error) {
    console.error(`Failed to get financial statements for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 직원 현황 조회
 */
export async function getEmployees(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartEmployee[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('empSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });

    if (response.status !== '000') {
      return [];
    }

    // 필드명 변환
    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      foBbm: item.fo_bbm,
      sexdstn: item.sexdstn,
      rgllbrCo: item.rgllbr_co,
      rgllbrAbacptLabrrCo: item.rgllbr_abacpt_labrr_co,
      cnttkCo: item.cnttk_co,
      cnttkAbacptLabrrCo: item.cnttk_abacpt_labrr_co,
      sm: item.sm,
      avrgCnwkSdytrn: item.avrg_cnwk_sdytrn,
      fyerSalaryTotamt: item.fyer_salary_totamt,
      janSalaryAm: item.jan_salary_am,
      rm: item.rm,
      stlmDt: item.stlm_dt,
    }));
  } catch (error) {
    console.error(`Failed to get employees for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 최대주주 현황 조회
 */
export async function getMajorShareholders(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartShareholder[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('hyslrSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });

    if (response.status !== '000') {
      return [];
    }

    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      nm: item.nm,
      relate: item.relate,
      stockKnd: item.stock_knd,
      bsisPosesnStkCo: item.bsis_posesn_stock_co,
      bsisPosesnStkQotaRt: item.bsis_posesn_stock_qota_rt,
      trmnPosessnStkCo: item.trmend_posesn_stock_co,
      trmnPosessnStkQotaRt: item.trmend_posesn_stock_qota_rt,
      rm: item.rm,
      stlmDt: item.stlm_dt,
    }));
  } catch (error) {
    console.error(`Failed to get major shareholders for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 임원 현황 조회
 */
export async function getExecutives(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartExecutive[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('exctvSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });

    if (response.status !== '000') {
      return [];
    }

    // DART API 필드명 매핑 (오리지널 medigatenews 기준)
    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      nm: item.nm,                           // 성명
      sexdstn: item.sexdstn,                 // 성별
      birthYm: item.birth_ym,                // 출생년월
      ofcps: item.ofcps,                     // 직위
      rgistExctvAt: item.rgist_exctv_at,     // 등기임원 여부
      fteAt: item.fte_at,                    // 상근 여부
      chrgJob: item.chrg_job,                // 담당업무
      mainCareer: item.main_career,          // 주요경력
      mxmmShrholdrRelate: item.mxmm_shrholdr_relate, // 최대주주와의 관계
      hffcPd: item.hffc_pd,                  // 재직기간
      tenureEndOn: item.tenure_end_on,       // 임기만료일
      stlmDt: item.stlm_dt,                  // 결산기준일
      // 하위호환 필드
      ofcpsNm: item.ofcps,
      chrgnJobNm: item.chrg_job,
      rm: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get executives for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 배당 현황 조회
 */
export async function getDividends(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartDividend[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('alotMatter.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });

    if (response.status !== '000') {
      return [];
    }

    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      seType: item.se,           // 구분 (단일 연도 응답)
      se: item.se,               // 구분 (다년간 응답 호환)
      stockKnd: item.stock_knd,
      thstrmNm: item.thstrm_nm,
      thstrm: item.thstrm,
      frmtrmNm: item.frmtrm_nm,
      frmtrm: item.frmtrm,
      lwfrNm: item.lwfr_nm,
      lwfr: item.lwfr,
    }));
  } catch (error) {
    console.error(`Failed to get dividends for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 공시 목록 조회
 */
export async function getDisclosures(
  corpCode: string,
  options: {
    beginDate?: string;
    endDate?: string;
    pageNo?: number;
    pageCount?: number;
    pblntfTy?: string;  // 공시유형
  } = {}
): Promise<DisclosureListResult> {
  try {
    const params: Record<string, string> = {
      corp_code: corpCode,
      page_no: String(options.pageNo || 1),
      page_count: String(options.pageCount || 20),
    };

    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;
    if (options.pblntfTy) params.pblntf_ty = options.pblntfTy;

    const response = await dartApiCall<Record<string, unknown>>('list.json', params);

    if (response.status !== '000') {
      return {
        status: response.status as string,
        message: response.message as string,
        list: [],
        totalCount: 0,
        totalPage: 0,
      };
    }

    const list = (response.list as Record<string, string>[] || []).map(item => ({
      corpCode: item.corp_code,
      corpName: item.corp_name,
      corpCls: item.corp_cls,
      reportNm: item.report_nm,
      rceptNo: item.rcept_no,
      flrNm: item.flr_nm,
      rceptDt: item.rcept_dt,
      rm: item.rm,
    }));

    return {
      status: response.status as string,
      message: response.message as string,
      pageNo: response.page_no as number,
      pageCount: response.page_count as number,
      totalCount: response.total_count as number,
      totalPage: response.total_page as number,
      list,
    };
  } catch (error) {
    console.error(`Failed to get disclosures for ${corpCode}:`, error);
    return {
      status: 'error',
      message: String(error),
      list: [],
      totalCount: 0,
      totalPage: 0,
    };
  }
}

/**
 * 최근 공시 조회 (간편 메서드)
 * DART API는 날짜 범위가 필수이므로 기본값으로 최근 2년간 데이터 조회
 */
export async function getRecentDisclosures(
  corpCode: string,
  limit: number = 10
): Promise<DartDisclosure[]> {
  // DART API는 bgn_de, end_de가 없으면 데이터를 반환하지 않음
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const startDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
    .toISOString().slice(0, 10).replace(/-/g, ''); // 2년 전

  const result = await getDisclosures(corpCode, {
    beginDate: startDate,
    endDate: endDate,
    pageCount: limit,
  });
  return result.list || [];
}

/**
 * 캐시 상태 확인
 */
export function getCacheStatus(): { loaded: boolean; count: number } {
  return {
    loaded: cacheLoaded,
    count: corpCodeCache.size,
  };
}

/**
 * 캐시 리로드
 */
export async function reloadCache(): Promise<void> {
  cacheLoaded = false;
  corpCodeCache.clear();
  corpNameIndex.clear();
  await loadCorpCodes();
}

// ==================== 자회사/증권/감사 API ====================

/**
 * 자회사(타법인 출자 현황) 조회
 */
export async function getSubsidiaries(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartSubsidiary[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('otrCprInvstmntSttus.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });

    if (response.status !== '000') {
      return [];
    }

    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      // 오리지널 필드명 (medigatenews 기준)
      inv_prm: item.inv_prm,                              // 피투자법인명
      invstmnt_purps: item.invstmnt_purps,                // 출자목적
      frst_acqs_de: item.frst_acqs_de,                    // 최초취득일
      bsis_blce_qy: item.bsis_blce_qy,                    // 기초주식수
      bsis_blce_qota_rt: item.bsis_blce_qota_rt,          // 기초지분율
      bsis_blce_acntbk_amount: item.bsis_blce_acntbk_amount, // 기초장부금액
      trmend_blce_qy: item.trmend_blce_qy,                // 기말주식수
      trmend_blce_qota_rt: item.trmend_blce_qota_rt,      // 기말지분율
      trmend_blce_acntbk_amount: item.trmend_blce_acntbk_amount, // 기말장부금액
      incrs_dcrs_acqs_dsps_qy: item.incrs_dcrs_acqs_dsps_qy, // 증감수량
      incrs_dcrs_acntbk_amount: item.incrs_dcrs_acntbk_amount, // 증감장부금액
      gl_amount: item.gl_amount,                          // 손익금액
      recent_bsns_year_fnnr_sttus_tot_assets: item.recent_bsns_year_fnnr_sttus_tot_assets, // 피투자총자산
      recent_bsns_year_fnnr_sttus_thstrm_ntpf: item.recent_bsns_year_fnnr_sttus_thstrm_ntpf, // 피투자당기손익
      rm: item.rm,
      // 하위호환 필드 (기존 코드 호환)
      invstmntCorpNm: item.inv_prm,
      frstAqsYmd: item.frst_acqs_de,
      invstmntRt: item.trmend_blce_qota_rt,
      thstrmFcAqsAm: item.trmend_blce_acntbk_amount,
      thstrmFcBsisAsetVl: item.recent_bsns_year_fnnr_sttus_tot_assets,
    }));
  } catch (error) {
    console.error(`Failed to get subsidiaries for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 감사의견 조회
 */
export async function getAuditOpinions(
  corpCode: string,
  year: string,
  reportCode: ReportCode = '11011'
): Promise<DartAuditOpinion[]> {
  try {
    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('accnutAdtorNmNdAdtOpinion.json', {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });

    if (response.status !== '000') {
      return [];
    }

    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      bsnsYear: item.bsns_year,
      bsnsYearNum: parseInt(year, 10),
      reprtCode: item.reprt_code,
      // 오리지널 필드명 (medigatenews 기준)
      auditOpinion: item.adt_opinion,     // 감사의견 (적정/한정/부적정/의견거절)
      auditor: item.adtor,                // 감사인(회계법인)
      stlmDt: item.stlm_dt,               // 결산기준일
      emphsMatter: item.emphs_matter,     // 강조사항
      coreAdtMatter: item.core_adt_matter,// 핵심감사사항
      adtReprtSpcmntMatter: item.adt_reprt_spcmnt_matter, // 감사보고서 특기사항
      // 하위호환 필드 (기존 코드 호환)
      audtrmNm: item.adtor,
      audtRptOpnnCtt: item.adt_opinion,
      audtEmpsCtt: item.emphs_matter,
      coreAuditMatterCtt: item.core_adt_matter,
      opnionType: item.adt_opinion,
    }));
  } catch (error) {
    console.error(`Failed to get audit opinions for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 유상증자 결정 조회
 */
export async function getPaidInCapitalIncrease(
  corpCode: string,
  options: {
    beginDate?: string;
    endDate?: string;
  } = {}
): Promise<DartPaidInCapitalIncrease[]> {
  try {
    const params: Record<string, string> = {
      corp_code: corpCode,
    };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('piicDecsn.json', params);

    if (response.status !== '000') {
      return [];
    }

    // DART API 필드명 매핑 (오리지널 medigatenews 기준)
    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      // 오리지널 DART API 필드명 (medigatenews 호환)
      nstkOstkCnt: item.nstk_ostk_cnt,    // 신주 보통주식수
      nstkEstkCnt: item.nstk_estk_cnt,    // 신주 우선주식수
      fvPs: item.fv_ps,                   // 1주당 액면가액
      bficTisstkOstk: item.bfic_tisstk_ostk, // 증자전 발행주식총수 보통주
      bficTisstkEstk: item.bfic_tisstk_estk, // 증자전 발행주식총수 우선주
      fdppFclt: item.fdpp_fclt,           // 자금조달목적-시설자금
      fdppBsninh: item.fdpp_bsninh,       // 자금조달목적-영업양수자금
      fdppOp: item.fdpp_op,               // 자금조달목적-운영자금
      fdppDtrp: item.fdpp_dtrp,           // 자금조달목적-채무상환자금
      fdppOcsa: item.fdpp_ocsa,           // 자금조달목적-타법인증권취득
      fdppEtc: item.fdpp_etc,             // 자금조달목적-기타
      icMthn: item.ic_mthn,               // 증자방식
      sslAt: item.ssl_at,                 // 공모여부
      sslBgd: item.ssl_bgd,               // 청약시작일
      sslEdd: item.ssl_edd,               // 청약종료일
      // bddd, bdFta는 유상증자에 없음 - 컴포넌트 호환용 추가 필드
      bddd: item.ssl_bgd,                 // 이사회결의일 대신 청약시작일 사용
      bdFta: null,                        // 사채총액 없음
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get paid-in capital increase for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 전환사채(CB) 발행결정 조회
 */
export async function getConvertibleBonds(
  corpCode: string,
  options: {
    beginDate?: string;
    endDate?: string;
  } = {}
): Promise<DartConvertibleBond[]> {
  try {
    const params: Record<string, string> = {
      corp_code: corpCode,
    };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('cvbdIsDecsn.json', params);

    if (response.status !== '000') {
      return [];
    }

    // DART API 필드명은 snake_case가 아닌 camelCase/축약형 그대로 옴
    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      // 오리지널 DART API 필드명 (medigatenews 호환)
      bddd: item.bddd,            // 이사회결의일
      bdKnd: item.bd_knd,         // 사채의 종류
      bdFta: item.bd_fta,         // 사채의 권면총액
      bdIntrEx: item.bd_intr_ex,  // 만기이자율
      bdIntrSf: item.bd_intr_sf,  // 표면이자율
      bdMtd: item.bd_mtd,         // 사채만기일
      bdisMthn: item.bdis_mthn,   // 발행방법
      cvRt: item.cv_rt,           // 전환비율
      cvPrc: item.cv_prc,         // 전환가액
      cvisstkKnd: item.cvisstk_knd, // 전환대상 주식종류
      cvisstkCnt: item.cvisstk_cnt, // 전환대상 주식수
      cvisstkTisstkVs: item.cvisstk_tisstk_vs, // 발행주식총수 대비 비율
      cvrqpdBgd: item.cvrqpd_bgd, // 전환청구기간 시작일
      cvrqpdEdd: item.cvrqpd_edd, // 전환청구기간 종료일
      fdppFclt: item.fdpp_fclt,   // 자금조달목적-시설자금
      fdppOp: item.fdpp_op,       // 자금조달목적-운영자금
      fdppDtrp: item.fdpp_dtrp,   // 자금조달목적-채무상환
      fdppOcsa: item.fdpp_ocsa,   // 자금조달목적-타법인증권취득
      fdppEtc: item.fdpp_etc,     // 자금조달목적-기타
      sbd: item.sbd,              // 청약일
      pymd: item.pymd,            // 납입일
      // 기존 매핑 필드 (하위호환)
      bondNm: item.bd_nm,
      bondTotamt: item.bd_fta,
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get convertible bonds for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 교환사채(EB) 발행결정 조회
 */
export async function getExchangeableBonds(
  corpCode: string,
  options: {
    beginDate?: string;
    endDate?: string;
  } = {}
): Promise<DartExchangeableBond[]> {
  try {
    const params: Record<string, string> = {
      corp_code: corpCode,
    };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('exbdIsDecsn.json', params);

    if (response.status !== '000') {
      return [];
    }

    // DART API 필드명 매핑 (오리지널 medigatenews 기준)
    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      // 오리지널 DART API 필드명 (medigatenews 호환)
      bddd: item.bddd,              // 이사회결의일
      bdKnd: item.bd_knd,           // 사채의 종류
      bdFta: item.bd_fta,           // 사채의 권면총액
      ovisFta: item.ovis_fta,       // 해외발행 권면총액
      ovisFtaCrn: item.ovis_fta_crn,// 해외발행 통화
      ovisSter: item.ovis_ster,     // 환율
      bdIntrEx: item.bd_intr_ex,    // 만기이자율
      bdIntrSf: item.bd_intr_sf,    // 표면이자율
      bdMtd: item.bd_mtd,           // 사채만기일
      bdisMthn: item.bdis_mthn,     // 발행방법
      exRt: item.ex_rt,             // 교환비율
      exPrc: item.ex_prc,           // 교환가액
      extg: item.extg,              // 교환대상
      extgStkcnt: item.extg_stkcnt, // 교환대상 주식수
      extgTisstkVs: item.extg_tisstk_vs, // 발행주식총수 대비 비율
      exrqpdBgd: item.exrqpd_bgd,   // 교환청구기간 시작일
      exrqpdEdd: item.exrqpd_edd,   // 교환청구기간 종료일
      fdppOp: item.fdpp_op,         // 자금조달목적-운영자금
      sbd: item.sbd,                // 청약일
      pymd: item.pymd,              // 납입일
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get exchangeable bonds for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 신주인수권부사채(BW) 발행결정 조회
 */
export async function getBondsWithWarrant(
  corpCode: string,
  options: {
    beginDate?: string;
    endDate?: string;
  } = {}
): Promise<DartBondWithWarrant[]> {
  try {
    const params: Record<string, string> = {
      corp_code: corpCode,
    };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<DartApiResponse<Record<string, string>>>('bdwtIsDecsn.json', params);

    if (response.status !== '000') {
      return [];
    }

    // DART API 필드명 매핑 (오리지널 medigatenews 기준)
    return (response.list || []).map(item => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      // 오리지널 DART API 필드명 (medigatenews 호환)
      bddd: item.bddd,              // 이사회결의일
      bdKnd: item.bd_knd,           // 사채의 종류
      bdFta: item.bd_fta,           // 사채의 권면총액
      bdIntrEx: item.bd_intr_ex,    // 만기이자율
      bdIntrSf: item.bd_intr_sf,    // 표면이자율
      bdMtd: item.bd_mtd,           // 사채만기일
      bdisMthn: item.bdis_mthn,     // 발행방법
      exPrc: item.ex_prc,           // 행사가액
      exisstkKnd: item.exisstk_knd, // 행사대상 주식종류
      exisstkCnt: item.exisstk_cnt, // 행사대상 주식수
      exisstkTisstkVs: item.exisstk_tisstk_vs, // 발행주식총수 대비 비율
      exrqpdBgd: item.exrqpd_bgd,   // 행사청구기간 시작일
      exrqpdEdd: item.exrqpd_edd,   // 행사청구기간 종료일
      fdppFclt: item.fdpp_fclt,     // 자금조달목적-시설자금
      fdppOp: item.fdpp_op,         // 자금조달목적-운영자금
      sbd: item.sbd,                // 청약일
      pymd: item.pymd,              // 납입일
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get bonds with warrant for ${corpCode}:`, error);
    return [];
  }
}

/**
 * 가용 기간 조회
 */
export async function getAvailablePeriods(
  corpCode: string,
  years: number = 5
): Promise<AvailablePeriods> {
  const currentYear = new Date().getFullYear();
  const reportCodes: ReportCode[] = ['11013', '11012', '11014', '11011'];

  const availableYears: AvailableYear[] = [];
  let latestYear = currentYear - years;
  let latestQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' = 'Q4';

  for (let y = currentYear; y >= currentYear - years; y--) {
    const yearData: AvailableYear = {
      year: y,
      q1Available: false,
      q2Available: false,
      q3Available: false,
      annualAvailable: false,
    };

    // 각 분기별 데이터 존재 여부 확인
    for (const code of reportCodes) {
      try {
        const financials = await getFinancialStatements(corpCode, String(y), code);
        if (financials && financials.length > 0) {
          switch (code) {
            case '11013':
              yearData.q1Available = true;
              if (y > latestYear || (y === latestYear && 'Q1' > latestQuarter)) {
                latestYear = y;
                latestQuarter = 'Q1';
              }
              break;
            case '11012':
              yearData.q2Available = true;
              if (y > latestYear || (y === latestYear && 'Q2' > latestQuarter)) {
                latestYear = y;
                latestQuarter = 'Q2';
              }
              break;
            case '11014':
              yearData.q3Available = true;
              if (y > latestYear || (y === latestYear && 'Q3' > latestQuarter)) {
                latestYear = y;
                latestQuarter = 'Q3';
              }
              break;
            case '11011':
              yearData.annualAvailable = true;
              if (y > latestYear) {
                latestYear = y;
                latestQuarter = 'Q4';
              }
              break;
          }
        }
      } catch {
        // Skip errors for unavailable periods
      }
    }

    availableYears.push(yearData);
  }

  return {
    corpCode,
    years: availableYears,
    latestYear,
    latestQuarter,
  };
}

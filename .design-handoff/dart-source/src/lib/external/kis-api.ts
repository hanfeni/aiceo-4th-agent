/**
 * 한국투자증권 Open API
 * - 실시간 주식 시세 조회
 * - PER/PBR/시가총액 등 투자지표 제공
 *
 * 토큰 관리:
 * - Access Token은 24시간 유효
 * - 파일 캐시로 토큰 저장/재사용
 * - 만료 시 자동 갱신
 */

import * as fs from 'fs';
import * as path from 'path';

// 환경 변수
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

// 실전투자 도메인 (모의투자: https://openapivts.koreainvestment.com:29443)
const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

// 토큰 캐시 파일 경로
// - 배포 시 rsync --delete로 삭제되지 않도록 홈 디렉토리에 저장
// - 로컬: 프로젝트 루트, 서버: /home/ubuntu/
const TOKEN_CACHE_PATH = process.env.NODE_ENV === 'production'
  ? path.join(process.env.HOME || '/home/ubuntu', '.kis-token-cache.json')
  : path.join(process.cwd(), '.kis-token-cache.json');

// 토큰 캐시 타입
interface TokenCache {
  accessToken: string;
  expiresAt: number;  // Unix timestamp (ms)
  issuedAt: number;   // 발급 시간
}

// 토큰 응답 타입
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;  // 초 단위 (86400 = 24시간)
}

// 주식 시세 응답 타입
export interface StockPriceOutput {
  iscd_stat_cls_code: string;  // 종목상태구분코드
  rprs_mrkt_kor_name: string;  // 대표시장 한글명
  bstp_kor_isnm: string;       // 업종 한글명
  stck_prpr: string;           // 주식현재가
  prdy_vrss: string;           // 전일대비
  prdy_vrss_sign: string;      // 전일대비부호
  prdy_ctrt: string;           // 전일대비율
  acml_tr_pbmn: string;        // 누적거래대금
  acml_vol: string;            // 누적거래량
  stck_oprc: string;           // 시가
  stck_hgpr: string;           // 고가
  stck_lwpr: string;           // 저가
  stck_mxpr: string;           // 상한가
  stck_llam: string;           // 하한가
  stck_sdpr: string;           // 기준가
  hts_frgn_ehrt: string;       // 외국인소진률
  frgn_ntby_qty: string;       // 외국인순매수량
  lstn_stcn: string;           // 상장주수
  hts_avls: string;            // HTS시가총액 (억원)
  per: string;                 // PER
  pbr: string;                 // PBR
  stac_month: string;          // 결산월
  eps: string;                 // EPS
  bps: string;                 // BPS
  w52_hgpr: string;            // 52주최고가
  w52_hgpr_date: string;       // 52주최고가일자
  w52_lwpr: string;            // 52주최저가
  w52_lwpr_date: string;       // 52주최저가일자
  frgn_hldn_qty: string;       // 외국인보유수량
  vi_cls_code: string;         // VI적용구분코드
  stck_shrn_iscd: string;      // 단축종목코드
}

interface StockPriceResponse {
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output: StockPriceOutput;
}

// 정제된 주식 시세 데이터
export interface StockQuote {
  stockCode: string;           // 종목코드
  stockName?: string;          // 종목명
  currentPrice: number;        // 현재가
  change: number;              // 전일대비
  changeRate: number;          // 전일대비율 (%)
  volume: number;              // 거래량
  tradingValue: number;        // 거래대금 (원)
  openPrice: number;           // 시가
  highPrice: number;           // 고가
  lowPrice: number;            // 저가
  marketCap: number;           // 시가총액 (억원)
  per: number | null;          // PER
  pbr: number | null;          // PBR
  eps: number | null;          // EPS
  bps: number | null;          // BPS
  foreignRate: number;         // 외국인 소진률 (%)
  foreignNetBuy: number;       // 외국인 순매수
  sharesOutstanding: number;   // 상장주수
  high52w: number;             // 52주 최고가
  low52w: number;              // 52주 최저가
  sector: string;              // 업종
  settlementMonth: string;     // 결산월
}

/**
 * 토큰 캐시 읽기
 */
function readTokenCache(): TokenCache | null {
  try {
    console.log('[KIS] 토큰 캐시 경로:', TOKEN_CACHE_PATH);
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const data = fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8');
      const cache = JSON.parse(data) as TokenCache;
      console.log('[KIS] 캐시 파일 존재 - 만료:', new Date(cache.expiresAt).toLocaleString());
      return cache;
    } else {
      console.log('[KIS] 캐시 파일 없음');
    }
  } catch (error) {
    console.warn('[KIS] 토큰 캐시 읽기 실패:', error);
  }
  return null;
}

/**
 * 토큰 캐시 저장
 */
function saveTokenCache(cache: TokenCache): void {
  try {
    fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log('[KIS] 토큰 캐시 저장 완료');
  } catch (error) {
    console.warn('[KIS] 토큰 캐시 저장 실패:', error);
  }
}

/**
 * 토큰 유효성 검사
 * - 만료 1시간 전부터 갱신 대상
 */
function isTokenValid(cache: TokenCache | null): boolean {
  if (!cache) {
    console.log('[KIS] 캐시 없음 - 토큰 무효');
    return false;
  }

  const now = Date.now();
  const buffer = 60 * 60 * 1000; // 1시간 버퍼
  const isValid = cache.expiresAt - buffer > now;

  if (!isValid) {
    const remaining = cache.expiresAt - now;
    console.log('[KIS] 토큰 만료됨 또는 갱신 필요 - 남은 시간:', Math.round(remaining / 1000 / 60), '분');
  }

  return isValid;
}

/**
 * Access Token 발급 (캐시 우선)
 */
async function getAccessToken(): Promise<string> {
  // 1. 캐시 확인
  const cached = readTokenCache();
  if (isTokenValid(cached)) {
    console.log('[KIS] 캐시된 토큰 사용 (만료:', new Date(cached!.expiresAt).toLocaleString(), ')');
    return cached!.accessToken;
  }

  // 2. 새 토큰 발급
  console.log('[KIS] 새 Access Token 발급 중...');

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error('KIS_APP_KEY 또는 KIS_APP_SECRET이 설정되지 않았습니다.');
  }

  const response = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token 발급 실패: ${response.status} - ${errorText}`);
  }

  const data: TokenResponse = await response.json();

  // 3. 캐시 저장
  const now = Date.now();
  const cache: TokenCache = {
    accessToken: data.access_token,
    issuedAt: now,
    expiresAt: now + (data.expires_in * 1000), // 24시간 후
  };
  saveTokenCache(cache);

  console.log('[KIS] Token 발급 성공 (만료:', new Date(cache.expiresAt).toLocaleString(), ')');
  return data.access_token;
}

/**
 * 주식 현재가 시세 조회 (Raw)
 * @param stockCode - 종목코드 (예: 005930)
 */
async function fetchStockPriceRaw(stockCode: string): Promise<StockPriceResponse> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${stockCode}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${accessToken}`,
        'appkey': KIS_APP_KEY!,
        'appsecret': KIS_APP_SECRET!,
        'tr_id': 'FHKST01010100',  // 주식현재가 시세 조회
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`시세 조회 실패: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * 주식 현재가 시세 조회 (정제된 데이터)
 * @param stockCode - 종목코드 (예: 005930)
 */
export async function getStockQuote(stockCode: string): Promise<StockQuote> {
  const result = await fetchStockPriceRaw(stockCode);

  if (result.rt_cd !== '0') {
    throw new Error(`API 오류: ${result.msg1}`);
  }

  const o = result.output;

  return {
    stockCode: stockCode,
    currentPrice: Number(o.stck_prpr) || 0,
    change: Number(o.prdy_vrss) || 0,
    changeRate: Number(o.prdy_ctrt) || 0,
    volume: Number(o.acml_vol) || 0,
    tradingValue: Number(o.acml_tr_pbmn) || 0,
    openPrice: Number(o.stck_oprc) || 0,
    highPrice: Number(o.stck_hgpr) || 0,
    lowPrice: Number(o.stck_lwpr) || 0,
    marketCap: Number(o.hts_avls) || 0,  // 억원 단위
    per: o.per ? Number(o.per) : null,
    pbr: o.pbr ? Number(o.pbr) : null,
    eps: o.eps ? Number(o.eps) : null,
    bps: o.bps ? Number(o.bps) : null,
    foreignRate: Number(o.hts_frgn_ehrt) || 0,
    foreignNetBuy: Number(o.frgn_ntby_qty) || 0,
    sharesOutstanding: Number(o.lstn_stcn) || 0,
    high52w: Number(o.w52_hgpr) || 0,
    low52w: Number(o.w52_lwpr) || 0,
    sector: o.bstp_kor_isnm || '',
    settlementMonth: o.stac_month || '',
  };
}

/**
 * 여러 종목 시세 일괄 조회
 * @param stockCodes - 종목코드 배열
 */
export async function getStockQuotes(stockCodes: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();

  // 순차 호출 (API 제한 고려)
  for (const code of stockCodes) {
    try {
      const quote = await getStockQuote(code);
      results.set(code, quote);

      // API 호출 간격 (초당 20건 제한)
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[KIS] ${code} 조회 실패:`, error);
    }
  }

  return results;
}

/**
 * 투자 지표만 조회
 * @param stockCode - 종목코드
 */
export async function getInvestmentIndicators(stockCode: string): Promise<{
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  marketCap: number;
  foreignRate: number;
}> {
  const quote = await getStockQuote(stockCode);

  return {
    per: quote.per,
    pbr: quote.pbr,
    eps: quote.eps,
    bps: quote.bps,
    marketCap: quote.marketCap,
    foreignRate: quote.foreignRate,
  };
}

/**
 * API 설정 확인
 */
export function checkKisApiConfig(): { configured: boolean; message: string } {
  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    return {
      configured: false,
      message: 'KIS_APP_KEY 또는 KIS_APP_SECRET 환경변수가 설정되지 않았습니다.',
    };
  }

  return {
    configured: true,
    message: 'KIS API 설정 완료',
  };
}

/**
 * DART OpenAPI fetch 코어 — 키 격리·SSRF 방어·캐시·rate-limit.
 *
 * 이식 출처: medigate `dart-api.ts`(10fb7f4) 37~404행. 기능축 4분리
 * (STRUCTURAL #2 — 원본 1234줄 단일 복사 금지). 이 파일 = "인증키
 * 격리 + 호스트 고정 fetch + 메모리 캐시 + corpCode ZIP 로드" 축.
 *
 * 보안 (NFR-16, 보안 pre-review 슬라이스):
 *  - DART_API_KEY 는 이 파일의 getApiKey() 한 곳에만 국한. 응답·로그·
 *    캐시 키에 직렬화 0(createCacheKey 가 crtfc_key 제외). NEXT_PUBLIC 0.
 *  - 모든 fetch URL 은 buildUrl() 이 `DART_API_BASE`(opendart.fss.or.kr)
 *    호스트로 고정 — endpoint/params 가 호스트·스킴을 못 바꾼다(SSRF
 *    방어). endpoint 는 코드 내부 상수, params 값도 corpCode/연도 등
 *    DART 도메인 값뿐(사용자 자유 입력이 URL 에 직접 유입 0).
 *
 * rate-limit: D3 `../ratelimit` 의 원본 시그니처 그대로 소비
 * (STRUCTURAL #1 — 호출부 diff 0). gemini/perplexity/auth/next-server
 * 의존 0(원본 dart-api.ts 도 0 — FR-27).
 */

import type { DartCompany } from "@/types/dart";
import {
  recordApiCallSync,
  reportConnectionErrorSync,
  canMakeRequest,
  getThrottleDelay,
  getRateLimitStateSync,
} from "../ratelimit";

/** DART OpenAPI 고정 호스트 (SSRF 방어 — 절대 가변화 금지) */
const DART_API_BASE = "https://opendart.fss.or.kr/api";

// 기업코드 캐시 (메모리)
const corpCodeCache: Map<string, DartCompany> = new Map();
const corpNameIndex: Map<string, DartCompany[]> = new Map();
let cacheLoaded = false;

// ==================== API 응답 캐시 ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}
const apiCache = new Map<string, CacheEntry<unknown>>();

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

export function resetApiCallStats(): void {
  apiCallStats = {
    totalCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now(),
  };
}

export function getApiCallStats(): ApiCallStats & {
  cacheHitRate: string;
  elapsed: string;
} {
  const elapsed = Date.now() - apiCallStats.startTime;
  const hitRate =
    apiCallStats.totalCalls > 0
      ? ((apiCallStats.cacheHits / apiCallStats.totalCalls) * 100).toFixed(1)
      : "0";
  return {
    ...apiCallStats,
    cacheHitRate: `${hitRate}%`,
    elapsed: `${(elapsed / 1000).toFixed(1)}s`,
  };
}

export function logApiCallStats(label: string = "DART API Stats"): void {
  const s = getApiCallStats();
  console.log(
    `[${label}] Total: ${s.totalCalls}, Hits: ${s.cacheHits}, Misses: ${s.cacheMisses}, HitRate: ${s.cacheHitRate}, Elapsed: ${s.elapsed}`,
  );
}

const CACHE_CONFIG = {
  financialStatements: 60 * 60 * 1000,
  companyInfo: 24 * 60 * 60 * 1000,
  disclosures: 10 * 60 * 1000,
  corporateInfo: 60 * 60 * 1000,
  default: 30 * 60 * 1000,
};

/** 캐시 키 생성 (crtfc_key 제외 — 키 비직렬화 보안) */
function createCacheKey(
  endpoint: string,
  params: Record<string, string>,
): string {
  const sortedParams = Object.keys(params)
    .filter((k) => k !== "crtfc_key")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${endpoint}?${sortedParams}`;
}

function getCacheTTL(endpoint: string): number {
  if (endpoint.includes("fnltt") || endpoint.includes("Acnt")) {
    return CACHE_CONFIG.financialStatements;
  }
  if (endpoint === "company.json") return CACHE_CONFIG.companyInfo;
  if (endpoint === "list.json") return CACHE_CONFIG.disclosures;
  if (
    ["hyslrSttus", "exctvSttus", "empSttus", "alotMatter"].some((e) =>
      endpoint.includes(e),
    )
  ) {
    return CACHE_CONFIG.corporateInfo;
  }
  return CACHE_CONFIG.default;
}

function getFromCache<T>(key: string): T | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setToCache<T>(key: string, data: T, ttl: number): void {
  const now = Date.now();
  apiCache.set(key, { data, timestamp: now, expiresAt: now + ttl });
}

export function getDartCacheStats(): { size: number; keys: string[] } {
  return { size: apiCache.size, keys: Array.from(apiCache.keys()) };
}

export function clearDartCache(): void {
  apiCache.clear();
}

export function cleanupExpiredCache(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of apiCache.entries()) {
    if (now > (entry as CacheEntry<unknown>).expiresAt) {
      apiCache.delete(key);
      cleaned++;
    }
  }
  return cleaned;
}

// ==================== 키·URL (보안 격리) ====================

/** DART_API_KEY 참조 단일 지점 (NFR-16 — 이 함수 밖으로 키 누출 0) */
function getApiKey(): string {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    throw new Error("DART_API_KEY is not configured");
  }
  return apiKey;
}

/**
 * 호스트 고정 URL 빌더 (SSRF 방어). endpoint/params 는 호스트·스킴을
 * 바꿀 수 없다 — 항상 DART_API_BASE 아래로만 요청.
 */
function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(`${DART_API_BASE}/${endpoint}`);
  // 방어: 조립 결과가 고정 호스트를 벗어나면 즉시 차단
  if (url.origin !== "https://opendart.fss.or.kr") {
    throw new Error(`DART API host violation: ${url.origin}`);
  }
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * DART API 호출 (캐싱 + Rate Limiting). 원본 dartApiCall 시그니처 보존.
 */
export async function dartApiCall<T>(
  endpoint: string,
  params: Record<string, string>,
  useCache: boolean = true,
): Promise<T> {
  const cacheKey = createCacheKey(endpoint, params);

  if (useCache) {
    const cached = getFromCache<T>(cacheKey);
    if (cached) {
      apiCallStats.totalCalls++;
      apiCallStats.cacheHits++;
      return cached;
    }
  }

  if (!canMakeRequest()) {
    const state = getRateLimitStateSync();
    throw new Error(
      state.isBlocked
        ? `DART API 차단됨: ${state.message}`
        : `DART API 호출 제한: ${state.message}`,
    );
  }

  const delay = getThrottleDelay();
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  apiCallStats.totalCalls++;
  apiCallStats.cacheMisses++;
  recordApiCallSync();

  const url = buildUrl(endpoint, { crtfc_key: getApiKey(), ...params });

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `DART API error: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as T;
    if (useCache) setToCache(cacheKey, data, getCacheTTL(endpoint));
    return data;
  } catch (error) {
    if (error instanceof Error) reportConnectionErrorSync(error);
    throw error;
  }
}

// ==================== corpCode ZIP 로드 ====================

function parseCorpCodeXml(xml: string): DartCompany[] {
  const companies: DartCompany[] = [];
  for (const corp of xml.split("<list>")) {
    if (!corp.includes("<corp_code>")) continue;
    const corpCode = extractTag(corp, "corp_code");
    const corpName = extractTag(corp, "corp_name");
    if (corpCode && corpName) {
      companies.push({
        corpCode,
        corpName,
        stockCode: extractTag(corp, "stock_code")?.trim() || undefined,
        corpCls: extractTag(corp, "corp_cls")?.trim() || undefined,
        modifyDate: extractTag(corp, "modify_date"),
      });
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

/** 기업코드 목록 로드 (corpCode.xml ZIP). 호스트 고정 URL. */
export async function loadCorpCodes(): Promise<void> {
  if (cacheLoaded && corpCodeCache.size > 0) return;

  const url = buildUrl("corpCode.xml", { crtfc_key: getApiKey() });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch corp codes: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = Object.values(zip.files).find((f) =>
    f.name.endsWith(".xml"),
  );
  if (!xmlFile) throw new Error("XML file not found in ZIP");

  const companies = parseCorpCodeXml(await xmlFile.async("string"));
  corpCodeCache.clear();
  corpNameIndex.clear();
  for (const company of companies) {
    corpCodeCache.set(company.corpCode, company);
    const nameLower = company.corpName.toLowerCase();
    const existing = corpNameIndex.get(nameLower) || [];
    existing.push(company);
    corpNameIndex.set(nameLower, existing);
  }
  cacheLoaded = true;
}

/** corpCode 캐시 접근자 (company.ts 가 검색에 사용) */
export function getCorpCodeCache(): Map<string, DartCompany> {
  return corpCodeCache;
}

export function isCorpCacheLoaded(): boolean {
  return cacheLoaded && corpCodeCache.size > 0;
}

export function getCacheStatus(): { loaded: boolean; count: number } {
  return { loaded: cacheLoaded, count: corpCodeCache.size };
}

export async function reloadCache(): Promise<void> {
  cacheLoaded = false;
  corpCodeCache.clear();
  corpNameIndex.clear();
  await loadCorpCodes();
}

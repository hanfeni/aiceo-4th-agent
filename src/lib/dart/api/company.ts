/**
 * DART 기업 식별·개황 조회 (corpCode 검색 + company.json).
 *
 * 이식 출처: medigate `dart-api.ts`(10fb7f4) 406~484행. 기능축 4분리
 * (STRUCTURAL #2). 이 파일 = "기업명/종목코드 → corpCode 해석 +
 * 기업 개황" 축 — 분석 파이프라인의 Step 2(기업 식별, UC-41).
 * snake→camel 매핑 격리(OPEN-4 §2: ceo_nm/stock_code/...).
 */

import type { DartCompany, DartCompanyInfo } from "@/types/dart";
import {
  dartApiCall,
  loadCorpCodes,
  getCorpCodeCache,
  isCorpCacheLoaded,
} from "./client";

/**
 * 기업 검색 (기업명 부분일치 / 종목코드). 상장사 우선·이름순,
 * 최대 20건. corpCode 캐시 미로드 시 1회 로드 시도(실패 시 빈 배열).
 */
export async function searchCompanies(
  keyword: string,
): Promise<DartCompany[]> {
  if (!isCorpCacheLoaded()) {
    try {
      await loadCorpCodes();
    } catch {
      return [];
    }
  }

  const lowerKeyword = keyword.toLowerCase();
  const results: DartCompany[] = [];
  for (const company of getCorpCodeCache().values()) {
    if (company.corpName.toLowerCase().includes(lowerKeyword)) {
      results.push(company);
    } else if (company.stockCode && company.stockCode.includes(keyword)) {
      results.push(company);
    }
  }

  results.sort((a, b) => {
    const aListed = !!a.stockCode;
    const bListed = !!b.stockCode;
    if (aListed !== bListed) return aListed ? -1 : 1;
    return a.corpName.localeCompare(b.corpName);
  });

  return results.slice(0, 20);
}

/**
 * 기업 개황 조회. status!=="000"(비상장·미존재 등) → null
 * (graceful — subagent 가 UC-41-E1 분기 처리).
 */
export async function getCompanyInfo(
  corpCode: string,
): Promise<DartCompanyInfo | null> {
  try {
    const response = await dartApiCall<
      Record<string, string>
    >("company.json", { corp_code: corpCode });

    if (response.status !== "000") {
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

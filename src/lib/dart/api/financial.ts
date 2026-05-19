/**
 * DART 재무·인력·지배구조·배당 조회 (snake→camel 매핑 격리).
 *
 * 이식 출처: medigate `dart-api.ts`(10fb7f4) 486~717행. 기능축 4분리
 * (STRUCTURAL #2). 이 파일 = "정기보고서 정량 데이터 조회 + raw
 * snake_case → 도메인 camelCase 변환" 축.
 *
 * OPEN-4 (R8 실측 — docs/notes/dart-api-probe.md §2): DART 실응답은
 * snake_case(account_nm/thstrm_amount/...), 도메인 타입은 camelCase.
 * 변환은 이 파일의 map* 함수가 단일 책임(D1 probe 정답지 기준).
 * 응답 status!=="000" 이면 예외 throw 아닌 빈 배열(graceful — NFR-18,
 * subagent 가 🔴미확인 표기 후 진행, TC-41.15 흐름).
 */

import type {
  DartFinancialItem,
  DartEmployee,
  DartShareholder,
  DartExecutive,
  DartDividend,
  DartApiResponse,
  ReportCode,
} from "@/types/dart";
import { dartApiCall } from "./client";

/** 재무제표 raw → 도메인 변환 (OPEN-4 정답지 매핑) */
function mapFinancialItem(
  item: Record<string, string>,
): DartFinancialItem {
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
 * 재무제표 조회. 연결(CFS) 우선, 없으면 개별(OFS) 폴백.
 */
export async function getFinancialStatements(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartFinancialItem[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("fnlttSinglAcntAll.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
      fs_div: "CFS",
    });

    if (response.status !== "000") {
      const ofs = await dartApiCall<DartApiResponse<Record<string, string>>>(
        "fnlttSinglAcntAll.json",
        {
          corp_code: corpCode,
          bsns_year: year,
          reprt_code: reportCode,
          fs_div: "OFS",
        },
      );
      if (ofs.status !== "000") return [];
      return (ofs.list || []).map(mapFinancialItem);
    }
    return (response.list || []).map(mapFinancialItem);
  } catch (error) {
    console.error(`Failed to get financial statements for ${corpCode}:`, error);
    return [];
  }
}

/** 직원 현황 조회 */
export async function getEmployees(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartEmployee[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("empSttus.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
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

/** 최대주주 현황 조회 */
export async function getMajorShareholders(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartShareholder[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("hyslrSttus.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
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

/** 임원 현황 조회 */
export async function getExecutives(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartExecutive[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("exctvSttus.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      nm: item.nm,
      sexdstn: item.sexdstn,
      birthYm: item.birth_ym,
      ofcps: item.ofcps,
      rgistExctvAt: item.rgist_exctv_at,
      fteAt: item.fte_at,
      chrgJob: item.chrg_job,
      mainCareer: item.main_career,
      mxmmShrholdrRelate: item.mxmm_shrholdr_relate,
      hffcPd: item.hffc_pd,
      tenureEndOn: item.tenure_end_on,
      stlmDt: item.stlm_dt,
      ofcpsNm: item.ofcps,
      chrgnJobNm: item.chrg_job,
      rm: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get executives for ${corpCode}:`, error);
    return [];
  }
}

/** 배당 현황 조회 */
export async function getDividends(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartDividend[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("alotMatter.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      seType: item.se,
      se: item.se,
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

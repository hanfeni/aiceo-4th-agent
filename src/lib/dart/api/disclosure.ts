/**
 * DART 공시목록·자회사·감사·가용기간 조회.
 *
 * 이식 출처: medigate `dart-api.ts`(10fb7f4) 719~928·1161~1234행.
 * 기능축 분리(STRUCTURAL #2). 이 파일 = "공시 메타·자회사·감사·
 * 가용기간" 축. 증권발행 5종(유상증자·CB·EB·BW)은 자본거래 책임이라
 * `securities.ts` 로 분리(disclosure.ts architect 예산 ≤420 정합).
 * snake→camel 매핑 격리(OPEN-4), status!=="000" → graceful 빈 결과.
 *
 * 주의: 공시 원문 ZIP/XML 파싱(extractDisclosureFullText 등)은 D4
 * `disclosure/parser.ts` 책임. 이 파일은 list.json 등 메타 조회만.
 */

import type {
  DartDisclosure,
  DisclosureListResult,
  DartSubsidiary,
  DartAuditOpinion,
  DartApiResponse,
  AvailablePeriods,
  AvailableYear,
  ReportCode,
} from "@/types/dart";
import { dartApiCall } from "./client";
import { getFinancialStatements } from "./financial";

/** 공시 목록 조회 (날짜 범위·페이지·공시유형) */
export async function getDisclosures(
  corpCode: string,
  options: {
    beginDate?: string;
    endDate?: string;
    pageNo?: number;
    pageCount?: number;
    pblntfTy?: string;
  } = {},
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

    const response = await dartApiCall<Record<string, unknown>>(
      "list.json",
      params,
    );

    if (response.status !== "000") {
      return {
        status: response.status as string,
        message: response.message as string,
        list: [],
        totalCount: 0,
        totalPage: 0,
      };
    }

    const list = ((response.list as Record<string, string>[]) || []).map(
      (item) => ({
        corpCode: item.corp_code,
        corpName: item.corp_name,
        corpCls: item.corp_cls,
        reportNm: item.report_nm,
        rceptNo: item.rcept_no,
        flrNm: item.flr_nm,
        rceptDt: item.rcept_dt,
        rm: item.rm,
      }),
    );

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
      status: "error",
      message: String(error),
      list: [],
      totalCount: 0,
      totalPage: 0,
    };
  }
}

/** 최근 공시 (기본 최근 2년) */
export async function getRecentDisclosures(
  corpCode: string,
  limit: number = 10,
): Promise<DartDisclosure[]> {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, "");
  const startDate = new Date(
    today.getFullYear() - 2,
    today.getMonth(),
    today.getDate(),
  )
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const result = await getDisclosures(corpCode, {
    beginDate: startDate,
    endDate,
    pageCount: limit,
  });
  return result.list || [];
}

/** 자회사(타법인 출자) 조회 */
export async function getSubsidiaries(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartSubsidiary[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("otrCprInvstmntSttus.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      inv_prm: item.inv_prm,
      invstmnt_purps: item.invstmnt_purps,
      frst_acqs_de: item.frst_acqs_de,
      bsis_blce_qy: item.bsis_blce_qy,
      bsis_blce_qota_rt: item.bsis_blce_qota_rt,
      bsis_blce_acntbk_amount: item.bsis_blce_acntbk_amount,
      trmend_blce_qy: item.trmend_blce_qy,
      trmend_blce_qota_rt: item.trmend_blce_qota_rt,
      trmend_blce_acntbk_amount: item.trmend_blce_acntbk_amount,
      incrs_dcrs_acqs_dsps_qy: item.incrs_dcrs_acqs_dsps_qy,
      incrs_dcrs_acntbk_amount: item.incrs_dcrs_acntbk_amount,
      gl_amount: item.gl_amount,
      recent_bsns_year_fnnr_sttus_tot_assets:
        item.recent_bsns_year_fnnr_sttus_tot_assets,
      recent_bsns_year_fnnr_sttus_thstrm_ntpf:
        item.recent_bsns_year_fnnr_sttus_thstrm_ntpf,
      rm: item.rm,
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

/** 감사의견 조회 */
export async function getAuditOpinions(
  corpCode: string,
  year: string,
  reportCode: ReportCode = "11011",
): Promise<DartAuditOpinion[]> {
  try {
    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("accnutAdtorNmNdAdtOpinion.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
    });
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      bsnsYear: item.bsns_year,
      bsnsYearNum: parseInt(year, 10),
      reprtCode: item.reprt_code,
      auditOpinion: item.adt_opinion,
      auditor: item.adtor,
      stlmDt: item.stlm_dt,
      emphsMatter: item.emphs_matter,
      coreAdtMatter: item.core_adt_matter,
      adtReprtSpcmntMatter: item.adt_reprt_spcmnt_matter,
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

/** 가용 기간 조회 (재무제표 존재 여부로 분기별 가용성 판정) */
export async function getAvailablePeriods(
  corpCode: string,
  years: number = 5,
): Promise<AvailablePeriods> {
  const currentYear = new Date().getFullYear();
  const reportCodes: ReportCode[] = ["11013", "11012", "11014", "11011"];
  const availableYears: AvailableYear[] = [];
  let latestYear = currentYear - years;
  let latestQuarter: "Q1" | "Q2" | "Q3" | "Q4" = "Q4";

  for (let y = currentYear; y >= currentYear - years; y--) {
    const yearData: AvailableYear = {
      year: y,
      q1Available: false,
      q2Available: false,
      q3Available: false,
      annualAvailable: false,
    };
    for (const code of reportCodes) {
      try {
        const financials = await getFinancialStatements(
          corpCode,
          String(y),
          code,
        );
        if (financials && financials.length > 0) {
          switch (code) {
            case "11013":
              yearData.q1Available = true;
              if (y > latestYear || (y === latestYear && "Q1" > latestQuarter)) {
                latestYear = y;
                latestQuarter = "Q1";
              }
              break;
            case "11012":
              yearData.q2Available = true;
              if (y > latestYear || (y === latestYear && "Q2" > latestQuarter)) {
                latestYear = y;
                latestQuarter = "Q2";
              }
              break;
            case "11014":
              yearData.q3Available = true;
              if (y > latestYear || (y === latestYear && "Q3" > latestQuarter)) {
                latestYear = y;
                latestQuarter = "Q3";
              }
              break;
            case "11011":
              yearData.annualAvailable = true;
              if (y > latestYear) {
                latestYear = y;
                latestQuarter = "Q4";
              }
              break;
          }
        }
      } catch {
        // 미가용 기간 스킵
      }
    }
    availableYears.push(yearData);
  }

  return { corpCode, years: availableYears, latestYear, latestQuarter };
}

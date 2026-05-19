/**
 * DART 증권발행 결정 조회 — 유상증자·CB·EB·BW (snake→camel 매핑).
 *
 * 이식 출처: medigate `dart-api.ts`(10fb7f4) 930~1159행. D2 분리 시
 * disclosure.ts 가 architect 예산(≤420) 초과 → "공시 메타 조회"와
 * "증권발행 이벤트"는 다른 책임이므로 securities.ts 로 추가 분리
 * (STRUCTURAL #2 정합 — 자본거래 축). status!=="000" → graceful 빈 배열.
 */

import type {
  DartPaidInCapitalIncrease,
  DartConvertibleBond,
  DartExchangeableBond,
  DartBondWithWarrant,
  DartApiResponse,
} from "@/types/dart";
import { dartApiCall } from "./client";

/** 유상증자 결정 조회 */
export async function getPaidInCapitalIncrease(
  corpCode: string,
  options: { beginDate?: string; endDate?: string } = {},
): Promise<DartPaidInCapitalIncrease[]> {
  try {
    const params: Record<string, string> = { corp_code: corpCode };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("piicDecsn.json", params);
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      nstkOstkCnt: item.nstk_ostk_cnt,
      nstkEstkCnt: item.nstk_estk_cnt,
      fvPs: item.fv_ps,
      bficTisstkOstk: item.bfic_tisstk_ostk,
      bficTisstkEstk: item.bfic_tisstk_estk,
      fdppFclt: item.fdpp_fclt,
      fdppBsninh: item.fdpp_bsninh,
      fdppOp: item.fdpp_op,
      fdppDtrp: item.fdpp_dtrp,
      fdppOcsa: item.fdpp_ocsa,
      fdppEtc: item.fdpp_etc,
      icMthn: item.ic_mthn,
      sslAt: item.ssl_at,
      sslBgd: item.ssl_bgd,
      sslEdd: item.ssl_edd,
      bddd: item.ssl_bgd,
      bdFta: null,
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get paid-in capital increase for ${corpCode}:`, error);
    return [];
  }
}

/** 전환사채(CB) 발행결정 조회 */
export async function getConvertibleBonds(
  corpCode: string,
  options: { beginDate?: string; endDate?: string } = {},
): Promise<DartConvertibleBond[]> {
  try {
    const params: Record<string, string> = { corp_code: corpCode };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("cvbdIsDecsn.json", params);
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      bddd: item.bddd,
      bdKnd: item.bd_knd,
      bdFta: item.bd_fta,
      bdIntrEx: item.bd_intr_ex,
      bdIntrSf: item.bd_intr_sf,
      bdMtd: item.bd_mtd,
      bdisMthn: item.bdis_mthn,
      cvRt: item.cv_rt,
      cvPrc: item.cv_prc,
      cvisstkKnd: item.cvisstk_knd,
      cvisstkCnt: item.cvisstk_cnt,
      cvisstkTisstkVs: item.cvisstk_tisstk_vs,
      cvrqpdBgd: item.cvrqpd_bgd,
      cvrqpdEdd: item.cvrqpd_edd,
      fdppFclt: item.fdpp_fclt,
      fdppOp: item.fdpp_op,
      fdppDtrp: item.fdpp_dtrp,
      fdppOcsa: item.fdpp_ocsa,
      fdppEtc: item.fdpp_etc,
      sbd: item.sbd,
      pymd: item.pymd,
      bondNm: item.bd_nm,
      bondTotamt: item.bd_fta,
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get convertible bonds for ${corpCode}:`, error);
    return [];
  }
}

/** 교환사채(EB) 발행결정 조회 */
export async function getExchangeableBonds(
  corpCode: string,
  options: { beginDate?: string; endDate?: string } = {},
): Promise<DartExchangeableBond[]> {
  try {
    const params: Record<string, string> = { corp_code: corpCode };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("exbdIsDecsn.json", params);
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      bddd: item.bddd,
      bdKnd: item.bd_knd,
      bdFta: item.bd_fta,
      ovisFta: item.ovis_fta,
      ovisFtaCrn: item.ovis_fta_crn,
      ovisSter: item.ovis_ster,
      bdIntrEx: item.bd_intr_ex,
      bdIntrSf: item.bd_intr_sf,
      bdMtd: item.bd_mtd,
      bdisMthn: item.bdis_mthn,
      exRt: item.ex_rt,
      exPrc: item.ex_prc,
      extg: item.extg,
      extgStkcnt: item.extg_stkcnt,
      extgTisstkVs: item.extg_tisstk_vs,
      exrqpdBgd: item.exrqpd_bgd,
      exrqpdEdd: item.exrqpd_edd,
      fdppOp: item.fdpp_op,
      sbd: item.sbd,
      pymd: item.pymd,
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get exchangeable bonds for ${corpCode}:`, error);
    return [];
  }
}

/** 신주인수권부사채(BW) 발행결정 조회 */
export async function getBondsWithWarrant(
  corpCode: string,
  options: { beginDate?: string; endDate?: string } = {},
): Promise<DartBondWithWarrant[]> {
  try {
    const params: Record<string, string> = { corp_code: corpCode };
    if (options.beginDate) params.bgn_de = options.beginDate;
    if (options.endDate) params.end_de = options.endDate;

    const response = await dartApiCall<
      DartApiResponse<Record<string, string>>
    >("bdwtIsDecsn.json", params);
    if (response.status !== "000") return [];
    return (response.list || []).map((item) => ({
      rceptNo: item.rcept_no,
      corpCode: item.corp_code,
      corpName: item.corp_name,
      rceptDt: item.rcept_dt,
      bddd: item.bddd,
      bdKnd: item.bd_knd,
      bdFta: item.bd_fta,
      bdIntrEx: item.bd_intr_ex,
      bdIntrSf: item.bd_intr_sf,
      bdMtd: item.bd_mtd,
      bdisMthn: item.bdis_mthn,
      exPrc: item.ex_prc,
      exisstkKnd: item.exisstk_knd,
      exisstkCnt: item.exisstk_cnt,
      exisstkTisstkVs: item.exisstk_tisstk_vs,
      exrqpdBgd: item.exrqpd_bgd,
      exrqpdEdd: item.exrqpd_edd,
      fdppFclt: item.fdpp_fclt,
      fdppOp: item.fdpp_op,
      sbd: item.sbd,
      pymd: item.pymd,
      rmCtt: item.rm,
    }));
  } catch (error) {
    console.error(`Failed to get bonds with warrant for ${corpCode}:`, error);
    return [];
  }
}


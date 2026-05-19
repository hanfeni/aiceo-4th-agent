/**
 * DART 효율성 지표 분기 연환산 + 4분기 단위금액 특수 로직 (순수).
 *
 * 이식 출처: medigate `indicator-calculator.ts`(10fb7f4) 704~793행.
 * 기능축 6분리(STRUCTURAL #2). 이 파일 = "분기 회전율 연환산
 * (4/경과분기) + 4Q 단위금액(연간−3분기누적)" 축 — TC-46.2 특수 로직.
 */

import type { DartFinancialItem } from "@/types/dart";
import { ACCOUNT_NAMES } from "./definitions";
import { extractByKey, extractAddAmount } from "./extract";
import { extractIndicatorAmount, calculateRatioIndicator } from "./ratio";
import { getAmountIndicatorAccountNames } from "./classify";

/**
 * 효율성 지표의 분기별 계산 (연환산 적용).
 * @param quarterIndex 0=Q1, 1=Q2, 2=Q3, 3=Q4
 * Q4 는 일반 계산, Q1~Q3 는 누적금액 × (4/경과분기) 연환산.
 */
export function calculateEfficiencyIndicatorForQuarter(
  financials: DartFinancialItem[],
  indicator: string,
  quarterIndex: number,
): number | null {
  if (quarterIndex === 3) {
    return calculateRatioIndicator(financials, indicator);
  }

  const quartersElapsed = quarterIndex + 1;
  let annualizationFactor = 4.0 / quartersElapsed;

  let revenueCumul = extractAddAmount(financials, ...ACCOUNT_NAMES.revenue);
  let costOfSalesCumul = extractAddAmount(financials, ...ACCOUNT_NAMES.costOfSales);

  if (revenueCumul === null) {
    const revenueUnit = extractByKey(financials, "revenue");
    if (revenueUnit !== null) {
      revenueCumul = revenueUnit;
      annualizationFactor = 4.0;
    }
  }
  if (costOfSalesCumul === null) {
    const costOfSalesUnit = extractByKey(financials, "costOfSales");
    if (costOfSalesUnit !== null) costOfSalesCumul = costOfSalesUnit;
  }

  const totalAssets = extractByKey(financials, "totalAssets");
  const receivables = extractByKey(financials, "receivables");
  const inventory = extractByKey(financials, "inventory");
  const payables = extractByKey(financials, "payables");
  const tangibleAssets = extractByKey(financials, "tangibleAssets");

  switch (indicator) {
    case "assetTurnover":
      if (revenueCumul !== null && totalAssets !== null && totalAssets !== 0) {
        return (revenueCumul * annualizationFactor) / totalAssets;
      }
      break;
    case "receivablesTurnover":
      if (revenueCumul !== null && receivables !== null && receivables !== 0) {
        return (revenueCumul * annualizationFactor) / receivables;
      }
      break;
    case "inventoryTurnover":
      if (costOfSalesCumul !== null && inventory !== null && inventory !== 0) {
        return (costOfSalesCumul * annualizationFactor) / inventory;
      }
      break;
    case "payablesTurnover":
      if (costOfSalesCumul !== null && payables !== null && payables !== 0) {
        return (costOfSalesCumul * annualizationFactor) / payables;
      }
      break;
    case "tangibleAssetTurnover":
      if (revenueCumul !== null && tangibleAssets !== null && tangibleAssets !== 0) {
        return (revenueCumul * annualizationFactor) / tangibleAssets;
      }
      break;
  }
  return null;
}

/**
 * 4분기 단위 금액 계산 (연간 − 3분기누적).
 * TC-46.2 특수 로직 — 사업보고서엔 Q4 단위금액이 없어 역산.
 */
export function calculateQ4UnitAmount(
  annualFinancials: DartFinancialItem[],
  q3Financials: DartFinancialItem[],
  indicator: string,
): number | null {
  if (!annualFinancials.length || !q3Financials.length) return null;

  const annualAmount = extractIndicatorAmount(annualFinancials, indicator);
  if (annualAmount === null) return null;

  const accountNames = getAmountIndicatorAccountNames(indicator);
  const q3CumulativeAmount = extractAddAmount(q3Financials, ...accountNames);
  if (q3CumulativeAmount === null) return null;

  return annualAmount - q3CumulativeAmount;
}

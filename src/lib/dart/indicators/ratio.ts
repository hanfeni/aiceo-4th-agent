/**
 * DART 비율·금액 지표 계산 (순수).
 *
 * 이식 출처: medigate `indicator-calculator.ts`(10fb7f4) 356~702행.
 * 기능축 6분리(STRUCTURAL #2). 이 파일 = "당기/전기 비율 지표 +
 * 금액 지표 추출" 축. 분모 0/null 가드로 결측 시 null 반환(예외
 * throw 아님 — TC-46.7/46.9 결정성, NFR-18). 수식은 원본 보존(자본잠식
 * 음수 자본도 수식대로 — 해석은 systemPrompt 책임, 함수는 결정적).
 */

import type { DartFinancialItem } from "@/types/dart";
import { extractByKey, extractPrevByKey } from "./extract";

/**
 * 비율 지표 계산.
 * @param prevYearFinancials 전년 동기 재무제표(성장률 지표용, 선택)
 */
export function calculateRatioIndicator(
  financials: DartFinancialItem[],
  indicator: string,
  prevYearFinancials?: DartFinancialItem[],
): number | null {
  const revenue = extractByKey(financials, "revenue");
  const operatingIncome = extractByKey(financials, "operatingIncome");
  const netIncome = extractByKey(financials, "netIncome");
  const totalAssets = extractByKey(financials, "totalAssets");
  const totalEquity = extractByKey(financials, "totalEquity");
  const totalLiabilities = extractByKey(financials, "totalLiabilities");
  const grossProfit = extractByKey(financials, "grossProfit");
  const currentAssets = extractByKey(financials, "currentAssets");
  const currentLiabilities = extractByKey(financials, "currentLiabilities");
  const inventory = extractByKey(financials, "inventory");
  const financeCost = extractByKey(financials, "financeCost");
  const shortTermBorrowings = extractByKey(financials, "shortTermBorrowings");
  const longTermBorrowings = extractByKey(financials, "longTermBorrowings");
  const bonds = extractByKey(financials, "bonds");
  const cash = extractByKey(financials, "cash");
  const receivables = extractByKey(financials, "receivables");
  const costOfSales = extractByKey(financials, "costOfSales");
  const payables = extractByKey(financials, "payables");
  const tangibleAssets = extractByKey(financials, "tangibleAssets");

  const totalBorrowings =
    (shortTermBorrowings ?? 0) + (longTermBorrowings ?? 0) + (bonds ?? 0);

  switch (indicator) {
    case "debtRatio":
      if (totalLiabilities !== null && totalEquity !== null && totalEquity !== 0) {
        return (totalLiabilities / totalEquity) * 100;
      }
      break;
    case "roe":
      if (netIncome !== null && totalEquity !== null && totalEquity !== 0) {
        return (netIncome / totalEquity) * 100;
      }
      break;
    case "grossProfitMargin":
      if (grossProfit !== null && revenue !== null && revenue !== 0) {
        return (grossProfit / revenue) * 100;
      }
      break;
    case "operatingProfitMargin":
      if (operatingIncome !== null && revenue !== null && revenue !== 0) {
        return (operatingIncome / revenue) * 100;
      }
      break;
    case "netProfitMargin":
      if (netIncome !== null && revenue !== null && revenue !== 0) {
        return (netIncome / revenue) * 100;
      }
      break;
    case "roa":
      if (netIncome !== null && totalAssets !== null && totalAssets !== 0) {
        return (netIncome / totalAssets) * 100;
      }
      break;
    case "currentRatio":
      if (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0) {
        return (currentAssets / currentLiabilities) * 100;
      }
      break;
    case "quickRatio":
      if (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0) {
        return ((currentAssets - (inventory ?? 0)) / currentLiabilities) * 100;
      }
      break;
    case "interestCoverage":
      if (operatingIncome !== null && financeCost !== null && financeCost !== 0) {
        return operatingIncome / financeCost;
      }
      break;
    case "debtDependency":
      if (totalAssets !== null && totalAssets !== 0) {
        return (totalBorrowings / totalAssets) * 100;
      }
      break;
    case "netDebtRatio":
      if (totalEquity !== null && totalEquity !== 0) {
        return ((totalBorrowings - (cash ?? 0)) / totalEquity) * 100;
      }
      break;
    case "cashRatio":
      if (cash !== null && totalAssets !== null && totalAssets !== 0) {
        return (cash / totalAssets) * 100;
      }
      break;
    case "assetTurnover":
      if (revenue !== null && totalAssets !== null && totalAssets !== 0) {
        return revenue / totalAssets;
      }
      break;
    case "receivablesTurnover":
      if (revenue !== null && receivables !== null && receivables !== 0) {
        return revenue / receivables;
      }
      break;
    case "inventoryTurnover":
      if (costOfSales !== null && inventory !== null && inventory !== 0) {
        return costOfSales / inventory;
      }
      break;
    case "payablesTurnover":
      if (costOfSales !== null && payables !== null && payables !== 0) {
        return costOfSales / payables;
      }
      break;
    case "tangibleAssetTurnover":
      if (revenue !== null && tangibleAssets !== null && tangibleAssets !== 0) {
        return revenue / tangibleAssets;
      }
      break;
    case "revenueGrowth": {
      let prev = prevYearFinancials ? extractByKey(prevYearFinancials, "revenue") : null;
      if (prev === null) prev = extractPrevByKey(financials, "revenue");
      if (revenue !== null && prev !== null && prev !== 0) {
        return ((revenue - prev) / Math.abs(prev)) * 100;
      }
      break;
    }
    case "operatingIncomeGrowth": {
      let prev = prevYearFinancials ? extractByKey(prevYearFinancials, "operatingIncome") : null;
      if (prev === null) prev = extractPrevByKey(financials, "operatingIncome");
      if (operatingIncome !== null && prev !== null && prev !== 0) {
        return ((operatingIncome - prev) / Math.abs(prev)) * 100;
      }
      break;
    }
    case "netIncomeGrowth": {
      let prev = prevYearFinancials ? extractByKey(prevYearFinancials, "netIncome") : null;
      if (prev === null) prev = extractPrevByKey(financials, "netIncome");
      if (netIncome !== null && prev !== null && prev !== 0) {
        return ((netIncome - prev) / Math.abs(prev)) * 100;
      }
      break;
    }
    case "assetGrowth": {
      let prev = prevYearFinancials ? extractByKey(prevYearFinancials, "totalAssets") : null;
      if (prev === null) prev = extractPrevByKey(financials, "totalAssets");
      if (totalAssets !== null && prev !== null && prev !== 0) {
        return ((totalAssets - prev) / Math.abs(prev)) * 100;
      }
      break;
    }
    case "equityGrowth": {
      let prev = prevYearFinancials ? extractByKey(prevYearFinancials, "totalEquity") : null;
      if (prev === null) prev = extractPrevByKey(financials, "totalEquity");
      if (totalEquity !== null && prev !== null && prev !== 0) {
        return ((totalEquity - prev) / Math.abs(prev)) * 100;
      }
      break;
    }
  }
  return null;
}

/** 금액 지표 추출 (당기) */
export function extractIndicatorAmount(
  financials: DartFinancialItem[],
  indicator: string,
): number | null {
  switch (indicator) {
    case "revenue":
      return extractByKey(financials, "revenue");
    case "operatingIncome":
      return extractByKey(financials, "operatingIncome");
    case "netIncome":
      return extractByKey(financials, "netIncome");
    case "eps":
      return extractByKey(financials, "eps");
    case "operatingCF":
      return extractByKey(financials, "operatingCF");
    case "investingCF":
      return extractByKey(financials, "investingCF");
    case "financingCF":
      return extractByKey(financials, "financingCF");
    case "fcf": {
      const opCF = extractByKey(financials, "operatingCF");
      const invCF = extractByKey(financials, "investingCF");
      return opCF !== null && invCF !== null ? opCF + invCF : null;
    }
    case "totalAssets":
      return extractByKey(financials, "totalAssets");
    default:
      return null;
  }
}

/** 금액 지표 추출 (전기) */
export function extractPrevIndicatorAmount(
  financials: DartFinancialItem[],
  indicator: string,
): number | null {
  switch (indicator) {
    case "revenue":
      return extractPrevByKey(financials, "revenue");
    case "operatingIncome":
      return extractPrevByKey(financials, "operatingIncome");
    case "netIncome":
      return extractPrevByKey(financials, "netIncome");
    case "eps":
      return extractPrevByKey(financials, "eps");
    case "operatingCF":
      return extractPrevByKey(financials, "operatingCF");
    case "investingCF":
      return extractPrevByKey(financials, "investingCF");
    case "financingCF":
      return extractPrevByKey(financials, "financingCF");
    case "fcf": {
      const opCF = extractPrevByKey(financials, "operatingCF");
      const invCF = extractPrevByKey(financials, "investingCF");
      return opCF !== null && invCF !== null ? opCF + invCF : null;
    }
    case "totalAssets":
      return extractPrevByKey(financials, "totalAssets");
    default:
      return null;
  }
}

/** 전기 비율 지표 계산 (QoQ/%p 비교용) */
export function calculatePrevRatioIndicator(
  financials: DartFinancialItem[],
  indicator: string,
): number | null {
  const revenuePrev = extractPrevByKey(financials, "revenue");
  const operatingIncomePrev = extractPrevByKey(financials, "operatingIncome");
  const netIncomePrev = extractPrevByKey(financials, "netIncome");
  const totalAssetsPrev = extractPrevByKey(financials, "totalAssets");
  const totalEquityPrev = extractPrevByKey(financials, "totalEquity");
  const totalLiabilitiesPrev = extractPrevByKey(financials, "totalLiabilities");
  const grossProfitPrev = extractPrevByKey(financials, "grossProfit");
  const currentAssetsPrev = extractPrevByKey(financials, "currentAssets");
  const currentLiabilitiesPrev = extractPrevByKey(financials, "currentLiabilities");
  const inventoryPrev = extractPrevByKey(financials, "inventory");
  const cashPrev = extractPrevByKey(financials, "cash");
  const shortTermBorrowingsPrev = extractPrevByKey(financials, "shortTermBorrowings");
  const longTermBorrowingsPrev = extractPrevByKey(financials, "longTermBorrowings");
  const bondsPrev = extractPrevByKey(financials, "bonds");

  const totalBorrowingsPrev =
    (shortTermBorrowingsPrev ?? 0) + (longTermBorrowingsPrev ?? 0) + (bondsPrev ?? 0);

  switch (indicator) {
    case "debtRatio":
      if (totalLiabilitiesPrev !== null && totalEquityPrev !== null && totalEquityPrev !== 0) {
        return (totalLiabilitiesPrev / totalEquityPrev) * 100;
      }
      break;
    case "roe":
      if (netIncomePrev !== null && totalEquityPrev !== null && totalEquityPrev !== 0) {
        return (netIncomePrev / totalEquityPrev) * 100;
      }
      break;
    case "grossProfitMargin":
      if (grossProfitPrev !== null && revenuePrev !== null && revenuePrev !== 0) {
        return (grossProfitPrev / revenuePrev) * 100;
      }
      break;
    case "operatingProfitMargin":
      if (operatingIncomePrev !== null && revenuePrev !== null && revenuePrev !== 0) {
        return (operatingIncomePrev / revenuePrev) * 100;
      }
      break;
    case "netProfitMargin":
      if (netIncomePrev !== null && revenuePrev !== null && revenuePrev !== 0) {
        return (netIncomePrev / revenuePrev) * 100;
      }
      break;
    case "roa":
      if (netIncomePrev !== null && totalAssetsPrev !== null && totalAssetsPrev !== 0) {
        return (netIncomePrev / totalAssetsPrev) * 100;
      }
      break;
    case "currentRatio":
      if (currentAssetsPrev !== null && currentLiabilitiesPrev !== null && currentLiabilitiesPrev !== 0) {
        return (currentAssetsPrev / currentLiabilitiesPrev) * 100;
      }
      break;
    case "quickRatio":
      if (currentAssetsPrev !== null && currentLiabilitiesPrev !== null && currentLiabilitiesPrev !== 0) {
        return ((currentAssetsPrev - (inventoryPrev ?? 0)) / currentLiabilitiesPrev) * 100;
      }
      break;
    case "debtDependency":
      if (totalAssetsPrev !== null && totalAssetsPrev !== 0) {
        return (totalBorrowingsPrev / totalAssetsPrev) * 100;
      }
      break;
    case "netDebtRatio":
      if (totalEquityPrev !== null && totalEquityPrev !== 0) {
        return ((totalBorrowingsPrev - (cashPrev ?? 0)) / totalEquityPrev) * 100;
      }
      break;
    case "cashRatio":
      if (cashPrev !== null && totalAssetsPrev !== null && totalAssetsPrev !== 0) {
        return (cashPrev / totalAssetsPrev) * 100;
      }
      break;
  }
  return null;
}

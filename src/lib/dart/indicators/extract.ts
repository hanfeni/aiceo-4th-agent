/**
 * DART 재무제표 금액 추출 원자 함수 (순수).
 *
 * 이식 출처: medigate `indicator-calculator.ts`(10fb7f4) 232~354행.
 * 기능축 6분리(STRUCTURAL #2). 이 파일 = "통화 정규화 + 계정과목
 * 매칭 + 당기/전기/누적 금액 추출" 축. LLM/IO 0 — 순수 함수(NFR-18).
 */

import type { DartFinancialItem } from "@/types/dart";
import { ACCOUNT_NAMES } from "./definitions";

/**
 * 통화 단위를 고려한 금액 변환 (백만원/천원 → 원).
 * (TC-46.2/46.11 특수 로직 — 통화단위 혼재 정규화.)
 */
export function convertToWon(
  amount: string | undefined,
  currency: string | undefined,
): number | null {
  if (!amount) return null;
  const cleanAmount = amount.replace(/,/g, "").trim();
  const value = parseFloat(cleanAmount);
  if (isNaN(value)) return null;
  if (currency === "백만원" || currency === "천원") {
    return currency === "백만원" ? value * 1000000 : value * 1000;
  }
  return value;
}

/**
 * 계정과목명 매칭 (정확 → 시작 → 포함 순 부분 매칭).
 */
export function matchAccountName(
  accountNm: string | undefined,
  targetNames: string[],
): boolean {
  if (!accountNm) return false;
  const normalized = accountNm.trim();
  for (const target of targetNames) {
    if (normalized === target) return true;
    if (normalized.startsWith(target)) return true;
    if (normalized.includes(target)) return true;
  }
  return false;
}

/** 재무제표에서 특정 계정과목의 당기금액 추출 (정확→부분 매칭) */
export function extractAmount(
  financials: DartFinancialItem[],
  ...accountNames: string[]
): number | null {
  for (const accountName of accountNames) {
    const item = financials.find((f) => f.accountNm === accountName);
    if (item?.thstrmAmount) {
      const value = convertToWon(item.thstrmAmount, item.currency);
      if (value !== null) return value;
    }
  }
  const item = financials.find((f) => matchAccountName(f.accountNm, accountNames));
  if (item?.thstrmAmount) {
    const value = convertToWon(item.thstrmAmount, item.currency);
    if (value !== null) return value;
  }
  return null;
}

/** 재무제표에서 특정 계정과목의 전기금액 추출 */
export function extractPrevAmount(
  financials: DartFinancialItem[],
  ...accountNames: string[]
): number | null {
  for (const accountName of accountNames) {
    const item = financials.find((f) => f.accountNm === accountName);
    if (item?.frmtrmAmount) {
      const value = convertToWon(item.frmtrmAmount, item.currency);
      if (value !== null) return value;
    }
  }
  const item = financials.find((f) => matchAccountName(f.accountNm, accountNames));
  if (item?.frmtrmAmount) {
    const value = convertToWon(item.frmtrmAmount, item.currency);
    if (value !== null) return value;
  }
  return null;
}

/** 재무제표에서 특정 계정과목의 당기누적금액 추출 (분기보고서) */
export function extractAddAmount(
  financials: DartFinancialItem[],
  ...accountNames: string[]
): number | null {
  for (const accountName of accountNames) {
    const item = financials.find((f) => f.accountNm === accountName);
    if (item?.thstrmAddAmount) {
      const value = convertToWon(item.thstrmAddAmount, item.currency);
      if (value !== null) return value;
    }
  }
  const item = financials.find((f) => matchAccountName(f.accountNm, accountNames));
  if (item?.thstrmAddAmount) {
    const value = convertToWon(item.thstrmAddAmount, item.currency);
    if (value !== null) return value;
  }
  return null;
}

/** 계정 키(ACCOUNT_NAMES)로 당기금액 추출 */
export function extractByKey(
  financials: DartFinancialItem[],
  key: string,
): number | null {
  const names = ACCOUNT_NAMES[key];
  if (!names) return null;
  return extractAmount(financials, ...names);
}

/** 계정 키(ACCOUNT_NAMES)로 전기금액 추출 */
export function extractPrevByKey(
  financials: DartFinancialItem[],
  key: string,
): number | null {
  const names = ACCOUNT_NAMES[key];
  if (!names) return null;
  return extractPrevAmount(financials, ...names);
}

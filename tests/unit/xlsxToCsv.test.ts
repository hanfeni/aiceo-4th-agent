import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { isXlsxFile, xlsxToCsv } from "@/lib/files/xlsxToCsv";
import { parseCsv } from "@/lib/sqllab/load";

// xlsxToCsv 단위 테스트 — 엑셀→CSV 변환 (LLM 비의존, 무과금·결정적).
// 핵심 검증: 변환 산출 CSV 가 적재 경로의 parseCsv 와 왕복 호환되는가
// (RFC4180). SheetJS 로 실제 워크북을 만들어 .xlsx 바이트 → File →
// xlsxToCsv → parseCsv 전 구간을 결정적으로 검증한다(jsdom).

/** rows(2차원 배열)로 .xlsx File 을 만든다(SheetJS aoa). */
function xlsxFile(name: string, rows: (string | number)[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("isXlsxFile — 확장자 판정 (순수)", () => {
  it("xlsx/xls 는 true, 그 외는 false", () => {
    expect(isXlsxFile(new File([], "a.xlsx"))).toBe(true);
    expect(isXlsxFile(new File([], "a.xls"))).toBe(true);
    expect(isXlsxFile(new File([], "A.XLSX"))).toBe(true);
    expect(isXlsxFile(new File([], "a.csv"))).toBe(false);
    expect(isXlsxFile(new File([], "a.pdf"))).toBe(false);
  });
});

describe("xlsxToCsv — 엑셀→CSV 변환 + parseCsv 왕복", () => {
  it("단순 표를 CSV 로 변환하고 parseCsv 로 동일 복원", async () => {
    const file = xlsxFile("data.xlsx", [
      ["name", "age"],
      ["김두환", 40],
      ["이순신", 50],
    ]);
    const csv = await xlsxToCsv(file);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual([
      ["name", "age"],
      ["김두환", "40"],
      ["이순신", "50"],
    ]);
  });

  it("콤마·따옴표·줄바꿈 포함 셀도 RFC4180 왕복 안전", async () => {
    const file = xlsxFile("tricky.xlsx", [
      ["col"],
      ["a,b"],
      ['그는 "안녕"이라 했다'],
      ["줄1\n줄2"],
    ]);
    const csv = await xlsxToCsv(file);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual([
      ["col"],
      ["a,b"],
      ['그는 "안녕"이라 했다'],
      ["줄1\n줄2"],
    ]);
  });

  it("데이터 없는 빈 시트는 빈 문자열 반환(throw 아님)", async () => {
    // SheetJS 는 시트 0개 워크북을 write 단계에서 막으므로(Workbook is
    // empty), 실제 발생 가능한 형태 = 시트는 있되 셀이 없는 경우.
    const file = xlsxFile("blank.xlsx", []);
    expect(await xlsxToCsv(file)).toBe("");
  });

  it("첫 시트만 변환한다(여러 시트 중)", async () => {
    const ws1 = XLSX.utils.aoa_to_sheet([["first"], ["1"]]);
    const ws2 = XLSX.utils.aoa_to_sheet([["second"], ["2"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "A");
    XLSX.utils.book_append_sheet(wb, ws2, "B");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], "multi.xlsx");
    const parsed = parseCsv(await xlsxToCsv(file));
    expect(parsed).toEqual([["first"], ["1"]]);
  });
});

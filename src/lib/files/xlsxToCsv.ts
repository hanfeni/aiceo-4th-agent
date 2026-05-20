/**
 * 엑셀(xlsx/xls) → CSV 변환 (클라이언트 전용 — 적재 메뉴 업로드용).
 *
 * 데이터 적재(/data-load)는 표 데이터 전용이라 비정형 문서(pdf/hwpx)와
 * 성격이 다르다 → extractText.ts(텍스트 추출 SSOT)에 넣지 않고 여기로
 * 격리한다. 변환 산출물은 RFC4180 CSV 문자열 → 기존 loadCustomCsv 경로
 * (sql-lab/upload + parseCsv)에 그대로 흘려보내 서버 무변경(R2/R3 무영향).
 *
 * 동적 import(D1): xlsx(SheetJS)는 모듈 top-level 에 두면 prod 번들에
 * 항상 포함된다 → 동적 import 로 적재 업로드 시점에만 로드. pickXlsx /
 * isXlsxFile 은 라이브러리 로드 없이 평가되는 순수 함수(단위 테스트 경량).
 */

/** 엑셀로 인식하는 확장자(첫 시트만 CSV 로 변환). */
const XLSX_EXT = new Set(["xlsx", "xls"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** 엑셀 파일인지(확장자 기준, 순수). */
export function isXlsxFile(file: File): boolean {
  return XLSX_EXT.has(extOf(file.name));
}

/**
 * 엑셀 첫 시트를 RFC4180 CSV 문자열로 변환한다.
 *
 * 여러 시트가 있어도 첫 시트만 적재 대상(SQLite 단일 테이블 = 단일 시트
 * 가정 — 강의 실습 단순성). 빈 셀은 빈 문자열, 콤마·따옴표·줄바꿈은
 * SheetJS sheet_to_csv 가 RFC4180 으로 이스케이프하므로 parseCsv 와
 * 왕복(round-trip) 호환된다. 시트가 없으면 명확히 throw(무음 실패 0).
 */
export async function xlsxToCsv(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error(
      `엑셀에 시트가 없습니다: ${file.name} (내용이 있는 .xlsx 인지 확인하세요)`,
    );
  }
  const sheet = wb.Sheets[firstSheetName];
  // blankrows:false — 완전히 빈 행 제외(꼬리 빈 행이 적재되지 않게).
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  return csv.trim();
}

import { describe, it, expect } from "vitest";
import {
  pickFormat,
  isSupportedFile,
  SUPPORTED_TEXT_EXT,
  extractTextFromFile,
  type FileFormat,
} from "@/lib/files/extractText";

// extractText 단위 테스트 — 파일 텍스트 추출 (LLM 비의존, 무과금·결정적).
// Plan Critic H1: 파일 추출은 결정적이라 라이브러리 모킹 불필요 — 순수
// 분기 로직 + FileReader(jsdom 네이티브) 실동작 검증. pdf/docx 실추출은
// 동적 import(prod 번들 제외 — D1)라 통합 영역, 여기선 분기 결정만.

/** jsdom File 생성 헬퍼(텍스트 내용). */
function textFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("pickFormat — 확장자 → 포맷 분기 (순수)", () => {
  it.each<[string, FileFormat]>([
    ["notes.txt", "text"],
    ["README.md", "text"],
    ["data.csv", "text"],
    ["config.json", "text"],
    ["app.ts", "text"],
    ["main.py", "text"],
    ["server.log", "text"],
    ["report.pdf", "pdf"],
    ["spec.docx", "docx"],
    ["PAPER.PDF", "pdf"],
    ["Doc.DOCX", "docx"],
  ])("'%s' → %s", (name, expected) => {
    expect(pickFormat(name)).toBe(expected);
  });

  it("미지원 확장자 → null (xls/png/zip 등)", () => {
    expect(pickFormat("sheet.xls")).toBeNull();
    expect(pickFormat("photo.png")).toBeNull();
    expect(pickFormat("archive.zip")).toBeNull();
    expect(pickFormat("noext")).toBeNull();
  });
});

describe("isSupportedFile — 지원 여부 판정", () => {
  it("지원 파일 true / 미지원 false", () => {
    expect(isSupportedFile(textFile("a.txt", "x"))).toBe(true);
    expect(isSupportedFile(textFile("a.pdf", "x"))).toBe(true);
    expect(isSupportedFile(textFile("a.docx", "x"))).toBe(true);
    expect(isSupportedFile(textFile("a.png", "x"))).toBe(false);
  });

  it("SUPPORTED_TEXT_EXT 는 최소 txt/md/csv/json 을 포함", () => {
    for (const e of ["txt", "md", "csv", "json"]) {
      expect(SUPPORTED_TEXT_EXT).toContain(e);
    }
  });
});

describe("extractTextFromFile — 텍스트 계열 (FileReader jsdom 실동작)", () => {
  it("txt 파일 내용을 그대로 추출한다", async () => {
    const out = await extractTextFromFile(
      textFile("memo.txt", "안녕하세요\n둘째 줄"),
    );
    expect(out).toBe("안녕하세요\n둘째 줄");
  });

  it("md/csv/json/코드도 readAsText 로 원문 추출", async () => {
    const csv = await extractTextFromFile(textFile("d.csv", "a,b\n1,2"));
    expect(csv).toBe("a,b\n1,2");
    const code = await extractTextFromFile(
      textFile("x.ts", "export const a = 1;"),
    );
    expect(code).toBe("export const a = 1;");
  });

  it("빈 텍스트 파일 → 빈 문자열(throw 아님)", async () => {
    expect(await extractTextFromFile(textFile("empty.txt", ""))).toBe("");
  });

  it("미지원 확장자 → 명확한 Error throw (무음 실패 0)", async () => {
    await expect(
      extractTextFromFile(textFile("sheet.xls", "x")),
    ).rejects.toThrow(/지원하지 않는|unsupported/i);
  });
});

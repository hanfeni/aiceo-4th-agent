import { describe, it, expect, vi } from "vitest";
import {
  classifyAttachment,
  fileToDataUrl,
  type AttachmentKind,
} from "@/lib/files/prepareAttachments";

// prepareAttachments 단위 테스트 — 첨부 분류 + base64 변환 (LLM 비의존).
// classifyAttachment 는 순수(확장자/MIME), fileToDataUrl 은 FileReader
// (jsdom 네이티브). 실제 텍스트 추출(extractTextFromFile)은 동적 import
// 라 Slice C 에서 별도 검증됨 — 여기선 분류·변환만.

function file(name: string, type: string, body = "x"): File {
  return new File([body], name, { type });
}

describe("classifyAttachment — 이미지 vs 추출대상 vs 미지원", () => {
  it.each<[string, string, AttachmentKind]>([
    ["a.png", "image/png", "image"],
    ["b.jpg", "image/jpeg", "image"],
    ["c.webp", "image/webp", "image"],
    ["d.gif", "image/gif", "image"],
    ["notes.txt", "text/plain", "text"],
    ["doc.pdf", "application/pdf", "text"],
    ["x.docx", "application/octet-stream", "text"],
    ["data.csv", "text/csv", "text"],
  ])("'%s' (%s) → %s", (name, type, expected) => {
    expect(classifyAttachment(file(name, type))).toBe(expected);
  });

  it("미지원(xls/zip/svg 등) → 'unsupported'", () => {
    expect(classifyAttachment(file("s.xls", "application/vnd.ms-excel"))).toBe(
      "unsupported",
    );
    expect(classifyAttachment(file("a.zip", "application/zip"))).toBe(
      "unsupported",
    );
    // svg 는 스크립트 주입 위험 → 이미지로 취급하지 않음
    expect(classifyAttachment(file("x.svg", "image/svg+xml"))).toBe(
      "unsupported",
    );
  });
});

describe("fileToDataUrl — base64 data URL 변환 (FileReader)", () => {
  it("이미지 파일을 data:image/...;base64,... 로 변환", async () => {
    const url = await fileToDataUrl(file("a.png", "image/png", "PNGDATA"));
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("읽기 실패 시 reject(무음 실패 0)", async () => {
    const bad = file("a.png", "image/png");
    // FileReader.readAsDataURL 를 강제로 에러내기
    const origReader = globalThis.FileReader;
    class FailingReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    await expect(fileToDataUrl(bad)).rejects.toThrow();
    vi.stubGlobal("FileReader", origReader);
  });
});

/**
 * DART 공시 원문 파서 보안 강화(Slice D4) 단위 테스트 — 역검증(green).
 *
 * 대상: src/lib/dart/disclosure/{parser,context,types,index}.ts
 *
 * 네트워크/실제 DART/LLM 0 — fetch·JSZip·D2 api 전부 vi.mock(과금·
 * 비결정·zip-slip 실파일쓰기 금지). 정답지는 합성 ZIP/XML 의 자명한 값
 * 또는 손계산(추측 금지 — CLAUDE.md TDD 규칙).
 *
 * TC 매핑:
 *  - TC-48.4  (UC-48 / NFR-16·OPEN-2)   zip-slip 방어(엔트리명 traversal 거부)
 *  - TC-48.5  (UC-48 / NFR-16·OPEN-2)   XML 폭탄/과대 응답 차단(길이 게이트)
 *  - TC-41.14 (UC-41-E5 / FR-21·NFR-18) 손상 ZIP/XML → throw 0, 결정 결과
 *  - TC-46.8  (UC-46-E2 / FR-21·NFR-18) 위 결정 검증(동일 흐름)
 *  - TC-47.1  (UC-47 / FR-27·AC-26)     trend/·disclosure/ gemini import 0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// jszip 모킹 — parser.ts 는 `import JSZip from "jszip"` (static default).
// JSZip.loadAsync(arrayBuffer) → { files: { name: { dir, async() } } }.
// 실제 압축 해제 0 — zip.files 객체를 테스트가 직접 주입(zip-slip 안전).
// ──────────────────────────────────────────────────────────────────────────
const loadAsyncMock = vi.fn();
vi.mock("jszip", () => ({
  default: { loadAsync: (...a: unknown[]) => loadAsyncMock(...a) },
}));

// D2 api(getRecentDisclosures) 모킹 — context.ts 가 사용
vi.mock("@/lib/dart/api", () => ({
  getRecentDisclosures: vi.fn(),
}));

import {
  extractDisclosureFullText,
  getUnlistedCompanyDisclosureContext,
} from "@/lib/dart/disclosure";
import { getRecentDisclosures } from "@/lib/dart/api";

const mockGetRecent = vi.mocked(getRecentDisclosures);

/** ZIP 엔트리 객체 빌더 (dir=false, async→문자열) */
function zipFile(content: string, dir = false) {
  return {
    dir,
    async: vi.fn(async () => content),
  };
}

/** JSZip.loadAsync 결과 모킹 (files 맵 주입) */
function mockZip(files: Record<string, ReturnType<typeof zipFile>>): void {
  loadAsyncMock.mockResolvedValue({ files });
}

/** fetch → ZIP arrayBuffer 응답 모킹 (byteLength 제어 가능) */
function mockFetchZip(byteLength = 1024, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      arrayBuffer: async () => new ArrayBuffer(byteLength),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("DART_API_KEY", "TESTKEY40CHARS0000000000000000000000abcd");
  vi.clearAllMocks();
  loadAsyncMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════
// 1. TC-48.4 — zip-slip 방어 (엔트리명 traversal 거부) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-48.4 zip-slip 방어 (악성 엔트리명 거부)", () => {
  it("../ 상위경로·절대경로·백슬래시 엔트리만 있는 ZIP → XML 못찾음(success:false)", async () => {
    mockFetchZip();
    mockZip({
      "../evil.xml": zipFile("<root>EVIL</root>"),
      "/abs/x.xml": zipFile("<root>ABS</root>"),
      "a\\b.xml": zipFile("<root>BACKSLASH</root>"),
      "..\\x.xml": zipFile("<root>WINTRAVERSAL</root>"),
    });

    const r = await extractDisclosureFullText("20240101000001");
    // 모든 후보가 isSafeEntryName 에서 거부 → XML 0건
    expect(r.success).toBe(false);
    expect(r.error).toBe("XML 파일을 찾을 수 없습니다.");
    expect(r.text).toBe("");
    expect(r.charCount).toBe(0);
  });

  it("악성 엔트리 + 안전한 report.xml 혼재 → 안전한 것만 추출(traversal 0)", async () => {
    mockFetchZip();
    const safe = zipFile("<DOCUMENT-NAME>안전문서</DOCUMENT-NAME><BODY>본문</BODY>");
    const evil = zipFile("<root>../escaped payload</root>");
    mockZip({
      "../../etc/passwd.xml": evil,
      "report.xml": safe,
    });

    const r = await extractDisclosureFullText("20240101000002");
    expect(r.success).toBe(true);
    // 안전 엔트리(report.xml)만 .async 호출, 악성은 호출 0
    expect(safe.async).toHaveBeenCalledTimes(1);
    expect(evil.async).not.toHaveBeenCalled();
    expect(r.documentName).toBe("안전문서");
    expect(r.text).toContain("본문");
    expect(r.text).not.toContain("escaped payload");
  });

  it("디렉토리 엔트리(dir=true)·언더스코어 우선순위는 안전 후보 내에서만", async () => {
    mockFetchZip();
    mockZip({
      "subdir/": zipFile("", true), // dir → 후보 제외
      "a_b.xml": zipFile("<BODY>언더스코어</BODY>"),
      "main.xml": zipFile("<BODY>메인</BODY>"), // 언더스코어 없음 → 우선
    });
    const r = await extractDisclosureFullText("20240101000003");
    expect(r.success).toBe(true);
    expect(r.text).toContain("메인");
    expect(r.text).not.toContain("언더스코어");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. TC-48.5 — XML 폭탄/과대 응답 차단 (길이 게이트, 파싱 전) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-48.5 XML 폭탄/과대 응답 방어", () => {
  it("8MB 초과 arrayBuffer → 압축 해제 전 '과대' error 반환(loadAsync 미호출)", async () => {
    const TOO_BIG = 8 * 1024 * 1024 + 1;
    mockFetchZip(TOO_BIG);

    const r = await extractDisclosureFullText("20240101000004");
    expect(r.success).toBe(false);
    expect(r.error).toContain("과대");
    expect(r.charCount).toBe(0);
    // 파싱 전 게이트 → JSZip.loadAsync 진입 0 (DoS 차단)
    expect(loadAsyncMock).not.toHaveBeenCalled();
  });

  it("MAX_XML_BYTES 초과 압축해제 XML → 절단(charCount ≤ 상한, throw 0)", async () => {
    mockFetchZip(1024); // ZIP 자체는 작음(원본 게이트 통과)
    const MAX = 8 * 1024 * 1024;
    // 태그 없는 거대 텍스트(엔티티 폭탄 전개 후 모사) — 상한 초과
    const huge = "A".repeat(MAX + 5000);
    mockZip({ "report.xml": zipFile(huge) });

    const r = await extractDisclosureFullText("20240101000005");
    // findXmlContent 가 raw.slice(0, MAX) → 이후 태그 제거(없음)·trim
    expect(r.success).toBe(true);
    expect(r.charCount).toBeLessThanOrEqual(MAX);
    expect(r.charCount).toBeGreaterThan(0);
  });

  it("정규식 태그 제거가 깊은 중첩에도 throw 없이 동작(엔티티/태그 변환)", async () => {
    mockFetchZip();
    const xml =
      "<a><b><c>&lt;tag&gt;</c></b></a>" +
      "&nbsp;&amp;&quot;x&quot;" +
      "<n>".repeat(500) +
      "끝" +
      "</n>".repeat(500);
    mockZip({ "report.xml": zipFile(xml) });

    const r = await extractDisclosureFullText("20240101000006");
    expect(r.success).toBe(true);
    // 엔티티 변환: &lt;→< &gt;→> &amp;→& &quot;→"  / &nbsp;→공백
    expect(r.text).toContain("<tag>");
    expect(r.text).toContain('&"x"');
    expect(r.text).toContain("끝");
    // 모든 <...> 태그 제거됨
    expect(r.text).not.toMatch(/<n>/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. TC-41.14 / TC-46.8 — 손상 입력 → throw 0, 결정 결과 [P0/P1]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-41.14/46.8 graceful — 파싱 실패 시 throw 0 결정 결과", () => {
  it("fetch !ok → {success:false, error:'HTTP error: 500'}(throw 0)", async () => {
    mockFetchZip(0, false, 500);
    const r = await extractDisclosureFullText("X");
    expect(r).toEqual({
      success: false,
      text: "",
      charCount: 0,
      error: "HTTP error: 500",
    });
  });

  it("JSZip.loadAsync reject(손상 ZIP) → catch 결과 객체(throw 0)", async () => {
    mockFetchZip();
    loadAsyncMock.mockRejectedValue(new Error("Corrupted zip"));
    const r = await extractDisclosureFullText("X");
    expect(r.success).toBe(false);
    expect(r.text).toBe("");
    expect(r.error).toBe("Corrupted zip");
  });

  it("ZIP 안에 .xml 0건(스키마 불일치) → 'XML 파일을 찾을 수 없습니다.'", async () => {
    mockFetchZip();
    mockZip({
      "data.txt": zipFile("not xml"),
      "image.png": zipFile("binary"),
    });
    const r = await extractDisclosureFullText("X");
    expect(r.success).toBe(false);
    expect(r.error).toBe("XML 파일을 찾을 수 없습니다.");
  });

  it("정상 XML(태그+엔티티) → 태그 제거·엔티티 변환 text, charCount 정확", async () => {
    mockFetchZip();
    const xml =
      "<DOCUMENT-NAME>사업보고서</DOCUMENT-NAME>" +
      "<P>매출 &amp; 이익</P>  <P>증가&nbsp;세</P>";
    mockZip({ "report.xml": zipFile(xml) });
    const r = await extractDisclosureFullText("X");
    expect(r.success).toBe(true);
    expect(r.documentName).toBe("사업보고서");
    // 태그 제거 + &amp;→& + &nbsp;→공백 + 다중공백 1개 + trim
    expect(r.text).toBe("사업보고서 매출 & 이익 증가 세");
    expect(r.charCount).toBe(r.text.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. context — 비상장사 공시 맥락 (전문 모드 전용, gemini 경로 부재) [P1]
// ══════════════════════════════════════════════════════════════════════════
describe("getUnlistedCompanyDisclosureContext 전문 모드만", () => {
  it("자동선택: 우선순위 키워드(감사/사업보고서) 정렬 + 전문 context 조립", async () => {
    mockGetRecent.mockResolvedValue([
      { rceptNo: "R1", reportNm: "임원변경", rceptDt: "20240301" },
      { rceptNo: "R2", reportNm: "감사보고서", rceptDt: "20240401" },
    ]);
    mockFetchZip();
    mockZip({ "report.xml": zipFile("<BODY>원문 텍스트</BODY>") });

    const r = await getUnlistedCompanyDisclosureContext("00999999", "비상장㈜", 2);
    expect(r.success).toBe(true);
    expect(r.disclosureCount).toBe(2);
    // PRIORITY_KEYWORDS 정렬 → 감사보고서가 앞
    const idxAudit = r.context.indexOf("감사보고서");
    const idxExec = r.context.indexOf("임원변경");
    expect(idxAudit).toBeGreaterThanOrEqual(0);
    expect(idxAudit).toBeLessThan(idxExec);
    // 전문 마커 + 비상장 안내
    expect(r.context).toContain("[전문]");
    expect(r.context).toContain("비상장 회사");
    // 전문이므로 summary=original
    expect(r.totalSummaryChars).toBe(r.totalOriginalChars);
  });

  it("공시 0건 → success:false (요약 모드 호출 0 — gemini 경로 부재)", async () => {
    mockGetRecent.mockResolvedValue([]);
    const r = await getUnlistedCompanyDisclosureContext("X", "회사", 3);
    expect(r.success).toBe(false);
    expect(r.error).toBe("최근 공시가 없습니다.");
    expect(r.disclosureCount).toBe(0);
  });

  it("전 공시 추출 실패(전부 ZIP 손상) → success:false (throw 0)", async () => {
    mockGetRecent.mockResolvedValue([
      { rceptNo: "R1", reportNm: "사업보고서", rceptDt: "20240101" },
    ]);
    mockFetchZip();
    loadAsyncMock.mockRejectedValue(new Error("bad zip"));
    const r = await getUnlistedCompanyDisclosureContext("X", "회사", 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe("공시 내용을 처리할 수 없습니다.");
  });

  it("selectedDisclosures(mode='full') 우선 — getRecentDisclosures 미호출", async () => {
    mockFetchZip();
    mockZip({ "report.xml": zipFile("<BODY>선택 공시 본문</BODY>") });
    const r = await getUnlistedCompanyDisclosureContext("X", "회사", 3, [
      { rceptNo: "SEL1", reportNm: "사업보고서", rceptDt: "20240101", mode: "full" },
    ]);
    expect(r.success).toBe(true);
    expect(mockGetRecent).not.toHaveBeenCalled();
    expect(r.context).toContain("선택 공시 본문");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. TC-47.1 — trend/·disclosure/ 소스에서 gemini import 0 [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-47.1 gemini/요약 경로 부재 (import 정적 검사)", () => {
  const SRC = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../src/lib/dart",
  );

  function readAll(dir: string): { file: string; src: string }[] {
    return readdirSync(resolve(SRC, dir))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({
        file: `${dir}/${f}`,
        src: readFileSync(resolve(SRC, dir, f), "utf8"),
      }));
  }

  /** import/require 문에서만 토큰 검출 (주석·설명문 제외 — dartApi.test 패턴) */
  function importLines(src: string): string[] {
    return src
      .split("\n")
      .filter((ln) => {
        const t = ln.trim();
        if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*"))
          return false;
        return (
          /^\s*import\b/.test(ln) ||
          /\brequire\s*\(/.test(ln) ||
          /\bimport\s*\(/.test(ln)
        );
      });
  }

  const FORBIDDEN = [
    /gemini/i,
    /@google\/generative-ai/i,
    /generative-ai/i,
    /summarizeDisclosureForAI/,
  ];

  it("trend/ 전 파일: import 문에 gemini/generative-ai/요약 호출 0건", () => {
    for (const { file, src } of readAll("trend")) {
      for (const ln of importLines(src)) {
        for (const pat of FORBIDDEN) {
          expect(pat.test(ln), `${file} import 위반: ${ln.trim()}`).toBe(false);
        }
      }
    }
  });

  it("disclosure/ 전 파일: import 문에 gemini/generative-ai/요약 호출 0건", () => {
    for (const { file, src } of readAll("disclosure")) {
      for (const ln of importLines(src)) {
        for (const pat of FORBIDDEN) {
          expect(pat.test(ln), `${file} import 위반: ${ln.trim()}`).toBe(false);
        }
      }
    }
  });

  it("disclosure/ 전 파일: summarizeDisclosureForAI 호출식 0건(전 본문)", () => {
    for (const { file, src } of readAll("disclosure")) {
      // 함수 호출 패턴(주석 설명문 제외 — 코드 라인만)
      const callLines = src.split("\n").filter((ln) => {
        const t = ln.trim();
        if (t.startsWith("*") || t.startsWith("//")) return false;
        return /summarizeDisclosureForAI\s*\(/.test(ln);
      });
      expect(callLines, `${file} 요약 호출 잔존`).toHaveLength(0);
    }
  });
});

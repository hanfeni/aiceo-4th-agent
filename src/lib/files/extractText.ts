/**
 * 파일 텍스트 추출 (클라이언트 전용 — 백엔드 무변경).
 *
 * 첨부 파일을 LLM 에 보낼 수 있게 텍스트로 변환한다. 결과 텍스트는
 * useChat 이 query 에 합쳐 기존 경로로 전송하므로 route/agent 변경 0
 * (R2/R3 무영향). 이미지는 별도 멀티모달 경로(extractText 대상 아님).
 *
 * 포맷별 전략 (R8 실측 — file-extract-probe 노트):
 *  - 텍스트 계열(txt/md/csv/json/코드): 브라우저 FileReader.readAsText.
 *    의존성 0. jsdom 네이티브 동작(단위 테스트 가능).
 *  - PDF: pdfjs-dist 5.x. SSR 에서 window/canvas 접근 → **동적 import**
 *    (모듈 top-level 금지). legacy 빌드 + GlobalWorkerOptions.workerSrc.
 *  - DOCX: mammoth. Node 전제 main 이라 **브라우저 진입점 명시**
 *    (`mammoth/mammoth.browser`) + 동적 import.
 *  - HWPX: 한글 최신 포맷 = ZIP+XML 컨테이너. jszip(이미 의존)으로
 *    Contents/section*.xml 을 풀어 <hp:t> 텍스트 노드만 모은다. 별도
 *    HWPX 파서 의존 0 — over-engineering 회피.
 *
 * 동적 import 이유(Plan Critic D1): pdfjs/mammoth 가 모듈 top-level 에
 * 없어야 prod 번들에서 물리적으로 빠진다(NODE_ENV dev 전용 노출 +
 * `.next/static/` grep 0 검증). pickFormat/isSupportedFile 은 라이브러리
 * 로드 없이 평가되는 순수 함수라 단위 테스트가 가볍다.
 */

export type FileFormat = "text" | "pdf" | "docx" | "hwpx";

/** FileReader.readAsText 로 처리하는 텍스트 계열 확장자. */
export const SUPPORTED_TEXT_EXT = [
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "log",
  "yaml",
  "yml",
  "xml",
  "html",
  // 코드 파일(LLM 컨텍스트로 흔히 첨부)
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "java",
  "c",
  "cpp",
  "go",
  "rs",
  "rb",
  "sh",
  "sql",
  "css",
] as const;

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

/** 확장자로 추출 포맷을 결정한다. 미지원이면 null(순수 함수). */
export function pickFormat(filename: string): FileFormat | null {
  const ext = extOf(filename);
  if ((SUPPORTED_TEXT_EXT as readonly string[]).includes(ext)) return "text";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "hwpx") return "hwpx";
  return null;
}

/** 추출 가능한 파일인지(확장자 기준). */
export function isSupportedFile(file: File): boolean {
  return pickFormat(file.name) !== null;
}

/** 텍스트 계열 — 브라우저 FileReader(jsdom 네이티브). */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error(`파일을 읽지 못했습니다: ${file.name}`));
    r.readAsText(file);
  });
}

/**
 * PDF — 페이지별 텍스트 배열로 추출(pdfjs-dist 동적 import, prod 번들 제외).
 * 인덱스 메뉴가 "페이지=문서 1건" 으로 색인하려고 페이지 경계를 보존한다.
 * 빈 페이지(텍스트 없음)는 빈 문자열로 자리만 유지(페이지 번호 = index+1).
 */
export async function extractPdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // worker 버전은 pdfjs-dist 와 정확히 일치해야 함(R8 실측). 번들러가
  // worker 자산을 emit 하도록 URL 로 지정.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .trim(),
    );
  }
  return pages;
}

/** PDF — 전체 본문 합본(챗 첨부 등 단일 텍스트가 필요한 경로). */
async function readPdf(file: File): Promise<string> {
  const pages = await extractPdfPages(file);
  return pages.join("\n").trim();
}

/** DOCX — mammoth 브라우저 진입점 동적 import. */
async function readDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

/** HWPX(한글) — ZIP 컨테이너에서 본문 XML 의 텍스트만 추출. */
async function readHwpx(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  // 본문은 Contents/section0.xml, section1.xml … 순서대로. 정렬해 순서 보존.
  const sectionPaths = Object.keys(zip.files)
    .filter((p) => /^Contents\/section\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/section(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/section(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });
  if (sectionPaths.length === 0) {
    throw new Error(
      `HWPX 본문(Contents/section*.xml)을 찾지 못했습니다: ${file.name} ` +
        `(한글 2014 이상에서 저장한 .hwpx 인지 확인하세요)`,
    );
  }
  const parts: string[] = [];
  for (const p of sectionPaths) {
    const xml = await zip.files[p].async("string");
    // <hp:t> 텍스트 노드만 모은다(서식·메타 태그 무시). 네임스페이스
    // 접두사가 다를 수 있어 :t 로 매칭. 단락 경계는 줄바꿈으로 보존.
    const matches = xml.match(/<[^>]*:t>([\s\S]*?)<\/[^>]*:t>/g) ?? [];
    for (const m of matches) {
      const inner = m.replace(/<[^>]+>/g, "");
      parts.push(decodeXmlEntities(inner));
    }
  }
  return parts.join("\n").trim();
}

/** XML 엔티티 디코드(hwpx 본문 텍스트용 최소 집합). */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * 파일에서 텍스트를 추출한다. 미지원 확장자는 명확히 throw(무음 실패 0).
 * pdf/docx/hwpx 추출 실패(암호화·손상)는 라이브러리 reject 가 그대로
 * 전파되어 호출부(UI)가 사용자에게 표면화한다(Plan Critic E3).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const fmt = pickFormat(file.name);
  if (fmt === null) {
    throw new Error(
      `지원하지 않는 파일 형식입니다: ${file.name} ` +
        `(텍스트 계열 / .pdf / .docx / .hwpx 만 가능)`,
    );
  }
  if (fmt === "text") return readAsText(file);
  if (fmt === "pdf") return readPdf(file);
  if (fmt === "hwpx") return readHwpx(file);
  return readDocx(file);
}

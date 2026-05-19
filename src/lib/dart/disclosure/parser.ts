/**
 * DART 공시 원문 ZIP/XML 파서 (보안 강화 — zip-slip·XML 폭탄 방어).
 *
 * 이식 출처: medigate `disclosure-parser.service.ts`(10fb7f4) 23~628행
 * 중 분석에 실제 쓰이는 extractDisclosureFullText + 보안 헬퍼만.
 * STRUCTURAL #4(원본 복사 금지): summarizeDisclosureForAI(gemini)
 * **미이식** → `generateText` import 제거, gemini 의존 0. medigate UI
 * 전용 섹션 트리 파서(getDisclosureDocument/getSectionContent/
 * parseDisclosureXml)도 미이식(D7 백엔드 불요 — UI 스코프 D9~ 대비
 * types.ts 정의만 보존).
 *
 * 보안 강화 (원본엔 없던 방어 — TC-48.4/48.5, 보안 pre-review):
 *  - zip-slip: ZIP 엔트리명에 `..`/절대경로/`\` 있으면 거부(traversal
 *    방어). 원본 findXmlContent 는 sanitize 0 이었음.
 *  - XML 폭탄: 압축 해제 텍스트 길이 상한(MAX_XML_BYTES) 초과 시
 *    절단·중단(billion-laughs·과대 응답 DoS 방어). 정규식 태그 제거
 *    전 길이 게이트.
 * 키 격리: getApiKey() 이 파일 국한, URL 호스트 고정(SSRF — D2 패턴).
 */

import JSZip from "jszip";
import type { DisclosureFullText } from "./types";

const DART_API_BASE = "https://opendart.fss.or.kr/api";

/** 공시 원문 텍스트 상한 (XML 폭탄/과대 응답 방어 — 약 8MB) */
const MAX_XML_BYTES = 8 * 1024 * 1024;

/** DART_API_KEY 단일 격리 지점 (NFR-16) */
function getApiKey(): string {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY is not configured");
  return apiKey;
}

/** 호스트 고정 document.xml URL (SSRF 방어 — D2 buildUrl 동형) */
function buildDocumentUrl(rceptNo: string): string {
  const url = new URL(`${DART_API_BASE}/document.xml`);
  if (url.origin !== "https://opendart.fss.or.kr") {
    throw new Error(`DART API host violation: ${url.origin}`);
  }
  url.searchParams.set("crtfc_key", getApiKey());
  url.searchParams.set("rcept_no", rceptNo);
  return url.toString();
}

/**
 * zip-slip 방어: 엔트리명이 디렉토리 traversal·절대경로면 거부.
 * (원본 findXmlContent 엔 없던 보안 게이트 — TC-48.4.)
 */
function isSafeEntryName(name: string): boolean {
  if (!name) return false;
  // 절대경로(POSIX `/`, Windows `C:\`) 거부
  if (name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name)) return false;
  // 백슬래시(Windows traversal) 거부
  if (name.includes("\\")) return false;
  // `..` 세그먼트(상위 디렉토리 탈출) 거부
  if (name.split("/").some((seg) => seg === "..")) return false;
  return true;
}

/**
 * ZIP 에서 메인 XML 추출. 안전한 엔트리명만 후보(zip-slip 방어).
 * 우선순위: ① 언더스코어 없는 .xml ② 첫 .xml(비상장 감사보고서 등).
 */
async function findXmlContent(zip: JSZip): Promise<string | null> {
  const xmlFiles: string[] = [];
  for (const filename of Object.keys(zip.files)) {
    if (
      filename.endsWith(".xml") &&
      !zip.files[filename].dir &&
      isSafeEntryName(filename) // zip-slip 게이트
    ) {
      xmlFiles.push(filename);
    }
  }
  if (xmlFiles.length === 0) return null;

  const pick =
    xmlFiles.find((f) => !f.includes("_")) ?? xmlFiles[0];
  const raw = await zip.files[pick].async("string");

  // XML 폭탄/과대 응답 방어: 길이 상한 초과 시 절단(파싱 전 게이트)
  if (raw.length > MAX_XML_BYTES) {
    return raw.slice(0, MAX_XML_BYTES);
  }
  return raw;
}

function extractTagValue(xml: string, tag: string): string | undefined {
  const start = xml.indexOf(`<${tag}>`);
  const end = xml.indexOf(`</${tag}>`);
  if (start >= 0 && end > start) {
    return xml.substring(start + tag.length + 2, end).trim();
  }
  return undefined;
}

/**
 * 공시 원문 전체 텍스트 추출 (전문 모드 — gemini 0).
 * HTML/XML 태그 제거 후 순수 텍스트. 실패 시 throw 아닌 결과 객체
 * (graceful — NFR-18, subagent 가 해당 공시 제외·🔴 표기).
 */
export async function extractDisclosureFullText(
  rceptNo: string,
): Promise<DisclosureFullText> {
  try {
    const response = await fetch(buildDocumentUrl(rceptNo));
    if (!response.ok) {
      return {
        success: false,
        text: "",
        charCount: 0,
        error: `HTTP error: ${response.status}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    // 과대 ZIP 방어: 압축 해제 전 원본 바이트 상한
    if (arrayBuffer.byteLength > MAX_XML_BYTES) {
      return {
        success: false,
        text: "",
        charCount: 0,
        error: "공시 원문이 과대합니다(상한 초과).",
      };
    }

    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlContent = await findXmlContent(zip);
    if (!xmlContent) {
      return {
        success: false,
        text: "",
        charCount: 0,
        error: "XML 파일을 찾을 수 없습니다.",
      };
    }

    const documentName = extractTagValue(xmlContent, "DOCUMENT-NAME");
    const fullText = xmlContent
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    return {
      success: true,
      text: fullText,
      documentName,
      charCount: fullText.length,
    };
  } catch (error) {
    console.error(`[extractDisclosureFullText] Error for ${rceptNo}:`, error);
    return {
      success: false,
      text: "",
      charCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

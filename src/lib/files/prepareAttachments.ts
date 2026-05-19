/**
 * 첨부 분류 + base64 변환 (클라이언트 전용).
 *
 * 첨부 파일을 두 갈래로 나눈다:
 *  - image : OpenAI 멀티모달 → base64 data URL 로 변환해 body.images 로 전송
 *  - text  : 텍스트/PDF/DOCX → extractTextFromFile(동적 import)로 추출해
 *            query 에 합쳐 전송(백엔드 무변경)
 *  - unsupported : 그 외(차단)
 *
 * 보안(Plan Critic E2): 이미지는 래스터 포맷(png/jpeg/webp/gif)만 허용.
 * `image/svg+xml` 은 <script> XSS 벡터라 unsupported(서버 route zod 의
 * IMAGE_DATA_URL_RE 화이트리스트와 클라이언트에서 일관 — defense-in-depth).
 *
 * classifyAttachment 는 순수(확장자/MIME), fileToDataUrl 은 FileReader
 * (jsdom 네이티브) — 둘 다 라이브러리 동적 import 없이 단위 테스트 가능.
 * 실제 텍스트 추출은 extractText.ts(동적 import — prod 번들 제외 D1).
 */

import { pickFormat } from "./extractText";

export type AttachmentKind = "image" | "text" | "unsupported";

/** OpenAI 멀티모달이 받는 래스터 이미지 MIME(SVG 제외 — XSS 차단). */
const RASTER_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const RASTER_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * 첨부를 image / text(추출대상) / unsupported 로 분류한다(순수).
 * MIME 우선, 비신뢰 MIME(octet-stream 등) 대비 확장자 폴백.
 */
export function classifyAttachment(file: File): AttachmentKind {
  const ext = extOf(file.name);
  if (RASTER_IMAGE_MIME.has(file.type) || RASTER_IMAGE_EXT.has(ext)) {
    return "image";
  }
  // 텍스트/PDF/DOCX 는 extractText 의 화이트리스트 재사용(SSOT).
  if (pickFormat(file.name) !== null) return "text";
  return "unsupported";
}

/** File → base64 data URL(FileReader.readAsDataURL — jsdom 네이티브). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () =>
      reject(new Error(`이미지를 읽지 못했습니다: ${file.name}`));
    r.readAsDataURL(file);
  });
}

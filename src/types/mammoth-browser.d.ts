/**
 * mammoth 브라우저 진입점(`mammoth/mammoth.browser`) ambient 선언.
 *
 * mammoth 1.12.0 은 자체 타입 선언이 없고 @types/mammoth 도 부재(실측).
 * extractText.ts 가 DOCX 추출에 쓰는 API 표면만 최소 선언한다(R8 실측 —
 * file-extract-probe 노트: 브라우저는 .browser 진입점 명시 필수).
 */
declare module "mammoth/mammoth.browser" {
  export interface ExtractRawTextInput {
    arrayBuffer: ArrayBuffer;
  }
  export interface ExtractRawTextResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(
    input: ExtractRawTextInput,
  ): Promise<ExtractRawTextResult>;
}

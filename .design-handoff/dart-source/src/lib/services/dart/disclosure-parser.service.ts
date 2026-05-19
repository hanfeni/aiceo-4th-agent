/**
 * DART 공시 원문 파싱 서비스
 *
 * DART API의 document.xml 엔드포인트에서 ZIP 파일을 다운로드하고
 * XML을 파싱하여 목차, 섹션, 테이블 등을 추출
 *
 * 비상장 회사 지원:
 * - extractDisclosureFullText: 공시 전체 텍스트 추출
 * - summarizeDisclosureForAI: Gemini Flash Lite로 공시 요약 (AI 분석용)
 */

import JSZip from 'jszip';
import { generateText } from '@/lib/external/gemini';
import type {
  DisclosureDocument,
  DisclosureSection,
  DisclosureSectionContent,
  DisclosureTable,
  DisclosureTableCell,
  DisclosureSummary,
} from '@/types/disclosure';

const DART_API_URL = 'https://opendart.fss.or.kr/api';

function getApiKey(): string {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    throw new Error('DART_API_KEY is not configured');
  }
  return apiKey;
}

/**
 * ZIP 파일에서 메인 XML 파일 찾기
 * 우선순위:
 * 1. 언더스코어 없는 .xml 파일
 * 2. 첫 번째 .xml 파일 (언더스코어 포함 허용)
 */
async function findXmlContent(zip: JSZip): Promise<string | null> {
  const xmlFiles: string[] = [];

  for (const filename of Object.keys(zip.files)) {
    if (filename.endsWith('.xml') && !zip.files[filename].dir) {
      xmlFiles.push(filename);
    }
  }

  if (xmlFiles.length === 0) {
    return null;
  }

  // 1순위: 언더스코어 없는 .xml 파일
  const noUnderscoreFile = xmlFiles.find(f => !f.includes('_'));
  if (noUnderscoreFile) {
    return await zip.files[noUnderscoreFile].async('string');
  }

  // 2순위: 첫 번째 .xml 파일 (비상장 회사 감사보고서 등)
  return await zip.files[xmlFiles[0]].async('string');
}

/**
 * 공시 원문 문서 다운로드 및 파싱
 */
export async function getDisclosureDocument(rceptNo: string): Promise<DisclosureDocument> {
  const result: DisclosureDocument = { rceptNo };

  try {
    const apiKey = getApiKey();
    const url = `${DART_API_URL}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // ZIP 내에서 XML 파일 찾기
    const xmlContent = await findXmlContent(zip);

    if (!xmlContent) {
      result.error = 'XML 파일을 찾을 수 없습니다.';
      return result;
    }

    // XML 파싱
    parseDisclosureXml(xmlContent, result);

  } catch (error) {
    console.error(`Failed to get disclosure document for ${rceptNo}:`, error);
    result.error = `문서를 불러오는데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

/**
 * 특정 섹션의 본문 내용 파싱
 */
export async function getSectionContent(rceptNo: string, tocId: string): Promise<DisclosureSectionContent> {
  const result: DisclosureSectionContent = { tocId };

  try {
    const apiKey = getApiKey();
    const url = `${DART_API_URL}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // ZIP 내에서 XML 파일 찾기
    const xmlContent = await findXmlContent(zip);

    if (!xmlContent) {
      result.error = 'XML 파일을 찾을 수 없습니다.';
      return result;
    }

    // 섹션 내용 파싱
    parseSectionContent(xmlContent, tocId, result);

  } catch (error) {
    console.error(`Failed to get section content for ${rceptNo} tocId ${tocId}:`, error);
    result.error = `섹션 내용을 불러오는데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

// ==================== XML 파싱 함수 ====================

function parseDisclosureXml(xmlContent: string, result: DisclosureDocument): void {
  try {
    // 문서 기본 정보 추출
    result.documentName = extractTagValue(xmlContent, 'DOCUMENT-NAME');
    result.companyName = extractTagValue(xmlContent, 'COMPANY-NAME');
    result.formulaVersion = extractTagAttribute(xmlContent, 'FORMULA-VERSION', 'ADATE');
    result.documentCode = extractTagAttribute(xmlContent, 'DOCUMENT-NAME', 'ACODE');

    // 메타데이터 추출
    const metadata: Record<string, string> = {};
    const extractionPattern = /<EXTRACTION\s+ACODE="([^"]+)"[^>]*>([^<]*)<\/EXTRACTION>/g;
    let match;
    while ((match = extractionPattern.exec(xmlContent)) !== null) {
      metadata[match[1]] = match[2].trim();
    }
    result.metadata = metadata;

    // 섹션(목차) 파싱
    result.sections = parseSections(xmlContent);

    // 정기공시인 경우 요약 추출
    if (isPeriodicReport(result.documentCode)) {
      result.summary = extractSummary(xmlContent, metadata);
    }

  } catch (error) {
    console.error('Failed to parse disclosure XML:', error);
    result.error = `XML 파싱 실패: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function parseSections(xmlContent: string): DisclosureSection[] {
  const sections: DisclosureSection[] = [];

  // ATOC="Y"인 COVER-TITLE과 TITLE 태그를 모두 추출
  // 이들이 목차에 표시되어야 하는 항목들
  const items: { tocId: string; title: string; pos: number }[] = [];

  // COVER-TITLE 추출 (표지 제목, 예: "감사보고서")
  const coverPattern = /<COVER-TITLE[^>]*ATOC="Y"[^>]*ATOCID="(\d+)"[^>]*>([\s\S]*?)<\/COVER-TITLE>/g;
  let match;
  while ((match = coverPattern.exec(xmlContent)) !== null) {
    const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
    if (rawTitle) {
      items.push({
        tocId: match[1],
        title: cleanText(rawTitle),
        pos: match.index,
      });
    }
  }

  // TITLE 추출 (본문 섹션 제목)
  const titlePattern = /<TITLE[^>]*ATOC="Y"[^>]*ATOCID="(\d+)"[^>]*>([\s\S]*?)<\/TITLE>/g;
  while ((match = titlePattern.exec(xmlContent)) !== null) {
    const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
    if (rawTitle) {
      items.push({
        tocId: match[1],
        title: cleanText(rawTitle),
        pos: match.index,
      });
    }
  }

  // 위치 기준으로 정렬
  items.sort((a, b) => a.pos - b.pos);

  // 플랫 리스트로 반환 (계층 구조 없이)
  for (const item of items) {
    sections.push({
      tocId: item.tocId,
      title: item.title,
      level: 1,
    });
  }

  return sections;
}

function parseSubSections(xmlContent: string, startPos: number, endPos: number): DisclosureSection[] {
  const subSections: DisclosureSection[] = [];
  const sectionContent = xmlContent.substring(startPos, endPos);

  // SECTION-2 태그에서 하위 목차 추출
  // TITLE 내부에 SPAN 등 다른 태그가 있을 수 있으므로 [\s\S]*?로 캡처
  const subPattern = /<SECTION-2[^>]*>[\s\S]*?<TITLE[^>]*ATOCID="(\d+)"[^>]*>([\s\S]*?)<\/TITLE>/g;
  let match;

  while ((match = subPattern.exec(sectionContent)) !== null) {
    // TITLE 내부의 HTML 태그 제거하여 텍스트만 추출
    const rawTitle = match[2];
    const cleanTitle = rawTitle.replace(/<[^>]+>/g, '').trim();

    subSections.push({
      tocId: match[1],
      title: cleanText(cleanTitle),
      level: 2,
    });
  }

  return subSections;
}

function parseSectionContent(xmlContent: string, tocId: string, result: DisclosureSectionContent): void {
  const pattern = `ATOCID="${tocId}"`;
  const titleStart = xmlContent.indexOf(pattern);

  if (titleStart === -1) {
    result.error = '섹션을 찾을 수 없습니다.';
    return;
  }

  // 제목 추출 - TITLE 또는 COVER-TITLE 태그 모두 지원
  let titleTagStart = xmlContent.lastIndexOf('<TITLE', titleStart);
  const coverTitleStart = xmlContent.lastIndexOf('<COVER-TITLE', titleStart);

  // COVER-TITLE이 더 가까우면 그것을 사용
  if (coverTitleStart > titleTagStart) {
    titleTagStart = coverTitleStart;
  }

  let titleTagEnd = xmlContent.indexOf('</TITLE>', titleStart);
  const coverTitleEnd = xmlContent.indexOf('</COVER-TITLE>', titleStart);

  // 더 가까운 종료 태그 사용
  if (coverTitleEnd > -1 && (titleTagEnd === -1 || coverTitleEnd < titleTagEnd)) {
    titleTagEnd = coverTitleEnd + 6; // </COVER-TITLE> 길이 조정
  }

  if (titleTagStart !== -1 && titleTagEnd !== -1) {
    const titleTag = xmlContent.substring(titleTagStart, titleTagEnd + 8);
    result.title = cleanText(extractTagContent(titleTag));
  }

  // 섹션 내용 범위 결정
  const contentStart = titleTagEnd + 8;
  const contentEnd = findSectionEnd(xmlContent, contentStart, tocId);
  const sectionXml = xmlContent.substring(contentStart, contentEnd);

  // 문단 추출
  result.paragraphs = extractParagraphs(sectionXml);

  // 테이블 추출
  result.tables = extractTables(sectionXml);
}

function findSectionEnd(xmlContent: string, startPos: number, currentTocId: string): number {
  const currentTocIdNum = parseInt(currentTocId, 10);

  // 다음 ATOCID를 가진 TITLE 또는 COVER-TITLE 찾기
  const nextTitlePattern = /<(?:COVER-)?TITLE[^>]*ATOC="Y"[^>]*ATOCID="(\d+)"/g;
  nextTitlePattern.lastIndex = startPos;

  let match;
  while ((match = nextTitlePattern.exec(xmlContent)) !== null) {
    const foundTocId = parseInt(match[1], 10);
    if (foundTocId > currentTocIdNum) {
      // 이 TITLE 태그가 시작되기 전 위치 반환
      // TITLE 앞에 SECTION 태그가 있을 수 있으므로 좀 더 앞을 찾음
      const beforeTitle = xmlContent.substring(Math.max(0, match.index - 100), match.index);
      const sectionMatch = beforeTitle.lastIndexOf('<SECTION');
      if (sectionMatch > -1) {
        return match.index - 100 + sectionMatch;
      }
      return match.index;
    }
  }

  const bodyEnd = xmlContent.indexOf('</BODY>', startPos);
  return bodyEnd > 0 ? bodyEnd : xmlContent.length;
}

function extractParagraphs(sectionXml: string): string[] {
  const paragraphs: string[] = [];

  const pPattern = /<P[^>]*>([\s\S]*?)<\/P>/g;
  let match;

  while ((match = pPattern.exec(sectionXml)) !== null) {
    let content = match[1];
    // SPAN 태그 제거
    content = content.replace(/<SPAN[^>]*>/g, '');
    content = content.replace(/<\/SPAN>/g, '');
    // 기타 HTML 태그 제거
    content = content.replace(/<[^>]+>/g, '');
    content = cleanText(content);

    if (content) {
      paragraphs.push(content);
    }
  }

  return paragraphs;
}

function extractTables(sectionXml: string): DisclosureTable[] {
  const tables: DisclosureTable[] = [];

  const tablePattern = /<TABLE[^>]*>([\s\S]*?)<\/TABLE>/g;
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tablePattern.exec(sectionXml)) !== null && tableIndex < 10) {
    const tableXml = tableMatch[1];
    const table = parseTable(tableXml);

    if (table && table.rows.length > 0) {
      tables.push(table);
    }
    tableIndex++;
  }

  return tables;
}

function parseTable(tableXml: string): DisclosureTable {
  const table: DisclosureTable = { rows: [], hasHeader: false };

  const rowPattern = /<TR[^>]*>([\s\S]*?)<\/TR>/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(tableXml)) !== null) {
    const rowXml = rowMatch[1];
    const cells: DisclosureTableCell[] = [];

    // TH, TD, TE, TU 태그 모두 처리 (속성 포함하여 캡처)
    const cellPattern = /<(TH|TD|TE|TU)([^>]*)>([\s\S]*?)<\/\1>/g;
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowXml)) !== null) {
      const tagName = cellMatch[1];
      const attributes = cellMatch[2];
      let cellContent = cellMatch[3];

      // HTML 태그 제거
      cellContent = cellContent.replace(/<[^>]+>/g, '');

      // colspan, rowspan 추출
      const colspanMatch = attributes.match(/COLSPAN="?(\d+)"?/i);
      const rowspanMatch = attributes.match(/ROWSPAN="?(\d+)"?/i);

      const cell: DisclosureTableCell = {
        content: cleanText(cellContent),
        isHeader: tagName === 'TH',
      };

      if (colspanMatch) {
        cell.colspan = parseInt(colspanMatch[1], 10);
      }
      if (rowspanMatch) {
        cell.rowspan = parseInt(rowspanMatch[1], 10);
      }

      cells.push(cell);
    }

    if (cells.length > 0) {
      table.rows.push(cells);
    }
  }

  // TH 태그가 있으면 헤더 있음
  if (tableXml.includes('<TH')) {
    table.hasHeader = true;
  }

  return table;
}

function extractSummary(xmlContent: string, metadata: Record<string, string>): DisclosureSummary {
  const summary: DisclosureSummary = {};

  // 매출액 추출
  const revenueMatch = xmlContent.match(/매출[은액]?[^0-9]*([0-9,]+)\s*(조|억|백만|천)?\s*원/);
  if (revenueMatch) {
    summary.revenue = revenueMatch[0];
  }

  // 영업이익 추출
  const opIncomeMatch = xmlContent.match(/영업이익[은]?[^0-9]*([0-9,]+)\s*(조|억|백만|천)?\s*원/);
  if (opIncomeMatch) {
    summary.operatingIncome = opIncomeMatch[0];
  }

  // 직원수 추출
  const employeeMatch = xmlContent.match(/(직원|임직원)[^0-9]*([0-9,]+)\s*(명|인)/);
  if (employeeMatch) {
    summary.employeeCount = employeeMatch[0];
  }

  // 주요 매출처 추출
  const customerMatch = xmlContent.match(/주요\s*매출처[^가-힣]*([가-힣A-Za-z,\s]+)(등|입니다|있습니다)/);
  if (customerMatch) {
    summary.majorCustomers = customerMatch[1].trim();
  }

  // IFRS 적용 여부
  summary.ifrsApplied = metadata['IFRS_YN'] === 'Y';

  return summary;
}

// ==================== 유틸리티 함수 ====================

function isPeriodicReport(docCode?: string): boolean {
  if (!docCode) return false;
  return docCode.startsWith('1101');
}

function extractTagValue(xml: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const match = xml.match(pattern);
  return match ? match[1].trim() : undefined;
}

function extractTagAttribute(xml: string, tagName: string, attrName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}[^>]*${attrName}="([^"]+)"`);
  const match = xml.match(pattern);
  return match ? match[1] : undefined;
}

function extractTagContent(tagXml: string): string {
  const start = tagXml.indexOf('>') + 1;
  const end = tagXml.lastIndexOf('</');
  if (start > 0 && end > start) {
    return tagXml.substring(start, end);
  }
  return '';
}

function cleanText(text: string | undefined): string {
  if (!text) return '';
  let result = text
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

  // "감 사 보 고 서" 패턴 제거: 연속된 (단일한글 + 공백) 패턴을 찾아 공백 제거
  // 예: "감 사 보 고 서" → "감사보고서", but "독립된 감사인의" 유지
  // 패턴: 한글 한 글자 + 공백이 2회 이상 연속되는 경우
  result = result.replace(/(?:[가-힣] ){2,}[가-힣]/g, (match) => {
    return match.replace(/ /g, '');
  });

  return result;
}

// ==================== 공시 유형 판별 ====================

export function getDisclosureTypeInfo(reportNm: string): { type: string; badge: string; badgeClass: string } {
  if (!reportNm) return { type: 'other', badge: '', badgeClass: '' };

  // 정기공시
  if (reportNm.includes('사업보고서')) {
    return { type: 'annual', badge: '사업', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
  }
  if (reportNm.includes('반기보고서')) {
    return { type: 'semiannual', badge: '반기', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
  }
  if (reportNm.includes('분기보고서')) {
    return { type: 'quarterly', badge: '분기', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
  }

  // 증권발행
  if (reportNm.includes('유상증자')) {
    return { type: 'capital_increase', badge: '유증', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' };
  }
  if (reportNm.includes('무상증자')) {
    return { type: 'bonus_issue', badge: '무증', badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' };
  }
  if (reportNm.includes('전환사채')) {
    return { type: 'cb', badge: 'CB', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' };
  }
  if (reportNm.includes('교환사채')) {
    return { type: 'eb', badge: 'EB', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' };
  }
  if (reportNm.includes('신주인수권부사채')) {
    return { type: 'bw', badge: 'BW', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' };
  }

  // M&A
  if (reportNm.includes('합병')) {
    return { type: 'merger', badge: '합병', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' };
  }
  if (reportNm.includes('분할')) {
    return { type: 'split', badge: '분할', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' };
  }

  // 자기주식
  if (reportNm.includes('자기주식') || reportNm.includes('자사주')) {
    return { type: 'treasury', badge: '자사주', badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' };
  }

  // 지분공시
  if (reportNm.includes('최대주주') || reportNm.includes('대주주')) {
    return { type: 'major_shareholder', badge: '대주주', badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' };
  }
  if (reportNm.includes('임원') && reportNm.includes('변동')) {
    return { type: 'executive', badge: '임원', badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' };
  }

  // 감사
  if (reportNm.includes('감사보고서')) {
    return { type: 'audit', badge: '감사', badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
  }

  // 소송
  if (reportNm.includes('소송')) {
    return { type: 'lawsuit', badge: '소송', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' };
  }

  // 주요사항
  if (reportNm.includes('주요사항보고서')) {
    return { type: 'major', badge: '주요', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' };
  }

  return { type: 'other', badge: '', badgeClass: '' };
}

/**
 * 공시 문서에서 전체 텍스트를 추출
 * 비상장 회사 AI 분석을 위한 원본 텍스트 추출
 */
export async function extractDisclosureFullText(rceptNo: string): Promise<{
  success: boolean;
  text: string;
  documentName?: string;
  charCount: number;
  error?: string;
}> {
  try {
    const apiKey = getApiKey();
    const url = `${DART_API_URL}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`;

    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, text: '', charCount: 0, error: `HTTP error: ${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const xmlContent = await findXmlContent(zip);
    if (!xmlContent) {
      return { success: false, text: '', charCount: 0, error: 'XML 파일을 찾을 수 없습니다.' };
    }

    // 문서명 추출
    const documentName = extractTagValue(xmlContent, 'DOCUMENT-NAME');

    // 전체 텍스트 추출 (HTML 태그 제거)
    let fullText = xmlContent
      // XML/HTML 태그 제거 (내용은 보존)
      .replace(/<[^>]+>/g, ' ')
      // HTML 엔티티 변환
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      // 연속 공백 정리
      .replace(/\s+/g, ' ')
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
      text: '',
      charCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 비상장 회사 공시 내용을 AI 분석용으로 요약
 * Gemini 2.5 Flash Lite 모델 사용
 *
 * 요약 길이는 원본 크기에 비례하여 동적으로 조정 (과하게 줄이지 않음)
 */
export async function summarizeDisclosureForAI(
  rceptNo: string,
  corpName: string
): Promise<{
  success: boolean;
  summary: string;
  originalCharCount: number;
  summaryCharCount: number;
  documentName?: string;
  error?: string;
}> {
  try {
    // 1. 공시 전체 텍스트 추출
    const extraction = await extractDisclosureFullText(rceptNo);
    if (!extraction.success || !extraction.text) {
      return {
        success: false,
        summary: '',
        originalCharCount: 0,
        summaryCharCount: 0,
        error: extraction.error || '공시 텍스트 추출 실패',
      };
    }

    const originalText = extraction.text;
    const originalCharCount = originalText.length;

    // 2. 요약 목표 길이 동적 계산 (원본 대비 비율)
    // - 10,000자 이하: 70% 유지
    // - 10,000~50,000자: 50% 유지 (최소 7,000자)
    // - 50,000~100,000자: 30% 유지 (최소 25,000자)
    // - 100,000자 초과: 20% 유지 (최소 30,000자, 최대 50,000자)
    let targetLength: number;
    if (originalCharCount <= 10000) {
      targetLength = Math.floor(originalCharCount * 0.7);
    } else if (originalCharCount <= 50000) {
      targetLength = Math.max(7000, Math.floor(originalCharCount * 0.5));
    } else if (originalCharCount <= 100000) {
      targetLength = Math.max(25000, Math.floor(originalCharCount * 0.3));
    } else {
      targetLength = Math.min(50000, Math.max(30000, Math.floor(originalCharCount * 0.2)));
    }

    console.log(`[summarizeDisclosureForAI] ${corpName} (${rceptNo}): ${originalCharCount}자 → 목표 ${targetLength}자`);

    // 3. Gemini Flash Lite로 요약 요청
    const prompt = `당신은 기업 공시 분석 전문가입니다.

다음은 비상장 회사 "${corpName}"의 DART 공시 문서입니다.
문서명: ${extraction.documentName || '공시 문서'}

이 공시 내용을 AI 기업분석에 활용할 수 있도록 요약해주세요.

## 요약 지침:
1. **핵심 정보 보존**: 재무 수치, 사업 내용, 주요 변동사항, 경영 현황 등 중요 정보는 반드시 포함
2. **구조 유지**: 원본의 주요 섹션 구조를 유지하여 정리
3. **숫자 정확성**: 매출액, 자산, 부채, 이익 등 재무 수치는 정확히 기재
4. **길이 목표**: 약 ${targetLength}자 내외로 요약 (원본의 ${Math.round(targetLength / originalCharCount * 100)}%)
5. **정보 손실 최소화**: 과하게 줄이지 말고 AI 분석에 필요한 맥락을 충분히 포함

## 원본 공시 내용:
${originalText.substring(0, 200000)}

## 요약 결과:`;

    const summary = await generateText(prompt, {
      model: 'gemini-2.0-flash-lite',
      temperature: 0.2,
      maxOutputTokens: Math.min(16000, Math.ceil(targetLength / 3)), // 한글 평균 3자/토큰
    });

    return {
      success: true,
      summary: summary.trim(),
      originalCharCount,
      summaryCharCount: summary.length,
      documentName: extraction.documentName,
    };
  } catch (error) {
    console.error(`[summarizeDisclosureForAI] Error for ${rceptNo}:`, error);
    return {
      success: false,
      summary: '',
      originalCharCount: 0,
      summaryCharCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 비상장 공시 선택 옵션 타입
 */
interface SelectedDisclosureOption {
  rceptNo: string;
  reportNm: string;
  rceptDt: string;
  mode: 'summary' | 'full';
}

/**
 * 비상장 회사의 최근 공시들을 요약하여 AI 분석 컨텍스트 생성
 *
 * @param corpCode - 회사 고유코드
 * @param corpName - 회사명
 * @param maxDisclosures - 최대 공시 수 (selectedDisclosures가 없을 때 사용)
 * @param selectedDisclosures - 사용자가 선택한 공시 목록 (있으면 이것을 우선 사용)
 */
export async function getUnlistedCompanyDisclosureContext(
  corpCode: string,
  corpName: string,
  maxDisclosures: number = 3,
  selectedDisclosures?: SelectedDisclosureOption[]
): Promise<{
  success: boolean;
  context: string;
  disclosureCount: number;
  totalOriginalChars: number;
  totalSummaryChars: number;
  error?: string;
}> {
  try {
    // 사용자가 선택한 공시가 있으면 그것 사용, 없으면 자동 선택
    let disclosuresToProcess: { rceptNo: string; reportNm: string; rceptDt: string; mode: 'summary' | 'full' }[] = [];

    if (selectedDisclosures && selectedDisclosures.length > 0) {
      // 사용자가 선택한 공시 사용
      disclosuresToProcess = selectedDisclosures;
      console.log(`[getUnlistedCompanyDisclosureContext] Using user-selected disclosures: ${disclosuresToProcess.length}건`);
    } else {
      // 기존 로직: 최근 공시 목록 조회 후 자동 선택
      const { getRecentDisclosures } = await import('@/lib/external/dart-api');
      const disclosures = await getRecentDisclosures(corpCode, 10);

      if (!disclosures || disclosures.length === 0) {
        return {
          success: false,
          context: '',
          disclosureCount: 0,
          totalOriginalChars: 0,
          totalSummaryChars: 0,
          error: '최근 공시가 없습니다.',
        };
      }

      // 중요 공시 우선 선택 (감사보고서, 사업보고서 등)
      const priorityKeywords = ['감사보고서', '사업보고서', '반기보고서', '분기보고서', '재무제표'];
      const sortedDisclosures = [...disclosures].sort((a, b) => {
        const aHasPriority = priorityKeywords.some(kw => a.reportNm?.includes(kw));
        const bHasPriority = priorityKeywords.some(kw => b.reportNm?.includes(kw));
        if (aHasPriority && !bHasPriority) return -1;
        if (!aHasPriority && bHasPriority) return 1;
        return 0;
      });

      disclosuresToProcess = sortedDisclosures.slice(0, maxDisclosures).map(d => ({
        rceptNo: d.rceptNo || '',
        reportNm: d.reportNm || '',
        rceptDt: d.rceptDt || '',
        mode: 'summary' as const, // 자동 선택 시 기본값은 요약 모드
      }));
      console.log(`[getUnlistedCompanyDisclosureContext] Auto-selected disclosures: ${disclosuresToProcess.length}건`);
    }

    // 각 공시 처리 (요약 또는 전문)
    const contents: string[] = [];
    let totalOriginalChars = 0;
    let totalSummaryChars = 0;

    // 병렬 처리로 속도 향상
    const results = await Promise.all(
      disclosuresToProcess.map(async (disclosure) => {
        if (!disclosure.rceptNo) return null;

        if (disclosure.mode === 'full') {
          // 전문 모드: extractDisclosureFullText 사용
          const fullText = await extractDisclosureFullText(disclosure.rceptNo);
          if (fullText.success && fullText.text) {
            return {
              content: `### ${disclosure.reportNm || '공시'} (${disclosure.rceptDt || '날짜 미상'}) [전문]\n\n${fullText.text}`,
              originalChars: fullText.charCount,
              summaryChars: fullText.charCount, // 전문이므로 동일
            };
          }
        } else {
          // 요약 모드: summarizeDisclosureForAI 사용
          const result = await summarizeDisclosureForAI(disclosure.rceptNo, corpName);
          if (result.success && result.summary) {
            return {
              content: `### ${disclosure.reportNm || '공시'} (${disclosure.rceptDt || '날짜 미상'}) [요약]\n\n${result.summary}`,
              originalChars: result.originalCharCount,
              summaryChars: result.summaryCharCount,
            };
          }
        }
        return null;
      })
    );

    // 결과 집계
    for (const result of results) {
      if (result) {
        contents.push(result.content);
        totalOriginalChars += result.originalChars;
        totalSummaryChars += result.summaryChars;
      }
    }

    if (contents.length === 0) {
      return {
        success: false,
        context: '',
        disclosureCount: 0,
        totalOriginalChars: 0,
        totalSummaryChars: 0,
        error: '공시 내용을 처리할 수 없습니다.',
      };
    }

    // 컨텍스트 조합
    const modeInfo = selectedDisclosures
      ? `(사용자 선택: 요약 ${selectedDisclosures.filter(d => d.mode === 'summary').length}건, 전문 ${selectedDisclosures.filter(d => d.mode === 'full').length}건)`
      : '(자동 선택)';
    const context = `## 비상장 회사 "${corpName}" 공시 정보 ${modeInfo}

아래는 DART에서 조회한 공시 ${contents.length}건입니다.
비상장 회사이므로 KRX 시세 정보 및 KIND 공시는 제공되지 않습니다.

${contents.join('\n\n---\n\n')}`;

    return {
      success: true,
      context,
      disclosureCount: contents.length,
      totalOriginalChars,
      totalSummaryChars,
    };
  } catch (error) {
    console.error(`[getUnlistedCompanyDisclosureContext] Error:`, error);
    return {
      success: false,
      context: '',
      disclosureCount: 0,
      totalOriginalChars: 0,
      totalSummaryChars: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

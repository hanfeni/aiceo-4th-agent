/**
 * KRX (KIND) 공시 API 클라이언트
 * kind.krx.co.kr HTML 스크래핑 기반
 *
 * 세션 관리 필수: 메인 페이지 → 검색 페이지 → 검색 실행 순서로 쿠키 유지
 * 최대 3년 이내 검색 제한
 */

import type {
  KrxCompany,
  KrxDisclosure,
  KrxDisclosureResult,
  KrxDisclosureSearchParams,
  KrxDisclosureDetail,
  KrxDocument,
  KrxPdfInfo,
  KrxDisclosurePreview,
  KrxDisclosureType,
  KrxParsedTable,
} from '@/types/krx';

const KRX_BASE_URL = 'https://kind.krx.co.kr';

/**
 * KRX API 클라이언트
 * 세션 쿠키를 관리하며 HTML 스크래핑 수행
 */
export class KrxApiClient {
  private cookies: Map<string, string> = new Map();
  private sessionInitialized = false;

  /**
   * 쿠키 문자열 생성
   */
  private getCookieString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  /**
   * Set-Cookie 헤더 파싱
   */
  private parseCookies(setCookieHeaders: string | string[] | null): void {
    if (!setCookieHeaders) return;

    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    cookies.forEach((cookie) => {
      const match = cookie.match(/^([^=]+)=([^;]*)/);
      if (match) {
        this.cookies.set(match[1], match[2]);
      }
    });
  }

  /**
   * HTTP 요청 수행
   */
  private async request(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      body?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<{ status: number; headers: Headers; body: string }> {
    const { method = 'GET', body, headers = {} } = options;

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Cookie': this.getCookieString(),
      ...headers,
    };

    if (body) {
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }

    const response = await fetch(`${KRX_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body,
      cache: 'no-store', // Next.js 캐싱 비활성화
    });

    // 쿠키 파싱 - getSetCookie()로 모든 Set-Cookie 헤더 가져오기
    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      this.parseCookies(setCookies);
    } else {
      // fallback: get('set-cookie')
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        this.parseCookies(setCookie);
      }
    }

    const responseBody = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      body: responseBody,
    };
  }

  /**
   * 세션 초기화
   * 메인 페이지와 검색 페이지에 접근하여 세션 쿠키 획득
   */
  async initSession(): Promise<void> {
    if (this.sessionInitialized && this.cookies.size > 0) return;

    console.log('[KRX API] Initializing session...');

    // 1. 메인 페이지 접근
    await this.request('/main.do?method=loadInitPage&scrnmode=1');

    // 2. 상세검색 페이지 접근
    await this.request('/disclosure/details.do?method=searchDetailsMain');

    this.sessionInitialized = true;
    console.log('[KRX API] Session initialized, cookies:', Array.from(this.cookies.keys()));
  }

  /**
   * 세션 리셋
   */
  resetSession(): void {
    this.cookies.clear();
    this.sessionInitialized = false;
  }

  /**
   * 회사명 검색 (JSON 응답)
   * 자동완성 API 사용
   */
  async searchCompany(corpName: string): Promise<KrxCompany[]> {
    const path = `/common/searchcorpname.do?method=searchCorpNameJson&searchCorpName=${encodeURIComponent(corpName)}`;

    const response = await this.request(path, {
      headers: {
        Accept: 'application/json',
      },
    });

    try {
      const data = JSON.parse(response.body);
      return Array.isArray(data) ? data : [];
    } catch {
      console.error('[KRX API] Failed to parse company search response');
      return [];
    }
  }

  /**
   * DART corpCode로 KRX 회사 정보 조회
   * fssunqno가 DART corpCode와 동일
   */
  async findCompanyByCorpCode(corpCode: string, corpName?: string): Promise<KrxCompany | null> {
    // 회사명으로 검색
    const searchName = corpName || '';
    if (!searchName) {
      console.warn('[KRX API] corpName is required for company search');
      return null;
    }

    const companies = await this.searchCompany(searchName);

    // fssunqno가 corpCode와 일치하는 회사 찾기
    const match = companies.find((c) => c.fssunqno === corpCode);
    if (match) return match;

    // 정확히 일치하지 않으면 첫 번째 결과 반환
    return companies.length > 0 ? companies[0] : null;
  }

  /**
   * 공시 목록 검색 (HTML 파싱)
   */
  async searchDisclosures(params: KrxDisclosureSearchParams): Promise<KrxDisclosureResult> {
    // 세션 초기화 확인
    await this.initSession();

    // 검색 파라미터 구성
    const searchParams = new URLSearchParams({
      method: 'searchDetailsSub',
      forward: 'details_sub',
      searchCorpName: params.searchCorpName,
      repIsuSrtCd: params.repIsuSrtCd,
      isurCd: params.isurCd,
      fromDate: params.fromDate,
      toDate: params.toDate,
      currentPageSize: String(params.currentPageSize || 15),
      pageIndex: String(params.pageIndex || 1),
      orderMode: params.orderMode || '0',
      orderStat: params.orderStat || 'D',
    });

    // 시장구분 필터
    if (params.marketType) {
      searchParams.set('marketType', params.marketType);
    }

    // 최종보고서만 필터
    if (params.lastReport) {
      searchParams.set('lastReport', 'T');
    }

    // 공시유형 필터
    if (params.disclosureType01) {
      searchParams.set('disclosureType01', params.disclosureType01);
    }
    if (params.disclosureType02) {
      searchParams.set('disclosureType02', params.disclosureType02);
    }
    if (params.disclosureType03) {
      searchParams.set('disclosureType03', params.disclosureType03);
    }
    if (params.disclosureType05) {
      searchParams.set('disclosureType05', params.disclosureType05);
    }

    const response = await this.request('/disclosure/details.do', {
      method: 'POST',
      body: searchParams.toString(),
      headers: {
        Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    // 에러 페이지 확인
    if (response.body.includes('errorpage') || response.body.includes('페이지 오류')) {
      console.error('[KRX API] Error page returned');
      return {
        total: 0,
        pageIndex: params.pageIndex || 1,
        pageSize: params.currentPageSize || 15,
        disclosures: [],
      };
    }

    // HTML 파싱
    return this.parseDisclosureTable(response.body, params.pageIndex || 1, params.currentPageSize || 15);
  }

  /**
   * 공시 목록 HTML 테이블 파싱
   */
  private parseDisclosureTable(html: string, pageIndex: number, pageSize: number): KrxDisclosureResult {
    const disclosures: KrxDisclosure[] = [];

    // 전체 건수 추출 (여러 형식 지원)
    // 형식1: 총 <strong>123</strong>건
    // 형식2: 총 <b>123</b>건
    // 형식3: 총 123건
    // 형식4: (123건)
    let total = 0;
    const totalMatch = html.match(/총\s*<(?:strong|b)[^>]*>([,\d]+)<\/(?:strong|b)>\s*건/i)
      || html.match(/총\s+([,\d]+)\s*건/)
      || html.match(/\(\s*([,\d]+)\s*건\s*\)/);
    if (totalMatch) {
      total = parseInt(totalMatch[1].replace(/,/g, ''), 10);
    } else {
      // fallback: 실제 파싱된 행 수로 추정 (정확하지 않음)
      // disclosures가 파싱된 후에 설정됨
    }

    // 테이블 행 추출
    const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    for (const row of rows) {
      // 데이터 행인지 확인 (td가 있어야 함)
      if (!row.includes('<td')) continue;

      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 5) continue;

      // 번호
      const firstCell = cells[0];
      if (!firstCell) continue;
      const numMatch = firstCell.match(/>(\d+)</);
      if (!numMatch) continue;

      // 시간
      const timeMatch = cells[1].match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : '';

      // 회사명
      const companyMatch = cells[2].match(/title='([^']+)'/);
      const company = companyMatch ? companyMatch[1] : '';

      // 시장구분
      let market = '';
      if (cells[2].includes('icn_t_yu.gif')) market = '유가';
      else if (cells[2].includes('icn_t_ko.gif')) market = '코스닥';
      else if (cells[2].includes('icn_t_kn.gif')) market = '코넥스';

      // 공시제목
      const titleMatch = cells[3].match(/title='([^']+)'/);
      const title = titleMatch ? titleMatch[1] : cells[3].replace(/<[^>]+>/g, '').trim();

      // 공시번호
      const disclsNoMatch = cells[3].match(/openDisclsViewer\('(\d+)'/);
      const disclsNo = disclsNoMatch ? disclsNoMatch[1] : '';

      // 제출인
      const submitter = cells[4].replace(/<[^>]+>/g, '').trim();

      if (numMatch && title) {
        disclosures.push({
          num: numMatch[1],
          time,
          company,
          market,
          title,
          disclsNo,
          submitter,
        });
      }
    }

    // fallback: total이 0이고 실제 데이터가 있으면 파싱된 수로 설정
    // 첫 페이지에서만 유효 (페이지네이션 시 정확하지 않을 수 있음)
    const finalTotal = total > 0 ? total : disclosures.length;

    return {
      total: finalTotal,
      pageIndex,
      pageSize,
      disclosures,
    };
  }

  /**
   * 엑셀 다운로드 URL 생성
   */
  getExcelDownloadParams(params: KrxDisclosureSearchParams): URLSearchParams {
    const searchParams = new URLSearchParams({
      method: 'searchDetailsSub',
      forward: 'details_down', // 엑셀 다운로드용
      searchCorpName: params.searchCorpName,
      repIsuSrtCd: params.repIsuSrtCd,
      isurCd: params.isurCd,
      fromDate: params.fromDate,
      toDate: params.toDate,
      currentPageSize: '1000', // 최대 건수
      pageIndex: '1',
      orderMode: params.orderMode || '0',
      orderStat: params.orderStat || 'D',
    });

    // 필터 추가
    if (params.marketType) searchParams.set('marketType', params.marketType);
    if (params.lastReport) searchParams.set('lastReport', 'T');
    if (params.disclosureType01) searchParams.set('disclosureType01', params.disclosureType01);
    if (params.disclosureType02) searchParams.set('disclosureType02', params.disclosureType02);
    if (params.disclosureType03) searchParams.set('disclosureType03', params.disclosureType03);
    if (params.disclosureType05) searchParams.set('disclosureType05', params.disclosureType05);

    return searchParams;
  }

  /**
   * 공시 상세 조회 (뷰어 페이지에서 문서 목록 및 내용 추출)
   */
  async getDisclosureDetail(acptNo: string, disclosure?: KrxDisclosure): Promise<KrxDisclosureDetail | null> {
    await this.initSession();

    try {
      // 1. searchContents로 문서 경로 정보 가져오기
      // acptNo와 docNo 모두 포함해야 세션이 유효하게 동작
      const contentsUrl = `/common/disclsviewer.do?method=searchContents&acptNo=${acptNo}&docNo=${acptNo}`;
      let contentsResponse = await this.request(contentsUrl, {
        headers: {
          Referer: `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}`,
        },
      });

      console.log('[KRX API] searchContents response length:', contentsResponse.body.length);

      // 세션 문제로 리다이렉트 페이지가 반환되는 경우 재시도
      if (contentsResponse.body.includes('창 닫기') || contentsResponse.body.includes('blank.html')) {
        console.log('[KRX API] Session expired, reinitializing...');
        this.resetSession();
        await this.initSession();

        // 뷰어 페이지 먼저 방문하여 세션 설정
        await this.request(`/common/disclsviewer.do?method=search&acptno=${acptNo}&docno=&viewerhost=`, {
          headers: {
            Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
          },
        });

        contentsResponse = await this.request(contentsUrl, {
          headers: {
            Referer: `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}`,
          },
        });
        console.log('[KRX API] Retry searchContents response length:', contentsResponse.body.length);
      }

      // setPath 함수에서 문서 경로 추출 (2번째 파라미터: docUrl)
      // 형식: parent.setPath('tocUrl', 'docUrl', 'serverPath', ...)
      const setPathMatch = contentsResponse.body.match(/parent\.setPath\s*\(\s*['"][^'"]*['"]\s*,\s*['"]([^'"]+)['"]/);
      let docPath = setPathMatch ? setPathMatch[1] : null;

      console.log('[KRX API] setPath match:', setPathMatch ? setPathMatch[1] : 'NOT FOUND');

      // 전체 URL에서 /external 경로만 추출
      if (docPath && docPath.includes('/external/')) {
        const externalMatch = docPath.match(/(\/external\/[^'"]+)/);
        if (externalMatch) {
          docPath = externalMatch[1];
        }
      }

      console.log('[KRX API] Final docPath:', docPath);

      // 문서 목록 파싱 (뷰어 페이지에서)
      const viewerUrl = `/common/disclsviewer.do?method=search&acptno=${acptNo}&docno=&viewerhost=`;
      const viewerResponse = await this.request(viewerUrl, {
        headers: {
          Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
        },
      });
      const documents = this.parseDocumentList(viewerResponse.body);

      // 문서 경로가 있으면 첫 번째 문서에 설정
      if (docPath && documents.length > 0) {
        documents[0].docPath = docPath;
      }

      // 메인 문서 내용 가져오기
      let content: string | undefined;
      if (docPath) {
        content = await this.getDocumentContent(docPath);
      } else if (documents.length > 0 && documents[0].docPath) {
        content = await this.getDocumentContent(documents[0].docPath);
      }

      return {
        acptNo,
        title: disclosure?.title || this.extractTitle(viewerResponse.body) || '',
        company: disclosure?.company || this.extractCompany(viewerResponse.body) || '',
        market: disclosure?.market || '',
        submitter: disclosure?.submitter || '',
        time: disclosure?.time || '',
        documents,
        content,
      };
    } catch (error) {
      console.error('[KRX API] Failed to get disclosure detail:', error);
      return null;
    }
  }

  /**
   * 문서 목록 파싱 (뷰어 페이지의 select 옵션에서 추출)
   */
  private parseDocumentList(html: string): KrxDocument[] {
    const documents: KrxDocument[] = [];

    // mainDoc select에서 옵션 추출
    const mainDocMatch = html.match(/<select[^>]*id="mainDoc"[^>]*>([\s\S]*?)<\/select>/i);
    if (mainDocMatch) {
      const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi;
      let match;
      while ((match = optionRegex.exec(mainDocMatch[1])) !== null) {
        const docNo = match[1];
        const docNm = match[2].trim();
        if (docNo) {
          documents.push({ docNo, docNm });
        }
      }
    }

    // docpath 추출 시도
    const docPathMatch = html.match(/docpath\s*[:=]\s*["']([^"']+)["']/i);
    if (docPathMatch && documents.length > 0) {
      documents[0].docPath = docPathMatch[1];
    }

    // setPath 함수에서 경로 추출
    const setPathMatch = html.match(/setPath\s*\([^)]*["']([^"']+)["']/);
    if (setPathMatch && documents.length > 0 && !documents[0].docPath) {
      documents[0].docPath = setPathMatch[1];
    }

    return documents;
  }

  /**
   * 문서 내용 가져오기 (external 경로의 HTML)
   */
  private async getDocumentContent(docPath: string): Promise<string | undefined> {
    try {
      // docPath가 /external로 시작하면 직접 접근
      let fullPath = docPath;
      if (!docPath.startsWith('/')) {
        fullPath = `/external/${docPath}`;
      }

      const response = await this.request(fullPath);

      // HTML에서 body 내용만 추출
      const bodyMatch = response.body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        return this.cleanHtmlContent(bodyMatch[1]);
      }

      return this.cleanHtmlContent(response.body);
    } catch (error) {
      console.error('[KRX API] Failed to get document content:', error);
      return undefined;
    }
  }

  /**
   * HTML 내용 정리
   */
  private cleanHtmlContent(html: string): string {
    // 스크립트 태그 제거
    let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    // 스타일 태그 제거
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // 주석 제거
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    // 불필요한 공백 정리
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * 제목 추출
   */
  private extractTitle(html: string): string {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : '';
  }

  /**
   * 회사명 추출
   */
  private extractCompany(html: string): string {
    // 뷰어 페이지에서 회사명 추출 시도
    const companyMatch = html.match(/법인명\s*[:：]\s*([^<\n]+)/);
    return companyMatch ? companyMatch[1].trim() : '';
  }

  /**
   * PDF 존재 여부 확인
   * searchContents에서 PDF 경로를 추출하면 PDF 사용 가능으로 판단
   * (KIND 서버가 HEAD 요청을 지원하지 않아 경로 존재 여부로 판단)
   */
  async checkPdfAvailability(acptNo: string, docNo: string): Promise<KrxPdfInfo> {
    await this.initSession();

    try {
      // searchContents에서 PDF 경로 추출
      const pdfPath = await this.getPdfPath(acptNo, docNo);

      if (!pdfPath) {
        console.log('[KRX API] No PDF path found for:', acptNo);
        return {
          available: false,
          acptNo,
          docNo,
        };
      }

      // PDF 경로가 추출되면 사용 가능으로 판단
      console.log('[KRX API] PDF availability check: path found -', pdfPath);

      return {
        available: true,
        acptNo,
        docNo,
        docPath: pdfPath,
      };
    } catch (error) {
      console.error('[KRX API] Failed to check PDF availability:', error);
      return {
        available: false,
        acptNo,
        docNo,
      };
    }
  }

  /**
   * PDF 다운로드 URL 파라미터 생성
   * 클라이언트에서 폼 제출에 사용
   */
  getPdfDownloadParams(acptNo: string, docNo: string, docLocPath?: string, docPath?: string): URLSearchParams {
    const params = new URLSearchParams({
      method: 'searchDocPdf',
      acptNo,
      docNo,
    });

    if (docLocPath) {
      params.set('docLocPath', docLocPath);
    }
    if (docPath) {
      params.set('docpath', docPath);
    }

    return params;
  }

  /**
   * searchContents 응답에서 PDF 경로 추출
   */
  private extractPdfPathFromResponse(html: string): string | null {
    // setPath 함수에서 serverPath 추출 (3번째 파라미터)
    // parent.setPath('tocUrl', 'docUrl', 'serverPath', ...)
    // 예: parent.setPath('...toc.htm', '...00637.htm', '/external/2025/01/09/000331/20250109000730/00637', '08', '20')
    const setPathMatch = html.match(/parent\.setPath\s*\(\s*['"][^'"]*['"]\s*,\s*['"][^'"]*['"]\s*,\s*['"]([^'"]+)['"]/);

    if (setPathMatch && setPathMatch[1]) {
      const serverPath = setPathMatch[1];
      console.log('[KRX API] Extracted serverPath:', serverPath);

      // serverPath에 .pdf를 붙여서 PDF URL 생성
      const pdfPath = serverPath.endsWith('.pdf') ? serverPath : `${serverPath}.pdf`;
      console.log('[KRX API] PDF path:', pdfPath);
      return pdfPath;
    }

    console.log('[KRX API] setPath not found in searchContents response');
    return null;
  }

  /**
   * searchContents에서 PDF 경로 추출
   * setPath 함수의 3번째 파라미터 (serverPath)에 .pdf를 붙이면 PDF 직접 접근 가능
   */
  private async getPdfPath(acptNo: string, docNo: string): Promise<string | null> {
    try {
      const effectiveDocNo = docNo || acptNo;

      // 먼저 뷰어 페이지를 열어서 문서별 세션 설정
      // KIND는 특정 문서에 대한 뷰어 세션이 필요함
      const viewerUrl = `/common/disclsviewer.do?method=search&acptno=${acptNo}&docno=&viewerhost=&frameHeight=`;
      const viewerResponse = await this.request(viewerUrl, {
        headers: {
          Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
        },
      });

      console.log('[KRX API] Viewer page response length:', viewerResponse.body.length);

      // 뷰어 페이지가 리다이렉트 페이지면 세션 재초기화
      if (viewerResponse.body.includes('창 닫기') || viewerResponse.body.includes('blank.html')) {
        console.log('[KRX API] Viewer page returned redirect, reinitializing session...');
        this.resetSession();
        await this.initSession();

        // 다시 뷰어 페이지 방문
        const retryViewerResponse = await this.request(viewerUrl, {
          headers: {
            Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
          },
        });
        console.log('[KRX API] Retry viewer page response length:', retryViewerResponse.body.length);

        if (retryViewerResponse.body.includes('창 닫기') || retryViewerResponse.body.includes('blank.html')) {
          console.error('[KRX API] Still getting redirect page for viewer after session reinit');
          return null;
        }
      }

      // searchContents 호출
      const contentsUrl = `/common/disclsviewer.do?method=searchContents&acptNo=${acptNo}&docNo=${effectiveDocNo}`;
      const contentsResponse = await this.request(contentsUrl, {
        headers: {
          Referer: `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}`,
        },
      });

      console.log('[KRX API] searchContents response length:', contentsResponse.body.length);

      // setPath 추출
      const pdfPath = this.extractPdfPathFromResponse(contentsResponse.body);
      if (pdfPath) {
        return pdfPath;
      }

      // setPath가 없으면 여전히 세션 문제일 수 있음
      if (contentsResponse.body.includes('창 닫기') || contentsResponse.body.includes('blank.html')) {
        console.error('[KRX API] searchContents returned redirect page');
      } else {
        console.log('[KRX API] searchContents response preview:', contentsResponse.body.substring(0, 500));
      }

      return null;
    } catch (error) {
      console.error('[KRX API] Failed to get PDF path:', error);
      return null;
    }
  }

  /**
   * PDF 다운로드 (서버에서 직접 다운로드)
   * searchContents에서 PDF 경로를 추출하여 직접 다운로드
   */
  async downloadPdf(acptNo: string, docNo: string, _docLocPath?: string, _docPath?: string): Promise<{ data: ArrayBuffer; filename: string } | null> {
    await this.initSession();

    try {
      // searchContents에서 PDF 경로 추출
      const pdfPath = await this.getPdfPath(acptNo, docNo);

      if (!pdfPath) {
        console.error('[KRX API] Failed to get PDF path from searchContents');
        return null;
      }

      // PDF 직접 다운로드
      console.log('[KRX API] Downloading PDF from:', pdfPath);

      const requestHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Cookie': this.getCookieString(),
        'Referer': `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}`,
      };

      const response = await fetch(`${KRX_BASE_URL}${pdfPath}`, {
        method: 'GET',
        headers: requestHeaders,
        cache: 'no-store',
      });

      // 쿠키 업데이트
      const setCookies = response.headers.getSetCookie?.() || [];
      if (setCookies.length > 0) {
        this.parseCookies(setCookies);
      }

      // Content-Type 확인
      const contentType = response.headers.get('content-type');
      console.log('[KRX API] PDF response content-type:', contentType);
      console.log('[KRX API] PDF response status:', response.status);

      if (response.status !== 200) {
        console.error('[KRX API] PDF download failed with status:', response.status);
        return null;
      }

      if (!contentType?.includes('application/pdf') && !contentType?.includes('octet-stream')) {
        console.error('[KRX API] PDF download returned non-PDF content type:', contentType);
        const text = await response.text();
        console.error('[KRX API] Response body preview:', text.substring(0, 500));
        return null;
      }

      // 파일명 추출 (경로에서 추출)
      const pathParts = pdfPath.split('/');
      const filename = pathParts[pathParts.length - 1] || `disclosure_${acptNo}.pdf`;

      const data = await response.arrayBuffer();

      console.log('[KRX API] PDF downloaded successfully, size:', data.byteLength, 'filename:', filename);

      return { data, filename };
    } catch (error) {
      console.error('[KRX API] Failed to download PDF:', error);
      return null;
    }
  }

  /**
   * 공시 상세에서 PDF 정보 포함하여 조회
   */
  async getDisclosureDetailWithPdf(acptNo: string, disclosure?: KrxDisclosure): Promise<KrxDisclosureDetail | null> {
    const detail = await this.getDisclosureDetail(acptNo, disclosure);
    if (!detail) return null;

    // 첫 번째 문서에 대해 PDF 사용 가능 여부 확인
    if (detail.documents.length > 0) {
      const firstDoc = detail.documents[0];
      const pdfInfo = await this.checkPdfAvailability(acptNo, firstDoc.docNo || acptNo);

      // PDF 정보를 문서에 추가
      if (pdfInfo.available) {
        firstDoc.docLocPath = pdfInfo.docLocPath;
      }
    }

    return detail;
  }

  /**
   * 공시 미리보기 조회 (파싱된 내용 반환)
   */
  async getDisclosurePreview(acptNo: string): Promise<KrxDisclosurePreview | null> {
    await this.initSession();

    try {
      // 1. 뷰어 페이지 방문하여 docNo 추출
      const viewerUrl = `/common/disclsviewer.do?method=search&acptno=${acptNo}&docno=&viewerhost=`;
      const viewerResponse = await this.request(viewerUrl, {
        headers: {
          Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
        },
      });

      // 세션 만료 체크
      if (viewerResponse.body.includes('창 닫기') || viewerResponse.body.includes('blank.html')) {
        console.log('[KRX API] Session expired, reinitializing...');
        this.resetSession();
        await this.initSession();

        const retryViewer = await this.request(viewerUrl, {
          headers: {
            Referer: `${KRX_BASE_URL}/disclosure/details.do?method=searchDetailsMain`,
          },
        });

        if (retryViewer.body.includes('창 닫기')) {
          console.error('[KRX API] Still getting session error after retry');
          return null;
        }
      }

      // mainDoc에서 docNo 추출
      const mainDocMatch = viewerResponse.body.match(/<option[^>]*value=['"]([^'"]+)['"][^>]*>([^<]+)<\/option>/);
      if (!mainDocMatch) {
        console.error('[KRX API] No main document found');
        return null;
      }

      const docNo = mainDocMatch[1].split('|')[0].trim();
      const docTitle = mainDocMatch[2].trim();

      // 2. searchContents로 문서 경로 가져오기
      const contentsUrl = `/common/disclsviewer.do?method=searchContents&acptNo=${acptNo}&docNo=${docNo}`;
      const contentsResponse = await this.request(contentsUrl, {
        headers: {
          Referer: `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (contentsResponse.body.includes('창 닫기')) {
        console.error('[KRX API] Session error on searchContents');
        return null;
      }

      // setPath에서 문서 경로 추출
      const setPathMatch = contentsResponse.body.match(/parent\.setPath\s*\(\s*['"][^'"]*['"]\s*,\s*['"]([^'"]*)['"]/);
      if (!setPathMatch) {
        console.error('[KRX API] setPath not found');
        return null;
      }

      let docPath = setPathMatch[1];
      if (docPath.includes('/external/')) {
        const match = docPath.match(/(\/external\/[^'"]+)/);
        if (match) docPath = match[1];
      }

      // 3. 실제 문서 HTML 가져오기
      const docResponse = await this.request(docPath, {
        headers: {
          Referer: `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}`,
        },
      });

      // 4. HTML 파싱
      return this.parseDisclosureHtml(acptNo, docTitle, docResponse.body);
    } catch (error) {
      console.error('[KRX API] Failed to get disclosure preview:', error);
      return null;
    }
  }

  /**
   * 공시 HTML 파싱하여 구조화된 데이터 추출
   */
  private parseDisclosureHtml(acptNo: string, docTitle: string, html: string): KrxDisclosurePreview {
    // 제목 추출
    let title = docTitle;
    const htmlTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (htmlTitleMatch) {
      title = htmlTitleMatch[1].replace(/^::\s*\d+_/, '').trim() || title;
    }

    // 본문 제목 (xforms_title에서 추출)
    const mainTitleMatch = html.match(/<div[^>]*class=['"]xforms_title['"][^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
    if (mainTitleMatch) {
      title = mainTitleMatch[1].trim();
    }

    // 공시 유형 판단
    const type = this.determineDisclosureType(title);

    // 테이블 파싱
    const tables = this.parseTablesFromHtml(html);

    // 텍스트 콘텐츠 추출
    const textContent = this.extractTextContent(html);

    // 구조화된 데이터 추출 (| key | value | 형식)
    const structuredData = this.extractStructuredData(textContent);

    return {
      acptNo,
      title,
      type,
      textContent,
      structuredData,
      tables,
    };
  }

  /**
   * 공시 유형 판단
   */
  private determineDisclosureType(title: string): KrxDisclosureType {
    if (title.includes('투자경고') || title.includes('투자주의') || title.includes('투자위험')) {
      return 'market_warning';
    }
    if (title.includes('관리종목')) {
      return 'market_managed';
    }
    if (title.includes('상장폐지')) {
      return 'market_delisting';
    }
    if (title.includes('매매거래정지') || title.includes('거래정지')) {
      return 'market_halt';
    }
    if (title.includes('사업보고서') || title.includes('분기보고서') || title.includes('반기보고서')) {
      return 'periodic_report';
    }
    if (title.includes('공정공시')) {
      return 'fair_disclosure';
    }
    if (title.includes('주요사항') || title.includes('증권발행') || title.includes('특수관계인')) {
      return 'timely_disclosure';
    }
    return 'unknown';
  }

  /**
   * HTML에서 테이블 파싱
   */
  private parseTablesFromHtml(html: string): KrxParsedTable[] {
    const tables: KrxParsedTable[] = [];
    const tableMatches = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];

    for (const tableHtml of tableMatches) {
      const table: KrxParsedTable = { headers: [], rows: [] };

      // 헤더 추출 (th)
      const thMatches = tableHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      table.headers = thMatches.map((th) =>
        th.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      );

      // 행 추출 (tr > td)
      const trMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      for (const tr of trMatches) {
        if (tr.includes('<th')) continue;

        const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (tdMatches.length > 0) {
          const row = tdMatches.map((td) =>
            td.replace(/<br[^>]*>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&gt;/g, '>')
              .replace(/&lt;/g, '<')
              .replace(/&amp;/g, '&')
              .trim()
          );
          if (row.some(cell => cell.length > 0)) {
            table.rows.push(row);
          }
        }
      }

      if (table.rows.length > 0) {
        tables.push(table);
      }
    }

    return tables;
  }

  /**
   * HTML에서 텍스트 콘텐츠 추출
   */
  private extractTextContent(html: string): string {
    // xforms_input 영역 먼저 시도
    const inputMatch = html.match(/<span[^>]*class=['"]xforms_input['"][^>]*>([\s\S]*?)<\/span>/);
    if (inputMatch) {
      return inputMatch[1]
        .replace(/<br[^>]*>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    }

    // body에서 추출
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1]
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, ' | ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    }

    return '';
  }

  /**
   * 텍스트에서 구조화된 데이터 추출 (| 1. 키 | 값 | 형식)
   */
  private extractStructuredData(text: string): Record<string, string> {
    const data: Record<string, string> = {};
    const lines = text.split('\n');
    let currentKey = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') || trimmed.startsWith('+')) {
        const parts = trimmed.split('|').map((p) => p.trim()).filter((p) => p && !p.startsWith('-'));
        if (parts.length >= 2) {
          const keyMatch = parts[0].match(/^\d+\.\s*(.+)/);
          if (keyMatch) {
            currentKey = keyMatch[1].trim();
            data[currentKey] = parts.slice(1).join(' ').trim();
          } else if (currentKey && parts[0] === '') {
            // 이전 키에 내용 추가
            data[currentKey] = (data[currentKey] + ' ' + parts.slice(1).join(' ')).trim();
          }
        }
      }
    }

    return data;
  }
}

// 싱글톤 인스턴스
let krxClientInstance: KrxApiClient | null = null;

/**
 * KRX API 클라이언트 인스턴스 가져오기
 */
export function getKrxApiClient(): KrxApiClient {
  if (!krxClientInstance) {
    krxClientInstance = new KrxApiClient();
  }
  return krxClientInstance;
}

/**
 * KRX 공시 원문 URL 생성
 * @param acptNo 공시 접수번호 (openDisclsViewer 파라미터)
 */
export function getKrxDisclosureUrl(acptNo: string): string {
  return `${KRX_BASE_URL}/common/disclsviewer.do?method=search&acptno=${acptNo}&docno=&viewerhost=`;
}

/**
 * 날짜 범위 유효성 검사 (최대 3년)
 */
export function validateDateRange(fromDate: string, toDate: string): { valid: boolean; message?: string } {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diffYears = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 365);

  if (diffYears > 3) {
    return {
      valid: false,
      message: 'KRX 공시 검색은 최대 3년까지만 가능합니다.',
    };
  }

  return { valid: true };
}

/**
 * DART API 클라이언트 분리(Slice D2) 단위 테스트 — 역검증(green 기대).
 *
 * 대상: src/lib/dart/api/{client,company,financial,disclosure}.ts +
 *       src/lib/dart/dart-api.service.ts
 *
 * 네트워크/실제 DART 호출 0 — fetch 는 전부 vi.fn 모킹(과금·비결정 금지,
 * CLAUDE.md "Mock 금지"의 예외 = 외부 그래프/HTTP 는 모킹 필수).
 * 정답지는 tests/fixtures/dart/ 의 OPEN-4 실측 raw 응답(삼성전자) +
 * docs/notes/dart-api-probe.md §2 raw 키 목록에서 도출(추측 금지).
 * env DART_API_KEY 는 vi.stubEnv 로만(실제 .env.local 키 미사용 — 테스트 격리).
 *
 * TC 매핑:
 *  - TC-46.5  (UC-46 / FR-21·NFR-18·OPEN-4) snake→camel 매핑 결정성
 *  - TC-48.4  (UC-48 / NFR-16·OPEN-2 인접) SSRF 호스트 고정(buildUrl)
 *  - TC-41.11 (UC-41-E2 / FR-21·NFR-16·AC-26) 키 비직렬화(코드레벨 격리)
 *  - TC-41.12 (UC-41-E3 / FR-21·NFR-20·OPEN-1) rate limit 초과 시 throw
 *  - TC-41.15 (UC-41-E6 / FR-22·NFR-18) graceful degradation(빈배열/null)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 주의: src/lib/dart/api/client.ts 가 jszip 을 dynamic import 한다.
// jszip 의 package.json 캐럿 핀은 TC-48.1(Slice D8) 게이트 책임이라
// 아직 미선언 → vitest.config.ts 에서 pnpm 스토어 실경로로 alias 처리
// (테스트 하네스 한정, 구현/package.json 무수정). D2 테스트는 ZIP
// 경로(loadCorpCodes)를 호출하지 않으므로 동작 영향 0.

import {
  dartApiCall,
  getDartCacheStats,
  clearDartCache,
  resetApiCallStats,
} from "@/lib/dart/api/client";
import { getCompanyInfo } from "@/lib/dart/api/company";
import { getFinancialStatements } from "@/lib/dart/api/financial";
import { getDisclosures } from "@/lib/dart/api/disclosure";
import { extractFinancialSummary } from "@/lib/dart/dart-api.service";
import {
  resetRateLimiter,
  reportConnectionError,
  clearBlockedState,
} from "@/lib/dart/ratelimit";

// ──────────────────────────────────────────────────────────────────────────
// 픽스처 로드 (OPEN-4 실측 삼성전자 raw 응답 = 정답지)
// ──────────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = resolve(__dirname, "../fixtures/dart");

const companyRaw = JSON.parse(
  readFileSync(resolve(fxDir, "company.json"), "utf8"),
) as Record<string, string>;
const finRaw = JSON.parse(
  readFileSync(resolve(fxDir, "financial-statements.json"), "utf8"),
) as { status: string; list: Record<string, string>[] };
const disclosureRaw = JSON.parse(
  readFileSync(resolve(fxDir, "disclosure-list.json"), "utf8"),
) as { status: string; list: Record<string, string>[] };

/** fetch 를 단일 JSON 응답으로 모킹 */
function mockFetchJson(payload: unknown): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** fetch 를 순차 응답(CFS→OFS 폴백 등)으로 모킹 */
function mockFetchSequence(
  payloads: unknown[],
): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  for (const p of payloads) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(p), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(async () => {
  vi.stubEnv("DART_API_KEY", "TESTKEY40CHARS0000000000000000000000abcd");
  clearDartCache();
  resetApiCallStats();
  await resetRateLimiter();
  await clearBlockedState();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════
// 1. TC-46.5 — snake→camel 매핑 결정성 (OPEN-4 §2 raw 키 정답지) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-46.5 snake→camel 매핑 결정성 (OPEN-4)", () => {
  it("getFinancialStatements: account_nm/thstrm_amount/sj_div 정확 매핑 (자산총계)", async () => {
    mockFetchJson(finRaw);
    const items = await getFinancialStatements("00126380", "2023", "11011");

    // 픽스처 raw 의 자산총계 항목 = account_nm:'자산총계',
    // thstrm_amount:'455905980000000', sj_div:'BS' (probe §2 키 목록 회귀)
    const assets = items.find((i) => i.accountNm === "자산총계");
    expect(assets).toBeDefined();
    expect(assets!.accountNm).toBe("자산총계");
    expect(assets!.thstrmAmount).toBe("455905980000000");
    expect(assets!.sjDiv).toBe("BS");
    expect(assets!.sjNm).toBe("재무상태표");
    expect(assets!.rceptNo).toBe("20240312000736");
    expect(assets!.bsnsYear).toBe("2023");
    expect(assets!.thstrmNm).toBe("제 55 기");

    // 자본총계·부채총계 raw 값 회귀 (손계산 정답지의 입력)
    const equity = items.find((i) => i.accountNm === "자본총계");
    const liab = items.find((i) => i.accountNm === "부채총계");
    expect(equity!.thstrmAmount).toBe("363677865000000");
    expect(liab!.thstrmAmount).toBe("92228115000000");

    // 전수 매핑 회귀: probe §2 의 17개 raw 키가 전부 camel 로 옮겨졌는지
    const sample = items[0];
    const rawSample = finRaw.list[0];
    expect(sample.rceptNo).toBe(rawSample.rcept_no);
    expect(sample.reprtCode).toBe(rawSample.reprt_code);
    expect(sample.bsnsYear).toBe(rawSample.bsns_year);
    expect(sample.corpCode).toBe(rawSample.corp_code);
    expect(sample.sjDiv).toBe(rawSample.sj_div);
    expect(sample.sjNm).toBe(rawSample.sj_nm);
    expect(sample.accountId).toBe(rawSample.account_id);
    expect(sample.accountNm).toBe(rawSample.account_nm);
    expect(sample.accountDetail).toBe(rawSample.account_detail);
    expect(sample.thstrmNm).toBe(rawSample.thstrm_nm);
    expect(sample.thstrmAmount).toBe(rawSample.thstrm_amount);
    expect(sample.frmtrmNm).toBe(rawSample.frmtrm_nm);
    expect(sample.frmtrmAmount).toBe(rawSample.frmtrm_amount);
    expect(sample.bfefrmtrmNm).toBe(rawSample.bfefrmtrm_nm);
    expect(sample.bfefrmtrmAmount).toBe(rawSample.bfefrmtrm_amount);
    expect(sample.ord).toBe(rawSample.ord);
    expect(sample.currency).toBe(rawSample.currency);

    // 176건 전부 매핑 (raw list.length 보존)
    expect(items).toHaveLength(finRaw.list.length);
  });

  it("getCompanyInfo: ceo_nm→ceoName / stock_code→stockCode 매핑", async () => {
    mockFetchJson(companyRaw);
    const info = await getCompanyInfo("00126380");

    expect(info).not.toBeNull();
    expect(info!.ceoName).toBe(companyRaw.ceo_nm); // '전영현, 노태문'
    expect(info!.stockCode).toBe(companyRaw.stock_code); // '005930'
    expect(info!.corpName).toBe(companyRaw.corp_name); // '삼성전자(주)'
    expect(info!.corpCode).toBe(companyRaw.corp_code); // '00126380'
    expect(info!.corpNameEng).toBe(companyRaw.corp_name_eng);
    expect(info!.bizrNo).toBe(companyRaw.bizr_no);
    expect(info!.jurirNo).toBe(companyRaw.jurir_no);
    expect(info!.address).toBe(companyRaw.adres);
    expect(info!.estDate).toBe(companyRaw.est_dt);
    expect(info!.accMonth).toBe(companyRaw.acc_mt);
  });

  it("getCompanyInfo: status!=='000' → null (graceful, UC-41-E1)", async () => {
    mockFetchJson({ status: "013", message: "조회된 데이터가 없습니다." });
    const info = await getCompanyInfo("00000000");
    expect(info).toBeNull();
  });

  it("getDisclosures: report_nm→reportNm / rcept_no→rceptNo 매핑", async () => {
    mockFetchJson(disclosureRaw);
    const result = await getDisclosures("00126380");

    expect(result.status).toBe("000");
    expect(result.list).toHaveLength(disclosureRaw.list.length);
    const first = result.list![0];
    const rawFirst = disclosureRaw.list[0];
    expect(first.reportNm).toBe(rawFirst.report_nm); // '특수관계인과의내부거래'
    expect(first.rceptNo).toBe(rawFirst.rcept_no); // '20240131000326'
    expect(first.corpCode).toBe(rawFirst.corp_code);
    expect(first.corpName).toBe(rawFirst.corp_name);
    expect(first.flrNm).toBe(rawFirst.flr_nm);
    expect(first.rceptDt).toBe(rawFirst.rcept_dt);
    expect(result.totalCount).toBe(15);
    expect(result.totalPage).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. TC-48.4 인접 — SSRF 호스트 고정 (buildUrl) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-48.4 인접 SSRF 호스트 고정 (buildUrl 경유)", () => {
  it("정상 endpoint: fetch URL 이 https://opendart.fss.or.kr/api/ 로 시작", async () => {
    const spy = mockFetchJson({ status: "000", list: [] });
    await dartApiCall("company.json", { corp_code: "00126380" });

    expect(spy).toHaveBeenCalledTimes(1);
    const calledUrl = String(spy.mock.calls[0][0]);
    expect(calledUrl.startsWith("https://opendart.fss.or.kr/api/")).toBe(true);
    expect(new URL(calledUrl).origin).toBe("https://opendart.fss.or.kr");
  });

  it("endpoint 에 ../traversal 이 있어도 호스트는 opendart.fss.or.kr 고정", async () => {
    const spy = mockFetchJson({ status: "000", list: [] });
    await dartApiCall("../../../etc/passwd", { corp_code: "x" });

    const calledUrl = String(spy.mock.calls[0][0]);
    // URL 생성자 정규화 결과도 고정 origin 을 벗어나면 안 됨
    expect(new URL(calledUrl).origin).toBe("https://opendart.fss.or.kr");
  });

  it("endpoint 에 절대 URL(@evil.com) 주입해도 host 는 opendart 고정 (path 로 무력화)", async () => {
    const spy = mockFetchJson({ status: "000", list: [] });
    // new URL(`${BASE}/${endpoint}`) 형태라 절대 URL 은 호스트가 아니라
    // base 경로 뒤 inert path 세그먼트로 합성됨
    // (.../api/https://evil.com/@steal). SSRF 방어의 경계는 origin/host —
    // attacker 문자열이 path 에 박혀도 요청은 opendart.fss.or.kr 로만 간다.
    await dartApiCall("https://evil.com/@steal", { q: "1" });

    const calledUrl = String(spy.mock.calls[0][0]);
    const parsed = new URL(calledUrl);
    expect(parsed.origin).toBe("https://opendart.fss.or.kr");
    expect(parsed.host).toBe("opendart.fss.or.kr");
    // evil.com 은 host 가 아니라 path 에만 존재(요청 라우팅에 영향 0)
    expect(parsed.host.includes("evil.com")).toBe(false);
    expect(parsed.pathname.includes("evil.com")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. TC-41.11 — 키 비직렬화 (코드레벨 격리, NFR-16/AC-26) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-41.11 키 비직렬화 (createCacheKey crtfc_key 제외)", () => {
  it("캐시 키·반환 데이터에 DART_API_KEY 문자열 0건", async () => {
    mockFetchJson(companyRaw);
    const data = await dartApiCall<typeof companyRaw>("company.json", {
      corp_code: "00126380",
    });

    // (a) 캐시 키에 키 문자열 누출 0 — createCacheKey 가 crtfc_key 제외
    const { keys } = getDartCacheStats();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.includes("TESTKEY")).toBe(false);
      expect(k.includes("crtfc_key")).toBe(false);
    }

    // (b) 반환 데이터(JSON 직렬화)에 키 문자열 0건
    expect(JSON.stringify(data).includes("TESTKEY")).toBe(false);
  });

  it("fetch 에 넘어간 URL 엔 crtfc_key 포함이 정상 (서버→서버, 누출 아님)", async () => {
    const spy = mockFetchJson({ status: "000", list: [] });
    await dartApiCall("company.json", { corp_code: "00126380" });

    const calledUrl = String(spy.mock.calls[0][0]);
    // 키는 외부 응답·캐시 키엔 0이지만, DART 서버 호출 URL 엔 필수(누출 아님)
    expect(calledUrl.includes("crtfc_key=TESTKEY")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. TC-41.12 — rate limit 초과 시 throw + fetch 미호출 [P1]
// ══════════════════════════════════════════════════════════════════════════
describe("TC-41.12 rate limit 차단 (OPEN-1 인메모리 limiter)", () => {
  it("차단 상태에서 dartApiCall throw + fetch 호출횟수 0", async () => {
    const spy = mockFetchJson({ status: "000", list: [] });

    // ECONNRESET → 인메모리 limiter 차단 상태 전환 (canMakeRequest=false)
    await reportConnectionError(new Error("ECONNRESET"));

    await expect(
      dartApiCall("company.json", { corp_code: "00126380" }, false),
    ).rejects.toThrow(/DART API 차단됨|DART API 호출 제한/);

    // 차단 시 fetch 진입 전 throw → 외부 호출 0 (과금·IP 차단 회피)
    expect(spy).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. CFS→OFS 폴백 + 전부 실패 시 빈 배열 (graceful) [P1]
// ══════════════════════════════════════════════════════════════════════════
describe("getFinancialStatements CFS→OFS 폴백", () => {
  it("CFS status!=='000' → OFS status='000' 폴백 결과 반환", async () => {
    const spy = mockFetchSequence([
      { status: "013", message: "데이터 없음" }, // CFS 실패
      finRaw, // OFS 성공
    ]);
    const items = await getFinancialStatements("00126380", "2023", "11011");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(finRaw.list.length);
    const assets = items.find((i) => i.accountNm === "자산총계");
    expect(assets!.thstrmAmount).toBe("455905980000000");

    // 폴백 호출은 fs_div=OFS 로 나가야 함
    const ofsUrl = String(spy.mock.calls[1][0]);
    expect(ofsUrl.includes("fs_div=OFS")).toBe(true);
  });

  it("CFS·OFS 둘 다 실패 → 빈 배열(throw 아님, NFR-18)", async () => {
    mockFetchSequence([
      { status: "013", message: "없음" },
      { status: "013", message: "없음" },
    ]);
    const items = await getFinancialStatements("00126380", "2099", "11011");
    expect(items).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. dart-api.service extractFinancialSummary 결정값 (손계산 정답지) [P1]
// ══════════════════════════════════════════════════════════════════════════
describe("extractFinancialSummary 억단위 정규화·비율 결정값", () => {
  it("픽스처(매핑 후) → debtRatio/roe/roa 손계산 기대치", async () => {
    mockFetchJson(finRaw);
    const items = await getFinancialStatements("00126380", "2023", "11011");
    const s = extractFinancialSummary(items, 2023);

    // 픽스처 raw 값(삼성전자 2023 CFS) 손계산:
    //  자산총계 455,905,980,000,000 → 4,559,060억
    //  부채총계  92,228,115,000,000 →   922,281억
    //  자본총계 363,677,865,000,000 → 3,636,779억
    //  영업수익 258,935,494,000,000 → 2,589,355억 (매출 대체계정)
    //  영업이익   6,566,976,000,000 →    65,670억
    //  당기순이익(손실) 15,487,100,000,000 → 154,871억
    expect(s.year).toBe(2023);
    expect(s.totalAssets).toBe(4559060);
    expect(s.totalLiabilities).toBe(922281);
    expect(s.totalEquity).toBe(3636779);
    expect(s.revenue).toBe(2589355);
    expect(s.operatingProfit).toBe(65670);
    expect(s.netIncome).toBe(154871);

    // debtRatio = 부채/자본*100 = 92228115/363677865*100 ≈ 25.4
    expect(s.debtRatio).toBe(25.4);
    // roe = 순익/자본*100 ≈ 4.3
    expect(s.roe).toBe(4.3);
    // roa = 순익/자산*100 ≈ 3.4
    expect(s.roa).toBe(3.4);
  });

  it("빈 입력 → 분모 0 가드(throw 아님, ratio=0)", () => {
    const s = extractFinancialSummary([], 2023);
    expect(s.debtRatio).toBe(0);
    expect(s.roe).toBe(0);
    expect(s.roa).toBe(0);
    expect(s.revenue).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 7. graceful — 전 조회 실패 시 throw 아닌 빈배열/null (NFR-18) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("graceful degradation (NFR-18 / TC-41.15 흐름)", () => {
  it("fetch reject(네트워크 오류) → getCompanyInfo=null, getFinancialStatements=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const info = await getCompanyInfo("00126380");
    const fin = await getFinancialStatements("00126380", "2023", "11011");
    const disc = await getDisclosures("00126380");

    expect(info).toBeNull();
    expect(fin).toEqual([]);
    expect(disc.list).toEqual([]);
    expect(disc.status).toBe("error");
  });

  it("status!=='000' 전 항목 → 빈 결과(throw 0)", async () => {
    mockFetchJson({ status: "020", message: "사용한도 초과" });
    await expect(getFinancialStatements("x", "2023", "11011")).resolves.toEqual(
      [],
    );
    await expect(getCompanyInfo("x")).resolves.toBeNull();
  });
});

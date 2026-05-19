/**
 * D6 dartTool 어댑터 + R2/R5 동형성 단위 테스트 — 역검증(green 기대).
 *
 * 대상: src/lib/agent/harness/tools/dartTool.ts (ClientTool — langchain
 *       `tool()`, zod ^4 / R1), src/lib/agent/harness/tools/index.ts
 *       (HARNESS_TOOLS R5 격리 + HARNESS_TOOL_DISPLAY_NAMES FR-08 매핑).
 *
 * 실제 DART/LLM/네트워크 호출 0 (과금·비결정·IP 차단 회피 — CLAUDE.md
 * "Mock 금지"의 외부 그래프/HTTP 예외). `@/lib/dart`(searchCompany·
 * getCompanyInfo·getMultiYearFinancialSummary·getEmployees·
 * getMajorShareholders·getDividends·extractWorkforceSummary),
 * `@/lib/dart/disclosure`(getUnlistedCompanyDisclosureContext),
 * `@/lib/dart/context-formatter`(formatDartContext) 를 vi.mock 으로
 * 완전 격리한다 — @/lib/dart 가 jszip dynamic import 까지 끌고 오므로
 * 모듈 모킹이 동작·격리 양면에서 필수. 정답지는 모킹 반환의 자명한
 * 값(추측 0).
 *
 * tool() 객체 호출 인터페이스: ClientTool 은 `.invoke` 가 함수
 * (webSearchTool.test.ts L85 `typeof t.invoke === "function"` 실측 +
 * exampleTool 도 동형). 스키마 검증/실행을 거치도록 `.invoke({...})`
 * 로 호출한다(.func 직접 호출은 스키마 우회라 TC-45/zod 거부 검증 불가).
 *
 * TC 매핑:
 *  - TC-41.10 (UC-41-E1 식별 분기 결정 / FR-21) 식별실패·검색오류·빈입력
 *  - TC-41.16 (UC-41-E7 / FR-25·AC-27) 정성근거(webSearch)와 분리 — dartTool
 *               은 DART 정량 수집만(여기선 정성 부재가 dartTool throw 0 보장)
 *  - TC-41.15 (UC-41-E6 / FR-22·NFR-18) 상장사 재무 미공시 → 공시 폴백(graceful)
 *  - TC-42.9  (UC-42-EC2 / FR-22) 비상장사 공시 원문 주입 흐름
 *  - TC-41.3/41.5/42.2 (FR-24·AC-30) 8관점 perspective 결정 전달
 *  - TC-44.3/44.4 (UC-44 / FR-20·R2) HARNESS_TOOLS 미등록 = 토글 OFF 시
 *               메인 직접호출 0 (R5 격리 — 영향면 0 정적 단언)
 *  - TC-45.2/45.3/45.5 (UC-45 / FR-26·R5) 본문 누출 0 의 구조적 보장:
 *               dartTool 이 메인 도구 배열 밖(subagent namespace 전용)
 *  - TC-41.12 (UC-41-E3 / NFR-20·OPEN-1) rate-limit 등 throw → 안내 문자열
 *               흡수(graceful — D3 가 흡수, dartTool 은 throw 재노출 0)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  type Mock,
} from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// 모듈 모킹 — 실제 DART/LLM/네트워크 0. vi.mock 은 hoist 되므로 팩토리에서
// vi.fn() 을 직접 생성하고, 각 it 에서 mockResolvedValue/mockImplementation
// 으로 정답지(자명한 값)를 주입한다.
// ──────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/dart", () => ({
  searchCompany: vi.fn(),
  getCompanyInfo: vi.fn(),
  getMultiYearFinancialSummary: vi.fn(),
  getEmployees: vi.fn(),
  getMajorShareholders: vi.fn(),
  getDividends: vi.fn(),
  extractWorkforceSummary: vi.fn(),
}));

vi.mock("@/lib/dart/disclosure", () => ({
  getUnlistedCompanyDisclosureContext: vi.fn(),
}));

vi.mock("@/lib/dart/context-formatter", () => ({
  // formatDartContext 는 D5 순수 모듈 — 여기선 호출 인자(perspective·
  // financialSummaries·disclosureContext)만 검증하므로 결정적 마커 반환.
  formatDartContext: vi.fn(() => "[[FORMATTED_DART_CONTEXT]]"),
}));

import {
  searchCompany,
  getCompanyInfo,
  getMultiYearFinancialSummary,
  getEmployees,
  getMajorShareholders,
  getDividends,
  extractWorkforceSummary,
} from "@/lib/dart";
import { getUnlistedCompanyDisclosureContext } from "@/lib/dart/disclosure";
import { formatDartContext } from "@/lib/dart/context-formatter";
import {
  dartTool,
  dartToolDisplayName,
  dartToolDescription,
} from "@/lib/agent/harness/tools/dartTool";
import {
  HARNESS_TOOLS,
  HARNESS_TOOL_DISPLAY_NAMES,
} from "@/lib/agent/harness/tools";

const mSearch = searchCompany as unknown as Mock;
const mInfo = getCompanyInfo as unknown as Mock;
const mMulti = getMultiYearFinancialSummary as unknown as Mock;
const mEmployees = getEmployees as unknown as Mock;
const mShareholders = getMajorShareholders as unknown as Mock;
const mDividends = getDividends as unknown as Mock;
const mWorkforce = extractWorkforceSummary as unknown as Mock;
const mDisclosure = getUnlistedCompanyDisclosureContext as unknown as Mock;
const mFormat = formatDartContext as unknown as Mock;

/** ClientTool 실행 — 스키마 검증 경유(.invoke). dartApi/webSearchTool
 *  실측: ClientTool 은 `.invoke` 가 함수(webSearchTool.test.ts L85). */
function callTool(args: unknown): Promise<string> {
  return (dartTool as unknown as { invoke: (a: unknown) => Promise<string> }).invoke(
    args,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // 안전 기본값(각 케이스가 덮어씀) — 미설정 호출이 undefined 로 터지지 않게.
  mInfo.mockResolvedValue(null);
  mMulti.mockResolvedValue([]);
  mEmployees.mockResolvedValue([]);
  mShareholders.mockResolvedValue([]);
  mDividends.mockResolvedValue([]);
  mWorkforce.mockReturnValue({ year: 2024, totalEmployees: 0 });
  mDisclosure.mockResolvedValue({ success: false, context: "", error: "공시 없음" });
  mFormat.mockReturnValue("[[FORMATTED_DART_CONTEXT]]");
});

// ══════════════════════════════════════════════════════════════════════════
// 1. 기업 식별 (UC-41 Step2) — 식별실패/빈입력/검색오류/정상후보 [P0]
//    TC-41.10 (식별 분기 결정), TC-41.12 인접(검색 throw 흡수)
// ══════════════════════════════════════════════════════════════════════════
describe("기업 식별 (UC-41 Step2 / TC-41.10) — graceful 안내 문자열, throw 0", () => {
  it("corpName 공백 → '기업명이 비어' 안내 (searchCompany 미호출, throw 0)", async () => {
    const out = await callTool({ corpName: "   ", perspective: "comprehensive" });
    expect(out).toContain("기업명이 비어");
    // 빈 입력은 외부 호출 진입 전 차단 (불필요 호출 0)
    expect(mSearch).not.toHaveBeenCalled();
  });

  it("searchCompany [] (검색 0건) → '찾지 못했습니다' 안내 (throw 0)", async () => {
    mSearch.mockResolvedValue([]);
    const out = await callTool({
      corpName: "없는회사",
      perspective: "financial_health",
    });
    expect(out).toContain("찾지 못했습니다");
    expect(mSearch).toHaveBeenCalledWith("없는회사");
    // 식별 실패 시 후속 수집/직렬화 진입 0
    expect(mFormat).not.toHaveBeenCalled();
  });

  it("searchCompany throw (rate-limit/네트워크 — D3 흡수) → '검색 중 오류' 안내 (throw 재노출 0)", async () => {
    mSearch.mockRejectedValue(new Error("DART API 차단됨"));
    // dartTool 은 throw 를 안내 문자열로 흡수(NFR-18/TC-41.12 — graceful)
    await expect(
      callTool({ corpName: "삼성전자", perspective: "risk" }),
    ).resolves.toMatch(/검색 중 오류/);
  });

  it("정상 후보(상장사 stockCode) → 첫 후보 채택 + 헤더 'corp_code=' 포함, formatDartContext 호출", async () => {
    mSearch.mockResolvedValue([
      { corpCode: "00126380", corpName: "삼성전자(주)", stockCode: "005930" },
      { corpCode: "99999999", corpName: "삼성전자서비스", stockCode: "" },
    ]);
    mInfo.mockResolvedValue({
      corpCode: "00126380",
      corpName: "삼성전자(주)",
      stockCode: "005930",
    });
    mMulti.mockResolvedValue([{ year: 2023, revenue: 100 }]);

    const out = await callTool({
      corpName: "삼성전자",
      perspective: "comprehensive",
    });

    // 첫 후보(005930) 채택 — corpCode 가 헤더에 결정적으로 박힘
    expect(out).toContain("기업: 삼성전자(주) (corp_code=00126380");
    expect(out).toContain("종목 005930");
    // 압축 직렬화 경유(raw 미반환 — OPEN-5) + 마커 합성
    expect(mFormat).toHaveBeenCalledTimes(1);
    expect(out).toContain("[[FORMATTED_DART_CONTEXT]]");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. 상장사 흐름 — 다년 재무 + 인력 조건부 (UC-41 Step4) [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("상장사 흐름 (UC-41 Step4) — financialSummaries 전달 / workforce 조건부", () => {
  beforeEach(() => {
    mSearch.mockResolvedValue([
      { corpCode: "00126380", corpName: "삼성전자(주)", stockCode: "005930" },
    ]);
    mInfo.mockResolvedValue({
      corpCode: "00126380",
      corpName: "삼성전자(주)",
      stockCode: "005930",
    });
  });

  it("getMultiYearFinancialSummary(요약 2건) → formatDartContext 에 input.financialSummaries 그대로 전달", async () => {
    const summaries = [
      { year: 2022, revenue: 200 },
      { year: 2023, revenue: 250 },
    ];
    mMulti.mockResolvedValue(summaries);

    await callTool({ corpName: "삼성전자", perspective: "growth" });

    expect(mFormat).toHaveBeenCalledTimes(1);
    const passed = mFormat.mock.calls[0][0];
    expect(passed.financialSummaries).toEqual(summaries);
    // 상장사 경로 — corpCode/연도 인자로 다년 재무 조회 진입(5년)
    expect(mMulti).toHaveBeenCalledWith("00126380", 5);
  });

  it("getEmployees 비어있으면 input.workforceSummary 미설정 (extractWorkforceSummary 미호출)", async () => {
    mMulti.mockResolvedValue([{ year: 2023, revenue: 250 }]);
    mEmployees.mockResolvedValue([]); // 인력 데이터 없음

    await callTool({ corpName: "삼성전자", perspective: "comprehensive" });

    const passed = mFormat.mock.calls[0][0];
    expect(passed.workforceSummary).toBeUndefined();
    expect(mWorkforce).not.toHaveBeenCalled();
  });

  it("getEmployees 있으면 extractWorkforceSummary 결과가 input.workforceSummary 로 전달", async () => {
    mMulti.mockResolvedValue([{ year: 2023, revenue: 250 }]);
    mEmployees.mockResolvedValue([{ sm: "100", sexdstn: "남" }]);
    const wf = { year: 2024, totalEmployees: 100, regularCount: 90 };
    mWorkforce.mockReturnValue(wf);

    await callTool({ corpName: "삼성전자", perspective: "workforce" });

    const passed = mFormat.mock.calls[0][0];
    expect(mWorkforce).toHaveBeenCalledTimes(1);
    expect(passed.workforceSummary).toEqual(wf);
    // 주주·배당도 상장사 경로에서 input 으로 합류
    expect(passed.shareholders).toBeDefined();
    expect(passed.dividends).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. 비상장사 흐름 (UC-41 비상장 / TC-42.9) — 공시 원문 주입 [P0]
// ══════════════════════════════════════════════════════════════════════════
describe("비상장사 흐름 (UC-41 비상장 / TC-42.9) — disclosureContext 주입", () => {
  it("stockCode 없는 후보 + companyInfo stockCode 없음 → 공시 ctx(success:true) → input.disclosureContext 설정", async () => {
    mSearch.mockResolvedValue([
      { corpCode: "00999999", corpName: "비상장테크", stockCode: "" },
    ]);
    mInfo.mockResolvedValue({
      corpCode: "00999999",
      corpName: "비상장테크",
      // stockCode 없음 → 비상장 분기
    });
    mDisclosure.mockResolvedValue({
      success: true,
      context: "## 비상장 회사 공시 전문 ...",
      disclosureCount: 2,
    });

    const out = await callTool({
      corpName: "비상장테크",
      perspective: "governance",
    });

    expect(mDisclosure).toHaveBeenCalledTimes(1);
    const passed = mFormat.mock.calls[0][0];
    expect(passed.disclosureContext).toBe("## 비상장 회사 공시 전문 ...");
    // 비상장 헤더 마커
    expect(out).toContain("비상장");
    // 비상장은 다년 재무 조회 미진입 (재무제표 없음)
    expect(mMulti).not.toHaveBeenCalled();
  });

  it("공시 ctx success:false → '비상장...공시를 찾지 못했' 안내 (throw 0, formatDartContext 미호출)", async () => {
    mSearch.mockResolvedValue([
      { corpCode: "00999999", corpName: "비상장X", stockCode: "" },
    ]);
    mInfo.mockResolvedValue({ corpCode: "00999999", corpName: "비상장X" });
    mDisclosure.mockResolvedValue({
      success: false,
      context: "",
      error: "최근 공시가 없습니다.",
    });

    const out = await callTool({
      corpName: "비상장X",
      perspective: "comprehensive",
    });

    expect(out).toContain("비상장");
    expect(out).toMatch(/공시를 찾지 못했/);
    expect(out).toContain("최근 공시가 없습니다.");
    // 분석 입력 없음 → 압축 직렬화 미진입
    expect(mFormat).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. 상장사 재무 미공시 폴백 (UC-41-E6 / TC-41.15) [P1]
// ══════════════════════════════════════════════════════════════════════════
describe("상장사 재무 미공시 폴백 (UC-41-E6 / TC-41.15) — graceful", () => {
  it("stockCode 있으나 getMultiYearFinancialSummary [] → 공시 폴백 호출 + ctx 주입", async () => {
    mSearch.mockResolvedValue([
      { corpCode: "00126380", corpName: "신규상장(주)", stockCode: "111111" },
    ]);
    mInfo.mockResolvedValue({
      corpCode: "00126380",
      corpName: "신규상장(주)",
      stockCode: "111111",
    });
    mMulti.mockResolvedValue([]); // 상장사이나 재무 미공시(신규 상장)
    mDisclosure.mockResolvedValue({
      success: true,
      context: "## 신규상장 공시 전문 ...",
      disclosureCount: 1,
    });

    await callTool({ corpName: "신규상장", perspective: "financial_health" });

    // UC-41-E6 흐름: 재무 [] 면 비상장과 같은 공시 컨텍스트 폴백
    expect(mDisclosure).toHaveBeenCalledTimes(1);
    const passed = mFormat.mock.calls[0][0];
    expect(passed.financialSummaries).toEqual([]);
    expect(passed.disclosureContext).toBe("## 신규상장 공시 전문 ...");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. 8관점 perspective 전달 + zod enum 스키마 거부 (FR-24 / AC-30) [P0]
//    TC-41.3 / TC-41.5 / TC-42.2 — 관점 결정 전달
// ══════════════════════════════════════════════════════════════════════════
describe("8관점 perspective 결정 전달 (FR-24·AC-30 / TC-41.3·41.5·42.2)", () => {
  beforeEach(() => {
    mSearch.mockResolvedValue([
      { corpCode: "00126380", corpName: "삼성전자(주)", stockCode: "005930" },
    ]);
    mInfo.mockResolvedValue({
      corpCode: "00126380",
      corpName: "삼성전자(주)",
      stockCode: "005930",
    });
    mMulti.mockResolvedValue([{ year: 2023, revenue: 1 }]);
  });

  it.each([
    "financial_health",
    "growth",
    "profitability",
    "valuation",
    "governance",
    "risk",
    "workforce",
    "comprehensive",
  ])("perspective='%s' → formatDartContext 에 그대로 전달", async (p) => {
    await callTool({ corpName: "삼성전자", perspective: p });
    const passed = mFormat.mock.calls[0][0];
    expect(passed.perspective).toBe(p);
  });

  it("잘못된 perspective(스키마 enum 외) → tool 스키마 검증 거부(.invoke reject, searchCompany 미호출)", async () => {
    // zod .enum(8종) 스키마 — 'invalid_persp' 는 파싱 거부.
    // .invoke 는 스키마 parse 를 거치므로 reject (throw 가 아닌 안내 문자열
    // 경로와 구분 — 식별 진입 전 스키마 단계에서 차단).
    await expect(
      callTool({ corpName: "삼성전자", perspective: "invalid_persp" }),
    ).rejects.toBeTruthy();
    expect(mSearch).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. R5 격리 — HARNESS_TOOLS 미등록 + DISPLAY_NAMES 매핑 존재 [P0]
//    TC-44.3/44.4 (토글 OFF 영향면 0) + TC-45.2/45.3/45.5 (본문 누출 0 구조 보장)
// ══════════════════════════════════════════════════════════════════════════
describe("R5 격리 (TC-44.3·44.4·45.2·45.3·45.5) — 메인 도구 배열 미등록 + 표시명 매핑", () => {
  /** ClientTool=.name / ServerTool=.type 으로 도구 식별(probe note §6-A). */
  const toolNames = HARNESS_TOOLS.map(
    (t) => (t as Record<string, unknown>).name ?? (t as Record<string, unknown>).type,
  );

  it("HARNESS_TOOLS 에 dart_company_data/dartTool 0건 (메인 직접호출 불가 — R5)", () => {
    expect(toolNames).not.toContain("dart_company_data");
    expect(HARNESS_TOOLS).not.toContain(dartTool);
  });

  it("HARNESS_TOOLS 는 web_search·current_time 만 (DART 미진입 — TC-45.2/45.3 구조 보장)", () => {
    // 메인 어시스턴트 노드가 DART 를 직접 호출할 표면이 없어야 본문 누출 0
    // (chunkFilter 가 아니라 도구 배열 격리로 R5/FR-26 을 구조적으로 보장).
    expect(toolNames.sort()).toEqual(["current_time", "web_search"]);
  });

  it("HARNESS_TOOL_DISPLAY_NAMES 에 dart_company_data 표시명 매핑 존재 (FR-08 — 사고 패널)", () => {
    const entry = HARNESS_TOOL_DISPLAY_NAMES.find(
      (e) => e.name === "dart_company_data",
    );
    expect(entry).toBeDefined();
    expect(entry!.displayName).toBe(dartToolDisplayName);
    expect(entry!.displayName).toBe("DART 기업데이터");
    // ServerTool 류와 구조 호환 — 매핑에 description 동봉(introspect 역결합 회피)
    expect(entry!.description).toBe(dartToolDescription);
  });

  it("dartToolDescription 에 raw 미반환 + subagent 전용 취지 명시 (R5/OPEN-5 의도 문서화)", () => {
    expect(dartToolDescription).toContain("raw JSON 미반환");
    expect(dartToolDescription).toContain("subagent");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 7. R2 동형성 — dartTool 추가가 메인 도구 배열을 불변으로 둠 (정적 단언) [P0]
//    TC-44.4 (레지스트리 단일 지점, 다른 모듈 diff 0)
// ══════════════════════════════════════════════════════════════════════════
describe("R2 동형성 (TC-44.4) — 메인 HARNESS_TOOLS 구성 불변 단언", () => {
  it("HARNESS_TOOLS 길이 = 2 (current_time + web_search — dartTool 추가 전과 동일)", () => {
    // R2: 새 요소(dartTool) 도입이 메인 도구 배열을 흩뜨리지 않음.
    // dartTool 은 별 경로(subagent tools:[dartTool])로만 주입되므로
    // 메인 배열 길이/구성은 dartTool 추가 전(2개)과 정확히 같아야 한다.
    expect(HARNESS_TOOLS).toHaveLength(2);
  });

  it("HARNESS_TOOLS .map(name|type) 에 'dart' 부분 일치 0 (메인 배열 DART 미포함)", () => {
    const ids = HARNESS_TOOLS.map(
      (t) =>
        String(
          (t as Record<string, unknown>).name ??
            (t as Record<string, unknown>).type ??
            "",
        ),
    );
    expect(ids.some((n) => n.toLowerCase().includes("dart"))).toBe(false);
  });

  it("DISPLAY_NAMES 매핑은 dart 항목 1건 추가됨 (FR-08 — 표시 전용, 도구 배열과 분리)", () => {
    // 영향면 분리 단언: 표시명 배열에는 1건 추가(사고 패널 한글),
    // 실행 도구 배열(HARNESS_TOOLS)에는 0건 — 두 배열이 독립.
    const dartDisplay = HARNESS_TOOL_DISPLAY_NAMES.filter(
      (e) => e.name === "dart_company_data",
    );
    expect(dartDisplay).toHaveLength(1);
    const dartInExec = HARNESS_TOOLS.filter(
      (t) => (t as Record<string, unknown>).name === "dart_company_data",
    );
    expect(dartInExec).toHaveLength(0);
  });
});

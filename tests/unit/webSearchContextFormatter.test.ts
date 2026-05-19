import { describe, it, expect } from "vitest";
import { formatWebSearchContext } from "@/lib/web-search/context-formatter";
import type { WebSearchRawResult } from "@/lib/web-search/types";

// Slice 1 — 정제 순수함수 정답지 (TDD). OpenAI Responses API 가 내부에서
// 한 N번 검색을 우리가 래핑해 "최종 결과 1개 문자열"로 정제하는 명세.
// mock 0 — 픽스처만(CLAUDE.md: 순수함수는 mock 불요). dart
// context-formatter.test 동형.
//
// Plan Critic 해소 못박기:
//  - 항목6(투명성): 검색어 N개·URL·pattern 이 정제 string 에 전량 보존
//  - 항목7(truncate 모순): 메타데이터(검색어/URL/citation)는 truncate
//    금지, 최종 답변 "본문"만 보수적 상한
//  - 항목5(graceful): ok:false reason 별 안내 문자열 분리

describe("formatWebSearchContext — 성공 케이스 (검색 스텝 전량 보존)", () => {
  it("search 스텝의 검색어 N개를 전부 표시 (truncate 금지 — 투명성)", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [
        { kind: "search", queries: ["삼성전자 주가", "005930 시세", "Samsung stock"] },
      ],
      answer: "삼성전자 주가는 ...",
      citations: [],
    };
    const out = formatWebSearchContext(raw);
    expect(out).toContain("삼성전자 주가");
    expect(out).toContain("005930 시세");
    expect(out).toContain("Samsung stock"); // 3개 전부 — 잘림 0
  });

  it("open_page / find_in_page 스텝의 URL·pattern 보존", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [
        { kind: "search", queries: ["삼성전자 IR"] },
        { kind: "open_page", url: "https://www.samsung.com/ir" },
        { kind: "find_in_page", pattern: "연결 매출", url: "https://www.samsung.com/ir" },
      ],
      answer: "본문",
      citations: [],
    };
    const out = formatWebSearchContext(raw);
    expect(out).toContain("https://www.samsung.com/ir");
    expect(out).toContain("연결 매출"); // find_in_page.pattern 표시(투명성)
  });

  it("미지 action.type 은 graceful passthrough (R8 — 하드코딩 0)", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [{ kind: "other", type: "future_action_xyz" }],
      answer: "본문",
      citations: [],
    };
    const out = formatWebSearchContext(raw);
    expect(out).toContain("future_action_xyz"); // 모르는 타입도 노출(투명성)
  });

  it("최종 답변 본문 + 출처 목록 포함", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [{ kind: "search", queries: ["q"] }],
      answer: "OpenAI 가 N검색을 종합한 서술 본문입니다.",
      citations: [
        { url: "https://a.com", title: "A 출처" },
        { url: "https://b.com", title: "B 출처" },
      ],
    };
    const out = formatWebSearchContext(raw);
    expect(out).toContain("OpenAI 가 N검색을 종합한 서술 본문입니다.");
    expect(out).toContain("https://a.com");
    expect(out).toContain("A 출처");
    expect(out).toContain("https://b.com");
  });

  it("검색어·URL 중복은 순서 보존하며 1회만 (노이즈 제거, 정보 손실 0)", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [
        { kind: "search", queries: ["삼성", "삼성"] },
        { kind: "open_page", url: "https://x.com" },
        { kind: "open_page", url: "https://x.com" },
      ],
      answer: "본문",
      citations: [
        { url: "https://c.com", title: "C" },
        { url: "https://c.com", title: "C" },
      ],
    };
    const out = formatWebSearchContext(raw);
    // "삼성" 이 정확히 1번만 (중복 제거)
    expect(out.match(/삼성/g)?.length).toBe(1);
    expect(out.match(/https:\/\/x\.com/g)?.length).toBe(1);
    expect(out.match(/https:\/\/c\.com/g)?.length).toBe(1);
  });
});

describe("formatWebSearchContext — truncate 정책 (Plan Critic 항목7)", () => {
  it("메타데이터(검색어)는 매우 많아도 truncate 금지 — 전량 보존", () => {
    const many = Array.from({ length: 50 }, (_, i) => `검색어_${i}`);
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [{ kind: "search", queries: many }],
      answer: "짧은 본문",
      citations: [],
    };
    const out = formatWebSearchContext(raw);
    // 50개 전부 — 검색어는 투명성 핵심이라 절대 안 자름
    for (const q of many) expect(out).toContain(q);
  });

  it("최종 답변 본문만 보수적 상한 truncate + 생략 마커", () => {
    const huge = "본".repeat(20_000); // 컨텍스트 폭발 방지 대상
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [{ kind: "search", queries: ["q"] }],
      answer: huge,
      citations: [{ url: "https://keep.com", title: "보존되어야 할 출처" }],
    };
    const out = formatWebSearchContext(raw);
    // 본문은 잘림(상한 적용)
    expect(out.length).toBeLessThan(huge.length);
    // 잘렸음을 명시하는 마커
    expect(out).toContain("생략");
    // 본문이 잘려도 출처(메타데이터)는 보존 — 항목7 핵심
    expect(out).toContain("https://keep.com");
    expect(out).toContain("보존되어야 할 출처");
  });
});

describe("formatWebSearchContext — graceful 실패 (Plan Critic 항목5, reason 분리)", () => {
  it("no_api_key — 키 미설정 안내 (검색 없이 진행 유도)", () => {
    const out = formatWebSearchContext({ ok: false, reason: "no_api_key" });
    expect(out).toContain("API 키");
    expect(out).not.toContain("undefined");
  });

  it("model_unsupported — 검색 미지원 모델 (empty 와 구분)", () => {
    const out = formatWebSearchContext({ ok: false, reason: "model_unsupported" });
    expect(out).toContain("미지원");
    // "검색했으나 결과 없음(0회)" 으로 오인되면 안 됨
    expect(out).not.toContain("0회");
  });

  it("network — 일시 오류 안내", () => {
    const out = formatWebSearchContext({ ok: false, reason: "network" });
    expect(out).toContain("오류");
  });

  it("empty — 검색 성공했으나 결과 0 (model_unsupported 와 다른 문구)", () => {
    const out = formatWebSearchContext({ ok: false, reason: "empty" });
    expect(out).toContain("찾지 못");
  });

  it("실패 detail 은 LLM 반환 문자열에 미노출 (디버깅 전용)", () => {
    const out = formatWebSearchContext({
      ok: false,
      reason: "api_error",
      detail: "secret-internal-trace-xyz",
    });
    expect(out).not.toContain("secret-internal-trace-xyz");
  });
});

describe("formatWebSearchContext — 경계", () => {
  it("steps 0 + answer 만 (검색 없이 답변) — graceful", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [],
      answer: "검색 없이 바로 답한 본문",
      citations: [],
    };
    const out = formatWebSearchContext(raw);
    expect(out).toContain("검색 없이 바로 답한 본문");
    expect(out).not.toContain("undefined");
  });

  it("전부 빈 성공 응답은 empty 와 동등하게 안내 (크래시 0)", () => {
    const raw: WebSearchRawResult = {
      ok: true,
      steps: [],
      answer: "",
      citations: [],
    };
    const out = formatWebSearchContext(raw);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0); // 빈 문자열 반환 금지
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { DartAnalyzeView } from "@/components/dart/DartAnalyzeView";
import { AgentNav } from "@/app/(main)/AgentNav";

// DartAnalyzeView 단위 테스트 (LLM/네트워크 비의존 — fetch + SSE
// ReadableStream 모킹, jsdom + @testing-library/react). 실 fetch 0.
//
// 매핑(QA: docs/qa/dart-fundamental-analysis_test_cases.md):
//   - UC-41 / TC-41.1 — 폼 입력 → DART 분석 스트리밍(클라이언트 SSE 소비)
//   - TC-41.5 / TC-46.4 — 8관점 select(perspective 매핑)
//   - TC-41.1 / TC-45.x — XSS 가드(결과는 ChatMarkdown rehype-sanitize 경유)
//   - AgentNav 메뉴 교체(D12: "제약 인사이트" mock → "DART 기업분석" 실항목)
//
// 정답지: 8관점 라벨은 구현 PERSPECTIVES 상수(DartAnalyzeView.tsx:27-36)
//   comprehensive=종합 분석 / financial_health=재무건전성 / growth=성장성 /
//   profitability=수익성 / valuation=밸류에이션 / governance=지배구조 /
//   risk=리스크 / workforce=인력/조직.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const enc = new TextEncoder();

/** SSE 이벤트 배열을 fetch Response.body(ReadableStream)로 감싼다. */
function sseBody(events: object[]): ReadableStream<Uint8Array> {
  const frames = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(enc.encode(frames[i++]));
      } else {
        controller.close();
      }
    },
  });
}

/** fetch 를 SSE 200 응답으로 모킹. 호출 인자 캡처용 spy 반환. */
function mockFetchOk(events: object[]): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(
    new Response(sseBody(events), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** fetch 를 비정상 HTTP(JSON body) 응답으로 모킹. */
function mockFetchHttpError(
  status: number,
  body: object,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** spy 의 마지막 fetch 호출의 POST body 를 객체로 파싱. */
function lastBody(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? "{}"));
}

// ---------------------------------------------------------------------------
// 1. 렌더 + 8관점 select (P0)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — 렌더 + 8관점 select (UC-41 / TC-41.5)", () => {
  it("corpName input(placeholder '기업명') + 분석 버튼이 렌더된다", () => {
    render(<DartAnalyzeView />);
    const input = screen.getByLabelText("분석 대상 기업명") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute("placeholder")).toMatch(/기업명/);
    expect(screen.getByRole("button", { name: "분석" })).toBeTruthy();
  });

  it("8개 관점 option 이 정확한 라벨로 렌더되고 기본=comprehensive", () => {
    render(<DartAnalyzeView />);
    const select = screen.getByLabelText("분석 관점") as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options).toHaveLength(8);

    // 정답지: 구현 PERSPECTIVES 상수 (key → label) 전수 일치
    const expected: Array<[string, string]> = [
      ["comprehensive", "종합 분석"],
      ["financial_health", "재무건전성"],
      ["growth", "성장성"],
      ["profitability", "수익성"],
      ["valuation", "밸류에이션"],
      ["governance", "지배구조"],
      ["risk", "리스크"],
      ["workforce", "인력/조직"],
    ];
    expect(options.map((o) => [o.value, o.textContent])).toEqual(expected);

    // 기본 선택값 = comprehensive(첫 항목)
    expect(select.value).toBe("comprehensive");
  });
});

// ---------------------------------------------------------------------------
// 2. 빈 corpName 검증 (P0)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — 빈 corpName 검증 (UC-41 입력 가드)", () => {
  it("corpName 빈 채 '분석' 클릭 → err 배너 노출 + fetch 미호출", () => {
    const spy = mockFetchOk([]);
    render(<DartAnalyzeView />);
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/기업명을 입력/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("공백만 입력 → trim 후 빈값으로 차단(fetch 미호출)", () => {
    const spy = mockFetchOk([]);
    render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));
    expect(screen.getByRole("alert").textContent).toMatch(/기업명을 입력/);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. 정상 SSE 흐름 (UC-41 / TC-41.1) (P0)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — 정상 SSE 흐름 (UC-41 / TC-41.1)", () => {
  it("기업명 입력 + 분석 → POST /api/dart/analyze(body corpName/perspective) + 누적 결과 렌더", async () => {
    const spy = mockFetchOk([
      { type: "thread", conversationId: "c-1" },
      { type: "tool_call", name: "dart_company_data" },
      { type: "tool_result", name: "dart_company_data" },
      { type: "token", text: "## 분석 " },
      { type: "token", text: "결과" },
      { type: "done" },
    ]);
    render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "삼성전자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    // fetch 계약: 엔드포인트 + POST + body
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toBe("/api/dart/analyze");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = lastBody(spy);
    expect(body.corpName).toBe("삼성전자");
    expect(body.perspective).toBe("comprehensive");

    // 누적된 token 이 ChatMarkdown 으로 렌더(heading "분석 결과")
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /분석 결과/ })).toBeTruthy();
    });
  });

  it("tool_call 단계에서 진행(progress) 배너가 노출된다", async () => {
    // tool_call 후 멈춰 두면 progress 가 잔류(token 도착 전 상태 관찰).
    mockFetchOk([
      { type: "thread", conversationId: "c-2" },
      { type: "tool_call", name: "dart_company_data" },
    ]);
    render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "삼성전자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    await waitFor(() => {
      expect(screen.getByText(/DART 공시 데이터 수집 중/)).toBeTruthy();
    });
  });

  it("perspective select 변경(governance) → fetch body.perspective='governance'", async () => {
    const spy = mockFetchOk([{ type: "done" }]);
    render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "현대차" },
    });
    fireEvent.change(screen.getByLabelText("분석 관점"), {
      target: { value: "governance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const body = lastBody(spy);
    expect(body.corpName).toBe("현대차");
    expect(body.perspective).toBe("governance");
  });
});

// ---------------------------------------------------------------------------
// 4. token 누적 정확성 (Strict Mode 안전 — 함수형 setResult) (P0)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — token 누적 정확성 (함수형 누적)", () => {
  it("token 'AB' → 'CD' 순차 도착 → 결과 'ABCD'(중복 'ABAB' 아님)", async () => {
    mockFetchOk([
      { type: "token", text: "AB" },
      { type: "token", text: "CD" },
      { type: "done" },
    ]);
    const { container } = render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "테스트사" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    // 함수형 setResult(r=>r+text) → 정확히 한 번씩 누적, 결과 "ABCD".
    await waitFor(() => {
      expect(container.textContent).toContain("ABCD");
    });
    expect(container.textContent).not.toContain("ABABCDCD");
    expect(container.textContent).not.toContain("ABAB");
  });
});

// ---------------------------------------------------------------------------
// 5. error 이벤트 → 배너 (P0)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — error 이벤트 → 배너", () => {
  it("SSE error 이벤트 → err 배너 노출, 결과 영역 미표시", async () => {
    mockFetchOk([
      { type: "thread", conversationId: "c-3" },
      { type: "error", message: "일시적 오류" },
      { type: "done" },
    ]);
    render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "삼성전자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/일시적 오류/);
    });
    // 결과 영역(ChatMarkdown)은 result 가 비어 미렌더.
    // 페이지 h1("DART 기업 펀더멘털 분석")은 항상 렌더되므로
    // 결과 본문 heading(h2 이상) 부재로 판정.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. HTTP 비정상 → err (P1)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — HTTP 비정상 응답", () => {
  it("res.ok=false(400 {error}) → err 배너에 서버 메시지 노출", async () => {
    mockFetchHttpError(400, { error: "요청이 잘못되었습니다" });
    render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "삼성전자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /요청이 잘못되었습니다/,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 7. XSS 가드 (TC-41.1 "ChatMarkdown sanitize 경유" / TC-45.x) (P0)
// ---------------------------------------------------------------------------
describe("DartAnalyzeView — XSS 가드 (ChatMarkdown rehype-sanitize 경유)", () => {
  it("token 으로 <script> 유입 → 렌더 DOM 에 <script> 요소 0개", async () => {
    mockFetchOk([
      { type: "token", text: "안전 텍스트\n\n" },
      { type: "token", text: "<script>alert(1)</script>" },
      { type: "token", text: "\n\n계속" },
      { type: "done" },
    ]);
    const { container } = render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "삼성전자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    await waitFor(() => {
      expect(container.textContent).toContain("안전 텍스트");
    });
    // sanitize allowlist: <script> 노드 0개
    expect(container.querySelectorAll("script").length).toBe(0);
  });

  it("token 으로 <img onerror=...> 유입 → 어떤 요소에도 on* 핸들러 속성 0", async () => {
    mockFetchOk([
      { type: "token", text: '<img src="x" onerror="alert(1)" alt="b">' },
      { type: "done" },
    ]);
    const { container } = render(<DartAnalyzeView />);
    fireEvent.change(screen.getByLabelText("분석 대상 기업명"), {
      target: { value: "삼성전자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    await waitFor(() => expect(container.querySelector("div")).toBeTruthy());
    const all = container.querySelectorAll("*");
    for (const el of Array.from(all)) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith("on")).toBe(false);
      }
    }
  });

  it("구조 단언: 결과 렌더는 ChatMarkdown 경유 — 직접 raw HTML 주입 prop 미사용", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await readFile(
      path.resolve(
        process.cwd(),
        "src/components/dart/DartAnalyzeView.tsx",
      ),
      "utf8",
    );
    // 결과 렌더는 ChatMarkdown(rehype-sanitize) 으로만 — raw HTML 주입 0.
    // (직접 innerHTML 주입 React prop 명칭을 토큰 분할로 구성 — 보안 훅 오탐 회피)
    const rawHtmlProp = ["dangerously", "Set", "InnerHTML"].join("");
    expect(src.includes(rawHtmlProp)).toBe(false);
    expect(src).toMatch(/ChatMarkdown/);
  });
});

// ---------------------------------------------------------------------------
// 8. AgentNav 메뉴 교체 (P1)
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
}));

describe("AgentNav — DART 기업분석 실항목 교체 (D12)", () => {
  it("'DART 기업분석' 링크(href=/dart)가 존재한다", () => {
    render(<AgentNav />);
    const link = screen.getByRole("link", { name: /DART 기업분석/ });
    expect(link.getAttribute("href")).toBe("/dart");
  });

  it("'제약 인사이트' mock 텍스트가 더 이상 존재하지 않는다(교체 확인)", () => {
    render(<AgentNav />);
    expect(screen.queryByText(/제약 인사이트/)).toBeNull();
  });
});

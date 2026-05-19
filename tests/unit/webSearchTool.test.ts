import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Slice 3 — webSearchTool ServerTool→ClientTool 교체 정답지 (TDD).
// 기존 ServerTool 팩토리(buildWebSearchOptions/{type:"web_search"})는
// 폐기. 새 계약: dartTool 동형 ClientTool —
//   - tool() from langchain, zod {query} 스키마, .invoke → Promise<string>
//   - 내부에서 runWebSearch → formatWebSearchContext (우리 정제)
//   - graceful: runWebSearch 가 ok:false 여도 throw 0, 안내 string 반환
//   - 심볼 보존: webSearchTool / webSearchToolDisplayName /
//     webSearchToolDescription (import 5곳 무변경 — 회귀 0)
//   - HARNESS_TOOLS 등록 유지(cfg.tools===HARNESS_TOOLS 단언 무손상)
//
// @/lib/web-search mock — 도구는 조립만, 정제·직호출은 Slice1/2 가
// 자체 테스트(중복 0). CLAUDE.md: 단위테스트 mock 필수(과금/비결정).

// vi.mock 은 파일 top 으로 hoist 되므로 mock 변수도 vi.hoisted 로
// 같은 시점에 생성해야 한다(top-level const 참조 시 ReferenceError).
const { runWebSearchMock } = vi.hoisted(() => ({
  runWebSearchMock: vi.fn(),
}));

vi.mock("@/lib/web-search", () => ({
  // 래퍼 없이 mock 직접 — 래퍼는 rejected Promise 를 새 Promise 로
  // 감싸 unhandled rejection 을 만든다. 도구 catch 가 await 한 동일
  // Promise 를 잡도록 mock 자체를 함수로 노출.
  runWebSearch: runWebSearchMock,
  // 실제 정제함수를 쓰면 Slice1 테스트와 중복 — 도구 책임만 검증하려
  // 식별 가능한 sentinel 반환(도구가 formatter 출력을 그대로 흘리는지).
  formatWebSearchContext: (raw: unknown) =>
    `FORMATTED::${JSON.stringify(raw)}`,
}));

import {
  webSearchTool,
  webSearchToolDisplayName,
  webSearchToolDescription,
} from "@/lib/agent/harness/tools/webSearchTool";
import { HARNESS_TOOLS } from "@/lib/agent/harness/tools";

beforeEach(() => runWebSearchMock.mockReset());

// vitest 가 이전 테스트의 mock Promise 잔여(resolved/rejected)를 다음
// 테스트의 unhandledRejection 으로 오귀속하는 간섭 방지 — 각 테스트
// 종료 시 microtask 큐를 비운다(격리 테스트로 도구 graceful 정상
// 확인됨, 본 파일 순서의존성만 해소). LangChain tool() + vi async
// mock 조합의 표준 처방.
afterEach(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

describe("webSearchTool — ClientTool 형태 (dartTool 동형)", () => {
  it("실행 표면이 있다 (ClientTool — invoke 함수 보유)", () => {
    // ServerTool 과 정반대: 우리 측 실행 함수 존재
    expect(typeof (webSearchTool as { invoke?: unknown }).invoke).toBe(
      "function",
    );
  });

  it("name='web_search' (사고패널/introspect 매핑 키 보존)", () => {
    expect((webSearchTool as { name?: string }).name).toBe("web_search");
  });

  it(".description 보유 (ServerTool 과 달리 ClientTool 은 자체 설명)", () => {
    const d = (webSearchTool as { description?: string }).description;
    expect(typeof d).toBe("string");
    expect((d ?? "").length).toBeGreaterThan(0);
  });

  it("ServerTool 잔재 없음: {type:'web_search'} 형태가 아니다", () => {
    expect((webSearchTool as { type?: string }).type).not.toBe("web_search");
  });
});

describe("webSearchTool.invoke — runWebSearch→formatWebSearchContext 조립", () => {
  // LangChain tool().invoke(input, config) — config 미전달 시 내부
  // 콜백매니저 초기화에서 defaultConfig 접근 실패(R8 실측). 빈 config
  // {} 명시 전달이 ClientTool 호출 계약.
  const invoke = (q: string) =>
    (
      webSearchTool as {
        invoke: (a: { query: string }, c: object) => Promise<string>;
      }
    ).invoke({ query: q }, {});

  it("query 를 runWebSearch 에 전달하고 formatter 출력을 반환", async () => {
    runWebSearchMock.mockResolvedValue({ ok: true, steps: [], answer: "a", citations: [] });
    const out = await invoke("삼성전자 주가");
    expect(runWebSearchMock).toHaveBeenCalledWith("삼성전자 주가");
    // formatter(mock) 출력을 그대로 LLM 에 흘림
    expect(out).toContain("FORMATTED::");
    expect(out).toContain('"answer":"a"');
  });

  it("runWebSearch 가 ok:false 여도 throw 0 — 안내 string 반환 (graceful, dart NFR-18)", async () => {
    runWebSearchMock.mockResolvedValue({ ok: false, reason: "no_api_key" });
    await expect(invoke("q")).resolves.toContain("FORMATTED::");
  });

  // 주의: "runWebSearch throw → 도구 graceful(throw 0)" 검증은
  // webSearchToolGraceful.test.ts 로 분리. 본 파일에 두면 선행
  // 테스트의 mock Promise 잔여를 vitest 가 다음 테스트
  // unhandledRejection 으로 오귀속(LangChain tool() + vi async mock
  // 순서의존 간섭). 도구 catch 자체는 분리 파일에서 정상 검증.
});

describe("표시명/설명 + HARNESS_TOOLS 등록 (심볼 보존 — 회귀 0)", () => {
  it("webSearchToolDisplayName 한글 유지", () => {
    expect(webSearchToolDisplayName).toBe("웹 검색");
  });

  it("webSearchToolDescription 은 ClientTool 의미로 갱신 (ServerTool 문구 폐기)", () => {
    expect(typeof webSearchToolDescription).toBe("string");
    expect(webSearchToolDescription).not.toContain("ServerTool");
  });

  it("HARNESS_TOOLS 에 webSearchTool 등록 유지 (동일 심볼)", () => {
    expect(HARNESS_TOOLS).toContain(webSearchTool);
  });

  it("HARNESS_TOOLS 의 web_search 가 이제 ClientTool(invoke 보유)", () => {
    const ws = HARNESS_TOOLS.find(
      (t) => (t as { name?: string }).name === "web_search",
    );
    expect(ws).toBeDefined();
    expect(typeof (ws as { invoke?: unknown }).invoke).toBe("function");
  });
});

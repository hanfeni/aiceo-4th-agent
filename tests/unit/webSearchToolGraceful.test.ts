import { describe, it, expect, vi } from "vitest";

// Slice 3 — webSearchTool graceful 격리 검증 (단독 파일).
//
// "runWebSearch 가 예기치 못한 throw 를 해도 도구는 throw 0, 안내
// 문자열을 반환한다(NFR-18 — 에이전트 진행 보장, 내부 에러 LLM
// 미노출)"는 도구의 핵심 안전 계약이다.
//
// 이 검증을 webSearchTool.test.ts 에 두면 선행 테스트의 mock Promise
// 잔여를 vitest 가 다음 테스트의 unhandledRejection 으로 오귀속한다
// (LangChain tool() + vi async mock 순서의존 간섭 — mockReset/
// mockClear/동기throw/microtask flush 4처방 모두 무효 확인). 선행
// 테스트·beforeEach 가 없는 단독 파일에서는 정상 통과하므로 분리한다.
// 도구 코드는 무수정 — 인프라 격리 목적.

const { runWebSearchMock } = vi.hoisted(() => ({
  runWebSearchMock: vi.fn(),
}));

vi.mock("@/lib/web-search", () => ({
  runWebSearch: runWebSearchMock,
  formatWebSearchContext: (raw: unknown) =>
    `FORMATTED::${JSON.stringify(raw)}`,
}));

import { webSearchTool } from "@/lib/agent/harness/tools/webSearchTool";

describe("webSearchTool — graceful (runWebSearch throw 흡수)", () => {
  it("runWebSearch 가 throw 해도 도구는 throw 0 (안내 string, 에러 미노출)", async () => {
    runWebSearchMock.mockImplementation(() => {
      throw new Error("unexpected boom");
    });
    const out = await (
      webSearchTool as {
        invoke: (a: { query: string }, c: object) => Promise<string>;
      }
    ).invoke({ query: "q" }, {});
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    // catch 분기 = formatWebSearchContext({ok:false,reason:"api_error"})
    expect(out).toContain("FORMATTED::");
    expect(out).toContain('"reason":"api_error"');
    // 내부 에러 메시지는 LLM 에 노출 금지
    expect(out).not.toContain("unexpected boom");
  });
});

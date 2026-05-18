import { describe, it, expect } from "vitest";

// webSearchTool.ts 단위 테스트 — ServerTool 팩토리 순수성 검증.
//
// 핵심 계약:
//   - buildWebSearchOptions(): 순수 함수. LLM·네트워크 호출 0
//     (tools.webSearch() 는 선언 객체만 생성 — 실행 주체는 OpenAI 서버).
//     → 실제 @langchain/openai 로 테스트해도 과금·비결정성 0
//       (registry.test.ts 같은 ChatOpenAI mock 불필요).
//   - webSearchTool: OpenAI Responses API 가 인식하는 ServerTool 형태.
//     필터 미지정 시 런타임 `{ type: "web_search" }` (probe note §6-A).
//   - HARNESS_TOOLS 등록 + 이종(ClientTool|ServerTool) 혼합 계약 유지.
//
// CLAUDE.md Mock 금지 절: 레지스트리·필터·파서는 LLM 분리 순수 테스트.

import {
  buildWebSearchOptions,
  webSearchTool,
} from "@/lib/agent/harness/tools/webSearchTool";
import { HARNESS_TOOLS } from "@/lib/agent/harness/tools";

describe("buildWebSearchOptions (순수 함수)", () => {
  it("호출 결과가 동일하다 (결정적·부수효과 0)", () => {
    expect(buildWebSearchOptions()).toEqual(buildWebSearchOptions());
  });

  it("WebSearchOptions 객체를 반환한다 (배열·null 아님)", () => {
    const opts = buildWebSearchOptions();
    expect(opts).toBeTypeOf("object");
    expect(opts).not.toBeNull();
    expect(Array.isArray(opts)).toBe(false);
  });

  it("기본값은 빈 옵션 — OpenAI 기본(필터 없음·medium) 동작 (TODO(USER) 미정 상태)", () => {
    // 운영 정책(buildWebSearchOptions TODO)이 채워지면 이 단언을 갱신한다.
    expect(buildWebSearchOptions()).toEqual({});
  });
});

describe("webSearchTool (ServerTool 형태)", () => {
  it("OpenAI Responses API 가 인식하는 web_search ServerTool 이다", () => {
    // 필터 미지정 시 런타임 = { type: "web_search" } (probe note §6-A 실측).
    expect(webSearchTool).toMatchObject({ type: "web_search" });
  });

  it("실행 함수가 없다 (provider 측 실행 — ClientTool 아님)", () => {
    // StructuredTool 의 invoke/func 같은 클라이언트 실행 표면이 없어야 한다.
    const t = webSearchTool as Record<string, unknown>;
    expect(typeof t.invoke).not.toBe("function");
    expect(typeof t.func).not.toBe("function");
  });
});

describe("HARNESS_TOOLS 등록 (FR-08 / 이종 혼합 계약)", () => {
  it("webSearchTool 이 배열에 등록되어 있다", () => {
    expect(HARNESS_TOOLS).toContain(webSearchTool);
  });

  it("ClientTool(currentTimeTool)과 ServerTool(webSearch) 이 공존한다", () => {
    // 적어도 ServerTool 1개 + 실행표면 있는 도구 1개가 섞여 있어야 한다.
    const hasServerTool = HARNESS_TOOLS.some(
      (t) => (t as Record<string, unknown>).type === "web_search",
    );
    const hasClientTool = HARNESS_TOOLS.some(
      (t) => typeof (t as Record<string, unknown>).invoke === "function",
    );
    expect(hasServerTool).toBe(true);
    expect(hasClientTool).toBe(true);
  });
});

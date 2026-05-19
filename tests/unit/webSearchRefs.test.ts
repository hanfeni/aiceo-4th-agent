import { describe, it, expect } from "vitest";
import { collectWebSearchRefs } from "@/lib/agent/utils/webSearchRefs";

// web_search 참조 URL 통합 — 순수 함수(LLM/React 무관, NFR-11).
// 사용자 요구: "검색한 URL(병렬) 모두 출력 + 인용한 것만 별도
// 라벨링". OpenAI built-in web_search 실측(ws-raw-dump-probe):
//  - args.actions[]: search{queries}, open_page{url}, find_in_page
//    {pattern,url} — 모델이 시도한 동작 전부(URL 은 open_page/
//    find_in_page 에만; search 는 검색어라 URL 아님).
//  - result(citations): "참고 출처 N건:\n• 제목 (url)\n…" —
//    답변에 **실제 인용**한 출처(보통 소수).
// collectWebSearchRefs: 시도한 URL 전부를 모으고, citation URL 과
// 대조해 cited 플래그를 붙인다(순서=등장순, URL 중복 제거).

describe("collectWebSearchRefs — 시도 URL 전부 + 인용 라벨", () => {
  it("open_page URL 1개 + 동일 URL citation → cited=true 1건", () => {
    const args = JSON.stringify({
      actions: [
        { type: "search", queries: ["삼성전자 주가"] },
        {
          type: "open_page",
          url: "https://kr.investing.com/equities/samsung",
        },
      ],
    });
    const result =
      "참고 출처 1건:\n• 삼성전자 주가 (https://kr.investing.com/equities/samsung)";
    expect(collectWebSearchRefs(args, result)).toEqual([
      {
        url: "https://kr.investing.com/equities/samsung",
        title: "삼성전자 주가",
        cited: true,
      },
    ]);
  });

  it("연 페이지 2개 중 1개만 인용 → cited 플래그로 구분", () => {
    const args = JSON.stringify({
      actions: [
        { type: "open_page", url: "https://a.example/page1" },
        { type: "open_page", url: "https://b.example/page2" },
      ],
    });
    const result =
      "참고 출처 1건:\n• B 페이지 (https://b.example/page2)";
    const refs = collectWebSearchRefs(args, result);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      url: "https://a.example/page1",
      cited: false,
    });
    expect(refs[1]).toMatchObject({
      url: "https://b.example/page2",
      title: "B 페이지",
      cited: true,
    });
  });

  it("citation 에만 있고 args 엔 없는 URL 도 포함(인용=참조)", () => {
    const args = JSON.stringify({
      actions: [{ type: "search", queries: ["q"] }],
    });
    const result =
      "참고 출처 1건:\n• 인용처 (https://cited-only.example)";
    expect(collectWebSearchRefs(args, result)).toEqual([
      {
        url: "https://cited-only.example",
        title: "인용처",
        cited: true,
      },
    ]);
  });

  it("find_in_page URL 도 시도 URL 로 수집", () => {
    const args = JSON.stringify({
      actions: [
        {
          type: "find_in_page",
          pattern: "주가",
          url: "https://find.example/p",
        },
      ],
    });
    expect(collectWebSearchRefs(args, undefined)).toEqual([
      { url: "https://find.example/p", title: "", cited: false },
    ]);
  });

  it("URL 중복(연 페이지 == 인용)은 1건으로 합치고 cited=true", () => {
    const args = JSON.stringify({
      actions: [{ type: "open_page", url: "https://dup.example" }],
    });
    const result = "참고 출처 1건:\n• 중복 (https://dup.example)";
    const refs = collectWebSearchRefs(args, result);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      url: "https://dup.example",
      title: "중복",
      cited: true,
    });
  });

  it("search 만 있고 URL 0 + citation 없음 → 빈 배열", () => {
    const args = JSON.stringify({
      actions: [{ type: "search", queries: ["a", "b"] }],
    });
    expect(collectWebSearchRefs(args, undefined)).toEqual([]);
  });

  it("등장 순서 보존: open_page → citation 추가 URL 순", () => {
    const args = JSON.stringify({
      actions: [{ type: "open_page", url: "https://first.example" }],
    });
    const result =
      "참고 출처 1건:\n• 둘째 (https://second.example)";
    const refs = collectWebSearchRefs(args, result);
    expect(refs.map((r) => r.url)).toEqual([
      "https://first.example",
      "https://second.example",
    ]);
  });

  it("비-JSON args / 빈 result → graceful 빈 배열(크래시 0)", () => {
    expect(collectWebSearchRefs("not json", undefined)).toEqual([]);
    expect(collectWebSearchRefs("", "")).toEqual([]);
    expect(collectWebSearchRefs("{}", undefined)).toEqual([]);
  });

  it("citation 텍스트가 출처 형식 아님(일반 status) → args URL 만", () => {
    const args = JSON.stringify({
      actions: [{ type: "open_page", url: "https://x.example" }],
    });
    // result 가 '참고 출처' 패턴 아님 — 인용 0, 시도 URL 만.
    const refs = collectWebSearchRefs(args, "검색 완료");
    expect(refs).toEqual([
      { url: "https://x.example", title: "", cited: false },
    ]);
  });
});

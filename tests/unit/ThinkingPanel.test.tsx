import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { ThinkingPanel } from "@/components/common/BaseChat/ThinkingPanel";
import type { ThinkingStep } from "@/types";

// ThinkingPanel 컴포넌트 단위 테스트 (jsdom + @testing-library/react).
// Slice F-redo + G2 — medigate-new 모방:
//  - 제목은 reducer 가 준 한글 안내문구를 그대로 표시('질문 분석 중').
//  - 영문 reasoning 텍스트는 제목 아닌 본문에 렌더(가공 0).
//  - '… 중' 제목엔 스태틱 ' ...'(점 애니메이션 아님).
//  - I/O 는 FoldableValue: 짧으면 요약만, 길면 클릭 시 전체 펼침.

afterEach(() => cleanup());

const reasoning = (
  title: string,
  content: string,
  order: number,
): ThinkingStep => ({ kind: "reasoning", title, content, order });

// result 인자를 명시적으로 받는다(기본값 미사용 — undefined 전달이
// '실행 중'을 의미하므로 기본 매개변수로 덮으면 안 됨).
const tool = (
  order: number,
  title: string,
  result: string | undefined,
): ThinkingStep => ({
  kind: "tool",
  title,
  id: `t${order}`,
  name: "web_search",
  args: "{}",
  result,
  order,
});

describe("ThinkingPanel — 빈 step / 미표시 게이트", () => {
  it("steps 비고 streaming=false → 아무것도 안 그림(null)", () => {
    const { container } = render(
      <ThinkingPanel steps={[]} streaming={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("steps 있으면 토글 버튼이 보인다", () => {
    render(
      <ThinkingPanel
        steps={[reasoning("분석", "본문", 0)]}
        streaming={false}
      />,
    );
    // 완료 + 접힘 → "답변 과정 보기"
    expect(screen.getByRole("button")).toBeTruthy();
  });
});

describe("ThinkingPanel — 한글 제목 헤더 + 영문 본문", () => {
  it("reducer 가 준 한글 제목을 헤더로 그대로 표시('질문 분석 중')", () => {
    render(
      <ThinkingPanel
        steps={[
          reasoning("질문 분석 중", "Clarifying user intent body", 0),
        ]}
        streaming={true}
      />,
    );
    expect(screen.getByText("질문 분석 중")).toBeTruthy();
  });

  it("영문 reasoning 텍스트는 제목이 아니라 본문에 렌더(가공 0)", () => {
    render(
      <ThinkingPanel
        steps={[
          reasoning("결과 분석 중", "Deciding on the search approach", 0),
        ]}
        streaming={true}
      />,
    );
    expect(
      screen.getByText("Deciding on the search approach"),
    ).toBeTruthy();
  });
});

describe("ThinkingPanel — 진행 중 스태틱 '...' (제목이 '… 중' 일 때)", () => {
  it("'질문 분석 중' → 헤더에 스태틱 '...' 가 텍스트로 붙는다", () => {
    const { container } = render(
      <ThinkingPanel
        steps={[reasoning("질문 분석 중", "본문", 0)]}
        streaming={true}
      />,
    );
    // 점 애니메이션 컴포넌트(role=status)가 아니라 스태틱 텍스트.
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.textContent).toContain("질문 분석 중 ...");
  });

  it("완료 제목('질문 분석')엔 '...' 없음", () => {
    const { container } = render(
      <ThinkingPanel
        steps={[reasoning("질문 분석", "본문", 0)]}
        streaming={false}
      />,
    );
    expect(container.textContent).not.toContain("...");
  });

  it("도구 진행 중 제목('웹 검색 도구 실행 중')에도 스태틱 '...'", () => {
    const { container } = render(
      <ThinkingPanel
        steps={[tool(1, "웹 검색 도구 실행 중", undefined)]}
        streaming={true}
      />,
    );
    expect(container.textContent).toContain("웹 검색 도구 실행 중 ...");
  });

  it("도구 완료 제목('웹 검색 도구 완료')엔 '...' 없음", () => {
    const { container } = render(
      <ThinkingPanel
        steps={[tool(1, "웹 검색 도구 완료", "결과")]}
        streaming={true}
      />,
    );
    expect(container.textContent).not.toContain("...");
  });
});

describe("ThinkingPanel — I/O FoldableValue (간단 표기 + 클릭 확장)", () => {
  const longResult =
    "참고 출처:\nhttps://www.samsung.com/sec/about-us/company-info/ 기업 정보\nhttps://example.com 추가 자료";

  it("긴 OUT 은 요약 한 줄만 보이고 전체는 숨겨진다(초기 접힘)", () => {
    render(
      <ThinkingPanel
        steps={[tool(1, "웹 검색 도구 완료", longResult)]}
        streaming={true}
      />,
    );
    // 요약(첫 줄)은 보이고, 둘째 줄 URL 은 초기엔 안 보임.
    expect(screen.getByText(/참고 출처:/)).toBeTruthy();
    expect(
      screen.queryByText(/example\.com 추가 자료/),
    ).toBeNull();
  });

  it("요약을 클릭하면 원문 전체가 펼쳐진다", () => {
    render(
      <ThinkingPanel
        steps={[tool(1, "웹 검색 도구 완료", longResult)]}
        streaming={true}
      />,
    );
    const toggles = screen.getAllByRole("button", { expanded: false });
    // 첫 펼침 가능 토글(OUT 요약) 클릭.
    const ioToggle = toggles.find((b) =>
      b.textContent?.includes("참고 출처"),
    );
    expect(ioToggle).toBeTruthy();
    fireEvent.click(ioToggle as HTMLElement);
    expect(screen.getByText(/example\.com 추가 자료/)).toBeTruthy();
  });

  it("짧은 한 줄 OUT 은 펼침 토글 없이 그대로 표시", () => {
    render(
      <ThinkingPanel
        steps={[tool(1, "웹 검색 도구 완료", "짧은 결과")]}
        streaming={true}
      />,
    );
    expect(screen.getByText("짧은 결과")).toBeTruthy();
    // 짧으면 펼침 가능한(role=button aria-expanded) 요소 없음.
    expect(
      screen.queryByRole("button", { expanded: false }),
    ).toBeNull();
  });

  it("실행 중(result undefined)이면 '실행 중…' 표시(FoldableValue 아님)", () => {
    render(
      <ThinkingPanel
        steps={[tool(1, "웹 검색 도구 실행 중", undefined)]}
        streaming={true}
      />,
    );
    expect(screen.getByText("실행 중…")).toBeTruthy();
  });
});

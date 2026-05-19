import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThinkingPanel } from "@/components/common/BaseChat/ThinkingPanel";
import type { ThinkingStep } from "@/types";

// ThinkingPanel 컴포넌트 단위 테스트 (jsdom + @testing-library/react).
// Slice F — medigate-new ThinkingPanel StreamingView/HistoryView 모방:
//  - reasoning step 제목이 별도 헤더로 렌더(영문도 그대로 — 백엔드가
//    한글 제목을 안 주므로 모델의 **bold** 제목을 그대로 헤더화).
//  - 제목이 비면(영문 bold 아직 미수신) 폴백 제목으로 "사고중" 표시.
//  - 스트리밍 중 마지막 reasoning step(=현재 진행)은 제목 옆 진행
//    마킹(점 애니메이션) — medigate-new lastGroup.isActive 패턴.

afterEach(() => cleanup());

const reasoning = (
  title: string,
  content: string,
  order: number,
): ThinkingStep => ({ kind: "reasoning", title, content, order });

const tool = (
  order: number,
  title = "웹 검색 도구 완료",
  result: string | undefined = "ok",
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

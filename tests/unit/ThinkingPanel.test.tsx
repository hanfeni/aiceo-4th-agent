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

const tool = (order: number): ThinkingStep => ({
  kind: "tool",
  title: "web_search",
  id: `t${order}`,
  name: "web_search",
  args: "{}",
  result: "ok",
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

describe("ThinkingPanel — reasoning 제목 헤더(영문 그대로)", () => {
  it("영문 bold 제목이 step 헤더로 그대로 렌더된다(번역/가공 없음)", () => {
    render(
      <ThinkingPanel
        steps={[reasoning("Clarifying user intent", "본문 텍스트", 0)]}
        streaming={false}
      />,
    );
    // 완료 상태는 자동 펼침 아님 → 토글 열어야 보임. autoOpen 은
    // streaming 일 때만이므로, 히스토리 검증은 streaming=true 로.
    cleanup();
    render(
      <ThinkingPanel
        steps={[reasoning("Clarifying user intent", "본문 텍스트", 0)]}
        streaming={true}
      />,
    );
    expect(screen.getByText("Clarifying user intent")).toBeTruthy();
  });

  it("제목이 빈 문자열이면 폴백 제목('사고 정리 중')을 헤더로 표시", () => {
    render(
      <ThinkingPanel
        steps={[reasoning("", "아직 제목 경계 미수신 본문", 0)]}
        streaming={true}
      />,
    );
    expect(screen.getByText("사고 정리 중")).toBeTruthy();
  });
});

describe("ThinkingPanel — 활성 step 진행 마킹(medigate isActive)", () => {
  it("스트리밍 중 마지막 reasoning step 제목에 진행 표시(role=status)", () => {
    render(
      <ThinkingPanel
        steps={[reasoning("Deciding approach", "본문", 0)]}
        streaming={true}
      />,
    );
    // 활성 마킹은 접근성 라벨 "진행 중"으로 노출.
    expect(screen.getByLabelText("진행 중")).toBeTruthy();
  });

  it("완료(streaming=false) reasoning step 엔 진행 마킹이 없다", () => {
    render(
      <ThinkingPanel
        steps={[reasoning("Done thinking", "본문", 0)]}
        streaming={false}
      />,
    );
    expect(screen.queryByLabelText("진행 중")).toBeNull();
  });

  it("마지막 step 이 tool 이면 reasoning 진행 마킹 없음(도구 실행 중은 별개)", () => {
    render(
      <ThinkingPanel
        steps={[reasoning("분석", "본문", 0), tool(1)]}
        streaming={true}
      />,
    );
    // liveMode 면 마지막 step(tool)만 노출 → reasoning 진행 마킹 0.
    expect(screen.queryByLabelText("진행 중")).toBeNull();
  });
});

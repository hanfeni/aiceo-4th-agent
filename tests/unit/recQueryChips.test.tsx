import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MessageList } from "@/components/common/BaseChat/MessageList";
import { chatStore } from "@/store";

// 추천 질문 칩 — LLM [REC_QUERY] 마커 → splitRecQueries → 렌더.
// 스트리밍 중 마커 누출 0 + 완료 후 칩 등장 + 클릭=즉시 전송 검증.

afterEach(() => {
  cleanup();
  chatStore.setState({ messages: [], isStreaming: false });
});

const REC = "본문 답변입니다.\n[REC_QUERY]\nQ 첫째?\nQ 둘째?\nQ 셋째?\n[/REC_QUERY]";

describe("추천 질문 칩 (rec_query 렌더)", () => {
  it("스트리밍 종료 후: 본문엔 마커 0, 칩 3개 노출", () => {
    chatStore.setState({
      messages: [{ role: "assistant", content: REC }],
      isStreaming: false,
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    // 본문에 마커·질문 미혼입(누출 0).
    expect(screen.queryByText(/REC_QUERY/)).toBeNull();
    expect(screen.getByText("본문 답변입니다.")).toBeTruthy();
    // 칩 3개.
    expect(screen.getByRole("button", { name: "Q 첫째?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Q 둘째?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Q 셋째?" })).toBeTruthy();
  });

  it("스트리밍 중(닫는 태그 미도착): 마커/미완 질문 본문 미노출, 칩 0", () => {
    chatStore.setState({
      messages: [
        { role: "assistant", content: "본문 끝.\n[REC_QUERY]\nQ 첫" },
      ],
      isStreaming: true,
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    expect(screen.queryByText(/REC_QUERY/)).toBeNull();
    expect(screen.queryByText(/Q 첫/)).toBeNull(); // 미확정 질문 노출 0
    expect(screen.getByText("본문 끝.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Q /})).toBeNull();
  });

  it("부분 마커로 끝나도(토큰 쪼개짐) 본문에 안 보인다", () => {
    chatStore.setState({
      messages: [{ role: "assistant", content: "답변 본문[REC_QU" }],
      isStreaming: true,
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    expect(screen.getByText("답변 본문")).toBeTruthy();
    expect(screen.queryByText(/REC_QU/)).toBeNull();
  });

  it("칩 클릭 → onRecQuery 에 그 질문 텍스트로 호출(즉시 전송)", () => {
    const onRecQuery = vi.fn();
    chatStore.setState({
      messages: [{ role: "assistant", content: REC }],
      isStreaming: false,
    });
    render(
      <MessageList onPickPrompt={() => {}} onRecQuery={onRecQuery} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Q 둘째?" }));
    expect(onRecQuery).toHaveBeenCalledExactlyOnceWith("Q 둘째?");
  });

  it("recQueries 없으면 추천 칩 미렌더(액션행 mock 버튼은 무관)", () => {
    const onRecQuery = vi.fn();
    chatStore.setState({
      messages: [{ role: "assistant", content: "추천 없는 일반 답변." }],
      isStreaming: false,
    });
    render(
      <MessageList onPickPrompt={() => {}} onRecQuery={onRecQuery} />,
    );
    expect(screen.getByText("추천 없는 일반 답변.")).toBeTruthy();
    // 액션행(좋아요/복사 등 aria-label mock)은 존재하나 추천 칩은 없음
    // → onRecQuery 를 호출하는 버튼이 0개여야 한다(클릭 시 미호출).
    const buttons = screen.queryAllByRole("button");
    for (const b of buttons) fireEvent.click(b);
    expect(onRecQuery).not.toHaveBeenCalled();
  });
});

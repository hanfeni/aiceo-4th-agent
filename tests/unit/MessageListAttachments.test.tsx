import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MessageList } from "@/components/common/BaseChat/MessageList";
import { chatStore } from "@/store";

// MessageList — user 메시지 첨부 흔적 표시 (Plan Critic I1).
// 이미지는 base64 로, 텍스트/PDF/DOCX 는 query 에 합쳐 보내므로 content
// 만으론 첨부 사실이 안 보임 → attachments 메타로 칩/썸네일 렌더.

afterEach(() => {
  cleanup();
  chatStore.setState({ messages: [], isStreaming: false });
});

describe("UserBubble — 첨부 칩/썸네일 (I1)", () => {
  it("텍스트 첨부가 있으면 파일명 칩이 버블에 표시된다", () => {
    chatStore.setState({
      messages: [
        {
          role: "user",
          content: "이 문서 요약",
          attachments: [{ name: "spec.pdf", kind: "text" }],
        },
      ],
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    expect(screen.getByText("이 문서 요약")).toBeTruthy();
    expect(screen.getByText("spec.pdf")).toBeTruthy();
  });

  it("이미지 첨부는 dataUrl 썸네일(img)로 표시된다", () => {
    chatStore.setState({
      messages: [
        {
          role: "user",
          content: "이 사진?",
          attachments: [
            {
              name: "shot.png",
              kind: "image",
              dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            },
          ],
        },
      ],
    });
    const { container } = render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("attachments 없으면 기존대로 content 만(무회귀, 칩 없음)", () => {
    chatStore.setState({
      messages: [{ role: "user", content: "그냥 텍스트" }],
    });
    const { container } = render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    expect(screen.getByText("그냥 텍스트")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("여러 첨부(이미지+텍스트 혼합) 모두 표시", () => {
    chatStore.setState({
      messages: [
        {
          role: "user",
          content: "분석",
          attachments: [
            { name: "a.png", kind: "image", dataUrl: "data:image/png;base64,AA=" },
            { name: "b.txt", kind: "text" },
          ],
        },
      ],
    });
    const { container } = render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    expect(container.querySelectorAll("img").length).toBe(1);
    expect(screen.getByText("b.txt")).toBeTruthy();
  });

  it("assistant 메시지엔 attachments 가 와도 무시(user 전용 — 회귀 가드)", () => {
    chatStore.setState({
      messages: [
        { role: "user", content: "q" },
        // assistant 에 attachments 가 잘못 들어와도 렌더 안전
        {
          role: "assistant",
          content: "답변",
          attachments: [{ name: "x.png", kind: "image" }],
        },
      ],
    });
    expect(() =>
      render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />),
    ).not.toThrow();
    expect(screen.getByText("답변")).toBeTruthy();
  });
});

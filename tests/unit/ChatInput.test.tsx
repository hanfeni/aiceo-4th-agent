import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ChatInput } from "@/components/common/BaseChat/ChatInput";

// ChatInput 단위 테스트 (LLM 비의존, jsdom + @testing-library/react).
// 매핑: TC-23.1/23.2/23.5, TC-24.5 / FR-03 / AC-5
// 디자인: chat.jsx:693 InputBar — Enter 전송 / Shift+Enter 줄바꿈,
//        스트리밍 중 입력+전송 잠금, 툴칩(첨부/이미지/데이터소스)=비활성 mock.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const onSend = vi.fn();
  render(<ChatInput onSend={onSend} streaming={false} {...props} />);
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  return { onSend, textarea };
}

describe("ChatInput — Enter 전송 / Shift+Enter 줄바꿈 (FR-03)", () => {
  // TC-23.2 / UC-1 — Enter(단독) → onSend(trim 된 값)
  it("Enter(단독) → onSend 가 trim 된 값으로 호출", () => {
    const { onSend, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "  안녕하세요  " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("안녕하세요");
  });

  // TC-23.5 — Shift+Enter → 전송 아님(줄바꿈)
  it("TC-23.5: Shift+Enter → onSend 미호출(줄바꿈만)", () => {
    const { onSend, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "첫줄" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  // Send 버튼 클릭 전송(UC-1-A)
  it("Send 버튼 클릭 → onSend 호출", () => {
    const { onSend, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "버튼전송" } });
    fireEvent.click(screen.getByRole("button", { name: /전송/ }));
    expect(onSend).toHaveBeenCalledWith("버튼전송");
  });

  // 전송 후 textarea 비워짐
  it("전송 후 textarea 가 비워진다", () => {
    const { textarea } = setup();
    fireEvent.change(textarea, { target: { value: "지워질값" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(textarea.value).toBe("");
  });
});

describe("ChatInput — 전송 차단 / 비활성 상태 (TC-23.1/AC-5)", () => {
  // TC-23.1 — 빈 입력 Enter → onSend 미호출
  it("TC-23.1: 빈 입력 Enter → onSend 미호출", () => {
    const { onSend, textarea } = setup();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  // TC-23.1 / TC-23.5 — 공백/개행만 → 차단
  it("TC-23.1: 공백/개행만 입력 Enter → onSend 미호출", () => {
    const { onSend, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "   \n\t " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  // 전송 버튼은 빈 입력일 때 disabled
  it("Send 버튼: 입력 비어있으면 disabled", () => {
    setup();
    const btn = screen.getByRole("button", { name: /전송/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // 스트리밍 중에는 입력+전송 잠금(FR-03)
  it("streaming=true → textarea/Send 비활성, Enter 전송 차단", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} streaming />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const btn = screen.getByRole("button", {
      name: /전송/,
    }) as HTMLButtonElement;
    expect(textarea.disabled).toBe(true);
    expect(btn.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "막혀야함" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("ChatInput — 비활성 mock 툴칩 (스코프: 미구현=mock)", () => {
  // 툴칩(첨부/이미지/데이터소스)은 비활성. 클릭해도 크래시 0, onSend 무영향.
  it("툴칩 클릭은 no-op (크래시 0, onSend 미호출, title='준비 중')", () => {
    const { onSend } = setup();
    for (const label of ["첨부", "이미지", "데이터 소스"]) {
      const chip = screen.getByRole("button", { name: label });
      expect(chip).toHaveProperty("disabled", true);
      expect(chip.getAttribute("title")).toBe("준비 중");
      fireEvent.click(chip); // 크래시 없어야 함
    }
    expect(onSend).not.toHaveBeenCalled();
  });

  // TC-24.5 — 긴 입력 + 마크다운/코드 다수 포함해도 렌더 안정(크래시 0)
  it("TC-24.5: 매우 긴 입력 + 코드/마크다운 다수 → 크래시 0, 값 보존", () => {
    const { textarea } = setup();
    const long =
      "```js\n" + "x".repeat(5000) + "\n```\n" + "# 제목\n- 목록\n".repeat(200);
    fireEvent.change(textarea, { target: { value: long } });
    expect(textarea.value).toBe(long);
    // 푸트노트 안내 문구는 항상 렌더(디자인 chat.jsx:786)
    expect(
      screen.getByText(/검토 후 사용하세요/),
    ).toBeTruthy();
  });

  // 디자인: placeholder 문구(chat.jsx:734)
  it("placeholder 에 Shift+Enter 줄바꿈 안내가 포함된다", () => {
    const { textarea } = setup();
    expect(textarea.getAttribute("placeholder")).toMatch(/Shift\+Enter/);
  });
});

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
    // 첨부 없으면 2번째 인자는 undefined(새 계약 onSend(value, files?)).
    expect(onSend).toHaveBeenCalledWith("안녕하세요", undefined);
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
    expect(onSend).toHaveBeenCalledWith("버튼전송", undefined);
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

// --- 첨부 UI (Slice E3): NODE_ENV 분기 + 버튼 + paste + 썸네일 칩 ---
describe("ChatInput — 첨부 (dev 환경분기 / D1)", () => {
  it("dev 에서 첨부·이미지 버튼이 활성(enabled)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} streaming={false} />);
    const attach = screen.getByRole("button", { name: /첨부/ });
    const image = screen.getByRole("button", { name: /이미지/ });
    expect((attach as HTMLButtonElement).disabled).toBe(false);
    expect((image as HTMLButtonElement).disabled).toBe(false);
    vi.unstubAllEnvs();
  });

  it("production 에서는 첨부·이미지 버튼이 disabled(기존 mock 유지)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} streaming={false} />);
    expect(
      (screen.getByRole("button", { name: /첨부/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("ChatInput — 파일 선택 → 썸네일/칩 + onSend(files)", () => {
  function devSetup() {
    vi.stubEnv("NODE_ENV", "development");
    const onSend = vi.fn();
    const { container } = render(
      <ChatInput onSend={onSend} streaming={false} />,
    );
    return { onSend, container };
  }

  it("이미지 첨부는 썸네일만 노출(파일명 텍스트 없음 — 사용자 요구)", async () => {
    const { container } = devSetup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const img = new File(["IMG"], "photo.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [img] });
    fireEvent.change(input);
    const thumb = await screen.findByRole("img", { name: /photo\.png/ });
    expect(thumb).toBeTruthy();
    // 이미지 칩엔 파일명 텍스트가 보이지 않는다(썸네일만).
    expect(screen.queryByText("photo.png")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("이미지 썸네일 클릭 → 확대 미리보기(라이트박스) 열림/닫힘", async () => {
    const { container } = devSetup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const img = new File(["IMG"], "shot.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [img] });
    fireEvent.change(input);
    const thumb = await screen.findByRole("img", { name: /shot\.png/ });
    fireEvent.click(thumb);
    // 라이트박스(dialog) 가 열리고 큰 이미지가 보인다
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    // 배경/닫기 클릭 시 닫힘
    fireEvent.click(screen.getByRole("button", { name: /미리보기 닫기/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("텍스트 파일 선택 시 파일명 칩 + 제거 버튼", async () => {
    const { container } = devSetup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const txt = new File(["T"], "spec.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [txt] });
    fireEvent.change(input);
    expect(await screen.findByText(/spec\.txt/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /spec\.txt 제거/ })).toBeTruthy();
    vi.unstubAllEnvs();
  });

  it("제거 버튼 클릭 시 해당 첨부가 사라진다", async () => {
    const { container } = devSetup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const txt = new File(["T"], "a.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [txt] });
    fireEvent.change(input);
    fireEvent.click(await screen.findByRole("button", { name: /a\.txt 제거/ }));
    expect(screen.queryByText(/a\.txt/)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("전송 시 onSend(value, files) 로 첨부 전달 + 입력·첨부 클리어", async () => {
    const { onSend, container } = devSetup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const txt = new File(["T"], "doc.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [txt] });
    fireEvent.change(input);
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "이거 봐줘" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
    const [val, files] = onSend.mock.calls[0];
    expect(val).toBe("이거 봐줘");
    expect(files).toHaveLength(1);
    expect((files[0] as File).name).toBe("doc.txt");
    vi.unstubAllEnvs();
  });

  it("첨부만 있고 텍스트 비어도 전송 가능", () => {
    const { onSend, container } = devSetup();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const img = new File(["I"], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [img] });
    fireEvent.change(input);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][1]).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});

describe("ChatInput — Ctrl+V 클립보드 이미지 paste", () => {
  it("이미지 클립보드 paste → 첨부에 추가된다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} streaming={false} />);
    const ta = screen.getByRole("textbox");
    const img = new File(["I"], "pasted.png", { type: "image/png" });
    fireEvent.paste(ta, {
      clipboardData: {
        files: [img],
        items: [{ kind: "file", type: "image/png", getAsFile: () => img }],
        getData: () => "",
      },
    });
    // paste 된 이미지가 썸네일(img)로 노출(파일명 텍스트 없음 — 사용자 요구).
    expect(
      await screen.findByRole("img", { name: /pasted\.png/ }),
    ).toBeTruthy();
    vi.unstubAllEnvs();
  });

  it("텍스트 paste 는 기존대로 입력란에 들어간다(첨부 아님)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} streaming={false} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.paste(ta, {
      clipboardData: {
        files: [],
        items: [{ kind: "string", type: "text/plain" }],
        getData: () => "붙여넣은 텍스트",
      },
    });
    // 이미지 첨부 칩이 생기지 않음(텍스트 paste 는 브라우저 기본 동작)
    expect(screen.queryByText(/\.png/)).toBeNull();
    vi.unstubAllEnvs();
  });
});

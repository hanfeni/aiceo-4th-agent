import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HeaderControls } from "@/app/(main)/chat/HeaderControls";
import { chatStore } from "@/store";
import { ALLOWED_MODELS } from "@/lib/agent/harness/models";

// HeaderControls 단위 테스트 — ModelPicker 실동작 (FR-16·FR-17 / AD-15·C7).
// Slice 8 에선 disabled 시각 mock 이었던 ModelPicker 를 실 드롭다운으로 전환.
// LLM 비의존(store 만 구동).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // store 초기화(테스트 격리).
  chatStore.setState({
    provider: "",
    model: "",
    isStreaming: false,
    messages: [],
  });
});

function setup(props?: Partial<React.ComponentProps<typeof HeaderControls>>) {
  const onNewChat = vi.fn();
  render(
    <HeaderControls
      provider="openai"
      model="gpt-5.4-mini"
      onNewChat={onNewChat}
      {...props}
    />,
  );
  return { onNewChat };
}

describe("HeaderControls — ModelPicker 실 드롭다운 (FR-16)", () => {
  it("ModelPicker 버튼이 활성(enabled)이고 현재 모델을 표시한다", () => {
    setup();
    const picker = screen.getByRole("button", { name: /모델/ });
    expect((picker as HTMLButtonElement).disabled).toBe(false);
    expect(picker.textContent).toContain("gpt-5.4-mini");
  });

  it("버튼 클릭 시 화이트리스트 3종 옵션이 모두 노출된다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /모델/ }));
    for (const m of ALLOWED_MODELS) {
      expect(screen.getByRole("menuitem", { name: m })).not.toBeNull();
    }
  });

  it("옵션 선택 시 store.setModel 이 호출돼 store.model 이 갱신된다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /모델/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "gpt-5.5" }));
    expect(chatStore.getState().model).toBe("gpt-5.5");
  });

  it("선택 후 드롭다운이 닫히고 라벨이 새 모델로 갱신된다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /모델/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "gpt-5.5" }));
    expect(screen.queryByRole("menuitem", { name: "gpt-5.4" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /모델/ }).textContent,
    ).toContain("gpt-5.5");
  });

  it("같은 모델 재선택은 no-op(드롭다운만 닫힘, 에러 없음 — C12 정신)", () => {
    chatStore.setState({ model: "gpt-5.4-mini" });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /모델/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "gpt-5.4-mini" }));
    expect(chatStore.getState().model).toBe("gpt-5.4-mini");
    expect(screen.queryByRole("menuitem", { name: "gpt-5.5" })).toBeNull();
  });
});

describe("HeaderControls — 스트리밍 중 잠금 (C7 / FR-17)", () => {
  it("isStreaming=true 면 ModelPicker 가 disabled 된다", () => {
    chatStore.setState({ isStreaming: true });
    setup();
    expect((screen.getByRole("button", { name: /모델/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("스트리밍 중에는 클릭해도 드롭다운이 열리지 않는다", () => {
    chatStore.setState({ isStreaming: true });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /모델/ }));
    for (const m of ALLOWED_MODELS) {
      expect(screen.queryByRole("menuitem", { name: m })).toBeNull();
    }
  });

  it("스트리밍 종료 후 다시 활성화된다", () => {
    chatStore.setState({ isStreaming: false });
    setup();
    expect((screen.getByRole("button", { name: /모델/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("HeaderControls — 무회귀 (FR-06 새 대화)", () => {
  it("새 대화 버튼은 여전히 resetChat + onNewChat 을 호출한다", () => {
    const { onNewChat } = setup();
    const before = chatStore.getState().conversationId;
    fireEvent.click(screen.getByRole("button", { name: "새 대화" }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(chatStore.getState().conversationId).not.toBe(before);
  });
});

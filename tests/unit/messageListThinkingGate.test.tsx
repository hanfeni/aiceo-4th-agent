import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MessageList } from "@/components/common/BaseChat/MessageList";
import { chatStore } from "@/store";
import type { ThinkingStep } from "@/types";

// 출력 중 사고 패널 컨테이너 게이트 회귀 가드.
//
// 사용자 보고(2회): 답변 출력 단계에 사고 패널이 사라졌다 생겼다
// 반복 → 답변 텍스트 레이아웃 시프트. 1차 수정(ThinkingPanel 내부
// return null 제거)은 절반 — 진짜 원인은 부모 AssistantBubble 의
// `!(streaming && outputting) && <ThinkingPanel>` 컨테이너 게이트
// (출력 중 컴포넌트 자체 언마운트). 이 테스트가 그 게이트 제거를
// 부모 레벨에서 못박는다(ThinkingPanel 단위 테스트로는 부모
// 조건부 렌더를 못 잡으므로 — tool-limitations: 호출처 검증).

const reasoningStep: ThinkingStep = {
  kind: "reasoning",
  title: "질문 분석 중",
  content: "사고 본문",
  order: 0,
};

afterEach(() => {
  cleanup();
  chatStore.setState({
    messages: [],
    isStreaming: false,
    lastStreamEvent: null,
  });
});

describe("MessageList — 출력 중 사고 패널 컨테이너 유지(언마운트 금지)", () => {
  it("isStreaming + lastStreamEvent=token(출력 중) 여도 사고 패널이 DOM 에 존재", () => {
    chatStore.setState({
      messages: [
        { role: "user", content: "질문" },
        {
          role: "assistant",
          content: "답변 본문 출력 중...",
          thinkingSteps: [reasoningStep],
        },
      ],
      isStreaming: true,
      lastStreamEvent: "token", // = outputting (답변 토큰 흐름 중)
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    // 출력 중에도 패널 토글 버튼이 DOM 에 존재(컨테이너 미언마운트
    // — 레이아웃 시프트 0). 옛 게이트면 button이 0개라 throw.
    expect(screen.getByRole("button")).toBeTruthy();
    // 답변 본문은 정상 표시(패널이 위 자리 차지해도 본문 렌더).
    expect(screen.getByText("답변 본문 출력 중...")).toBeTruthy();
  });

  it("출력 중(token)엔 사고 본문이 펼쳐지지 않음(접힘 고정 — ThinkingPanel 처리)", () => {
    chatStore.setState({
      messages: [
        {
          role: "assistant",
          content: "출력 중",
          thinkingSteps: [reasoningStep],
        },
      ],
      isStreaming: true,
      lastStreamEvent: "token",
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    // 접힘이라 step 본문/제목 미노출(헤더 버튼만).
    expect(screen.queryByText("사고 본문")).toBeNull();
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("사고 재개(lastStreamEvent=thinking) → 패널 펼침(동적 전이, 재마운트 아님)", () => {
    chatStore.setState({
      messages: [
        {
          role: "assistant",
          content: "진행",
          thinkingSteps: [reasoningStep],
        },
      ],
      isStreaming: true,
      lastStreamEvent: "thinking", // 출력 멈추고 사고 재개 → outputting=false
    });
    render(<MessageList onPickPrompt={() => {}} onRecQuery={() => {}} />);
    // outputting=false → 자동 펼침 → 사고 제목 노출.
    expect(screen.getByText("질문 분석 중")).toBeTruthy();
  });
});

"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Sparkles,
  ArrowUp,
  Paperclip,
  Image as ImageIcon,
  Database,
} from "lucide-react";

/**
 * ChatInput — 디자인 핸드오프 InputBar 재현.
 *
 * 기능(실 백엔드 연결): Enter 전송 / Shift+Enter 줄바꿈, textarea 자동 증가
 * (max 160px), 스트리밍 중 입력+전송 잠금(FR-03). onSend 는 trim 된 값으로
 * 호출되고 전송 후 textarea 를 비운다. 빈/공백은 차단(AD-4 client, TC-23.1).
 *
 * 시각 전용 mock(미구현=mock 스코프): 툴칩(첨부/이미지/데이터 소스)은
 * disabled + title="준비 중". 푸트노트 안내 문구는 디자인 그대로 렌더.
 *
 * 픽셀값은 chat.jsx 의 InputBar 인용:
 *  - 외곽: border 1.5px var(--agent-200), radius 22, violet shadow(:701)
 *  - 입력행: sparkles leading(:728), textarea fontSize 14.5(:738)
 *  - 전송 버튼: 36x36 radius 12, gradient 또는 disabled t-neutral-12(:749)
 *  - 툴칩: pill radius 999 border t-neutral-8(:794)
 */

const PLACEHOLDER = "무엇을 도와드릴까요? (Shift+Enter 줄바꿈)";
const MAX_TEXTAREA_PX = 160;

const toolChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid var(--t-neutral-8)",
  background: "white",
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--text-subtle)",
  cursor: "not-allowed",
};

export interface ChatInputProps {
  /** trim 된 입력값으로 호출(빈/공백이면 호출 안 됨). */
  onSend: (value: string) => void;
  /** 스트리밍 중이면 입력/전송 잠금(FR-03). */
  streaming: boolean;
  /** EmptyState 추천칩 등에서 입력값을 주입할 때(선택). */
  initialValue?: string;
}

export function ChatInput({
  onSend,
  streaming,
  initialValue = "",
}: ChatInputProps): ReactNode {
  const [value, setValue] = useState(initialValue);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !streaming;

  const autoGrow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, MAX_TEXTAREA_PX) + "px";
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || streaming) return; // TC-23.1
    onSend(trimmed);
    setValue("");
    const ta = taRef.current;
    if (ta) ta.style.height = "auto";
  }, [value, streaming, onSend]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter(단독) = 전송, Shift+Enter = 줄바꿈(전송 아님 — FR-03/TC-23.5).
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <div style={{ padding: "14px 24px 20px", background: "var(--surface-default)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div
          style={{
            border: "1.5px solid var(--agent-200)",
            borderRadius: 22,
            background: "white",
            boxShadow:
              "0 14px 40px -12px color-mix(in srgb, var(--agent-300) 60%, transparent), 0 4px 10px -4px rgba(15,23,42,.05)",
            padding: "12px 14px",
            transition: "border-color .15s, box-shadow .15s",
          }}
        >
          {/* Input row */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              padding: "4px 2px",
            }}
          >
            <Sparkles
              size={16}
              strokeWidth={2.1}
              style={{
                color: "var(--agent-500)",
                marginBottom: 10,
                flexShrink: 0,
              }}
              aria-hidden
            />
            <textarea
              ref={taRef}
              value={value}
              disabled={streaming}
              onChange={(e) => {
                setValue(e.target.value);
                autoGrow();
              }}
              onKeyDown={onKeyDown}
              placeholder={PLACEHOLDER}
              rows={1}
              aria-label="메시지 입력"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 14.5,
                lineHeight: 1.5,
                color: "var(--text-default)",
                fontFamily: "inherit",
                resize: "none",
                padding: "6px 0",
                maxHeight: MAX_TEXTAREA_PX,
              }}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              title="전송 (Enter)"
              aria-label="전송"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: "none",
                background: canSend
                  ? "linear-gradient(135deg, var(--agent-400), var(--agent-600))"
                  : "var(--t-neutral-12)",
                color: canSend ? "white" : "var(--text-subtle)",
                cursor: canSend ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: canSend ? "0 4px 12px -4px var(--agent-500)" : "none",
                transition: "all .15s",
                flexShrink: 0,
              }}
            >
              <ArrowUp size={17} strokeWidth={2.3} aria-hidden />
            </button>
          </div>

          {/* Tool chips — 시각 전용 mock(미구현). 클릭 no-op, title="준비 중". */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid var(--t-neutral-6)",
            }}
          >
            <button type="button" disabled title="준비 중" style={toolChip}>
              <Paperclip size={11} aria-hidden />
              첨부
            </button>
            <button type="button" disabled title="준비 중" style={toolChip}>
              <ImageIcon size={11} aria-hidden />
              이미지
            </button>
            <button type="button" disabled title="준비 중" style={toolChip}>
              <Database size={11} aria-hidden />
              데이터 소스
            </button>
          </div>
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--text-subtle)",
            textAlign: "center",
          }}
        >
          에이전트 응답은 검토 후 사용하세요. 출처를 항상 확인해주세요.
        </div>
      </div>
    </div>
  );
}

export default ChatInput;

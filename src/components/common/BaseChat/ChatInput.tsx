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
  X,
} from "lucide-react";
import { useChatStore } from "@/store";

// 첨부 노출 환경분기(Plan Critic D1): dev 에서만 첨부/이미지 실동작.
// process.env.NODE_ENV 는 Next.js 가 빌드 타임 인라인 → prod 빌드에선
// 이 비교가 false 상수로 접혀 첨부 버튼 활성 분기가 죽은 코드로 제거되고,
// extractText/prepareAttachments 는 useChat 의 동적 import 라 prod 번들에서
// 물리적으로 빠진다(.next/static grep 0 검증). 함수로 둬 호출 시점 평가
// (테스트 vi.stubEnv 가능 — 모듈 top-level 상수면 stub 무효).
function isAttachEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

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
  /**
   * trim 된 입력값(+ 첨부)으로 호출. 텍스트 비어도 첨부 있으면 호출.
   * files 는 ChatInput 이 store 에 결합되지 않게 콜백으로 위로 전달
   * (순수 prop 컴포넌트 유지 — Plan Critic I2). 파일 분류/추출/전송은
   * useChat 책임.
   */
  onSend: (value: string, files?: File[]) => void;
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
  const [files, setFiles] = useState<File[]>([]);
  // 이미지 썸네일 클릭 → 라이트박스 미리보기({url,name}|null).
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachEnabled = isAttachEnabled();
  // 마크다운 렌더 토글(입력창 하단 스위치). store 직접 구독 — 입력창
  // 전용 UI 상태라 prop 드릴링 대신 단일 소비처(MessageList 와 동일).
  const markdownEnabled = useChatStore((s) => s.markdownEnabled);
  const setMarkdownEnabled = useChatStore((s) => s.setMarkdownEnabled);
  // 텍스트 또는 첨부 중 하나라도 있으면 전송 가능(첨부만 보내기 허용).
  const hasContent = value.trim().length > 0 || files.length > 0;
  const canSend = hasContent && !streaming;

  const autoGrow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, MAX_TEXTAREA_PX) + "px";
  }, []);

  const addFiles = useCallback((picked: File[]) => {
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // hidden input 트리거(첨부=문서 / 이미지=image/*).
  const openPicker = useCallback((accept: string) => {
    const el = fileInputRef.current;
    if (!el) return;
    el.accept = accept;
    el.value = ""; // 같은 파일 재선택 허용
    el.click();
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    // 텍스트도 첨부도 없으면 차단(TC-23.1). 첨부만 있으면 전송 허용.
    if ((trimmed.length === 0 && files.length === 0) || streaming) return;
    onSend(trimmed, files.length > 0 ? files : undefined);
    setValue("");
    setFiles([]);
    const ta = taRef.current;
    if (ta) ta.style.height = "auto";
  }, [value, files, streaming, onSend]);

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

  // Ctrl+V — 클립보드 이미지 paste(스크린샷 붙여넣기). 이미지 파일이
  // 있으면 첨부에 추가, 없으면(텍스트 paste) 브라우저 기본 동작 유지.
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!attachEnabled || streaming) return;
      const dt = e.clipboardData;
      const picked: File[] = [];
      for (const item of Array.from(dt.items ?? [])) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) picked.push(f);
        }
      }
      // items 가 비어도 files 폴백(브라우저별 차이).
      if (picked.length === 0) {
        for (const f of Array.from(dt.files ?? [])) {
          if (f.type.startsWith("image/")) picked.push(f);
        }
      }
      if (picked.length > 0) {
        e.preventDefault(); // 이미지 paste 는 첨부로(텍스트 입력 방지)
        addFiles(picked);
      }
    },
    [streaming, addFiles, attachEnabled],
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
              onPaste={onPaste}
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

          {/* 첨부 미리보기 — 이미지는 썸네일만(클릭 시 라이트박스), 그 외는
              아이콘 + 파일명 칩. 둘 다 X 로 제거. */}
          {files.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {files.map((f, i) => {
                const isImg = f.type.startsWith("image/");
                if (isImg) {
                  const url = URL.createObjectURL(f);
                  return (
                    <div
                      key={`${f.name}-${i}`}
                      style={{ position: "relative", flexShrink: 0 }}
                    >
                      {/* 썸네일만(파일명 텍스트 없음 — 사용자 요구). 클릭 시
                          라이트박스 미리보기. */}
                      <button
                        type="button"
                        onClick={() => setPreview({ url, name: f.name })}
                        aria-label={`${f.name} 미리보기`}
                        style={{
                          padding: 0,
                          border: "1px solid var(--t-neutral-8)",
                          borderRadius: 8,
                          background: "transparent",
                          cursor: "zoom-in",
                          display: "block",
                          lineHeight: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={f.name}
                          style={{
                            width: 56,
                            height: 56,
                            objectFit: "cover",
                            borderRadius: 7,
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={`${f.name} 제거`}
                        title="제거"
                        style={{
                          position: "absolute",
                          top: -7,
                          right: -7,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "1px solid var(--t-neutral-8)",
                          background: "var(--surface-default)",
                          color: "var(--text-subtle)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          boxShadow: "0 2px 6px -2px rgba(15,23,42,.18)",
                          transition: "color .12s, border-color .12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--agent-600)";
                          e.currentTarget.style.borderColor =
                            "var(--agent-300)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-subtle)";
                          e.currentTarget.style.borderColor =
                            "var(--t-neutral-8)";
                        }}
                      >
                        <X size={12} strokeWidth={2.4} aria-hidden />
                      </button>
                    </div>
                  );
                }
                return (
                  <div
                    key={`${f.name}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 8px",
                      borderRadius: 8,
                      border: "1px solid var(--t-neutral-8)",
                      background: "var(--t-neutral-4)",
                      fontSize: 11.5,
                      maxWidth: 200,
                    }}
                  >
                    <Paperclip
                      size={12}
                      style={{ color: "var(--text-subtle)", flexShrink: 0 }}
                      aria-hidden
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text-default)",
                      }}
                    >
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`${f.name} 제거`}
                      title="제거"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--text-subtle)",
                        display: "flex",
                        flexShrink: 0,
                        padding: 0,
                      }}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 라이트박스 — 썸네일 클릭 시 원본 확대. 배경/닫기 클릭으로 닫힘. */}
          {preview && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${preview.name} 미리보기`}
              onClick={() => setPreview(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
                padding: 32,
              }}
            >
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="미리보기 닫기"
                title="닫기"
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "white",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} aria-hidden />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name}
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  borderRadius: 8,
                }}
              />
            </div>
          )}

          {/* Tool chips — dev 에서 첨부/이미지 실동작(D1 환경분기). prod 는
              기존 disabled mock 유지. 데이터 소스는 여전히 미구현 mock. */}
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              aria-hidden
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
              }}
            />
            <button
              type="button"
              disabled={!attachEnabled || streaming}
              title={attachEnabled ? "파일 첨부" : "준비 중"}
              onClick={() => openPicker(".txt,.md,.csv,.json,.pdf,.docx,text/*")}
              style={{
                ...toolChip,
                cursor:
                  attachEnabled && !streaming ? "pointer" : "not-allowed",
              }}
            >
              <Paperclip size={11} aria-hidden />
              첨부
            </button>
            <button
              type="button"
              disabled={!attachEnabled || streaming}
              title={attachEnabled ? "이미지 첨부" : "준비 중"}
              onClick={() => openPicker("image/png,image/jpeg,image/webp,image/gif")}
              style={{
                ...toolChip,
                cursor:
                  attachEnabled && !streaming ? "pointer" : "not-allowed",
              }}
            >
              <ImageIcon size={11} aria-hidden />
              이미지
            </button>
            <button type="button" disabled title="준비 중" style={toolChip}>
              <Database size={11} aria-hidden />
              데이터 소스
            </button>

            {/* 마크다운 토글 — 행 오른쪽 끝(marginLeft auto). OFF 시
                응답이 마크다운 해석 없이 원문 텍스트 그대로 표시된다. */}
            <button
              type="button"
              role="switch"
              aria-checked={markdownEnabled}
              onClick={() => setMarkdownEnabled(!markdownEnabled)}
              title={
                markdownEnabled
                  ? "마크다운 켜짐 — 끄면 원문 그대로 표시"
                  : "마크다운 꺼짐 — 원문 그대로 표시 중"
              }
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "4px 2px",
                fontSize: 11.5,
                fontWeight: 500,
                color: "var(--text-subtle)",
              }}
            >
              <span style={{ whiteSpace: "nowrap" }}>마크다운</span>
              {/* 트랙 + 노브 (순수 CSS 스위치) */}
              <span
                aria-hidden
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: 30,
                  height: 17,
                  borderRadius: 999,
                  background: markdownEnabled
                    ? "var(--agent-500)"
                    : "var(--t-neutral-12)",
                  transition: "background .15s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: markdownEnabled ? 15 : 2,
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: "white",
                    boxShadow: "0 1px 3px rgba(15,23,42,.3)",
                    transition: "left .15s",
                  }}
                />
              </span>
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

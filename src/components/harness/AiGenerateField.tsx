"use client";

/**
 * AiGenerateField — 하네스 생성/편집 폼 상단의 "AI 생성" 입력+버튼.
 *
 * 사용자가 한 줄 요청(예: "PDF 표 추출 스킬")을 입력하고 버튼을 누르면
 * /api/harness/generate (gpt-5.4-mini) 가 kind 에 맞는 필드를 만들어
 * onResult 로 넘긴다 → 폼이 그 값을 자체 필드(name/description/body 등)에
 * 자동 입력. 사용자 결정 2026-05-21: 기존 입력 영역에 버튼만 추가하고
 * 생성 후 자동으로 인풋에 채운다.
 *
 * 서버 전용 OPENAI_API_KEY 로 동작(라우트). 실패는 인라인 메시지로 안내.
 */

import { useState, type ReactNode } from "react";
import type {
  GenerateKind,
  GenerateMode,
} from "@/lib/harness-introspect/generate";
import { input as inputStyle } from "./managerStyles";

/** AI 생성 버튼 — 카드 안 유일 강조 액션이라 보라 채움(agent-500)으로 명료하게. */
const aiBtnPrimary = {
  fontSize: 12,
  fontWeight: 600,
  height: 36,
  padding: "0 14px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--agent-500)",
  background: "var(--agent-500)",
  color: "white",
  cursor: "pointer",
  flexShrink: 0,
  whiteSpace: "nowrap" as const,
  lineHeight: 1,
};
const aiBtnDisabled = {
  ...aiBtnPrimary,
  border: "1px solid var(--lab-agent-border)",
  background: "var(--surface-default)",
  color: "var(--agent-600)",
  cursor: "default" as const,
  opacity: 0.7,
};

export function AiGenerateField({
  kind,
  placeholder,
  onResult,
}: {
  kind: GenerateKind;
  placeholder: string;
  /** 생성 결과(필드 객체)를 폼 state 로 반영. */
  onResult: (result: Record<string, string>) => void;
}): ReactNode {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 생성 모드(instruction 전용 — 사용자 택1). 기본 reference(디폴트 참조).
  // skill/subagent 는 이 토글을 노출하지 않으며 서버에서도 mode 무시.
  const [mode, setMode] = useState<GenerateMode>("reference");
  const showModeToggle = kind === "instruction";

  const run = async (): Promise<void> => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/harness/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // mode 는 instruction 일 때만 의미(서버가 그 외엔 무시). 항상 전송해도
        // 무해하나, 명시적으로 instruction 일 때만 실어 보낸다.
        body: JSON.stringify(
          showModeToggle ? { kind, prompt: p, mode } : { kind, prompt: p },
        ),
      });
      const data = (await res.json()) as {
        result?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !data.result) {
        setErr(data.error ?? `생성 실패 (HTTP ${res.status})`);
        return;
      }
      onResult(data.result);
    } catch {
      setErr("생성 중 네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: "var(--r-md)",
        // 배경·테두리·내부 요소를 같은 보라 패밀리로 묶어 인풋이 "떠 보이는" 언밸런스 제거.
        background: "var(--lab-agent-bg)",
        border: "1px solid var(--lab-agent-border)",
      }}
    >
      {/* 타이틀 줄 — 좌측 타이틀 + 우측 생성 모드 칩(instruction 전용). */}
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--agent-700)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
            ✨
          </span>
          AI 생성
          {/* 모델 표기는 타이틀에서 분리해 연한 mono 칩으로 — 위계 정리. */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--agent-600)",
              background: "var(--surface-default)",
              border: "1px solid var(--lab-agent-border)",
              borderRadius: 999,
              padding: "1px 7px",
              fontFamily: "var(--lab-font-mono)",
            }}
          >
            gpt-5.4-mini
          </span>
        </div>
        {/* 생성 모드 선택(instruction 전용) — 디폴트 참조 / 완전 재구성 택1. */}
        {showModeToggle && (
          <div style={{ display: "flex", gap: 6 }}>
            <ModeChip
              label="디폴트 참조"
              title="기본 인스트럭션을 참고자료로 동등한 분량·구조로 재작성"
              active={mode === "reference"}
              disabled={busy}
              onClick={() => setMode("reference")}
            />
            <ModeChip
              label="완전 재구성"
              title="기본 인스트럭션을 참조하지 않고 요청만으로 새로 생성"
              active={mode === "rewrite"}
              disabled={busy}
              onClick={() => setMode("rewrite")}
            />
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          // 인풋 테두리를 카드 배경과 같은 보라 패밀리로 맞춰 톤 통일.
          style={{ ...inputStyle, flex: 1, border: "1px solid var(--lab-agent-border)" }}
          value={prompt}
          placeholder={placeholder}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <button
          type="button"
          style={busy || !prompt.trim() ? aiBtnDisabled : aiBtnPrimary}
          disabled={busy || !prompt.trim()}
          onClick={() => void run()}
        >
          {busy ? "생성 중…" : "AI로 생성"}
        </button>
      </div>
      {err && (
        <div style={{ fontSize: 10.5, color: "var(--red-500)", marginTop: 6 }}>
          {err}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: "var(--agent-600)", marginTop: 8, opacity: 0.85 }}>
        한 줄로 요청하면 아래 항목을 자동으로 채웁니다. 생성 후 검토·수정해
        저장하세요.
        {showModeToggle &&
          (mode === "reference"
            ? " (디폴트 참조: 기본 인스트럭션 분량·구조 기준으로 충실하게 재작성)"
            : " (완전 재구성: 요청만으로 새로 생성 — 짧고 자유롭게)")}
      </div>
    </div>
  );
}

/** 생성 모드 선택 칩(디폴트 참조 / 완전 재구성) — agent 보라 활성. */
function ModeChip({
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        appearance: "none",
        cursor: disabled ? "default" : "pointer",
        padding: "4px 10px",
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: active ? 600 : 500,
        // 활성/비활성 모두 보라 패밀리 안에서 — 강조는 채움(흰 배경)으로만, 테두리는 연하게.
        border: "1px solid var(--lab-agent-border)",
        background: active ? "var(--surface-default)" : "transparent",
        color: active ? "var(--agent-700)" : "var(--agent-600)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

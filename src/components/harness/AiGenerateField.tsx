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
import type { GenerateKind } from "@/lib/harness-introspect/generate";
import { input as inputStyle, btnPrimary, btnDisabled } from "./managerStyles";

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

  const run = async (): Promise<void> => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/harness/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, prompt: p }),
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
        marginBottom: 14,
        padding: 12,
        borderRadius: "var(--r-md)",
        background: "var(--lab-agent-bg)",
        border: "1px solid var(--lab-agent-border)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--agent-700)",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ✨ AI 생성 (gpt-5.4-mini)
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
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
          style={busy || !prompt.trim() ? btnDisabled : btnPrimary}
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
      <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 6 }}>
        한 줄로 요청하면 아래 항목을 자동으로 채웁니다. 생성 후 검토·수정해
        저장하세요.
      </div>
    </div>
  );
}

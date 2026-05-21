"use client";

import type { ReactNode, CSSProperties } from "react";

export type TokenDisplayMode = "box" | "duo-color" | "shade";

interface TokenHighlightProps {
  pieces: string[];
  totalTokens?: number;
  mode?: TokenDisplayMode;
}

/** 공백 → · , 개행 → ↵ + 실제 줄바꿈 */
function renderPiece(piece: string): ReactNode {
  return <>{piece.replace(/ /g, "·").replace(/\n/g, "↵\n")}</>;
}

function tokenStyle(i: number, mode: TokenDisplayMode): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    borderRadius: 3,
    padding: "0 3px",
    margin: "0 1px",
    cursor: "default",
  };

  if (mode === "box") {
    return { ...base, border: "1px solid rgba(100,116,139,0.55)" };
  }

  if (mode === "duo-color") {
    const colors = [
      { bg: "rgba(59,130,246,0.18)", border: "rgba(59,130,246,0.55)" },
      { bg: "rgba(16,185,129,0.18)", border: "rgba(16,185,129,0.55)" },
    ] as const;
    const c = colors[i % 2];
    return { ...base, background: c.bg, borderBottom: `2px solid ${c.border}` };
  }

  // shade: 밝음/어둠 교대 (단일 색)
  return i % 2 === 0
    ? { ...base, background: "rgba(100,116,139,0.10)" }
    : { ...base, background: "rgba(100,116,139,0.22)", borderBottom: "2px solid rgba(100,116,139,0.5)" };
}

export function TokenHighlight({
  pieces,
  totalTokens,
  mode = "box",
}: TokenHighlightProps): ReactNode {
  return (
    <>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          lineHeight: 2.4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {pieces.map((piece, i) => (
          <span
            key={i}
            title={`토큰 #${i + 1}: ${JSON.stringify(piece)}`}
            style={tokenStyle(i, mode)}
          >
            {renderPiece(piece)}
          </span>
        ))}
      </div>
      {totalTokens != null && totalTokens > pieces.length && (
        <div
          style={{
            marginTop: 10,
            fontSize: 10.5,
            color: "var(--text-subtle)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          앞 {pieces.length.toLocaleString()}토큰 표시 중 (전체{" "}
          {totalTokens.toLocaleString()}토큰)
        </div>
      )}
    </>
  );
}

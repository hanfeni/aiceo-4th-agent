"use client";

import type { ReactNode } from "react";

/**
 * LabWorkbench — 검색·라벨링 실습 워크벤치 공용 표현 컴포넌트.
 *
 * 실험(B) 시안의 진행 메트릭 타일(Metric)·다크 터미널 로그(Terminal)를
 * index-lab·data-load 등에서 재사용한다(중복 정의 제거). il-* 토큰 사용.
 */

/** 진행 메트릭 타일(시안 BenchMetric). */
export function Metric({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}): ReactNode {
  return (
    <div className={highlight ? "il-metric il-metric--hl" : "il-metric"}>
      <div className="il-metric-label">{label}</div>
      <div className="il-metric-value">
        {value}
        {unit && <span className="il-metric-unit">{unit}</span>}
      </div>
    </div>
  );
}

/** 진행 로그 다크 터미널(시안 Terminal). 줄 prefix 로 색 구분. */
export function Terminal({
  lines,
  title,
}: {
  lines: string[];
  title?: string;
}): ReactNode {
  return (
    <div>
      {title && (
        <div className="il-term-bar">
          <span className="il-term-dot" style={{ background: "#ff5f57" }} />
          <span className="il-term-dot" style={{ background: "#febc2e" }} />
          <span className="il-term-dot" style={{ background: "#28c840" }} />
          <span
            className="il-mono"
            style={{
              marginLeft: 8,
              fontSize: 10.5,
              color: "var(--lab-term-dim)",
            }}
          >
            {title}
          </span>
        </div>
      )}
      <pre className="il-term">
        {lines.map((l, i) => (
          <TermLine key={i} line={l} />
        ))}
        {lines.length > 0 && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 13,
              background: "var(--lab-term-accent)",
              verticalAlign: "middle",
              animation: "ilPulse 1s infinite",
            }}
          />
        )}
      </pre>
    </div>
  );
}

function TermLine({ line }: { line: string }): ReactNode {
  let color = "var(--lab-term-fg)";
  if (line.startsWith("✓")) color = "var(--lab-term-success)";
  else if (line.includes("⚠")) color = "var(--lab-term-warn)";
  else if (line.startsWith("▶") || line.startsWith("·"))
    color = "var(--lab-term-accent)";
  else if (line.startsWith(" ")) color = "var(--lab-term-dim)";
  return <div style={{ color, whiteSpace: "pre" }}>{line}</div>;
}

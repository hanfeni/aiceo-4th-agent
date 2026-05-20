"use client";

import { Fragment, type ReactNode } from "react";
import type { StageStatus, StageNodeMeta } from "./pipelineNodes";

/**
 * LabWorkbench — 검색·라벨링 실습 워크벤치 공용 표현 컴포넌트.
 *
 * 실험(B) 시안: 진행 메트릭(Metric)·다크 터미널(Terminal)·상태칩
 * (StatusPill)·hero 파이프라인 카드 노드(PipelineNode/Connector/Row)를
 * index-lab·data-load·meta-lab·search-lab 에서 재사용(중복 제거). il-* 토큰.
 */

/** 상태칩(idle/running/done/error). il-status CSS 매핑(running→run). */
export function StatusPill({ status }: { status: StageStatus }): ReactNode {
  const map: Record<StageStatus, { cls: string; label: string }> = {
    idle: { cls: "idle", label: "대기" },
    running: { cls: "run", label: "진행 중" },
    done: { cls: "done", label: "완료" },
    error: { cls: "run", label: "실패" },
  };
  const m = map[status] ?? map.idle;
  return <span className={`il-status il-status--${m.cls}`}>{m.label}</span>;
}

/**
 * PipelineNode — hero 파이프라인 카드 노드(시안 라이트판). 상태별
 * ring/bg/badge + emphasis(🤖 LLM) 배지 + 상태 dot. onClick 없으면 클릭 불가.
 */
export function PipelineNode({
  node,
  status,
  onClick,
}: {
  node: { stage: number; label: string; hint: string; emphasis?: boolean };
  status: StageStatus;
  onClick?: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="il-pipe-card"
      data-status={status}
      data-emphasis={node.emphasis ? "true" : "false"}
      data-clickable={onClick ? "true" : "false"}
      disabled={!onClick}
      onClick={onClick}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
      >
        <span className="il-pipe-badge">
          {status === "done" ? "✓" : node.stage}
        </span>
        {node.emphasis && <span className="il-pipe-llm">🤖 LLM</span>}
        <span style={{ flex: 1 }} />
        <span className="il-pipe-dot" data-status={status}>
          {status === "done"
            ? "완료"
            : status === "running"
              ? "진행"
              : status === "error"
                ? "실패"
                : "대기"}
        </span>
      </div>
      <div className="il-pipe-label">{node.label}</div>
      <div className="il-pipe-hint">{node.hint}</div>
    </button>
  );
}

/** PipelineConnector — 노드 사이 SVG 화살표. passed/active blue, done green. */
export function PipelineConnector({
  fromStatus,
  toStatus,
}: {
  fromStatus: StageStatus;
  toStatus: StageStatus;
}): ReactNode {
  const active =
    toStatus === "running" || (fromStatus === "done" && toStatus === "done");
  const stroke = active
    ? "var(--blue-500)"
    : fromStatus === "done"
      ? "var(--green-400)"
      : "#d4d8df";
  const dashed = toStatus === "running";
  const markerId = `il-pl-arrow-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="il-pipe-conn">
      <svg
        width="28"
        height="14"
        viewBox="0 0 28 14"
        style={{ overflow: "visible" }}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={stroke} />
          </marker>
        </defs>
        <line
          x1="0"
          y1="7"
          x2="22"
          y2="7"
          stroke={stroke}
          strokeWidth="1.8"
          strokeDasharray={dashed ? "4 3" : undefined}
          markerEnd={`url(#${markerId})`}
        >
          {dashed && (
            <animate
              attributeName="stroke-dashoffset"
              from="14"
              to="0"
              dur="0.8s"
              repeatCount="indefinite"
            />
          )}
        </line>
      </svg>
    </div>
  );
}

/**
 * PipelineRow — 노드 카드 + 커넥터를 가로 균등 분배로 렌더(시안 PipelineRow).
 * stage→status 매핑 함수와 노드 클릭 핸들러를 받는다.
 */
export function PipelineRow({
  nodes,
  statusOf,
  onNodeClick,
}: {
  nodes: readonly StageNodeMeta[];
  statusOf: (stage: number) => StageStatus;
  onNodeClick?: (stage: number) => void;
}): ReactNode {
  return (
    <div className="il-pipe">
      {nodes.map((n, i) => (
        <Fragment key={n.stage}>
          <PipelineNode
            node={n}
            status={statusOf(n.stage)}
            onClick={onNodeClick ? () => onNodeClick(n.stage) : undefined}
          />
          {i < nodes.length - 1 && (
            <PipelineConnector
              fromStatus={statusOf(n.stage)}
              toStatus={statusOf(nodes[i + 1].stage)}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

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

"use client";

import type { CSSProperties, ReactNode } from "react";
import { AccessDiagram } from "./AccessDiagram";

/**
 * ComparePanels — RAG / Text-to-SQL / GraphRAG 결과를 3열로.
 *
 * 각 패널: LLM 이 생성한 쿼리(코드) → 실행 결과 → 자연어 해석.
 * 강의 핵심: 같은 질문인데 RAG 는 관계를 못 잇고, SQL 은 다중
 * JOIN 한계에 부딪히고, GraphRAG 만 경로 한 줄로 푼다 — 가
 * 화면에서 직접 대비된다(사용자 결정 메시지).
 *
 * GraphLabView 에서 분리: View 가 비대해지지 않게(1000줄 규칙)
 * + 패널 렌더 로직 응집. PanelState 는 양쪽 공유 타입.
 */

export interface PanelState {
  status: "idle" | "running" | "done" | "error";
  lang: string;
  code: string;
  resultRows: number | null;
  resultPreview: string;
  answer: string;
  error: string;
}

export function emptyPanels(): Record<string, PanelState> {
  const blank: PanelState = {
    status: "idle",
    lang: "",
    code: "",
    resultRows: null,
    resultPreview: "",
    answer: "",
    error: "",
  };
  return {
    rag: { ...blank },
    sql: { ...blank },
    graphrag: { ...blank },
  };
}

const META: Record<
  string,
  { title: string; sub: string; accent: string }
> = {
  rag: {
    title: "RAG",
    sub: "텍스트 검색 → LLM",
    accent: "var(--t-neutral-9, #8b8b8b)",
  },
  sql: {
    title: "Text-to-SQL",
    sub: "단일 테이블 쿼리 (대조군)",
    accent: "var(--t-warning-9, #d4a017)",
  },
  graphrag: {
    title: "GraphRAG",
    sub: "Neo4j 멀티홉 경로",
    accent: "var(--blue-500, #2563eb)",
  },
};

const STATUS_LABEL: Record<PanelState["status"], string> = {
  idle: "대기",
  running: "실행 중…",
  done: "완료",
  error: "오류",
};

const codeBox: CSSProperties = {
  margin: 0,
  padding: "8px 10px",
  fontSize: 10.5,
  lineHeight: 1.5,
  background: "var(--cf-soft-bg)",
  borderRadius: 6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  maxHeight: 160,
  overflowY: "auto",
};

function Panel({
  id,
  st,
}: {
  id: string;
  st: PanelState;
}): ReactNode {
  const m = META[id];
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        border: "1px solid var(--t-neutral-8)",
        borderTop: `3px solid ${m.accent}`,
        borderRadius: "var(--r-md, 8px)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface-default)",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <strong style={{ fontSize: 13, color: "var(--text-default)" }}>
            {m.title}
          </strong>
          <span
            style={{
              fontSize: 10,
              color:
                st.status === "error"
                  ? "var(--t-danger-11, #e5484d)"
                  : "var(--text-subtle)",
            }}
          >
            {STATUS_LABEL[st.status]}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
          {m.sub}
        </div>
      </div>

      {st.code && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-subtle)",
              marginBottom: 4,
            }}
          >
            LLM 이 생성한 {st.lang || "코드"}
          </div>
          <pre style={codeBox}>{st.code}</pre>
        </div>
      )}

      {st.resultRows !== null && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-subtle)",
              marginBottom: 4,
            }}
          >
            실행 결과 ({st.resultRows}행)
          </div>
          <pre style={codeBox}>{st.resultPreview}</pre>
        </div>
      )}

      {/* 데이터 접근 방식 도해 — code/result 에서 동적 파생.
          쿼리가 나온 뒤(code) 표시 → "이 쿼리가 데이터를 어떻게
          타는가"를 방식별 고유 도해로 대비(사용자 결정). */}
      {(st.code || st.resultRows !== null) && (
        <AccessDiagram
          method={id as "rag" | "sql" | "graphrag"}
          code={st.code}
          resultPreview={st.resultPreview}
          resultRows={st.resultRows}
        />
      )}

      {st.answer && (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text-default)",
            whiteSpace: "pre-wrap",
          }}
        >
          {st.answer}
        </div>
      )}

      {st.status === "error" && st.error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--t-danger-11, #e5484d)",
            lineHeight: 1.5,
          }}
        >
          ⚠️ {st.error}
        </div>
      )}
    </div>
  );
}

export function ComparePanels({
  panels,
}: {
  panels: Record<string, PanelState>;
}): ReactNode {
  const any = Object.values(panels).some((p) => p.status !== "idle");
  if (!any) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "stretch",
      }}
    >
      <Panel id="rag" st={panels.rag} />
      <Panel id="sql" st={panels.sql} />
      <Panel id="graphrag" st={panels.graphrag} />
    </div>
  );
}

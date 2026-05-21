"use client";

import type { CSSProperties, ReactNode } from "react";
import { AccessDiagram } from "./AccessDiagram";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";

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

/**
 * 방식별 메타 — 시안 B MethodPanel 톤. 결과 전 편향 제거(사용자 결정
 * 2026-05-21): verdict 칩(한계/부분답/압승)·🏆 트로피·GraphRAG highlight
 * 를 모두 제거해 세 패널을 동등하게. 학생이 결과를 직접 보고 판단하도록
 * (결론 미리 주기 금지). 결과 데이터 자체는 PanelState(실 SSE)에서 옴.
 */
const META: Record<string, { title: string; sub: string }> = {
  rag: {
    title: "RAG (벡터 검색)",
    sub: "텍스트 검색 → LLM",
  },
  sql: {
    title: "Text-to-SQL",
    sub: "단일 테이블 쿼리 (대조군)",
  },
  graphrag: {
    title: "GraphRAG (Cypher)",
    sub: "Neo4j 멀티홉 경로",
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
        // 세 패널 동등(편향 제거) — 균일 1.5px 보더·흰 배경·그림자 0.
        border: "1.5px solid var(--t-neutral-8)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface-default)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-subtle)",
            }}
          >
            {m.title}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            {/* 실행 상태만 표시(verdict 결론 칩 제거 — 편향 0). */}
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
          <div
            style={{
              fontSize: 10.5,
              color: "var(--text-subtle)",
              marginTop: 4,
            }}
          >
            {m.sub}
          </div>
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
        // 챗·DART 와 동일한 공통 마크다운 모듈(ChatMarkdown) 재사용.
        // raw pre-wrap 출력 시 **굵게**·-목록 등이 리터럴로 노출되던
        // 문제 해결 + rehypeRaw→rehypeSanitize 보안 체인 공통 적용.
        // className 으로 패널 톤(12px)만 오버라이드(사용자 결정).
        <ChatMarkdown
          content={st.answer}
          className="text-xs leading-relaxed [&]:text-[var(--text-default)]"
        />
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

      {/* idle 빈 상태 — 패널 틀은 항상 보이고 본문만 안내(시안 B:
          실행 전에도 3-pane 비교 구조가 노출됨). */}
      {st.status === "idle" && !st.code && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-subtle)",
            lineHeight: 1.5,
            padding: "8px 0",
          }}
        >
          실행하면 결과가 표시됩니다.
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
  // 시안 B: 실행 전에도 3-pane 패널 틀을 항상 노출(빈 상태 안내).
  return (
    <div
      style={{
        display: "grid",
        // 3열 균등(시안 B). 좁은 폭에선 자동 줄바꿈(minmax 0 → 오버플로 방지).
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        alignItems: "stretch",
      }}
    >
      <Panel id="rag" st={panels.rag} />
      <Panel id="sql" st={panels.sql} />
      <Panel id="graphrag" st={panels.graphrag} />
    </div>
  );
}

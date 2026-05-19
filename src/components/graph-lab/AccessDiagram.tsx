"use client";

import type { ReactNode } from "react";

/**
 * AccessDiagram — 세 방식이 데이터를 "어떻게 타고 가는가"를 방식별
 * 고유 SVG 도해로 시각화 (사용자 결정 2026-05-19: 방식별 고유 도해,
 * 쿼리별 동적).
 *
 * 핵심: 같은 질문인데 접근 경로가 구조적으로 다름을 그림으로 대비.
 *  - RAG     : 흩어진 텍스트 조각 (서로 연결선 없음 = 관계 못 잇음)
 *  - SQL     : 평면 테이블 1개 + 생성 SQL 의 JOIN 수만큼 자기참조
 *              화살표 (self-JOIN 이 늘수록 폭발하는 걸 시각화)
 *  - GraphRAG: 생성 Cypher 의 노드-엣지 경로 (멀티홉이 한 줄 경로)
 *
 * 서버 변경 0 — 각 패널이 이미 가진 code(생성 쿼리)/resultPreview
 * 에서 클라이언트가 도해 입력을 파생(추가 API 불요, 최속).
 */

export interface AccessDiagramProps {
  method: "rag" | "sql" | "graphrag";
  /** LLM 이 생성한 쿼리/코드 (구조 파생용) */
  code: string;
  /** 실행 결과 프리뷰 (행 수·항목 파생용) */
  resultPreview: string;
  resultRows: number | null;
}

const COL = {
  rag: "var(--t-neutral-9, #8b8b8b)",
  sql: "var(--t-warning-9, #d4a017)",
  graph: "var(--blue-500, #2563eb)",
};

const wrap = (children: ReactNode): ReactNode => (
  <div
    style={{
      marginTop: 8,
      padding: "10px 12px",
      background: "var(--cf-soft-bg)",
      borderRadius: 8,
      border: "1px dashed var(--t-neutral-8)",
    }}
  >
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-subtle)",
        marginBottom: 8,
      }}
    >
      데이터 접근 방식
    </div>
    {children}
  </div>
);

const chip = (
  text: string,
  bg: string,
  key: string | number,
): ReactNode => (
  <span
    key={key}
    style={{
      display: "inline-block",
      background: bg,
      color: "white",
      fontSize: 9.5,
      padding: "3px 7px",
      borderRadius: 5,
      margin: 2,
      maxWidth: 130,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

/** RAG: 매칭된 텍스트 조각이 흩어져 있고 서로 연결 없음. */
function RagDiagram({ preview }: { preview: string }): ReactNode {
  const items = preview
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && s !== "(매칭 없음)")
    .slice(0, 6);
  return wrap(
    <div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          매칭된 텍스트 조각 없음 — 텍스트만 봐선 잡히는 게 없음
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {items.map((t, i) => chip(t.slice(0, 22), COL.rag, i))}
        </div>
      )}
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "var(--text-subtle)",
          fontStyle: "italic",
        }}
      >
        ⚠ 조각들 사이에 <strong>연결선이 없음</strong> — 텍스트
        유사도만으로는 「누가 무엇을 보유」 관계를 못 잇는다.
      </div>
    </div>,
  );
}

/** SQL: 평면 테이블 1개 + JOIN 수만큼 자기참조 (self-JOIN 폭발). */
function SqlDiagram({ code }: { code: string }): ReactNode {
  const joins = (code.toLowerCase().match(/\bjoin\b/g) ?? []).length;
  const W = 280;
  const arcs = Array.from({ length: Math.min(joins, 4) });
  return wrap(
    <div>
      <svg width={W} height={96} style={{ maxWidth: "100%" }}>
        {/* 평면 테이블 박스 */}
        <rect
          x={W / 2 - 50}
          y={62}
          width={100}
          height={26}
          rx={5}
          fill={COL.sql}
        />
        <text
          x={W / 2}
          y={79}
          textAnchor="middle"
          fontSize={11}
          fill="white"
          fontWeight={600}
        >
          holdings
        </text>
        {/* JOIN 마다 자기참조 호 (위로 겹쳐 쌓임 = 폭발 시각화) */}
        {arcs.map((_, i) => {
          const r = 22 + i * 16;
          return (
            <path
              key={i}
              d={`M ${W / 2 - 40} 62 A ${r} ${r} 0 1 1 ${W / 2 + 40} 62`}
              fill="none"
              stroke={COL.sql}
              strokeWidth={1.5}
              opacity={0.55}
            />
          );
        })}
      </svg>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-subtle)",
          fontStyle: "italic",
        }}
      >
        {joins >= 2 ? (
          <>
            ⚠ self-JOIN <strong>{joins}회</strong> — 같은 테이블을
            계속 자기 자신과 이어붙임. 홉이 늘수록 호가 쌓이듯
            <strong> 쿼리가 폭발</strong>한다.
          </>
        ) : (
          <>단일 테이블 평면 접근 — 단순 집계엔 충분하나 다중 홉
            관계는 표현이 어렵다.</>
        )}
      </div>
    </div>,
  );
}

/** GraphRAG: Cypher 의 노드-엣지 패턴을 경로 도해로. */
function GraphDiagram({
  code,
  rows,
}: {
  code: string;
  rows: number | null;
}): ReactNode {
  // Cypher 의 (label) ... -[:REL]-> 패턴에서 노드 라벨 추출(경로 길이).
  const labels = [...code.matchAll(/\(\s*\w*\s*:\s*(\w+)/g)].map(
    (m) => m[1],
  );
  const hops = Math.max(labels.length, 2);
  const seq =
    labels.length > 0 ? labels.slice(0, 5) : ["Manager", "Company"];
  return wrap(
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {seq.map((l, i) => (
          <span
            key={i}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <span
              style={{
                background: COL.graph,
                color: "white",
                fontSize: 10,
                padding: "4px 9px",
                borderRadius: 14,
                fontWeight: 600,
              }}
            >
              {l}
            </span>
            {i < seq.length - 1 && (
              <span
                style={{
                  color: COL.graph,
                  margin: "0 4px",
                  fontSize: 13,
                }}
              >
                ─▶
              </span>
            )}
          </span>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10,
          color: "var(--text-subtle)",
          fontStyle: "italic",
        }}
      >
        ✓ <strong>{hops}홉 경로</strong>를 한 번의 traversal 로
        따라감{rows !== null ? ` → 결과 ${rows}건` : ""}. self-JOIN
        없이 관계를 그대로 이동 — GraphRAG 우월성의 핵심.
      </div>
    </div>,
  );
}

export function AccessDiagram({
  method,
  code,
  resultPreview,
  resultRows,
}: AccessDiagramProps): ReactNode {
  if (!code && !resultPreview) return null;
  if (method === "rag") return <RagDiagram preview={resultPreview} />;
  if (method === "sql") return <SqlDiagram code={code} />;
  return <GraphDiagram code={code} rows={resultRows} />;
}

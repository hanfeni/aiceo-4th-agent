"use client";

import { type ReactNode } from "react";

/**
 * SearchResults — 검색 실습 결과 표현 컴포넌트 모음 (시안 B).
 *
 * SearchLabView 의 return JSX 가 1000줄을 넘지 않도록 결과 렌더만
 * 분리(데이터 흐름·핸들러는 부모에 그대로). 시각은 시안 B 의
 * CompareCol / CompactHit / HitsList / RagAnswerBlock / Text2SqlResult
 * 동형 + 기존 il-* / cf-* 토큰. 실제 데이터(Hit/SqlResult)만 받는다.
 */

/** 검색 결과 1건 (SearchLabView Hit 와 동일 구조 — API SearchHit 정합). */
export interface Hit {
  doc_id: string;
  /** 청크 순번(doc 내). 청킹 OFF 면 0/undefined. */
  chunk_id?: number;
  title: string;
  snippet: string;
  /** 원문 본문(모달 전체보기). API SearchHit.body 정합. 없을 수도 있어 옵션. */
  body?: string;
  score: number;
  via?: string[];
}

/** Text-to-SQL 실행 결과 (컬럼 + 행). */
export interface SqlResult {
  columns: string[];
  rows: unknown[][];
}

// ─────────────────────────────────────────────────────────────
// CompactHit — 3-pane 비교용 1줄 카드(시안 CompactHit).
// 순위 배지 + 제목 + score/doc_id. 스니펫은 title 아래 1줄 클램프.
// ─────────────────────────────────────────────────────────────
function CompactHit({
  hit,
  rank,
  onOpenDoc,
}: {
  hit: Hit;
  rank: number;
  onOpenDoc?: (hit: Hit) => void;
}): ReactNode {
  const clickable = !!onOpenDoc;
  return (
    <div
      onClick={clickable ? () => onOpenDoc(hit) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenDoc(hit);
              }
            }
          : undefined
      }
      title={clickable ? "클릭 시 글 전체 보기" : undefined}
      style={{
        padding: "8px 10px",
        background: "var(--surface-default)",
        border: "1px solid var(--t-neutral-8)",
        borderRadius: 8,
        fontSize: 11.5,
        minWidth: 0,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 2,
        }}
      >
        <span
          className="il-mono"
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "var(--text-subtle)",
            background: "var(--medi-gray-100)",
            padding: "2px 5px",
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          #{rank}
        </span>
        <span
          style={{
            fontWeight: 600,
            color: "var(--text-default)",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {hit.title}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--text-subtle)",
        }}
      >
        <span
          className="il-mono"
          style={{ color: "var(--blue-700)", fontWeight: 700 }}
        >
          {hit.score.toFixed(2)}
        </span>
        {hit.via && hit.via.length > 0 && (
          <>
            <span>·</span>
            <span
              className="il-mono"
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {hit.via.join("+")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CompareCol — 3-pane 비교 1열(시안 CompareCol). 왼쪽 검색 방식 선택과
// 일치하는 열을 highlight(lexical/vector/hybrid → 해당 칼럼).
// 검색/RAG 모드의 결과를 같은 hits 로 나란히 보여준다(같은 검색어,
// 다른 방식의 결과 차이 — 시안 의도). 실제 단일 fetch 결과를 3열에
// 동일 표시(현재 데이터 흐름 보존 — 방식별 별도 fetch 없음).
// ─────────────────────────────────────────────────────────────
export function CompareCol({
  label,
  hits,
  hint,
  highlight,
  onOpenDoc,
}: {
  label: string;
  hits: Hit[];
  hint: string;
  highlight?: boolean;
  onOpenDoc?: (hit: Hit) => void;
}): ReactNode {
  return (
    <div
      style={{
        padding: 14,
        background: highlight ? "var(--lab-blue-bg)" : "var(--surface-default)",
        border: "1.5px solid",
        borderColor: highlight ? "var(--blue-300)" : "var(--t-neutral-8)",
        borderRadius: 12,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: highlight ? "var(--blue-700)" : "var(--text-subtle)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        {/* highlight = 왼쪽 "검색 방식"에서 현재 선택된 칼럼 표시.
            배경·테두리·라벨색으로만 강조(추천 배지 제거 — 사용자 결정 2026-05-21). */}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--text-subtle)",
          marginBottom: 10,
        }}
      >
        {hint}
      </div>
      {hits.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-subtle)",
            padding: "8px 0",
            textAlign: "center",
          }}
        >
          실행하면 결과가 표시됩니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hits.map((h, i) => (
            <CompactHit
              key={`${h.doc_id}#${h.chunk_id ?? 0}`}
              hit={h}
              rank={i + 1}
              onOpenDoc={onOpenDoc}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HitsList — 일반 검색 펼친 리스트(시안 HitsList). 순위 배지 + 제목 +
// score + 스니펫. RAG 근거([1] 제목)와 동일 패턴.
// ─────────────────────────────────────────────────────────────
export function HitsList({
  hits,
  onOpenDoc,
}: {
  hits: Hit[];
  onOpenDoc?: (hit: Hit) => void;
}): ReactNode {
  const clickable = !!onOpenDoc;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {hits.map((h, i) => (
        <div
          key={`${h.doc_id}#${h.chunk_id ?? 0}`}
          onClick={clickable ? () => onOpenDoc(h) : undefined}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenDoc(h);
                  }
                }
              : undefined
          }
          title={clickable ? "클릭 시 글 전체 보기" : undefined}
          style={{
            padding: "14px 16px",
            background: "var(--surface-default)",
            border: "1px solid var(--t-neutral-8)",
            borderRadius: 10,
            cursor: clickable ? "pointer" : "default",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <span
              className="il-mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--blue-700)",
                background: "var(--lab-blue-bg)",
                padding: "2px 7px",
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              #{i + 1}
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--text-default)",
              }}
            >
              {h.title}
            </span>
            <span style={{ flex: 1 }} />
            <span
              className="il-mono"
              style={{
                fontSize: 11,
                color: "var(--text-subtle)",
                whiteSpace: "nowrap",
              }}
            >
              score {h.score.toFixed(4)}
              {h.via ? ` · ${h.via.join("+")}` : ""}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-subtle)",
              lineHeight: 1.55,
            }}
          >
            {h.snippet}…
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RagAnswer — LLM 답변(스트리밍) + 검색 근거 출처 목록(시안
// RagAnswerBlock). 답변 본문은 실제 ragAnswer 토큰, 출처는 hits.
// ─────────────────────────────────────────────────────────────
export function RagAnswer({
  answer,
  hits,
  streaming,
  onOpenDoc,
}: {
  answer: string;
  hits: Hit[];
  streaming: boolean;
  onOpenDoc?: (hit: Hit) => void;
}): ReactNode {
  const clickable = !!onOpenDoc;
  return (
    <div>
      {/* 실제 LLM 답변 토큰(스트리밍). 시안의 하드코딩 본문 대신
          ragAnswer 그대로 — pre 로 줄바꿈·여백 보존. */}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 13,
          lineHeight: 1.7,
          color: "var(--text-default)",
          margin: 0,
          marginBottom: hits.length > 0 ? 12 : 0,
          fontFamily: "inherit",
        }}
      >
        {answer}
        {streaming ? " ▌" : ""}
      </pre>
      {hits.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            borderTop: "1px dashed var(--t-neutral-16)",
            paddingTop: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: "var(--text-subtle)",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            출처 ({hits.length}건)
          </div>
          {hits.map((h, i) => (
            <div
              key={`${h.doc_id}#${h.chunk_id ?? 0}`}
              onClick={clickable ? () => onOpenDoc(h) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenDoc(h);
                      }
                    }
                  : undefined
              }
              title={clickable ? "클릭 시 글 전체 보기" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--text-subtle)",
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <span
                className="il-mono"
                style={{
                  fontWeight: 700,
                  color: "var(--blue-700)",
                  flexShrink: 0,
                }}
              >
                [{i + 1}]
              </span>
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {h.title}
              </span>
              <span style={{ flex: 1 }} />
              <span
                className="il-mono"
                style={{ fontSize: 10, flexShrink: 0 }}
              >
                {h.score.toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SqlResultBlock — 생성 SQL(il-code) + 결과 표(시안 Text2SqlResult).
// 실제 t2sSql / t2sResult(또는 chart 변형 상태)를 받는다.
// ─────────────────────────────────────────────────────────────
export function SqlResultBlock({
  sql,
  result,
}: {
  sql: string;
  result: SqlResult | null;
}): ReactNode {
  return (
    <div>
      {sql && (
        <pre className="il-code" style={{ marginBottom: 12 }}>
          {sql}
        </pre>
      )}
      {result &&
        (result.rows.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            조건에 맞는 행이 없습니다. 질문을 바꿔 보세요.
          </div>
        ) : (
          <div
            style={{
              overflow: "auto",
              border: "1px solid var(--t-neutral-8)",
              borderRadius: 8,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: "var(--medi-gray-50)" }}>
                  {result.columns.map((c) => (
                    <th
                      key={c}
                      className="il-mono"
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: 10.5,
                        color: "var(--text-default)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: "8px 12px",
                          borderTop: "1px solid var(--t-neutral-8)",
                          color: "var(--text-subtle)",
                          whiteSpace: "nowrap",
                          maxWidth: 280,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={cell == null ? "" : String(cell)}
                      >
                        {cell == null ? "—" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DocViewModal — 검색 결과 1건 전체보기(fixed overlay). 아이템 클릭 시
// 제목·doc_id·score·방식 + 원문 body 를 모달로. body 미보유(옵션)면
// snippet 폴백. 메타라벨 SourceModal 톤 동형.
// ─────────────────────────────────────────────────────────────
export function DocViewModal({
  hit,
  onClose,
}: {
  hit: Hit;
  onClose: () => void;
}): ReactNode {
  const fullText = hit.body && hit.body.length > 0 ? hit.body : hit.snippet;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "rgba(15,23,42,0.45)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          borderRadius: "var(--r-lg, 12px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              className="il-mono"
              style={{ fontSize: 10.5, color: "var(--text-subtle)" }}
            >
              {hit.doc_id}
              {hit.chunk_id != null ? `#${hit.chunk_id}` : ""}
              {" · score "}
              {hit.score.toFixed(4)}
              {hit.via && hit.via.length > 0 ? ` · ${hit.via.join("+")}` : ""}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-default)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {hit.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid var(--t-neutral-8)",
              background: "var(--surface-default)",
              color: "var(--text-subtle)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div
          className="thin-scroll"
          style={{
            overflowY: "auto",
            padding: "16px 20px",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--text-default)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {fullText || "(본문 없음)"}
        </div>
      </div>
    </div>
  );
}

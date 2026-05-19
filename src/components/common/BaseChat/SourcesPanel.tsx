"use client";

import type { ReactNode } from "react";
import type { WebSource } from "@/types";

/**
 * SourcesPanel — 답변 본문 하단 참고 출처(References) 패널.
 *
 * 디자인 핸드오프(Claude Design "Chat Agent") chat.jsx:523 SourcesPanel
 * 을 픽셀 재현한다. 사용자 확정: 출처 인용 = "C · 풋노트/학술 스타일"
 * (References · N 헤더, sup [N] agent-600, 점선 상단 보더). 스코프
 * 확정: 하단 패널만(본문 인라인 [N] 칩·우측 드로어 제외).
 *
 * 디자인은 SOURCE_LIBRARY mock(title/author/date/snippet) 기반이나
 * 우리 데이터원은 실 web_search citation(title+url)뿐이라, 마크업·
 * 스타일은 그대로 두고 author/date 자리는 생략한다(README: "match
 * visual output; don't copy prototype structure unless it fits").
 * mock 의 "원문 열기 ↗"(드로어)는 우리는 실제 url → 새 탭 링크.
 *
 * 픽셀값 인용(chat.jsx:523-558):
 *  - 컨테이너: marginTop 18, paddingTop 12, 1px dashed t-neutral-16
 *  - 헤더: 10.5px UPPERCASE, letterSpacing .08em, weight 700, mb 8
 *  - 항목: 11.5px, lineHeight 1.55, gap 6 / sup 10px agent-600 weight 700
 *  - 링크: agent-600, underline
 */

export interface SourcesPanelProps {
  /** 참고 출처(web_search citation). 비면 패널 미표시(chat.jsx:502). */
  sources: WebSource[];
}

export function SourcesPanel({ sources }: SourcesPanelProps): ReactNode {
  if (sources.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 12,
        borderTop: "1px dashed var(--t-neutral-16)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: "var(--text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        References · {sources.length}
      </div>
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {sources.map((s, i) => (
          <li
            key={`${i}-${s.url}`}
            style={{
              // sup(vertical-align:super) 제거 → 2-column 그리드로
              // 번호·본문을 같은 기준선에 정렬(번호 고정폭 24, 본문
              // 가변). 제목 줄바꿈돼도 번호는 첫 줄에 고정·정렬 유지.
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              columnGap: 8,
              fontSize: 11.5,
              lineHeight: 1.55,
            }}
          >
            <span
              style={{
                color: "var(--agent-600)",
                fontWeight: 700,
                fontSize: 11.5,
                lineHeight: 1.55,
                textAlign: "right",
              }}
            >
              [{i + 1}]
            </span>
            <span style={{ color: "var(--text-default)", minWidth: 0 }}>
              <strong style={{ fontWeight: 600 }}>{s.title}</strong>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: 6,
                  color: "var(--agent-600)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 11.5,
                  wordBreak: "break-all",
                }}
              >
                원문 열기 ↗
              </a>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default SourcesPanel;

"use client";

/**
 * FormDivider — AI 생성 카드와 수동 입력 폼 필드 사이의 구분 헤더.
 *
 * 하네스 생성/편집 모달 3종(Instruction/Skill/Subagent)이 공유한다.
 * 상단 AiGenerateField(AI 자동 생성)와 하단 폼 필드(직접 입력)의 역할을
 * 시각적으로 분리해 "AI로 채울지 / 직접 쓸지"의 위계를 명확히 한다.
 *
 * 좌측 라벨 + 우측으로 뻗는 얇은 구분선 형태(label + hairline).
 */

import type { ReactNode } from "react";

export function FormDivider({ label = "직접 입력" }: { label?: string }): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "4px 0 14px",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--t-neutral-8)" }} />
    </div>
  );
}

export default FormDivider;

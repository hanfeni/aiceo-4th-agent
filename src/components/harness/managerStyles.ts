/**
 * 하네스 관리 패널 3종(Instruction/Skill/Subagent)이 공유하는 디자인 토큰
 * 기반 인라인 스타일. HarnessView 의 card/sectionTitle 스타일과 시각
 * 일관성을 맞추기 위해 같은 토큰(--surface/--text/--agent/--r-*)을 쓴다.
 *
 * 컴포넌트가 아니라 스타일 상수 모음이므로 "use client" 불필요(순수 객체).
 * 각 매니저 파일이 import 해 재사용 — 중복 인라인 스타일 폭주 방지.
 */

import type { CSSProperties } from "react";

/** HarnessView.card 와 동일(시각 일관). */
export const card: CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  marginBottom: 16,
};

export const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-default)",
  letterSpacing: "-0.01em",
  marginBottom: 4,
};

export const sectionDesc: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-subtle)",
  marginBottom: 14,
};

/** 목록 항목 1개 컨테이너. */
export const rowItem: CSSProperties = {
  padding: "12px 0",
  borderBottom: "1px solid var(--t-neutral-6)",
};

export const itemName: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text-default)",
  fontFamily: "var(--font-mono)",
};

export const itemDesc: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-subtle)",
  marginTop: 3,
  lineHeight: 1.6,
};

/** 내장/builtin 표시 칩. */
export const builtinChip: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--t-neutral-8)",
  color: "var(--text-subtle)",
};

/** 기본 버튼(보조 — 편집/취소). */
export const btnGhost: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: "5px 11px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--t-neutral-8)",
  background: "var(--surface-default)",
  color: "var(--text-default)",
  cursor: "pointer",
};

/** 강조 버튼(저장/새로 만들기) — 하네스 그룹 accent(보라). */
export const btnPrimary: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: "var(--r-md)",
  border: "none",
  background: "var(--agent-500)",
  color: "#fff",
  cursor: "pointer",
};

/** 위험 버튼(삭제). */
export const btnDanger: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: "5px 11px",
  borderRadius: "var(--r-md)",
  border: "1px solid color-mix(in srgb, #dc2626 40%, transparent)",
  background: "var(--surface-default)",
  color: "#dc2626",
  cursor: "pointer",
};

/** 비활성 버튼(내장 항목 편집·삭제 차단 시). */
export const btnDisabled: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: "5px 11px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--t-neutral-6)",
  background: "var(--surface-subtle)",
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  opacity: 0.7,
};

export const input: CSSProperties = {
  width: "100%",
  fontSize: 12.5,
  padding: "8px 10px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--t-neutral-8)",
  background: "var(--surface-default)",
  color: "var(--text-default)",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const textarea: CSSProperties = {
  ...input,
  minHeight: 140,
  lineHeight: 1.6,
  fontFamily: "var(--font-mono)",
  resize: "vertical",
};

export const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 5,
};

export const field: CSSProperties = { marginBottom: 12 };

/** 인라인 안내 메시지(성공=초록 / 실패=빨강). */
export function messageStyle(ok: boolean): CSSProperties {
  return {
    fontSize: 11.5,
    padding: "8px 11px",
    borderRadius: "var(--r-md)",
    marginBottom: 12,
    border: `1px solid ${
      ok
        ? "color-mix(in srgb, #16a34a 35%, transparent)"
        : "color-mix(in srgb, #dc2626 35%, transparent)"
    }`,
    background: ok
      ? "color-mix(in srgb, #16a34a 8%, transparent)"
      : "color-mix(in srgb, #dc2626 8%, transparent)",
    color: ok ? "#15803d" : "#dc2626",
  };
}

/** 액션 버튼 묶음 가로 정렬. */
export const actionRow: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

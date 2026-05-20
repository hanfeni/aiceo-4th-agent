/**
 * 하네스 관리 패널 3종(Instruction/Skill/Subagent)이 공유하는 디자인 토큰
 * 기반 인라인 스타일.
 */

import type { CSSProperties } from "react";

export const card: CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: "var(--r-lg)",
  padding: "20px 24px",
  marginBottom: 12,
};

export const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-default)",
  letterSpacing: "-0.01em",
};

export const sectionDesc: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-subtle)",
  lineHeight: 1.6,
  marginTop: 10,
  marginBottom: 18,
};

/** 목록 항목 1개 컨테이너. */
export const rowItem: CSSProperties = {
  padding: "11px 0",
  borderTop: "1px solid var(--t-neutral-6)",
};

export const itemName: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text-default)",
  fontFamily: "var(--font-mono)",
  flexShrink: 0,
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
  padding: "2px 7px",
  borderRadius: 99,
  background: "var(--t-neutral-8)",
  color: "var(--text-subtle)",
  flexShrink: 0,
  letterSpacing: "0.02em",
};

/** 행 액션 버튼 공통 베이스 — 모든 행 버튼 높이 26px 통일. */
const btnBase: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
  height: 26,
  padding: "0 10px",
  borderRadius: "var(--r-md)",
  cursor: "pointer",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
};

/** 보기 버튼 — 항목 미리보기 옆 모달 트리거. */
export const btnView: CSSProperties = {
  ...btnBase,
  border: "1px solid var(--t-neutral-8)",
  background: "transparent",
  color: "var(--text-subtle)",
};

/** 보조 버튼(편집/취소). */
export const btnGhost: CSSProperties = {
  ...btnBase,
  border: "1px solid var(--t-neutral-8)",
  background: "var(--surface-default)",
  color: "var(--text-default)",
};

/** 헤더용 새로 만들기 버튼 — 타이틀(13px/700) 행 높이에 맞춤. */
export const btnPrimary: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
  height: 24,
  padding: "0 10px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--t-neutral-8)",
  background: "var(--surface-default)",
  color: "var(--text-default)",
  cursor: "pointer",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

/** 위험 버튼(삭제). */
export const btnDanger: CSSProperties = {
  ...btnBase,
  border: "1px solid color-mix(in srgb, #dc2626 35%, transparent)",
  background: "transparent",
  color: "#dc2626",
};

/** 비활성 버튼(내장 항목 편집·삭제 차단 시). */
export const btnDisabled: CSSProperties = {
  ...btnBase,
  border: "1px solid var(--t-neutral-6)",
  background: "transparent",
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  opacity: 0.5,
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
    padding: "8px 12px",
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

/** 폼 액션 버튼 묶음(저장·취소). */
export const actionRow: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

/** 항목 행 — 이름·칩·미리보기·버튼 가로 정렬. */
export const rowItemInner: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
};

/** 미리보기 텍스트 — 한 줄 말줄임. */
export const previewText: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-subtle)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};

// ─────────────────────────────────────────────────────────────
// Lab Design 시안 톤 추가 스타일 (agent 보라 accent)
// HarnessView 워크벤치 탭 안에서 BenchHeader + 시안 목록·모달과 톤 일치.
// 기존 CRUD 로직은 그대로, 렌더만 이 스타일을 사용.
// ─────────────────────────────────────────────────────────────

/** 헤더 우측 액션 버튼(+ 새로 만들기 / 편집) — 보라 outline. 시안 lab-btn--sm 톤. */
export const benchAction: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  height: 28,
  padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--agent-500)",
  background: "var(--lab-agent-bg)",
  color: "var(--agent-700)",
  cursor: "pointer",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

/** 보라 채움 버튼(모달 저장). 시안 background:var(--agent-500). */
export const benchPrimarySolid: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  height: 30,
  padding: "0 14px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--agent-500)",
  background: "var(--agent-500)",
  color: "white",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

/** 모달 footer 보조 버튼(취소). */
export const benchModalGhost: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  height: 30,
  padding: "0 14px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--t-neutral-8)",
  background: "var(--surface-default)",
  color: "var(--text-default)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  lineHeight: 1,
};

/** 모달 footer 위험 버튼(삭제). */
export const benchModalDanger: CSSProperties = {
  ...benchModalGhost,
  border: "1px solid color-mix(in srgb, #dc2626 35%, transparent)",
  background: "transparent",
  color: "#dc2626",
};

/** 모달 헤더 우측 보라 mono 배지(headerExtra). */
export const benchModalBadge: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--agent-700)",
  background: "var(--lab-agent-bg)",
  padding: "4px 8px",
  borderRadius: 4,
  fontFamily: "var(--lab-font-mono)",
};

/** placeholder(미확정) 배지 — 시안 ⚠ PH. */
export const phBadge: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: "#92400e",
  background: "#fef3c7",
  padding: "2px 6px",
  borderRadius: 4,
  letterSpacing: "0.04em",
};

/** 서브에이전트 2열 카드 그리드 컨테이너. */
export const subagentGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

/** 서브에이전트 카드(시안 BenchCard 안 2열 카드). */
export const subagentCard: CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  textAlign: "left",
  padding: "14px 16px",
  background: "var(--surface-default)",
  border: "1.5px solid var(--t-neutral-8)",
  borderRadius: 10,
  width: "100%",
  display: "flex",
  flexDirection: "column",
};

/** 카드 이름(mono). */
export const subagentCardName: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--lab-font-mono)",
  color: "var(--text-default)",
};

/** 카드 설명 — 2줄 minHeight 확보. */
export const subagentCardDesc: CSSProperties = {
  fontSize: 11,
  color: "var(--text-subtle)",
  lineHeight: 1.5,
  marginBottom: 8,
  minHeight: 32,
};

/** 카드 하단 점선 위 메타(모델·tools수). */
export const subagentCardMeta: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10.5,
  color: "var(--text-subtle)",
  borderTop: "1px dashed var(--t-neutral-12)",
  paddingTop: 8,
  marginTop: "auto",
};

/** 스킬 행(시안 행 리스트 — name + source[mono] + 버튼). */
export const skillRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto auto",
  gap: 10,
  alignItems: "center",
  padding: "10px 14px",
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: 8,
};

/** 시안 톤 행 보조 버튼(편집/보기). */
export const rowBtn: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 11px",
  borderRadius: 6,
  border: "1px solid var(--t-neutral-8)",
  background: "var(--surface-default)",
  color: "var(--text-default)",
  cursor: "pointer",
  flexShrink: 0,
  whiteSpace: "nowrap",
};

/** 시안 톤 행 위험 버튼(삭제). */
export const rowBtnDanger: CSSProperties = {
  ...rowBtn,
  color: "#dc2626",
  borderColor: "transparent",
};

/** 시안 톤 행 비활성 버튼(내장 항목). */
export const rowBtnDisabled: CSSProperties = {
  ...rowBtn,
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  opacity: 0.5,
};

/** 인스트럭션 변형 행(활성/내장 표시). */
export const instructionRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto auto",
  gap: 8,
  alignItems: "center",
  padding: "10px 14px",
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: 8,
};

/** 폼 래퍼(시안 톤 — agent 보라 hint). */
export const formWrap: CSSProperties = {
  border: "1px solid var(--lab-agent-border)",
  borderRadius: "var(--r-md)",
  padding: 14,
  marginBottom: 14,
  background: "var(--lab-agent-bg)",
};

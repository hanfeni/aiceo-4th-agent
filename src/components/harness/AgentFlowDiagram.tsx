"use client";

import type { ReactNode } from "react";

/**
 * AgentFlowDiagram — 에이전트 생성 모달의 "작동 원리" 설명 영역.
 *
 * 두 섹션:
 *  1. 구성 요소 카드 3개 — INSTRUCTION / SKILL / SUBAGENT 역할 설명
 *  2. 생성 흐름 화살표 다이어그램 — 요청 입력 → AI 분석 → 확인 → 일괄 저장
 *
 * bundle 생성 전(Step 1 초기 상태)에만 표시된다. AgentBuilder 1000줄 초과
 * 방지 목적으로 분리(CLAUDE.md 단일 파일 1000줄 초과 금지).
 */

const COMPONENTS = [
  {
    badge: "INSTRUCTION",
    title: "인스트럭션",
    desc: "에이전트의 성격·어조·행동 원칙을 정의하는 시스템 프롬프트",
  },
  {
    badge: "SKILL",
    title: "스킬",
    desc: "웹 검색·파일 처리 등 에이전트가 사용할 수 있는 도구 기능",
  },
  {
    badge: "SUBAGENT",
    title: "서브에이전트",
    desc: "특정 업무를 전담하는 보조 AI — 메인 에이전트가 위임",
  },
];

const STEPS = [
  {
    icon: "💬",
    label: "요청 입력",
    detail: "한 줄로 에이전트 목적을 설명합니다.",
  },
  {
    icon: "✨",
    label: "AI 분석·설계",
    detail: "AI가 필요한 스킬·서브에이전트를 제안합니다.",
  },
  {
    icon: "✅",
    label: "제안 확인·수정",
    detail: "포함 여부를 체크하고 이름·설명을 수정합니다.",
  },
  {
    icon: "🚀",
    label: "일괄 저장",
    detail: "스킬 → 서브에이전트 → 에이전트 순으로 생성되고 사이드바에 표시됩니다.",
  },
];

export function AgentFlowDiagram(): ReactNode {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "14px 16px",
        borderRadius: "var(--r-md)",
        background: "var(--surface-default)",
        border: "1px solid var(--t-neutral-8)",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--text-subtle)",
          marginBottom: 14,
        }}
      >
        작동 원리
      </div>

      {/* 구성 요소 카드 3개 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {COMPONENTS.map((item) => (
          <div
            key={item.badge}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--lab-agent-bg)",
              border: "1px solid var(--lab-agent-border)",
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "var(--agent-700)",
                marginBottom: 4,
              }}
            >
              {item.badge}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text-default)",
                marginBottom: 4,
              }}
            >
              {item.title}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              {item.desc}
            </div>
          </div>
        ))}
      </div>

      {/* 생성 흐름 서브 헤더 */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-subtle)",
          marginBottom: 10,
        }}
      >
        생성 흐름
      </div>

      {/* 화살표 다이어그램 */}
      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto" }}>
        {STEPS.map((step, i) => (
          <div
            key={step.label}
            style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}
          >
            <div
              style={{
                flex: 1,
                padding: "10px 10px",
                borderRadius: 8,
                background: "var(--lab-agent-bg)",
                border: "1px solid var(--lab-agent-border)",
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 5 }}>{step.icon}</div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "var(--agent-700)",
                  marginBottom: 3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {i + 1}. {step.label}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-subtle)", lineHeight: 1.45 }}>
                {step.detail}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flexShrink: 0,
                  width: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--agent-500)",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

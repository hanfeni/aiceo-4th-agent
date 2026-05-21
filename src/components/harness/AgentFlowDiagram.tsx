"use client";

import type { ReactNode } from "react";
import type { FlowStep } from "@/lib/harness-introspect/generate";

/**
 * AgentBundleFlow — AI가 생성한 에이전트 동작 흐름 다이어그램.
 *
 * flowSteps(from→to 노드 배열)와 flowSummary(전체 요약)를 받아
 * 시각적 화살표 다이어그램 + 요약 설명으로 렌더링한다.
 *
 * toKind 별 색상:
 *  - user    → 회색 (시작점)
 *  - agent   → 보라 (메인 에이전트)
 *  - subagent → 인디고 (서브에이전트)
 *  - skill   → 초록 (스킬)
 *  - result  → 주황 (최종 답변)
 *
 * AgentFlowDiagram(정적 설명용)은 번들 생성 전 표시,
 * AgentBundleFlow(AI 생성 결과용)는 번들 생성 후 Step2 상단에 표시.
 * 두 컴포넌트 모두 이 파일에서 export.
 */

// ── 노드 종류별 스타일 ────────────────────────────────────────────────────────

const KIND_STYLE: Record<
  FlowStep["toKind"],
  { bg: string; border: string; color: string; badge: string }
> = {
  user: {
    bg: "var(--t-neutral-4, #f8f9fa)",
    border: "var(--t-neutral-12, #dee2e6)",
    color: "var(--text-subtle)",
    badge: "USER",
  },
  agent: {
    bg: "var(--lab-agent-bg)",
    border: "var(--agent-500)",
    color: "var(--agent-700)",
    badge: "AGENT",
  },
  subagent: {
    bg: "var(--t-indigo-4, #edf2ff)",
    border: "var(--t-indigo-12, #bac8ff)",
    color: "var(--indigo-700, #364fc7)",
    badge: "SUBAGENT",
  },
  skill: {
    bg: "var(--t-green-4, #ebfbee)",
    border: "var(--t-green-12, #b2f2bb)",
    color: "var(--green-700, #2f9e44)",
    badge: "SKILL",
  },
  result: {
    bg: "var(--t-orange-4, #fff4e6)",
    border: "var(--t-orange-12, #ffd8a8)",
    color: "var(--orange-700, #c76b00)",
    badge: "OUTPUT",
  },
};

// ── 노드 컴포넌트 ─────────────────────────────────────────────────────────────

function FlowNode({ name, kind }: { name: string; kind: FlowStep["toKind"] }): ReactNode {
  const s = KIND_STYLE[kind];
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: s.bg,
        border: `1.5px solid ${s.border}`,
        minWidth: 90,
        maxWidth: 160,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.07em",
          color: s.color,
          marginBottom: 3,
          textTransform: "uppercase",
        }}
      >
        {s.badge}
      </div>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: s.color,
          wordBreak: "break-word",
          lineHeight: 1.3,
        }}
      >
        {name}
      </div>
    </div>
  );
}

// ── AI 생성 동작 흐름 다이어그램 ─────────────────────────────────────────────

export function AgentBundleFlow({
  flowSteps,
  flowSummary,
}: {
  flowSteps: FlowStep[];
  flowSummary: string;
}): ReactNode {
  if (flowSteps.length === 0) return null;

  // 중복 없는 노드 목록 순서대로 추출 (from 첫 등장 + 모든 to)
  const nodeMap = new Map<string, FlowStep["toKind"]>();
  for (const step of flowSteps) {
    if (!nodeMap.has(step.from)) {
      // from 의 kind 는 직전 step 의 toKind 로 추론
      const prev = [...nodeMap.entries()].find(([n]) => n === step.from);
      nodeMap.set(step.from, prev ? prev[1] : "user");
    }
    nodeMap.set(step.to, step.toKind);
  }

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
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-subtle)",
          }}
        >
          동작 흐름
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "var(--agent-700)",
            background: "var(--lab-agent-bg)",
            border: "1px solid var(--lab-agent-border)",
            borderRadius: 999,
            padding: "1px 7px",
          }}
        >
          AI 생성
        </span>
      </div>

      {/* 요약 설명 */}
      {flowSummary && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-default)",
            lineHeight: 1.65,
            marginBottom: 16,
            padding: "10px 12px",
            background: "var(--lab-agent-bg)",
            border: "1px solid var(--lab-agent-border)",
            borderRadius: 8,
          }}
        >
          {flowSummary}
        </div>
      )}

      {/* 화살표 다이어그램 — 가로 스크롤 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {flowSteps.map((step, i) => (
          <div
            key={`${step.from}-${step.to}-${i}`}
            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            {/* 시작 노드 (첫 스텝만) */}
            {i === 0 && (
              <>
                <FlowNode
                  name={step.from}
                  kind={step.from === "사용자" ? "user" : (nodeMap.get(step.from) ?? "agent")}
                />
                <Arrow label={step.action} />
              </>
            )}
            {/* 도착 노드 */}
            <FlowNode name={step.to} kind={step.toKind} />
            {/* 다음 화살표 (마지막 아닐 때) */}
            {i < flowSteps.length - 1 && (
              <Arrow label={flowSteps[i + 1].action} />
            )}
          </div>
        ))}
      </div>

      {/* 범례 */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        {(Object.entries(KIND_STYLE) as Array<[FlowStep["toKind"], typeof KIND_STYLE[FlowStep["toKind"]]]>).map(
          ([kind, s]) => (
            <div
              key={kind}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: s.bg,
                  border: `1.5px solid ${s.border}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 9.5, color: "var(--text-subtle)", fontWeight: 600 }}>
                {s.badge}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string }): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "0 4px",
        flexShrink: 0,
        minWidth: 60,
        maxWidth: 90,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--text-subtle)",
          textAlign: "center",
          lineHeight: 1.3,
          wordBreak: "keep-all",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          gap: 0,
        }}
      >
        <div style={{ flex: 1, height: 1.5, background: "var(--agent-400, #9775fa)" }} />
        <div
          style={{
            fontSize: 12,
            color: "var(--agent-500)",
            lineHeight: 1,
            marginLeft: -1,
          }}
        >
          ▶
        </div>
      </div>
    </div>
  );
}

// ── 정적 작동 원리 다이어그램 (번들 생성 전 표시) ─────────────────────────────

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

const STATIC_STEPS = [
  { icon: "💬", label: "요청 입력",    detail: "한 줄로 에이전트 목적을 설명합니다." },
  { icon: "✨", label: "AI 분석·설계", detail: "AI가 필요한 스킬·서브에이전트를 제안합니다." },
  { icon: "✅", label: "제안 확인",    detail: "포함 여부를 체크하고 이름·설명을 수정합니다." },
  { icon: "🚀", label: "일괄 저장",    detail: "스킬 → 서브에이전트 → 에이전트 순으로 생성됩니다." },
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
      <div
        style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 14,
        }}
      >
        작동 원리
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        {COMPONENTS.map((item) => (
          <div
            key={item.badge}
            style={{
              padding: "10px 12px", borderRadius: 8,
              background: "var(--lab-agent-bg)", border: "1px solid var(--lab-agent-border)",
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--agent-700)", marginBottom: 4 }}>
              {item.badge}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-default)", marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              {item.desc}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 10 }}>
        생성 흐름
      </div>
      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto" }}>
        {STATIC_STEPS.map((step, i) => (
          <div key={step.label} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
            <div style={{
              flex: 1, padding: "10px 10px", borderRadius: 8,
              background: "var(--lab-agent-bg)", border: "1px solid var(--lab-agent-border)", minWidth: 0,
            }}>
              <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 5 }}>{step.icon}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--agent-700)", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {i + 1}. {step.label}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-subtle)", lineHeight: 1.45 }}>{step.detail}</div>
            </div>
            {i < STATIC_STEPS.length - 1 && (
              <div style={{ flexShrink: 0, width: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--agent-500)", fontSize: 14, fontWeight: 700 }}>
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

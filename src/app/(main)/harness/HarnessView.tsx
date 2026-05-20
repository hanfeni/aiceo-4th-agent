"use client";

/**
 * HarnessView — 하네스 워크벤치 (Lab Design 시안 B · agent 보라 accent).
 *
 * 레이아웃: 다른 5개 검색·라벨링 메뉴와 동일한 il-bench(좌 320 설정 / 우 1fr
 * 워크벤치) 구조. 단 그룹이 "AI 에이전트"라 accent 는 blue 가 아니라 보라
 * (--agent-700 / --lab-agent-bg). 페이지 루트는 cf-scope--agent 로 cf-* 를
 * 보라로 스코프(globals.css).
 *
 * 데이터·CRUD 보존(절대 규칙 R1):
 *  - view prop(toggles/systemPrompt/tools/subagents/skills)은 읽기 전용 표시.
 *    toggles 는 환경변수(HARNESS_*) 제어라 UI 토글 스위치는 표시용(읽기 전용).
 *  - InstructionManager / SkillManager / SubagentManager 는 각자
 *    /api/harness/* CRUD 를 가진 동작 컴포넌트 — 로직 변경 없이 탭 컨텐츠로
 *    그대로 배치(자체 card 헤더를 그리므로 이중 테두리 방지 위해 추가 카드
 *    래퍼 없이 마진만 정리).
 *  - 도구 탭은 view.tools 를 ToolRow(C/S 뱃지)로 리스트 + 클릭 시 기존
 *    ContentModal 로 상세(parameters/configValues).
 */

import { useState, type ReactNode } from "react";
import type { HarnessView as HarnessViewData } from "@/lib/harness-introspect/view";
import { InstructionManager } from "@/components/harness/InstructionManager";
import { SkillManager } from "@/components/harness/SkillManager";
import { SubagentManager } from "@/components/harness/SubagentManager";
import { ContentModal } from "@/components/harness/ContentModal";

type TabKey = "tools" | "subagents" | "skills" | "instruction";

// ── 좌측: 요소 토글 스위치(표시용 — 실제 토글은 환경변수 제어) ─────────────

/** 시안 ToggleSwitch — 읽기 전용 상태 표시(클릭 비활성). agent 보라. */
function ToggleSwitch({ on }: { on: boolean }): ReactNode {
  return (
    <div
      style={{
        width: 32,
        height: 18,
        borderRadius: 99,
        background: on ? "var(--agent-500)" : "var(--t-neutral-12)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: 99,
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,.15)",
        }}
      />
    </div>
  );
}

/** 좌측 통계 타일(시안 AgentStat). accent=보라 강조. */
function AgentStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}): ReactNode {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: accent ? "var(--lab-agent-bg)" : "var(--surface-default)",
        border: "1px solid",
        borderColor: accent ? "var(--lab-agent-border)" : "var(--t-neutral-8)",
        borderRadius: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: accent ? "var(--agent-700)" : "var(--text-default)",
          marginTop: 2,
          fontFamily: "var(--font-mono)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── 좌측 패널(토글 + 메인 에이전트 메타 + 통계) ─────────────────────────────

function AsidePanel({
  view,
  counts,
  instructionCount,
}: {
  view: HarnessViewData;
  counts: { tools: number; subagents: number; skills: number };
  /** 인스트럭션 변형 수(InstructionManager 보고분). 미보고 시 undefined → "기본" 표기. */
  instructionCount?: number;
}): ReactNode {
  // 시안 HARNESS_TOGGLES — 실제 값은 view.toggles(읽기 전용).
  const toggles: { key: keyof HarnessViewData["toggles"]; label: string; sub: string }[] = [
    { key: "planning", label: "Planning", sub: "계획 수립 미들웨어" },
    { key: "filesystem", label: "Filesystem", sub: "파일 도구 (read/write/edit/ls)" },
    { key: "subagents", label: "Subagents", sub: "서브에이전트 위임 (task 도구)" },
    { key: "skills", label: "Skills", sub: "스킬 미들웨어 (progressive disclosure)" },
  ];
  const clientTools = view.tools.filter((t) => t.kind === "client").length;
  const serverTools = view.tools.filter((t) => t.kind === "server").length;
  const placeholderSubs = view.subagents.filter((s) => s.isPlaceholder).length;

  return (
    <div className="il-bench-aside">
      {/* ① 요소 토글 + 메인 에이전트 메타 카드(agent gradient) */}
      <div
        className="il-card"
        style={{
          borderColor: "var(--lab-agent-border)",
          background:
            "linear-gradient(180deg, var(--surface-default), var(--lab-agent-bg) 100%)",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: "var(--agent-700)",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          요소 토글
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {toggles.map((t) => {
            const on = view.toggles[t.key];
            return (
              <div
                key={t.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 10px",
                  background: "var(--surface-default)",
                  // 레퍼런스: 토글 행은 옅은 보더로 통일(활성도 보라 보더
                  // 아님 — 또렷한 아웃라인 제거). 활성 구분은 라벨 색으로만.
                  border: "1px solid var(--t-neutral-8)",
                  borderRadius: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: on ? "var(--agent-700)" : "var(--text-default)",
                    }}
                  >
                    {t.label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 1 }}>
                    {t.sub}
                  </div>
                </div>
                <ToggleSwitch on={on} />
              </div>
            );
          })}
        </div>

        {/* 현재 메인 에이전트 메타 */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px dashed var(--t-neutral-12)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--agent-700)",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            현재 메인 에이전트
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-default)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            gpt-4o
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
            인스트럭션:{" "}
            <strong style={{ color: "var(--agent-700)" }}>기본</strong>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 2 }}>
            도구 {counts.tools}개 · 서브에이전트 {counts.subagents}개
          </div>
        </div>
      </div>

      {/* ② 통계 카드(실제 view 카운트) */}
      <div className="il-card" style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <AgentStat
            label="도구"
            value={counts.tools}
            sub={`C ${clientTools} · S ${serverTools}`}
            accent
          />
          <AgentStat
            label="서브"
            value={counts.subagents}
            sub={placeholderSubs > 0 ? `PH ${placeholderSubs}` : "위임"}
          />
          <AgentStat
            label="스킬"
            value={counts.skills}
            sub={view.toggles.skills ? "활성" : "비활성"}
          />
          <AgentStat
            label="인스트럭션"
            value={instructionCount ?? "기본"}
            sub="기본 활성"
          />
        </div>
      </div>
    </div>
  );
}

// ── 우측 도구 탭: ToolRow(C/S 뱃지) + 상세 모달 ────────────────────────────

type ToolView = HarnessViewData["tools"][number];

/** 시안 ToolRow — C/S 뱃지 + name + desc, 클릭 시 상세 모달. */
function ToolRow({ tool, onClick }: { tool: ToolView; onClick: () => void }): ReactNode {
  const isClient = tool.kind === "client";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        cursor: "pointer",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 14px",
        background: "var(--surface-default)",
        border: "1px solid var(--t-neutral-8)",
        borderRadius: 8,
        width: "100%",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          background: isClient ? "var(--lab-agent-bg)" : "var(--lab-blue-bg)",
          color: isClient ? "var(--agent-700)" : "var(--blue-700)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {isClient ? "C" : "S"}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color: "var(--text-default)",
          }}
        >
          {tool.name}
          {tool.displayName && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-subtle)",
                marginLeft: 8,
                fontFamily: "var(--font-sans, inherit)",
              }}
            >
              {tool.displayName}
            </span>
          )}
        </div>
        {tool.description && (
          <div
            style={{
              fontSize: 10.5,
              color: "var(--text-subtle)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tool.description}
          </div>
        )}
      </div>
      <span
        className="il-mono"
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          padding: "2px 7px",
          borderRadius: 4,
          background: "var(--medi-gray-100)",
          color: "var(--text-subtle)",
        }}
      >
        {tool.kind}
      </span>
    </button>
  );
}

/** 도구 상세 모달(ContentModal 재사용) — parameters/configValues 표시. */
function ToolDetailModal({
  tool,
  onClose,
}: {
  tool: ToolView;
  onClose: () => void;
}): ReactNode {
  const isClient = tool.kind === "client";
  const schema = tool.parametersSchema ?? tool.configValues;
  return (
    <ContentModal
      title={tool.name}
      subtitle={`${
        isClient ? "ClientTool — 우리 측 실행" : "ServerTool — provider 측 실행"
      }${tool.displayName ? ` · ${tool.displayName}` : ""}`}
      onClose={onClose}
    >
      {tool.description && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-default)",
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          {tool.description}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {isClient
          ? "LLM 사용 명세 (parameters)"
          : "구성값 (provider 가 입력 명세 관리)"}
      </div>
      {schema ? (
        <pre className="il-code">{JSON.stringify(schema, null, 2)}</pre>
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--text-subtle)", fontStyle: "italic" }}>
          표시할 명세가 없습니다(provider 내장 도구이거나 schema 미보유).
        </div>
      )}
    </ContentModal>
  );
}

// ── 우측 탭 컨텐츠 카드 헤더(BenchCard 보라 변형) ───────────────────────────

export function BenchHeader({
  label,
  title,
  status,
}: {
  label: string;
  title: string;
  status?: ReactNode;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="il-bench-label">{label}</span>
        <span
          style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-default)" }}
        >
          {title}
        </span>
      </div>
      {status}
    </div>
  );
}

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────

export function HarnessView({ view }: { view: HarnessViewData }): ReactNode {
  const [tab, setTab] = useState<TabKey>("tools");
  const [showTool, setShowTool] = useState<ToolView | null>(null);
  // 인스트럭션 변형 수 — InstructionManager 가 로드 후 보고(통계 타일 정직값).
  // 탭 전환으로 매니저가 언마운트돼도 마지막 보고값을 유지.
  const [instructionCount, setInstructionCount] = useState<number | undefined>(undefined);

  const counts = {
    tools: view.tools.length,
    subagents: view.subagents.length,
    skills: view.skills.sources.length,
  };

  // 탭 정의 — 라벨에 실제 카운트 반영(인스트럭션은 정적).
  const tabs: { key: TabKey; label: string }[] = [
    { key: "tools", label: `도구 ${counts.tools}` },
    { key: "subagents", label: `서브에이전트 ${counts.subagents}` },
    { key: "skills", label: `스킬 ${counts.skills}` },
    { key: "instruction", label: "시스템 인스트럭션" },
  ];

  return (
    <div
      className="thin-scroll cf-scope--agent"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 24px 64px" }}>
        {/* 헤더(시안 HarnessPage) — agent eyebrow + 타이틀 + 서브타이틀 */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--agent-700)",
              textTransform: "uppercase",
              background: "var(--lab-agent-bg-2)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            AI 에이전트 · 하네스
          </span>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-default)",
              margin: "8px 0 0",
              letterSpacing: "-0.015em",
            }}
          >
            하네스 워크벤치
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-subtle)",
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            좌측에 요소 토글·메타·통계, 우측 탭에서 도구·서브에이전트·스킬·시스템
            인스트럭션을 한 화면에. 토글은 환경변수로 제어(읽기 전용)되고,
            서브에이전트·스킬·인스트럭션은 탭에서 직접 만들고 편집·삭제합니다.
          </p>
        </div>

        <div className="il-bench">
          {/* ─── 좌측: 토글 · 메타 · 통계 ─── */}
          <AsidePanel view={view} counts={counts} instructionCount={instructionCount} />

          {/* ─── 우측: 탭 워크벤치 ─── */}
          <div style={{ minWidth: 0 }}>
            {/* 탭 헤더(agent 보라 활성) */}
            <div
              style={{
                background: "var(--surface-default)",
                border: "1px solid var(--t-neutral-8)",
                borderRadius: 12,
                padding: 6,
                marginBottom: 14,
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
              }}
            >
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    style={{
                      appearance: "none",
                      cursor: "pointer",
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: active ? "var(--lab-agent-bg)" : "transparent",
                      color: active ? "var(--agent-700)" : "var(--text-subtle)",
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* tools 탭 — view.tools 를 ToolRow 리스트 + 상세 모달 */}
            {tab === "tools" && (
              <div className="il-card">
                <BenchHeader label="TOOLS" title="에이전트가 호출 가능한 도구" />
                {view.tools.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                    등록된 도구가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {view.tools.map((t) => (
                      <ToolRow key={t.name} tool={t} onClick={() => setShowTool(t)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* subagents 탭 — SubagentManager(실제 CRUD). 자체 card 헤더를
                그리므로 추가 카드 래퍼 없이 그대로 배치(이중 테두리 방지). */}
            {tab === "subagents" && (
              <div className="harness-tab-body">
                <SubagentManager />
              </div>
            )}

            {/* skills 탭 — SkillManager(실제 CRUD). */}
            {tab === "skills" && (
              <div className="harness-tab-body">
                <SkillManager />
              </div>
            )}

            {/* instruction 탭 — InstructionManager(실제 CRUD · 시스템 프롬프트). */}
            {tab === "instruction" && (
              <div className="harness-tab-body">
                <InstructionManager
                  systemPrompt={view.systemPrompt}
                  onCount={setInstructionCount}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 도구 상세 모달 */}
      {showTool && (
        <ToolDetailModal tool={showTool} onClose={() => setShowTool(null)} />
      )}
    </div>
  );
}

export default HarnessView;

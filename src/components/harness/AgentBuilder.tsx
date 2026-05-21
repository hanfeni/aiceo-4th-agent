"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * AgentBuilder — 커스텀 에이전트 생성·목록·삭제 컴포넌트.
 *
 * HarnessView CREATE 탭 본문으로 배치된다. HarnessView.tsx 1000줄 초과
 * 방지를 위해 별도 파일로 분리(CLAUDE.md 단일 파일 1000줄 초과 금지).
 *
 * 기능:
 *  - name(input), description(textarea), instructionId(select)
 *  - subagentNames(checkbox — /api/harness/subagents GET 후보)
 *  - skillNames(checkbox — /api/harness/skills GET 후보)
 *  - 생성 → POST /api/harness/agents → onCreated() 호출
 *  - 기존 에이전트 목록 + 삭제(DELETE /api/harness/agents) → onCreated() 호출
 *
 * AgentNav 갱신: onCreated() 가 CustomEvent('agentCreated') 를 dispatch 해
 * AgentNav 의 fetch 가 재실행된다(이벤트 버스 — 전역 상태 불필요).
 */

interface InstructionMeta {
  id: string;
  label: string;
  builtin?: boolean;
}

interface SubagentMeta {
  name: string;
  description?: string;
}

interface SkillMeta {
  name: string;
  description?: string;
}

interface CustomAgentMeta {
  id: string;
  name: string;
  description: string;
  instructionId: string;
  subagentNames: string[];
  skillNames: string[];
  createdAt: string;
}

export interface AgentBuilderProps {
  /** 생성/삭제 완료 후 호출 — AgentNav 갱신 트리거. */
  onCreated?: () => void;
}

export function AgentBuilder({ onCreated }: AgentBuilderProps): ReactNode {
  // ── 후보 목록 fetch ─────────────────────────────────────────────────────
  const [instructions, setInstructions] = useState<InstructionMeta[]>([]);
  const [subagents, setSubagents] = useState<SubagentMeta[]>([]);
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [existingAgents, setExistingAgents] = useState<CustomAgentMeta[]>([]);

  const fetchAll = async (): Promise<void> => {
    try {
      const [insRes, subRes, skillRes, agentRes] = await Promise.all([
        fetch("/api/harness/instructions"),
        fetch("/api/harness/subagents"),
        fetch("/api/harness/skills"),
        fetch("/api/harness/agents"),
      ]);
      const [insData, subData, skillData, agentData] = await Promise.all([
        insRes.ok ? (insRes.json() as Promise<{ instructions?: InstructionMeta[] }>) : Promise.resolve({ instructions: [] }),
        subRes.ok ? (subRes.json() as Promise<{ subagents?: SubagentMeta[] }>) : Promise.resolve({ subagents: [] }),
        skillRes.ok ? (skillRes.json() as Promise<{ skills?: SkillMeta[] }>) : Promise.resolve({ skills: [] }),
        agentRes.ok ? (agentRes.json() as Promise<{ agents?: CustomAgentMeta[] }>) : Promise.resolve({ agents: [] }),
      ]);
      setInstructions(insData.instructions ?? []);
      setSubagents(subData.subagents ?? []);
      setSkills(skillData.skills ?? []);
      setExistingAgents(agentData.agents ?? []);
    } catch {
      // 오류 시 폴백 — 빈 상태 유지
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  // ── 폼 상태 ────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructionId, setInstructionId] = useState("default");
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const toggleSet = (set: Set<string>, item: string): Set<string> => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  const notifyNav = (): void => {
    window.dispatchEvent(new CustomEvent("agentCreated"));
    onCreated?.();
  };

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) {
      setErrorMsg("에이전트 이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/harness/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          instructionId,
          subagentNames: [...selectedSubs],
          skillNames: [...selectedSkills],
        }),
      });
      const data = (await res.json()) as { agent?: CustomAgentMeta; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "에이전트 생성에 실패했습니다.");
        return;
      }
      // 폼 초기화
      setName("");
      setDescription("");
      setInstructionId("default");
      setSelectedSubs(new Set());
      setSelectedSkills(new Set());
      setSuccessMsg(`"${data.agent?.name ?? name}" 에이전트가 생성됐습니다.`);
      await fetchAll();
      notifyNav();
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, agentName: string): Promise<void> => {
    try {
      const res = await fetch(`/api/harness/agents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMsg(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      setSuccessMsg(`"${agentName}" 에이전트가 삭제됐습니다.`);
      await fetchAll();
      notifyNav();
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    }
  };

  // ── 스타일 헬퍼 ────────────────────────────────────────────────────────

  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--t-neutral-12)",
    background: "var(--surface-default)",
    color: "var(--text-default)",
    fontSize: 12.5,
    boxSizing: "border-box" as const,
  };

  const labelStyle = {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-subtle)",
    marginBottom: 4,
    display: "block" as const,
  };

  const sectionStyle = {
    marginBottom: 16,
  };

  const checkboxItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "var(--text-default)",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── 생성 폼 ─────────────────────────────────────────────────── */}
      <div className="il-card">
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: "var(--agent-700)",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          에이전트 생성
        </div>

        {/* name */}
        <div style={sectionStyle}>
          <label htmlFor="agent-name" style={labelStyle}>
            에이전트 이름 <span style={{ color: "var(--agent-500)" }}>*</span>
          </label>
          <input
            id="agent-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 재무 분석 전문가"
            maxLength={80}
            style={inputStyle}
          />
        </div>

        {/* description */}
        <div style={sectionStyle}>
          <label htmlFor="agent-description" style={labelStyle}>
            설명 (선택)
          </label>
          <textarea
            id="agent-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="이 에이전트가 무엇을 하는지 한 줄로 적어주세요."
            maxLength={500}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {/* instructionId */}
        <div style={sectionStyle}>
          <label htmlFor="agent-instruction" style={labelStyle}>
            시스템 인스트럭션
          </label>
          <select
            id="agent-instruction"
            value={instructionId}
            onChange={(e) => setInstructionId(e.target.value)}
            style={inputStyle}
          >
            <option value="default">기본 인스트럭션</option>
            {instructions
              .filter((ins) => !ins.builtin)
              .map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.label}
                </option>
              ))}
          </select>
        </div>

        {/* subagentNames */}
        {subagents.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>서브에이전트 선택 (선택)</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "8px 10px",
                border: "1px solid var(--t-neutral-8)",
                borderRadius: 8,
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {subagents.map((sub) => (
                <label key={sub.name} style={checkboxItemStyle}>
                  <input
                    type="checkbox"
                    checked={selectedSubs.has(sub.name)}
                    onChange={() => setSelectedSubs(toggleSet(selectedSubs, sub.name))}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {sub.name}
                  </span>
                  {sub.description && (
                    <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>
                      — {sub.description}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* skillNames */}
        {skills.length > 0 && (
          <div style={sectionStyle}>
            <div style={labelStyle}>스킬 선택 (선택)</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "8px 10px",
                border: "1px solid var(--t-neutral-8)",
                borderRadius: 8,
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {skills.map((skill) => (
                <label key={skill.name} style={checkboxItemStyle}>
                  <input
                    type="checkbox"
                    checked={selectedSkills.has(skill.name)}
                    onChange={() => setSelectedSkills(toggleSet(selectedSkills, skill.name))}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {skill.name}
                  </span>
                  {skill.description && (
                    <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>
                      — {skill.description}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 에러/성공 메시지 */}
        {errorMsg && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--t-red-6, #fff5f5)",
              border: "1px solid var(--t-red-12, #ffc9c9)",
              color: "var(--red-700, #c92a2a)",
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--t-green-6, #f0fff4)",
              border: "1px solid var(--t-green-12, #b2f2bb)",
              color: "var(--green-700, #2f9e44)",
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            {successMsg}
          </div>
        )}

        {/* 생성 버튼 */}
        <button
          type="button"
          onClick={() => { void handleCreate(); }}
          disabled={submitting || !name.trim()}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background:
              submitting || !name.trim()
                ? "var(--t-neutral-8)"
                : "var(--agent-500)",
            color:
              submitting || !name.trim() ? "var(--text-subtle)" : "white",
            fontSize: 13,
            fontWeight: 700,
            cursor: submitting || !name.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "생성 중..." : "에이전트 생성"}
        </button>
      </div>

      {/* ── 기존 에이전트 목록 ──────────────────────────────────────── */}
      {existingAgents.length > 0 && (
        <div className="il-card">
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--text-subtle)",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            생성된 에이전트 ({existingAgents.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {existingAgents.map((agent) => (
              <div
                key={agent.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  border: "1px solid var(--t-neutral-8)",
                  borderRadius: 8,
                  background: "var(--surface-default)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text-default)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {agent.name}
                  </div>
                  {agent.description && (
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
                      {agent.description}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 2 }}>
                    {agent.subagentNames.length > 0 && (
                      <span>서브에이전트 {agent.subagentNames.length}개</span>
                    )}
                    {agent.subagentNames.length > 0 && agent.skillNames.length > 0 && (
                      <span> · </span>
                    )}
                    {agent.skillNames.length > 0 && (
                      <span>스킬 {agent.skillNames.length}개</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleDelete(agent.id, agent.name); }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--t-neutral-12)",
                    background: "var(--surface-default)",
                    color: "var(--text-subtle)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentBuilder;

"use client";

/**
 * AgentBuilder — 커스텀 에이전트 생성·목록·삭제 컴포넌트.
 *
 * SubagentManager 패턴 동형:
 *  - 카드 헤더 + 그리드 목록(클릭 → 상세 모달)
 *  - "+ 새로 만들기" → ContentModal 생성 폼
 *  - AiGenerateField(kind="agent") — 한 줄 요청으로 name/description 자동 입력
 *  - 상세 모달 footer: 삭제 / 닫기
 *
 * HarnessView CREATE 탭에 배치. AgentNav 갱신은 CustomEvent('agentCreated').
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  sectionDesc,
  input,
  textarea,
  fieldLabel,
  field,
  messageStyle,
  benchAction,
  benchPrimarySolid,
  benchModalGhost,
  benchModalDanger,
  benchModalBadge,
  subagentGrid,
  subagentCard,
  subagentCardName,
  subagentCardDesc,
  subagentCardMeta,
} from "./managerStyles";
import { ContentModal } from "./ContentModal";
import { AiGenerateField } from "./AiGenerateField";
import { FormDivider } from "./FormDivider";
import { BenchHeader } from "@/app/(main)/harness/HarnessView";

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

interface FormState {
  name: string;
  description: string;
  instructionId: string;
  selectedSubs: Set<string>;
  selectedSkills: Set<string>;
}

export interface AgentBuilderProps {
  onCreated?: () => void;
}

const MAX_NAME_LEN = 80;
const MAX_DESC_LEN = 500;

export function AgentBuilder({ onCreated }: AgentBuilderProps): ReactNode {
  const [items, setItems] = useState<CustomAgentMeta[]>([]);
  const [instructions, setInstructions] = useState<InstructionMeta[]>([]);
  const [subagents, setSubagents] = useState<SubagentMeta[]>([]);
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<CustomAgentMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insRes, subRes, skillRes, agentRes] = await Promise.all([
        fetch("/api/harness/instructions"),
        fetch("/api/harness/subagents"),
        fetch("/api/harness/skills"),
        fetch("/api/harness/agents"),
      ]);
      const [insData, subData, skillData, agentData] = await Promise.all([
        insRes.ok
          ? (insRes.json() as Promise<{ instructions?: InstructionMeta[] }>)
          : Promise.resolve({ instructions: [] }),
        subRes.ok
          ? (subRes.json() as Promise<{ subagents?: SubagentMeta[] }>)
          : Promise.resolve({ subagents: [] }),
        skillRes.ok
          ? (skillRes.json() as Promise<{ skills?: SkillMeta[] }>)
          : Promise.resolve({ skills: [] }),
        agentRes.ok
          ? (agentRes.json() as Promise<{ agents?: CustomAgentMeta[] }>)
          : Promise.resolve({ agents: [] }),
      ]);
      setInstructions(insData.instructions ?? []);
      setSubagents(subData.subagents ?? []);
      setSkills(skillData.skills ?? []);
      setItems(agentData.agents ?? []);
    } catch {
      setMsg({ ok: false, text: "목록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const startNew = (): void => {
    setMsg(null);
    setForm({
      name: "",
      description: "",
      instructionId: "default",
      selectedSubs: new Set(),
      selectedSkills: new Set(),
    });
  };

  const cancel = (): void => {
    setForm(null);
    setMsg(null);
  };

  const notifyNav = (): void => {
    window.dispatchEvent(new CustomEvent("agentCreated"));
    onCreated?.();
  };

  const toggleSet = (set: Set<string>, item: string): Set<string> => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.name.trim()) {
      setMsg({ ok: false, text: "에이전트 이름을 입력해 주세요." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/harness/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          instructionId: form.instructionId,
          subagentNames: [...form.selectedSubs],
          skillNames: [...form.selectedSkills],
        }),
      });
      const data = (await res.json()) as { agent?: CustomAgentMeta; error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "저장에 실패했습니다." });
        return;
      }
      setMsg({ ok: true, text: `"${data.agent?.name ?? form.name}" 에이전트가 생성됐습니다.` });
      setForm(null);
      await load();
      notifyNav();
    } catch {
      setMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (agent: CustomAgentMeta): Promise<void> => {
    if (!window.confirm(`'${agent.name}' 에이전트를 삭제할까요?`)) return;
    setMsg(null);
    try {
      const res = await fetch(
        `/api/harness/agents?id=${encodeURIComponent(agent.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "삭제에 실패했습니다." });
        return;
      }
      setMsg({ ok: true, text: "삭제했습니다." });
      setModal(null);
      await load();
      notifyNav();
    } catch {
      setMsg({ ok: false, text: "삭제 중 오류가 발생했습니다." });
    }
  };

  const modalSource = modal ? items.find((a) => a.id === modal.id) : undefined;

  return (
    <>
      <div className="il-card">
        <BenchHeader
          label="AGENTS"
          title="목적별 커스텀 챗 에이전트"
          status={
            !form ? (
              <button type="button" style={benchAction} onClick={startNew}>
                + 새로 만들기
              </button>
            ) : undefined
          }
        />
        <div style={sectionDesc}>
          인스트럭션·서브에이전트·스킬 조합으로 전용 챗 에이전트를 만듭니다.
          생성 후 사이드바 "나의 에이전트" 그룹에 자동으로 표시됩니다.
        </div>

        {msg && <div style={messageStyle(msg.ok)}>{msg.text}</div>}

        {loading ? (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>불러오는 중…</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            생성된 커스텀 에이전트가 없습니다. "+ 새로 만들기"로 추가하세요.
          </div>
        ) : (
          <div style={subagentGrid}>
            {items.map((agent) => (
              <button
                key={agent.id}
                type="button"
                style={subagentCard}
                onClick={() => setModal(agent)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={subagentCardName}>{agent.name}</span>
                </div>
                <div style={subagentCardDesc}>
                  {agent.description || (
                    <span style={{ fontStyle: "italic" }}>설명 없음</span>
                  )}
                </div>
                <div style={subagentCardMeta}>
                  {agent.subagentNames.length > 0 && (
                    <span style={{ color: "var(--agent-700)", fontWeight: 700, fontFamily: "var(--lab-font-mono)" }}>
                      서브에이전트 {agent.subagentNames.length}
                    </span>
                  )}
                  {agent.subagentNames.length > 0 && agent.skillNames.length > 0 && (
                    <span>·</span>
                  )}
                  {agent.skillNames.length > 0 && (
                    <span>스킬 {agent.skillNames.length}</span>
                  )}
                  {agent.subagentNames.length === 0 && agent.skillNames.length === 0 && (
                    <span style={{ color: "var(--agent-700)", fontWeight: 700 }}>기본 구성</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {modal && (
        <ContentModal
          title={modal.name}
          subtitle={modal.description || "커스텀 챗 에이전트"}
          onClose={() => setModal(null)}
          width={640}
          headerExtra={<span style={benchModalBadge}>AGENT</span>}
          footer={
            <>
              <button type="button" style={benchModalGhost} onClick={() => setModal(null)}>
                닫기
              </button>
              <button
                type="button"
                style={benchModalDanger}
                onClick={() => {
                  if (!modalSource) return;
                  void remove(modalSource);
                }}
              >
                삭제
              </button>
            </>
          }
        >
          <AgentDetailBody agent={modal} />
        </ContentModal>
      )}

      {/* 생성 폼 모달 */}
      {form && (
        <ContentModal
          title="새 에이전트"
          subtitle="인스트럭션·서브에이전트·스킬 조합으로 전용 챗 에이전트를 만듭니다."
          onClose={cancel}
          width={720}
          headerExtra={<span style={benchModalBadge}>AGENT</span>}
          footer={
            <>
              <button type="button" style={benchModalGhost} onClick={cancel}>
                취소
              </button>
              <button
                type="button"
                style={
                  saving
                    ? { ...benchPrimarySolid, opacity: 0.6, cursor: "not-allowed" }
                    : benchPrimarySolid
                }
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "생성 중…" : "생성"}
              </button>
            </>
          }
        >
          <AiGenerateField
            kind="agent"
            placeholder="예: 재무제표 분석 전문가, 법률 계약서 검토 에이전트"
            onResult={(r) =>
              setForm((prev) =>
                prev
                  ? {
                      ...prev,
                      name: r.name ?? prev.name,
                      description: r.description ?? prev.description,
                    }
                  : prev,
              )
            }
          />
          <FormDivider />

          <div style={field}>
            <label style={fieldLabel}>
              에이전트 이름 <span style={{ color: "var(--agent-500)" }}>*</span>
            </label>
            <input
              style={input}
              value={form.name}
              maxLength={MAX_NAME_LEN}
              placeholder="예: 재무 분석 전문가"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div style={field}>
            <label style={fieldLabel}>설명 (선택)</label>
            <textarea
              style={{ ...textarea, minHeight: 56 }}
              value={form.description}
              maxLength={MAX_DESC_LEN}
              placeholder="이 에이전트가 무엇을 잘 하는지 한 줄로 적어주세요."
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div style={field}>
            <label style={fieldLabel}>시스템 인스트럭션</label>
            <select
              style={input}
              value={form.instructionId}
              onChange={(e) => setForm({ ...form, instructionId: e.target.value })}
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

          {subagents.length > 0 && (
            <div style={field}>
              <label style={fieldLabel}>서브에이전트 선택 (선택)</label>
              <CheckList
                items={subagents.map((s) => ({ key: s.name, label: s.name, desc: s.description }))}
                selected={form.selectedSubs}
                onChange={(key) => setForm({ ...form, selectedSubs: toggleSet(form.selectedSubs, key) })}
              />
            </div>
          )}

          {skills.length > 0 && (
            <div style={{ ...field, marginBottom: 0 }}>
              <label style={fieldLabel}>스킬 선택 (선택)</label>
              <CheckList
                items={skills.map((s) => ({ key: s.name, label: s.name, desc: s.description }))}
                selected={form.selectedSkills}
                onChange={(key) => setForm({ ...form, selectedSkills: toggleSet(form.selectedSkills, key) })}
              />
            </div>
          )}
        </ContentModal>
      )}
    </>
  );
}

function CheckList({
  items,
  selected,
  onChange,
}: {
  items: { key: string; label: string; desc?: string }[];
  selected: Set<string>;
  onChange: (key: string) => void;
}): ReactNode {
  return (
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
      {items.map((item) => (
        <label
          key={item.key}
          style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={selected.has(item.key)}
            onChange={() => onChange(item.key)}
          />
          <span style={{ fontFamily: "var(--lab-font-mono)", fontSize: 11.5 }}>{item.label}</span>
          {item.desc && (
            <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>— {item.desc}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function AgentDetailBody({ agent }: { agent: CustomAgentMeta }): ReactNode {
  const rows: { label: string; value: string }[] = [
    { label: "인스트럭션", value: agent.instructionId === "default" ? "기본 인스트럭션" : agent.instructionId },
    {
      label: "서브에이전트",
      value: agent.subagentNames.length > 0 ? agent.subagentNames.join(", ") : "없음",
    },
    {
      label: "스킬",
      value: agent.skillNames.length > 0 ? agent.skillNames.join(", ") : "없음",
    },
    {
      label: "생성일",
      value: new Date(agent.createdAt).toLocaleString("ko-KR"),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {agent.description && (
        <div style={{ fontSize: 13, color: "var(--text-default)", lineHeight: 1.6 }}>
          {agent.description}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderBottom: "1px solid var(--t-neutral-6)" }}>
              <td
                style={{
                  padding: "8px 0",
                  width: 120,
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                  verticalAlign: "top",
                }}
              >
                {row.label}
              </td>
              <td style={{ padding: "8px 0", color: "var(--text-default)", wordBreak: "break-all" }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AgentBuilder;

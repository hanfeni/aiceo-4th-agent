"use client";

/**
 * AgentBuilder — 커스텀 에이전트 생성·목록·삭제 컴포넌트.
 *
 * SubagentManager 패턴 동형 + AI 일괄 생성(agent-bundle):
 *  - 카드 헤더 + 그리드 목록 → 클릭 시 상세 모달
 *  - "+ 새로 만들기" → ContentModal 생성 폼
 *  - [STEP 1] 한 줄 요청 → AI가 에이전트 + 새 스킬 + 새 서브에이전트 일괄 제안
 *  - [STEP 2] 제안 확인·편집 → "모두 저장" 시 스킬·서브에이전트·에이전트 순차 생성
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
import { FormDivider } from "./FormDivider";
import { BenchHeader } from "@/app/(main)/harness/HarnessView";
import type { GeneratedAgentBundle } from "@/lib/harness-introspect/generate";

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
  onCreated?: () => void;
}

const MAX_NAME_LEN = 80;
const MAX_DESC_LEN = 500;

// ── Step 2 편집 상태 ────────────────────────────────────────────────────────

interface BundleEditState {
  agentName: string;
  agentDescription: string;
  instructionId: string;
  // 새로 생성할 스킬/서브에이전트 (체크로 포함 여부 결정)
  newSkills: Array<{ name: string; description: string; body: string; included: boolean }>;
  newSubagents: Array<{ name: string; description: string; systemPrompt: string; included: boolean }>;
  // 기존 목록 중 활성화 여부
  existingSkillNames: Set<string>;
  existingSubagentNames: Set<string>;
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────────

export function AgentBuilder({ onCreated }: AgentBuilderProps): ReactNode {
  const [items, setItems] = useState<CustomAgentMeta[]>([]);
  const [instructions, setInstructions] = useState<InstructionMeta[]>([]);
  const [subagents, setSubagents] = useState<SubagentMeta[]>([]);
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<CustomAgentMeta | null>(null);

  // Step 1
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  // Step 2
  const [bundle, setBundle] = useState<BundleEditState | null>(null);
  const [saving, setSaving] = useState(false);

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
    void (async () => { await load(); })();
  }, [load]);

  const openNew = (): void => {
    setPrompt("");
    setBundle(null);
    setGenErr(null);
    setMsg(null);
    setFormOpen(true);
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setBundle(null);
    setPrompt("");
    setGenErr(null);
  };

  const notifyNav = (): void => {
    window.dispatchEvent(new CustomEvent("agentCreated"));
    onCreated?.();
  };

  // ── Step 1: AI 일괄 생성 ──────────────────────────────────────────────

  const generate = async (): Promise<void> => {
    const p = prompt.trim();
    if (!p || generating) return;
    setGenerating(true);
    setGenErr(null);
    setBundle(null);
    try {
      const res = await fetch("/api/harness/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "agent-bundle",
          prompt: p,
          existingSkills: skills.map((s) => s.name),
          existingSubagents: subagents.map((s) => s.name),
        }),
      });
      const data = (await res.json()) as { result?: GeneratedAgentBundle; error?: string };
      if (!res.ok || !data.result) {
        setGenErr(data.error ?? `생성 실패 (HTTP ${res.status})`);
        return;
      }
      const r = data.result;
      setBundle({
        agentName: r.agentName,
        agentDescription: r.agentDescription,
        instructionId: "default",
        newSkills: r.newSkills.map((s) => ({ ...s, included: true })),
        newSubagents: r.newSubagents.map((s) => ({ ...s, included: true })),
        existingSkillNames: new Set(r.existingSkillNames),
        existingSubagentNames: new Set(r.existingSubagentNames),
      });
    } catch {
      setGenErr("네트워크 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  // ── Step 2: 일괄 저장 ─────────────────────────────────────────────────

  const saveBundle = async (): Promise<void> => {
    if (!bundle) return;
    if (!bundle.agentName.trim()) {
      setMsg({ ok: false, text: "에이전트 이름을 입력해 주세요." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      // 1) 새 스킬 생성
      const includedSkills = bundle.newSkills.filter((s) => s.included);
      for (const s of includedSkills) {
        const res = await fetch("/api/harness/skills", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: s.name, description: s.description, body: s.body }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(`스킬 '${s.name}' 생성 실패: ${d.error ?? res.status}`);
        }
      }
      // 2) 새 서브에이전트 생성
      const includedSubs = bundle.newSubagents.filter((s) => s.included);
      for (const s of includedSubs) {
        const res = await fetch("/api/harness/subagents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: s.name, description: s.description, systemPrompt: s.systemPrompt }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(`서브에이전트 '${s.name}' 생성 실패: ${d.error ?? res.status}`);
        }
      }
      // 3) 에이전트 생성
      const allSkillNames = [
        ...includedSkills.map((s) => s.name),
        ...[...bundle.existingSkillNames],
      ];
      const allSubNames = [
        ...includedSubs.map((s) => s.name),
        ...[...bundle.existingSubagentNames],
      ];
      const res = await fetch("/api/harness/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: bundle.agentName.trim(),
          description: bundle.agentDescription.trim(),
          instructionId: bundle.instructionId,
          subagentNames: allSubNames,
          skillNames: allSkillNames,
        }),
      });
      const d = (await res.json()) as { agent?: CustomAgentMeta; error?: string };
      if (!res.ok) throw new Error(d.error ?? "에이전트 생성 실패");

      const createdName = d.agent?.name ?? bundle.agentName;
      setMsg({
        ok: true,
        text: `"${createdName}" 에이전트가 생성됐습니다.${includedSkills.length > 0 ? ` (스킬 ${includedSkills.length}개 포함)` : ""}${includedSubs.length > 0 ? ` (서브에이전트 ${includedSubs.length}개 포함)` : ""}`,
      });
      closeForm();
      await load();
      notifyNav();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장 중 오류가 발생했습니다." });
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

  // ── 렌더 ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="il-card">
        <BenchHeader
          label="AGENTS"
          title="목적별 커스텀 챗 에이전트"
          status={
            !formOpen ? (
              <button type="button" style={benchAction} onClick={openNew}>
                + 새로 만들기
              </button>
            ) : undefined
          }
        />
        <div style={sectionDesc}>
          인스트럭션·서브에이전트·스킬 조합으로 전용 챗 에이전트를 만듭니다.
          AI가 필요한 스킬·서브에이전트까지 한 번에 제안·생성합니다.
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
                  {agent.description || <span style={{ fontStyle: "italic" }}>설명 없음</span>}
                </div>
                <div style={subagentCardMeta}>
                  {agent.subagentNames.length > 0 && (
                    <span style={{ color: "var(--agent-700)", fontWeight: 700, fontFamily: "var(--lab-font-mono)" }}>
                      서브에이전트 {agent.subagentNames.length}
                    </span>
                  )}
                  {agent.subagentNames.length > 0 && agent.skillNames.length > 0 && <span>·</span>}
                  {agent.skillNames.length > 0 && <span>스킬 {agent.skillNames.length}</span>}
                  {agent.subagentNames.length === 0 && agent.skillNames.length === 0 && (
                    <span style={{ color: "var(--agent-700)", fontWeight: 700 }}>기본 구성</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 상세 모달 ──────────────────────────────────────────────────── */}
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
                onClick={() => { if (modalSource) void remove(modalSource); }}
              >
                삭제
              </button>
            </>
          }
        >
          <AgentDetailBody agent={modal} />
        </ContentModal>
      )}

      {/* ── 생성 폼 모달 ─────────────────────────────────────────────── */}
      {formOpen && (
        <ContentModal
          title="새 에이전트"
          subtitle="AI가 스킬·서브에이전트까지 한 번에 제안합니다."
          onClose={closeForm}
          width={760}
          headerExtra={<span style={benchModalBadge}>AGENT</span>}
          footer={
            bundle ? (
              <>
                <button type="button" style={benchModalGhost} onClick={closeForm}>
                  취소
                </button>
                <button
                  type="button"
                  style={saving ? { ...benchPrimarySolid, opacity: 0.6, cursor: "not-allowed" } : benchPrimarySolid}
                  disabled={saving}
                  onClick={() => void saveBundle()}
                >
                  {saving ? "저장 중…" : "모두 저장"}
                </button>
              </>
            ) : (
              <button type="button" style={benchModalGhost} onClick={closeForm}>
                닫기
              </button>
            )
          }
        >
          {/* ── STEP 1: 요청 입력 ── */}
          <Step1
            prompt={prompt}
            onPromptChange={setPrompt}
            generating={generating}
            err={genErr}
            onGenerate={() => void generate()}
            hasBundle={!!bundle}
          />

          {/* ── STEP 2: AI 제안 확인·편집 ── */}
          {bundle && (
            <>
              <FormDivider />
              <Step2
                bundle={bundle}
                instructions={instructions}
                existingSkills={skills}
                existingSubagents={subagents}
                onChange={setBundle}
              />
            </>
          )}
        </ContentModal>
      )}
    </>
  );
}

// ── Step 1 컴포넌트 ──────────────────────────────────────────────────────────

function Step1({
  prompt,
  onPromptChange,
  generating,
  err,
  onGenerate,
  hasBundle,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  generating: boolean;
  err: string | null;
  onGenerate: () => void;
  hasBundle: boolean;
}): ReactNode {
  const aiBtnActive = {
    fontSize: 12, fontWeight: 600, height: 36, padding: "0 14px",
    borderRadius: "var(--r-md)", border: "1px solid var(--agent-500)",
    background: "var(--agent-500)", color: "white", cursor: "pointer",
    flexShrink: 0, whiteSpace: "nowrap" as const, lineHeight: 1,
  };
  const aiBtnOff = {
    ...aiBtnActive,
    border: "1px solid var(--lab-agent-border)",
    background: "var(--surface-default)",
    color: "var(--agent-600)", cursor: "default" as const, opacity: 0.7,
  };

  return (
    <div style={{
      marginBottom: 0, padding: 14, borderRadius: "var(--r-md)",
      background: "var(--lab-agent-bg)", border: "1px solid var(--lab-agent-border)",
    }}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden style={{ fontSize: 13 }}>✨</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--agent-700)" }}>
          AI 일괄 생성
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, color: "var(--agent-600)",
          background: "var(--surface-default)", border: "1px solid var(--lab-agent-border)",
          borderRadius: 999, padding: "1px 7px", fontFamily: "var(--lab-font-mono)",
        }}>
          gpt-5.4-mini
        </span>
        {hasBundle && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "var(--green-700, #2f9e44)",
            background: "var(--t-green-6, #f0fff4)", border: "1px solid var(--t-green-12, #b2f2bb)",
            borderRadius: 999, padding: "1px 8px",
          }}>
            ✓ 제안 완료 — 아래에서 확인·수정 후 저장하세요
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1, border: "1px solid var(--lab-agent-border)" }}
          value={prompt}
          placeholder="예: 재무제표와 DART 데이터를 분석하는 전문 에이전트"
          disabled={generating}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onGenerate(); } }}
        />
        <button
          type="button"
          style={generating || !prompt.trim() ? aiBtnOff : aiBtnActive}
          disabled={generating || !prompt.trim()}
          onClick={onGenerate}
        >
          {generating ? "생성 중…" : hasBundle ? "재생성" : "AI로 구성"}
        </button>
      </div>
      {err && <div style={{ fontSize: 10.5, color: "var(--red-500)", marginTop: 6 }}>{err}</div>}
      {!hasBundle && (
        <div style={{ fontSize: 10.5, color: "var(--agent-600)", marginTop: 8, opacity: 0.85 }}>
          한 줄 요청 → AI가 에이전트 이름·설명, 필요한 스킬, 서브에이전트를 한 번에 제안합니다.
          기존 스킬·서브에이전트도 자동으로 활용 여부를 제안합니다.
        </div>
      )}
    </div>
  );
}

// ── Step 2 컴포넌트 ──────────────────────────────────────────────────────────

function Step2({
  bundle,
  instructions,
  existingSkills,
  existingSubagents,
  onChange,
}: {
  bundle: BundleEditState;
  instructions: InstructionMeta[];
  existingSkills: SkillMeta[];
  existingSubagents: SubagentMeta[];
  onChange: (b: BundleEditState) => void;
}): ReactNode {
  const toggleExistingSkill = (name: string): void => {
    const next = new Set(bundle.existingSkillNames);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange({ ...bundle, existingSkillNames: next });
  };
  const toggleExistingSub = (name: string): void => {
    const next = new Set(bundle.existingSubagentNames);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange({ ...bundle, existingSubagentNames: next });
  };
  const toggleNewSkill = (i: number): void => {
    const next = bundle.newSkills.map((s, idx) => idx === i ? { ...s, included: !s.included } : s);
    onChange({ ...bundle, newSkills: next });
  };
  const toggleNewSub = (i: number): void => {
    const next = bundle.newSubagents.map((s, idx) => idx === i ? { ...s, included: !s.included } : s);
    onChange({ ...bundle, newSubagents: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 에이전트 기본 정보 */}
      <SectionTitle>에이전트 정보</SectionTitle>
      <div style={field}>
        <label style={fieldLabel}>
          이름 <span style={{ color: "var(--agent-500)" }}>*</span>
        </label>
        <input
          style={inputStyle}
          value={bundle.agentName}
          maxLength={MAX_NAME_LEN}
          onChange={(e) => onChange({ ...bundle, agentName: e.target.value })}
        />
      </div>
      <div style={field}>
        <label style={fieldLabel}>설명</label>
        <textarea
          style={{ ...textareaStyle, minHeight: 52 }}
          value={bundle.agentDescription}
          maxLength={MAX_DESC_LEN}
          onChange={(e) => onChange({ ...bundle, agentDescription: e.target.value })}
        />
      </div>
      <div style={{ ...field, marginBottom: 0 }}>
        <label style={fieldLabel}>시스템 인스트럭션</label>
        <select
          style={inputStyle}
          value={bundle.instructionId}
          onChange={(e) => onChange({ ...bundle, instructionId: e.target.value })}
        >
          <option value="default">기본 인스트럭션</option>
          {instructions.filter((i) => !i.builtin).map((i) => (
            <option key={i.id} value={i.id}>{i.label}</option>
          ))}
        </select>
      </div>

      {/* 새로 생성할 스킬 */}
      {bundle.newSkills.length > 0 && (
        <>
          <SectionTitle>
            새로 생성할 스킬
            <Badge color="green">{bundle.newSkills.filter((s) => s.included).length}개 포함</Badge>
          </SectionTitle>
          {bundle.newSkills.map((s, i) => (
            <NewItemCard
              key={s.name}
              kind="SKILL"
              name={s.name}
              description={s.description}
              included={s.included}
              onToggle={() => toggleNewSkill(i)}
            />
          ))}
        </>
      )}

      {/* 새로 생성할 서브에이전트 */}
      {bundle.newSubagents.length > 0 && (
        <>
          <SectionTitle>
            새로 생성할 서브에이전트
            <Badge color="green">{bundle.newSubagents.filter((s) => s.included).length}개 포함</Badge>
          </SectionTitle>
          {bundle.newSubagents.map((s, i) => (
            <NewItemCard
              key={s.name}
              kind="SUBAGENT"
              name={s.name}
              description={s.description}
              included={s.included}
              onToggle={() => toggleNewSub(i)}
            />
          ))}
        </>
      )}

      {/* 기존 스킬 활성화 */}
      {existingSkills.length > 0 && (
        <>
          <SectionTitle>
            기존 스킬 활성화
            <Badge color="purple">{bundle.existingSkillNames.size}개 선택</Badge>
          </SectionTitle>
          <CheckGrid
            items={existingSkills.map((s) => ({ key: s.name, label: s.name, desc: s.description }))}
            selected={bundle.existingSkillNames}
            onToggle={toggleExistingSkill}
          />
        </>
      )}

      {/* 기존 서브에이전트 활성화 */}
      {existingSubagents.length > 0 && (
        <>
          <SectionTitle>
            기존 서브에이전트 활성화
            <Badge color="purple">{bundle.existingSubagentNames.size}개 선택</Badge>
          </SectionTitle>
          <CheckGrid
            items={existingSubagents.map((s) => ({ key: s.name, label: s.name, desc: s.description }))}
            selected={bundle.existingSubagentNames}
            onToggle={toggleExistingSub}
          />
        </>
      )}
    </div>
  );
}

// ── 작은 UI 조각들 ──────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: "1px solid var(--t-neutral-12)", background: "var(--surface-default)",
  color: "var(--text-default)", fontSize: 12.5, boxSizing: "border-box" as const,
};
const textareaStyle = { ...inputStyle, resize: "vertical" as const };

function SectionTitle({ children }: { children: ReactNode }): ReactNode {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: "0.07em",
      color: "var(--text-subtle)", textTransform: "uppercase" as const,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: ReactNode; color: "green" | "purple" }): ReactNode {
  const styles = color === "green"
    ? { color: "var(--green-700,#2f9e44)", background: "var(--t-green-6,#f0fff4)", border: "1px solid var(--t-green-12,#b2f2bb)" }
    : { color: "var(--agent-700)", background: "var(--lab-agent-bg)", border: "1px solid var(--lab-agent-border)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 7px", ...styles }}>
      {children}
    </span>
  );
}

function NewItemCard({
  kind, name, description, included, onToggle,
}: {
  kind: string; name: string; description: string; included: boolean; onToggle: () => void;
}): ReactNode {
  return (
    <div style={{
      display: "flex", gap: 10, padding: "10px 12px",
      border: `1px solid ${included ? "var(--agent-500)" : "var(--t-neutral-8)"}`,
      borderRadius: 8, background: included ? "var(--lab-agent-bg)" : "var(--surface-default)",
      cursor: "pointer", alignItems: "flex-start",
    }}
      onClick={onToggle}
    >
      <input type="checkbox" checked={included} onChange={onToggle} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
            color: "var(--agent-700)", background: "var(--lab-agent-bg)",
            border: "1px solid var(--lab-agent-border)", borderRadius: 4, padding: "1px 5px",
          }}>
            {kind}
          </span>
          <span style={{ fontFamily: "var(--lab-font-mono)", fontSize: 11.5, fontWeight: 600 }}>
            {name}
          </span>
        </div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>{description}</div>
        )}
      </div>
    </div>
  );
}

function CheckGrid({
  items, selected, onToggle,
}: {
  items: { key: string; label: string; desc?: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}): ReactNode {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 5,
      padding: "8px 10px", border: "1px solid var(--t-neutral-8)",
      borderRadius: 8, maxHeight: 130, overflowY: "auto",
    }}>
      {items.map((item) => (
        <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={selected.has(item.key)} onChange={() => onToggle(item.key)} />
          <span style={{ fontFamily: "var(--lab-font-mono)", fontSize: 11.5 }}>{item.label}</span>
          {item.desc && <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>— {item.desc}</span>}
        </label>
      ))}
    </div>
  );
}

function AgentDetailBody({ agent }: { agent: CustomAgentMeta }): ReactNode {
  const rows = [
    { label: "인스트럭션", value: agent.instructionId === "default" ? "기본 인스트럭션" : agent.instructionId },
    { label: "서브에이전트", value: agent.subagentNames.length > 0 ? agent.subagentNames.join(", ") : "없음" },
    { label: "스킬", value: agent.skillNames.length > 0 ? agent.skillNames.join(", ") : "없음" },
    { label: "생성일", value: new Date(agent.createdAt).toLocaleString("ko-KR") },
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
              <td style={{ padding: "8px 0", width: 120, fontWeight: 600, color: "var(--text-subtle)", verticalAlign: "top" }}>
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

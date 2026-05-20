"use client";

/**
 * 스킬 관리 패널 — /api/harness/skills CRUD UI.
 *
 * GET    {skills:[{name,description,body,sourcePath,builtin}]}
 * POST   body{name,description,body} → {skill} | {error}
 * DELETE ?name= → {ok:true} | {error}
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  sectionDesc,
  itemName,
  builtinChip,
  btnGhost,
  btnPrimary,
  btnDisabled,
  input,
  textarea,
  fieldLabel,
  field,
  messageStyle,
  actionRow,
  benchAction,
  benchPrimarySolid,
  benchModalGhost,
  benchModalDanger,
  benchModalBadge,
  skillRow,
  rowBtn,
  rowBtnDanger,
  rowBtnDisabled,
  formWrap,
} from "./managerStyles";
import { ContentModal } from "./ContentModal";
import { BenchHeader } from "@/app/(main)/harness/HarnessView";

interface Skill {
  name: string;
  description: string;
  body: string;
  sourcePath: string;
  builtin: boolean;
}

interface FormState {
  editing: boolean;
  name: string;
  description: string;
  body: string;
}

interface ModalState {
  name: string;
  description: string;
  body: string;
}

const MAX_DESC_LEN = 2000;
const MAX_BODY_LEN = 100000;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function SkillManager(): ReactNode {
  const [items, setItems] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/harness/skills");
      const data = (await res.json()) as { skills?: Skill[] };
      setItems(data.skills ?? []);
    } catch {
      setMsg({ ok: false, text: "목록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = (): void => {
    setMsg(null);
    setForm({ editing: false, name: "", description: "", body: "" });
  };

  const startEdit = (sk: Skill): void => {
    setMsg(null);
    setForm({ editing: true, name: sk.name, description: sk.description, body: sk.body });
  };

  const cancel = (): void => {
    setForm(null);
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.name.trim()) {
      setMsg({ ok: false, text: "스킬 이름을 입력하세요." });
      return;
    }
    if (!SLUG_RE.test(form.name)) {
      setMsg({ ok: false, text: "이름은 영문 소문자·숫자·하이픈만(2~64자) 사용할 수 있습니다." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/harness/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description, body: form.body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "저장에 실패했습니다." });
        return;
      }
      setMsg({ ok: true, text: "저장했습니다." });
      setForm(null);
      await load();
    } catch {
      setMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (sk: Skill): Promise<void> => {
    if (sk.builtin) return;
    if (!window.confirm(`'${sk.name}' 스킬을 삭제할까요?`)) return;
    setMsg(null);
    try {
      const res = await fetch(
        `/api/harness/skills?name=${encodeURIComponent(sk.name)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "삭제에 실패했습니다." });
        return;
      }
      setMsg({ ok: true, text: "삭제했습니다." });
      if (form?.name === sk.name) setForm(null);
      await load();
    } catch {
      setMsg({ ok: false, text: "삭제 중 오류가 발생했습니다." });
    }
  };

  // 모달에서 보고 있는 스킬의 원본(편집·삭제 연결용).
  const modalSource = modal ? items.find((s) => s.name === modal.name) : undefined;

  return (
    <>
      <div className="il-card">
        {/* 시안 BenchCard 헤더 — SKILLS 라벨 + 비활성 status + 우측 액션 */}
        <BenchHeader
          label="SKILLS"
          title="progressive disclosure — frontmatter + SKILL.md 본문"
          status={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {!form && (
                <button type="button" style={benchAction} onClick={startNew}>
                  + 새로 만들기
                </button>
              )}
            </div>
          }
        />
        <div style={sectionDesc}>
          스킬 = skills/&lt;이름&gt;/SKILL.md. frontmatter(설명)가 LLM 프롬프트에
          주입되고 본문은 에이전트가 read_file 로 읽습니다. 내장 스킬은 삭제할 수
          없습니다(본문 편집은 가능).
        </div>

        {msg && <div style={messageStyle(msg.ok)}>{msg.text}</div>}

        {/* 편집 폼 */}
        {form && (
          <div style={formWrap}>
            <div style={field}>
              <label style={fieldLabel}>이름 (slug)</label>
              <input
                style={{
                  ...input,
                  ...(form.editing ? { background: "var(--t-neutral-6)", cursor: "not-allowed" } : {}),
                  fontFamily: "var(--font-mono)",
                }}
                value={form.name}
                maxLength={64}
                disabled={form.editing}
                placeholder="예: invoice-parser"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {form.editing && (
                <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 4 }}>
                  이름(폴더명)은 변경할 수 없습니다.
                </div>
              )}
            </div>
            <div style={field}>
              <label style={fieldLabel}>설명 (description)</label>
              <input
                style={input}
                value={form.description}
                maxLength={MAX_DESC_LEN}
                placeholder="LLM 이 스킬 사용 시점을 판단하는 근거"
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div style={field}>
              <label style={fieldLabel}>SKILL.md 본문</label>
              <textarea
                style={textarea}
                value={form.body}
                maxLength={MAX_BODY_LEN}
                placeholder="스킬 사용 가이드(에이전트가 read_file 로 읽는 본문)"
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div style={actionRow}>
              <button
                type="button"
                style={saving ? btnDisabled : btnPrimary}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
              <button type="button" style={btnGhost} onClick={cancel}>
                취소
              </button>
            </div>
          </div>
        )}

        {/* 목록 — 시안 행 리스트(name + source[mono] + 편집/삭제). 행 클릭 → 모달 */}
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>불러오는 중…</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>등록된 스킬이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((sk) => (
              <div
                key={sk.name}
                role="button"
                tabIndex={0}
                style={{ ...skillRow, cursor: "pointer" }}
                onClick={() => setModal({ name: sk.name, description: sk.description, body: sk.body })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModal({ name: sk.name, description: sk.description, body: sk.body });
                  }
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={itemName}>{sk.name}</span>
                    {sk.builtin && <span style={builtinChip}>내장</span>}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-subtle)",
                      marginTop: 2,
                      fontFamily: "var(--lab-font-mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sk.sourcePath}
                  </div>
                </div>
                <button
                  type="button"
                  style={rowBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(sk);
                  }}
                >
                  편집
                </button>
                <button
                  type="button"
                  style={sk.builtin ? rowBtnDisabled : rowBtnDanger}
                  disabled={sk.builtin}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(sk);
                  }}
                >
                  삭제
                </button>
                <span style={{ width: 4 }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상세 모달 — 시안 SkillDetailModal 톤(SKILL.md 배지 + footer) */}
      {modal && (
        <ContentModal
          title={modal.name}
          subtitle={modalSource?.sourcePath || modal.description || undefined}
          onClose={() => setModal(null)}
          width={820}
          headerExtra={<span style={benchModalBadge}>SKILL.md</span>}
          footer={
            <>
              <button type="button" style={benchModalGhost} onClick={() => setModal(null)}>
                닫기
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                {modalSource && !modalSource.builtin && (
                  <button
                    type="button"
                    style={benchModalDanger}
                    onClick={() => {
                      const target = modalSource;
                      setModal(null);
                      void remove(target);
                    }}
                  >
                    삭제
                  </button>
                )}
                {modalSource && (
                  <button
                    type="button"
                    style={benchPrimarySolid}
                    onClick={() => {
                      setModal(null);
                      startEdit(modalSource);
                    }}
                  >
                    편집
                  </button>
                )}
              </div>
            </>
          }
        >
          {modal.description && (
            <>
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
                description (frontmatter)
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-default)", lineHeight: 1.6, marginBottom: 16 }}>
                {modal.description}
              </div>
            </>
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
            본문 (에이전트가 read_file 로 읽음)
          </div>
          {modal.body ? (
            <pre className="il-code" style={{ maxHeight: 360, overflowY: "auto" }}>
              {modal.body}
            </pre>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>본문이 없습니다.</div>
          )}
        </ContentModal>
      )}
    </>
  );
}

export default SkillManager;

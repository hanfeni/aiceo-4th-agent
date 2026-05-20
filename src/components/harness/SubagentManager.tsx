"use client";

/**
 * 서브에이전트 관리 패널 — /api/harness/subagents CRUD UI.
 *
 * GET    {subagents:[{name,description,systemPrompt}]}  (커스텀만, builtin 제외)
 * POST   body{name,description,systemPrompt} → {subagent} | {error}
 * DELETE ?name= → {ok:true} | {error}
 *
 * 목록은 사용자 정의 서브에이전트만 노출(내장 web-searcher 는 코드 모듈이라
 * 여기 안 옴 → 모두 편집·삭제 가능). 예약명(web-searcher)은 API 가 거부하며
 * UI 도 slug 검증으로 차단한다. 편집 시 name(식별자)은 잠근다.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  card,
  sectionTitle,
  sectionDesc,
  rowItem,
  itemName,
  itemDesc,
  btnGhost,
  btnPrimary,
  btnDanger,
  btnDisabled,
  input,
  textarea,
  fieldLabel,
  field,
  messageStyle,
  actionRow,
} from "./managerStyles";

interface Subagent {
  name: string;
  description: string;
  systemPrompt: string;
}

interface FormState {
  /** 편집 모드면 true(name 잠금). */
  editing: boolean;
  name: string;
  description: string;
  systemPrompt: string;
}

const MAX_DESC_LEN = 2000;
const MAX_PROMPT_LEN = 20000;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const RESERVED = new Set<string>(["web-searcher"]);

export function SubagentManager(): ReactNode {
  const [items, setItems] = useState<Subagent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/harness/subagents");
      const data = (await res.json()) as { subagents?: Subagent[] };
      setItems(data.subagents ?? []);
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
    setForm({ editing: false, name: "", description: "", systemPrompt: "" });
  };

  const startEdit = (sa: Subagent): void => {
    setMsg(null);
    setForm({
      editing: true,
      name: sa.name,
      description: sa.description,
      systemPrompt: sa.systemPrompt,
    });
  };

  const cancel = (): void => {
    setForm(null);
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.name.trim()) {
      setMsg({ ok: false, text: "서브에이전트 이름을 입력하세요." });
      return;
    }
    if (!SLUG_RE.test(form.name)) {
      setMsg({
        ok: false,
        text: "이름은 영문 소문자·숫자·하이픈만(2~64자) 사용할 수 있습니다.",
      });
      return;
    }
    if (RESERVED.has(form.name)) {
      setMsg({
        ok: false,
        text: `'${form.name}' 은(는) 내장 서브에이전트 이름이라 사용할 수 없습니다.`,
      });
      return;
    }
    if (!form.systemPrompt.trim()) {
      setMsg({ ok: false, text: "systemPrompt 를 입력하세요." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/harness/subagents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          systemPrompt: form.systemPrompt,
        }),
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

  const remove = async (sa: Subagent): Promise<void> => {
    if (!window.confirm(`'${sa.name}' 서브에이전트를 삭제할까요?`)) return;
    setMsg(null);
    try {
      const res = await fetch(
        `/api/harness/subagents?name=${encodeURIComponent(sa.name)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "삭제에 실패했습니다." });
        return;
      }
      setMsg({ ok: true, text: "삭제했습니다." });
      if (form?.name === sa.name) setForm(null);
      await load();
    } catch {
      setMsg({ ok: false, text: "삭제 중 오류가 발생했습니다." });
    }
  };

  return (
    <div style={card}>
      <div style={sectionTitle}>서브에이전트 관리</div>
      <div style={sectionDesc}>
        메인 에이전트가 task 도구로 위임하는 일꾼 에이전트를 선언형으로
        만듭니다(코드 작성 불필요). 도구는 메인 기본 도구를 상속합니다. 내장
        서브에이전트(web-searcher)는 여기 표시되지 않습니다.
      </div>

      {msg && <div style={messageStyle(msg.ok)}>{msg.text}</div>}

      {!form && (
        <div style={{ marginBottom: 14 }}>
          <button type="button" style={btnPrimary} onClick={startNew}>
            + 새 서브에이전트
          </button>
        </div>
      )}

      {form && (
        <div
          style={{
            border: "1px solid var(--t-neutral-8)",
            borderRadius: "var(--r-md)",
            padding: 14,
            marginBottom: 14,
            background: "var(--surface-subtle)",
          }}
        >
          <div style={field}>
            <label style={fieldLabel}>이름 (slug)</label>
            <input
              style={{
                ...input,
                ...(form.editing
                  ? { background: "var(--t-neutral-6)", cursor: "not-allowed" }
                  : {}),
                fontFamily: "var(--font-mono)",
              }}
              value={form.name}
              maxLength={64}
              disabled={form.editing}
              placeholder="예: contract-reviewer"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {form.editing && (
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--text-subtle)",
                  marginTop: 4,
                }}
              >
                이름(식별자)은 변경할 수 없습니다.
              </div>
            )}
          </div>
          <div style={field}>
            <label style={fieldLabel}>설명 (description)</label>
            <input
              style={input}
              value={form.description}
              maxLength={MAX_DESC_LEN}
              placeholder="메인이 언제 이 서브에이전트에 위임할지 판단하는 근거"
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div style={field}>
            <label style={fieldLabel}>systemPrompt</label>
            <textarea
              style={textarea}
              value={form.systemPrompt}
              maxLength={MAX_PROMPT_LEN}
              placeholder="이 서브에이전트의 역할·지침 전문"
              onChange={(e) =>
                setForm({ ...form, systemPrompt: e.target.value })
              }
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

      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          등록된 커스텀 서브에이전트가 없습니다.
        </div>
      ) : (
        items.map((sa) => (
          <div key={sa.name} style={rowItem}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={itemName}>{sa.name}</span>
            </div>
            {sa.description && <div style={itemDesc}>{sa.description}</div>}
            <div style={{ ...actionRow, marginTop: 8 }}>
              <button type="button" style={btnGhost} onClick={() => startEdit(sa)}>
                편집
              </button>
              <button
                type="button"
                style={btnDanger}
                onClick={() => void remove(sa)}
              >
                삭제
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default SubagentManager;

"use client";

/**
 * 시스템 인스트럭션 관리 패널 — /api/harness/instructions CRUD UI.
 *
 * GET    {instructions:[{id,label,body,builtin?}]}
 * POST   body{id?,label,body} → {instruction} | {error,detail?}(400)
 * DELETE ?id= → {ok:true} | {error}
 *
 * builtin(=true, "default")은 편집·삭제 비활성(API 도 거부하지만 UI 차단).
 * 자체 fetch + 로컬 상태(표시 전용 HarnessView 와 분리 — 충돌 0).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  card,
  sectionTitle,
  sectionDesc,
  rowItem,
  itemName,
  itemDesc,
  builtinChip,
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

interface Instruction {
  id: string;
  label: string;
  body: string;
  builtin?: boolean;
}

interface FormState {
  /** 신규면 undefined, 편집이면 대상 id. */
  id?: string;
  label: string;
  body: string;
}

const MAX_LABEL_LEN = 100;
const MAX_BODY_LEN = 20000;

export function InstructionManager(): ReactNode {
  const [items, setItems] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/harness/instructions");
      const data = (await res.json()) as { instructions?: Instruction[] };
      setItems(data.instructions ?? []);
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
    setForm({ label: "", body: "" });
  };

  const startEdit = (it: Instruction): void => {
    setMsg(null);
    setForm({ id: it.id, label: it.label, body: it.body });
  };

  const cancel = (): void => {
    setForm(null);
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.label.trim() || !form.body.trim()) {
      setMsg({ ok: false, text: "이름과 본문을 모두 입력하세요." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/harness/instructions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          label: form.label,
          body: form.body,
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

  const remove = async (it: Instruction): Promise<void> => {
    if (it.builtin) return;
    if (!window.confirm(`'${it.label}' 인스트럭션을 삭제할까요?`)) return;
    setMsg(null);
    try {
      const res = await fetch(
        `/api/harness/instructions?id=${encodeURIComponent(it.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "삭제에 실패했습니다." });
        return;
      }
      setMsg({ ok: true, text: "삭제했습니다." });
      if (form?.id === it.id) setForm(null);
      await load();
    } catch {
      setMsg({ ok: false, text: "삭제 중 오류가 발생했습니다." });
    }
  };

  return (
    <div style={card}>
      <div style={sectionTitle}>시스템 인스트럭션 관리</div>
      <div style={sectionDesc}>
        메인 에이전트에 주입할 시스템 프롬프트를 만들고 편집합니다. 내장
        기본 인스트럭션은 보호되어 편집·삭제할 수 없습니다.
      </div>

      {msg && <div style={messageStyle(msg.ok)}>{msg.text}</div>}

      {!form && (
        <div style={{ marginBottom: 14 }}>
          <button type="button" style={btnPrimary} onClick={startNew}>
            + 새 인스트럭션
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
            <label style={fieldLabel}>이름 (label)</label>
            <input
              style={input}
              value={form.label}
              maxLength={MAX_LABEL_LEN}
              placeholder="예: 친절한 고객 지원 톤"
              onChange={(e) =>
                setForm({ ...form, label: e.target.value })
              }
            />
          </div>
          <div style={field}>
            <label style={fieldLabel}>본문 (body)</label>
            <textarea
              style={textarea}
              value={form.body}
              maxLength={MAX_BODY_LEN}
              placeholder="시스템 프롬프트 전문을 입력하세요."
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

      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          등록된 인스트럭션이 없습니다.
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} style={rowItem}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={itemName}>{it.label}</span>
              {it.builtin && <span style={builtinChip}>내장</span>}
            </div>
            <div style={itemDesc}>
              {it.body.length > 120
                ? `${it.body.slice(0, 120)}…`
                : it.body}
            </div>
            <div style={{ ...actionRow, marginTop: 8 }}>
              <button
                type="button"
                style={it.builtin ? btnDisabled : btnGhost}
                disabled={it.builtin}
                onClick={() => startEdit(it)}
              >
                편집
              </button>
              <button
                type="button"
                style={it.builtin ? btnDisabled : btnDanger}
                disabled={it.builtin}
                onClick={() => void remove(it)}
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

export default InstructionManager;

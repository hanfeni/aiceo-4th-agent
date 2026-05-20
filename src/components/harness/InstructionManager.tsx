"use client";

/**
 * 시스템 인스트럭션 관리 패널 — /api/harness/instructions CRUD UI.
 *
 * GET    {instructions:[{id,label,body,builtin?}]}
 * POST   body{id?,label,body} → {instruction} | {error,detail?}(400)
 * DELETE ?id= → {ok:true} | {error}
 *
 * builtin(=true)은 편집·삭제 비활성. systemPrompt prop 은 내장 "기본" 항목
 * 미리보기용(CRUD API 목록에 포함되지 않는 정적 상수 — 별도 표시).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  sectionDesc,
  itemName,
  builtinChip,
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
  instructionRow,
  rowBtn,
  rowBtnDanger,
  rowBtnDisabled,
  previewText,
} from "./managerStyles";
import { ContentModal } from "./ContentModal";
import { AiGenerateField } from "./AiGenerateField";
import { BenchHeader } from "@/app/(main)/harness/HarnessView";

interface Instruction {
  id: string;
  label: string;
  body: string;
  builtin?: boolean;
}

interface FormState {
  id?: string;
  label: string;
  body: string;
}

const MAX_LABEL_LEN = 100;
const MAX_BODY_LEN = 20000;
const PREVIEW_LEN = 80;

export function InstructionManager({
  systemPrompt,
  onCount,
}: {
  systemPrompt: string;
  /** 인스트럭션 총 변형 수(내장 "기본" 1 + CRUD 변형)를 부모에 보고 — 통계 타일용. */
  onCount?: (count: number) => void;
}): ReactNode {
  const [items, setItems] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 모달: id 가 있으면 CRUD 변형(편집/삭제 가능), 없으면 정적 "기본"(읽기 전용).
  const [modal, setModal] = useState<{ id?: string; label: string; body: string; builtin?: boolean } | null>(
    null,
  );

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

  // 변형 수(내장 "기본" 1 + CRUD 변형) 보고 — 통계 타일이 정직한 값을 표시.
  useEffect(() => {
    if (!loading) onCount?.(items.length + 1);
  }, [items.length, loading, onCount]);

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
        body: JSON.stringify({ id: form.id, label: form.label, body: form.body }),
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

  // 모달이 가리키는 CRUD 변형 원본(편집·삭제 연결용). id 없으면 정적 "기본".
  const modalSource = modal?.id ? items.find((i) => i.id === modal.id) : undefined;
  // 변형 1줄 행 — 정적 "기본"과 CRUD 변형을 동일 톤으로 렌더(builtin 보호).
  const renderRow = (
    key: string,
    label: string,
    body: string,
    opts: { builtin: boolean; active?: boolean; onView: () => void; onEdit?: () => void; onDelete?: () => void },
  ): ReactNode => (
    <div
      key={key}
      role="button"
      tabIndex={0}
      style={{ ...instructionRow, cursor: "pointer" }}
      onClick={opts.onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          opts.onView();
        }
      }}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={itemName}>{label}</span>
        {opts.active && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "var(--lab-success-text, #15803d)",
              marginLeft: 2,
            }}
          >
            ● 활성
          </span>
        )}
        {opts.builtin && <span style={builtinChip}>내장</span>}
        <span style={{ ...previewText, marginLeft: 4 }}>
          {body.length > PREVIEW_LEN ? `${body.slice(0, PREVIEW_LEN)}…` : body}
        </span>
      </div>
      <button
        type="button"
        style={opts.builtin || !opts.onEdit ? rowBtnDisabled : rowBtn}
        disabled={opts.builtin || !opts.onEdit}
        onClick={(e) => {
          e.stopPropagation();
          opts.onEdit?.();
        }}
      >
        편집
      </button>
      <button
        type="button"
        style={opts.builtin || !opts.onDelete ? rowBtnDisabled : rowBtnDanger}
        disabled={opts.builtin || !opts.onDelete}
        onClick={(e) => {
          e.stopPropagation();
          opts.onDelete?.();
        }}
      >
        삭제
      </button>
      <span style={{ width: 4 }} />
    </div>
  );

  return (
    <>
      <div className="il-card">
        {/* 시안 BenchCard 헤더 — SYSTEM 라벨 + 우측 액션. 멀티 변형 구조 */}
        <BenchHeader
          label="SYSTEM"
          title="메인 에이전트 시스템 인스트럭션 (변형)"
          status={
            !form ? (
              <button type="button" style={benchAction} onClick={startNew}>
                + 새 인스트럭션
              </button>
            ) : undefined
          }
        />
        <div style={sectionDesc}>
          메인 에이전트에 주입할 시스템 프롬프트 변형을 만들고 편집합니다. 내장
          기본 인스트럭션은 보호되어 편집·삭제할 수 없습니다. 변형 행을 클릭하면
          전문을 봅니다.
        </div>

        {msg && <div style={messageStyle(msg.ok)}>{msg.text}</div>}

        {/* 현재 활성 인스트럭션(기본) 전문 미리보기 — 시안 instruction 탭 il-code.
            메인 에이전트에 실제 주입되는 정적 systemPrompt 전문을 그대로 표시. */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          현재 활성 인스트럭션
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "var(--lab-success-text, #15803d)",
            }}
          >
            ● 기본
          </span>
        </div>
        <pre className="il-code" style={{ maxHeight: 240, overflowY: "auto", marginBottom: 18 }}>
          {systemPrompt}
        </pre>

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          변형 목록
        </div>

        {/* 변형 목록 — 정적 "기본"(활성) + CRUD 변형, 동일 톤 행 리스트 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* 기본(내장) 인스트럭션 — 정적 systemPrompt, 활성 표시 */}
          {renderRow("__builtin__", "기본", systemPrompt, {
            builtin: true,
            active: true,
            onView: () => setModal({ label: "기본 인스트럭션", body: systemPrompt, builtin: true }),
          })}

          {loading ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)", paddingTop: 6 }}>
              불러오는 중…
            </div>
          ) : (
            items.map((it) =>
              renderRow(it.id, it.label, it.body, {
                builtin: !!it.builtin,
                onView: () => setModal({ id: it.id, label: it.label, body: it.body, builtin: it.builtin }),
                onEdit: it.builtin ? undefined : () => startEdit(it),
                onDelete: it.builtin ? undefined : () => void remove(it),
              }),
            )
          )}
        </div>
      </div>

      {/* 상세 모달 — 시안 InstructionEditModal 톤(SYSTEM 배지 + footer) */}
      {modal && (
        <ContentModal
          title={modal.label}
          subtitle="시스템 인스트럭션 전문"
          onClose={() => setModal(null)}
          width={820}
          headerExtra={<span style={benchModalBadge}>SYSTEM</span>}
          footer={
            <>
              <button type="button" style={benchModalGhost} onClick={() => setModal(null)}>
                닫기
              </button>
              {modalSource && !modalSource.builtin && (
                <div style={{ display: "flex", gap: 6 }}>
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
                </div>
              )}
            </>
          }
        >
          <pre className="il-code" style={{ maxHeight: 420, overflowY: "auto" }}>
            {modal.body}
          </pre>
        </ContentModal>
      )}

      {/* 생성·편집 폼 모달 — 인라인 폼 대신 ContentModal(footer 취소/삭제/저장).
          상단에 AiGenerateField(한 줄 요청 → label/body 자동 입력) 통합. */}
      {form && (
        <ContentModal
          title={form.id ? `인스트럭션 편집 — ${form.label}` : "새 인스트럭션"}
          subtitle="메인 에이전트에 주입할 시스템 프롬프트 변형을 만듭니다. 저장 후 다음 대화부터 반영됩니다."
          onClose={cancel}
          width={820}
          headerExtra={<span style={benchModalBadge}>SYSTEM</span>}
          footer={
            <>
              <button type="button" style={benchModalGhost} onClick={cancel}>
                취소
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                {form.id && (
                  <button
                    type="button"
                    style={benchModalDanger}
                    onClick={() => {
                      const target = items.find((i) => i.id === form.id);
                      if (!target) return;
                      void remove(target);
                    }}
                  >
                    삭제
                  </button>
                )}
                <button
                  type="button"
                  style={
                    saving ? { ...benchPrimarySolid, opacity: 0.6, cursor: "not-allowed" } : benchPrimarySolid
                  }
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </>
          }
        >
          {/* AI 생성 — 한 줄 요청으로 label/body 자동 입력 */}
          <AiGenerateField
            kind="instruction"
            placeholder="예: 간결하게 코드 중심으로 답하는 톤"
            onResult={(r) =>
              setForm((prev) =>
                prev
                  ? {
                      ...prev,
                      label: r.label ?? prev.label,
                      body: r.body ?? prev.body,
                    }
                  : prev,
              )
            }
          />
          <div style={field}>
            <label style={fieldLabel}>이름 (label)</label>
            <input
              style={input}
              value={form.label}
              maxLength={MAX_LABEL_LEN}
              placeholder="예: 친절한 고객 지원 톤"
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div style={{ ...field, marginBottom: 0 }}>
            <label style={fieldLabel}>본문 (body)</label>
            <textarea
              style={{ ...textarea, minHeight: 240 }}
              value={form.body}
              maxLength={MAX_BODY_LEN}
              placeholder="시스템 프롬프트 전문을 입력하세요."
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
        </ContentModal>
      )}
    </>
  );
}

export default InstructionManager;

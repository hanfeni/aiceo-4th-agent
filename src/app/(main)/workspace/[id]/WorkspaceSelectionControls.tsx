"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { useChatStoreApi, useChatStore } from "@/store";
import type { WorkspaceId } from "@/lib/agent/harness/profiles";

/**
 * WorkspaceSelectionControls — 에이전트 A/B/C 컨트롤 바의 스킬·서브에이전트
 * 멀티선택 UI(시스템 인스트럭션 옆).
 *
 * 동작:
 *  - 마운트 시 /api/harness/workspace-selections?id=<profileId> 로 카탈로그
 *    (전체 스킬·서브에이전트 목록) + 현재 선택을 1회 로드.
 *  - 선택(null=전체)을 칩+팝오버 체크박스로 표시. 토글 시 낙관적 로컬 갱신
 *    → PUT 영속 → store.resetChat()(서버가 다음 요청에서 새 selection 으로
 *    그래프 재빌드 — agent.ts graphSig 에 selection 포함).
 *
 * 선택은 서버 .data/ 가 단일 소스라 store/body 에 싣지 않는다(agent.ts 가
 * profileId 로 직접 조회). 이 컴포넌트는 영속 + UI 만 담당.
 */

interface CatalogItem {
  name: string;
  description: string;
  builtin: boolean;
}

interface ApiResponse {
  selection?: { skills: string[] | null; subagents: string[] | null };
  skills?: CatalogItem[];
  subagents?: CatalogItem[];
}

export function WorkspaceSelectionControls({
  profileId,
}: {
  profileId: WorkspaceId;
}): ReactNode {
  const storeApi = useChatStoreApi();
  const isStreaming = useChatStore((s) => s.isStreaming);

  const [skillCatalog, setSkillCatalog] = useState<CatalogItem[]>([]);
  const [subagentCatalog, setSubagentCatalog] = useState<CatalogItem[]>([]);
  // null = 전체 선택(기본). 배열 = 선택된 name 만.
  const [skills, setSkills] = useState<string[] | null>(null);
  const [subagents, setSubagents] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 마운트 시 카탈로그 + 선택 로드.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/harness/workspace-selections?id=${encodeURIComponent(profileId)}`,
        );
        const d = (await r.json()) as ApiResponse;
        if (!alive) return;
        setSkillCatalog(d.skills ?? []);
        setSubagentCatalog(d.subagents ?? []);
        setSkills(d.selection?.skills ?? null);
        setSubagents(d.selection?.subagents ?? null);
        setLoaded(true);
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileId]);

  // 변경 영속 + 세션 리프레시. 낙관적 갱신은 호출 전 setState 가 처리.
  const persist = useCallback(
    (nextSkills: string[] | null, nextSubagents: string[] | null): void => {
      void fetch(
        `/api/harness/workspace-selections?id=${encodeURIComponent(profileId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skills: nextSkills, subagents: nextSubagents }),
        },
      ).catch(() => {
        /* 저장 실패는 조용히 — 다음 토글에서 재시도(UI 는 로컬 상태 유지). */
      });
      // 선택 변경 → 서버 그래프 캐시 키(selection sig)가 달라진다. 새 thread
      // 로 리프레시해 이전 그래프 기억과 섞이지 않게(토글·인스트럭션 동일 정책).
      storeApi.getState().resetChat();
    },
    [profileId, storeApi],
  );

  // 한 항목 토글. 현재 selection 이 null(전체)이면 "전체에서 1개 제외"로
  // 시작하기 위해 카탈로그 전체를 펼친 뒤 그 항목을 뺀다(직관적 동작).
  const toggleItem = useCallback(
    (
      kind: "skills" | "subagents",
      name: string,
    ): void => {
      if (isStreaming) return;
      const catalog = kind === "skills" ? skillCatalog : subagentCatalog;
      const cur = kind === "skills" ? skills : subagents;
      const allNames = catalog.map((c) => c.name);
      const base = cur ?? allNames; // null=전체 → 전체 목록에서 출발
      const next = base.includes(name)
        ? base.filter((n) => n !== name)
        : [...base, name];
      // 전체와 동일해지면 null(전체)로 정규화 — sig 가 기본과 같아져 회귀 0.
      const normalized =
        next.length === allNames.length &&
        allNames.every((n) => next.includes(n))
          ? null
          : next;
      if (kind === "skills") {
        setSkills(normalized);
        persist(normalized, subagents);
      } else {
        setSubagents(normalized);
        persist(skills, normalized);
      }
    },
    [isStreaming, skillCatalog, subagentCatalog, skills, subagents, persist],
  );

  if (!loaded) return null;

  return (
    <>
      <MultiSelect
        label="스킬"
        catalog={skillCatalog}
        selected={skills}
        disabled={isStreaming}
        onToggle={(name) => toggleItem("skills", name)}
        emptyHint="등록된 스킬 없음"
      />
      <MultiSelect
        label="서브에이전트"
        catalog={subagentCatalog}
        selected={subagents}
        disabled={isStreaming}
        onToggle={(name) => toggleItem("subagents", name)}
        emptyHint="등록된 서브에이전트 없음"
      />
    </>
  );
}

/** 칩(현재 선택 수) + 클릭 시 체크박스 팝오버. */
function MultiSelect({
  label,
  catalog,
  selected,
  disabled,
  onToggle,
  emptyHint,
}: {
  label: string;
  catalog: CatalogItem[];
  /** null = 전체. */
  selected: string[] | null;
  disabled: boolean;
  onToggle: (name: string) => void;
  emptyHint: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭으로 닫기.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const total = catalog.length;
  const count = selected === null ? total : selected.length;
  const isChecked = (name: string): boolean =>
    selected === null ? true : selected.includes(name);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <span style={{ fontSize: 11, color: "var(--text-subtle)", marginRight: 4, alignSelf: "center" }}>
        {label}:
      </span>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled || total === 0}
        title={total === 0 ? emptyHint : `${label} 선택`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--t-neutral-8)",
          background: "var(--surface-default)",
          color: "var(--text-default)",
          cursor: disabled || total === 0 ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          fontWeight: 600,
        }}
      >
        {total === 0
          ? emptyHint
          : count === total
            ? `전체 (${total})`
            : `${count}/${total}`}
        <ChevronDown size={12} aria-hidden />
      </button>

      {open && total > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: 220,
            maxWidth: 320,
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--surface-default)",
            border: "1px solid var(--t-neutral-8)",
            borderRadius: 8,
            boxShadow: "0 8px 24px -8px rgba(15,23,42,0.25)",
            padding: 4,
          }}
        >
          {catalog.map((item) => {
            const checked = isChecked(item.name);
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => onToggle(item.name)}
                title={item.description || item.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 11.5,
                  color: "var(--text-default)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--t-neutral-4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 4,
                    border: "1px solid var(--t-neutral-12)",
                    background: checked ? "var(--agent-500)" : "transparent",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {checked && <Check size={11} strokeWidth={3} aria-hidden />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  {item.builtin && (
                    <span style={{ color: "var(--text-subtle)", fontSize: 10 }}>
                      {" "}
                      (기본)
                    </span>
                  )}
                  {item.description && (
                    <span
                      style={{
                        display: "block",
                        color: "var(--text-subtle)",
                        fontSize: 10.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkspaceSelectionControls;

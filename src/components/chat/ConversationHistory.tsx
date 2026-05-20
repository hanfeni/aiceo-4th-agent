"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { History, Search, X } from "lucide-react";
import { useChatStoreApi } from "@/store";
import type { ChatMessage } from "@/types";
import type { ConversationRow } from "@/lib/conversations/list";
import { groupConversations } from "@/lib/conversations/group";

/**
 * ConversationHistory — 과거 대화 호출 Popover (Slice 4).
 *
 * 디자인 정합: chat.jsx:560 ConvHistoryPopover 스펙을 픽셀·토큰 그대로
 * 이식한다(width 340 / maxHeight 520 / radius 12 / popoverIn .15s /
 * 검색 var(--t-neutral-6) / active var(--agent-50)+좌측 agent-500 바 /
 * footer "총 N개 대화"·"ESC ↵ 닫기"). 디자인의 c.group(하드코딩)은 우리
 * 실 데이터(checkpoint ts)에 없으므로 groupConversations 가 KST 날짜로
 * 동적 산출(group.ts). preview 자리는 디자인의 더미 대신 실데이터
 * "시각 · N개" 표시(medigate-manager 패턴과 동일 정보).
 *
 * 데이터: GET /api/conversations(목록) → 선택 시 GET /api/conversations/
 * [id](복원 messages) → store.loadConversation(id, messages) 원자 커밋
 * (C1 — 복원 직후 send 가 같은 thread_id 로 이어짐).
 */

interface ApiListResponse {
  conversations: ConversationRow[];
  mode: "sqlite" | "memory";
  error?: string;
}

interface ApiRestoreResponse {
  id: string;
  messages: ChatMessage[];
  error?: string;
}

/** ts(ISO) → "MM-DD HH:mm" KST 표시(목록 보조). */
function fmtTs(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 60 * 60 * 1000); // KST
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export interface ConversationHistoryProps {
  /** 헤더 아이콘 버튼 공통 스타일(HeaderControls 와 시각 일치). */
  iconBtnStyle: CSSProperties;
}

export function ConversationHistory({
  iconBtnStyle,
}: ConversationHistoryProps): ReactNode {
  // 현재 컨텍스트의 store(워크스페이스 격리 또는 전역 /chat).
  const storeApi = useChatStoreApi();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [mode, setMode] = useState<"sqlite" | "memory">("sqlite");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(
    storeApi.getState().conversationId,
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchList = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      const data = (await res.json()) as ApiListResponse;
      setRows(Array.isArray(data.conversations) ? data.conversations : []);
      setMode(data.mode === "memory" ? "memory" : "sqlite");
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 토글 핸들러 — 여는 순간 최신 목록 fetch(새 대화 후 즉시 반영,
  // medigate fetchSessions). React 권장: effect 가 아니라 이벤트에서
  // 직접 트리거(불필요한 effect 제거 — react-hooks/set-state-in-effect).
  const toggleOpen = useCallback((): void => {
    setOpen((prev) => {
      const next = !prev;
      if (next) void fetchList();
      return next;
    });
  }, [fetchList]);

  // 바깥 클릭으로 닫기(디자인 chat.jsx:42 convOpen outside click).
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

  // ESC 닫기(디자인 footer "ESC ↵ 닫기").
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSelect = useCallback(async (id: string): Promise<void> => {
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
      const data = (await res.json()) as ApiRestoreResponse;
      // C1 — 원자 복원: conversationId + messages 동시 커밋. 복원 직후
      // useChat.send 가 이 conversationId 를 읽어 같은 thread 로 이어짐.
      storeApi
        .getState()
        .loadConversation(id, Array.isArray(data.messages) ? data.messages : []);
      setActiveId(id);
      setOpen(false);
    } catch {
      // 복원 실패는 조용히 무시(목록은 유지 — 사용자가 재시도 가능).
    }
  }, [storeApi]);

  const grouped = groupConversations(rows, query);
  const total = grouped.reduce((s, [, items]) => s + items.length, 0);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex" }}>
      <button
        type="button"
        onClick={toggleOpen}
        title="대화 기록"
        aria-label="대화 기록"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          ...iconBtnStyle,
          // 실 동작 기능 — disabled(흐린 --text-subtle)가 아니라 활성
          // 컨벤션(--text-default, "새 대화" 버튼과 동일 위계). 열림 시엔
          // agent accent(violet)로 패널 활성 상태를 명확히(디자인 chat.jsx
          // convOpen 배경 강조 패턴 + 색까지 확장).
          color: open ? "var(--agent-600)" : "var(--text-default)",
          cursor: "pointer",
          background: open ? "var(--t-neutral-8)" : "transparent",
        }}
      >
        <History size={15} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="대화 기록"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 100,
            width: 340,
            maxHeight: 520,
            background: "var(--surface-default)",
            border: "1px solid var(--t-neutral-12)",
            borderRadius: 12,
            boxShadow:
              "0 16px 48px -16px rgba(15,23,42,.18), 0 4px 12px -4px rgba(15,23,42,.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "popoverIn .15s ease-out",
          }}
        >
          {/* Search (디자인 chat.jsx:574) */}
          <div style={{ padding: "12px 14px 8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 10px",
                background: "var(--t-neutral-6)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <Search size={12} style={{ color: "var(--text-subtle)" }} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="대화 검색"
                aria-label="대화 검색"
                autoFocus
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 12,
                  color: "var(--text-default)",
                  minWidth: 0,
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    border: "none",
                    background: "var(--t-neutral-12)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-subtle)",
                  }}
                >
                  <X size={9} aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* List (디자인 chat.jsx:600) */}
          <div
            className="thin-scroll"
            style={{ flex: 1, overflowY: "auto", padding: "0 8px 10px" }}
          >
            {loading ? (
              <div style={emptyMsgStyle}>불러오는 중…</div>
            ) : mode === "memory" ? (
              <div style={emptyMsgStyle}>
                메모리 모드에서는 대화 기록이 보존되지 않습니다
              </div>
            ) : grouped.length === 0 ? (
              <div style={emptyMsgStyle}>
                {rows.length === 0
                  ? "저장된 대화가 없습니다"
                  : "일치하는 대화가 없습니다"}
              </div>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} style={{ marginTop: 4 }}>
                  <div
                    style={{
                      padding: "6px 8px 4px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--text-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {group}
                  </div>
                  {items.map((c) => {
                    const isActive = c.id === activeId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void handleSelect(c.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: 7,
                          border: "none",
                          cursor: "pointer",
                          background: isActive
                            ? "var(--agent-50)"
                            : "transparent",
                          color: "var(--text-default)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          marginBottom: 1,
                          position: "relative",
                          transition: "background .12s",
                        }}
                      >
                        {isActive && (
                          <span
                            style={{
                              position: "absolute",
                              left: -4,
                              top: 6,
                              bottom: 6,
                              width: 3,
                              borderRadius: 2,
                              background: "var(--agent-500)",
                            }}
                          />
                        )}
                        <span
                          className="truncate"
                          style={{
                            fontSize: 12.5,
                            fontWeight: isActive ? 600 : 500,
                            color: "var(--text-default)",
                          }}
                        >
                          {c.title}
                        </span>
                        <span
                          className="truncate"
                          style={{ fontSize: 11, color: "var(--text-subtle)" }}
                        >
                          {fmtTs(c.ts)} · {c.messageCount}개
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer (디자인 chat.jsx:650) */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid var(--t-neutral-8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 10.5,
              color: "var(--text-subtle)",
            }}
          >
            <span>총 {total}개 대화</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>ESC ↵ 닫기</span>
          </div>
        </div>
      )}
    </div>
  );
}

const emptyMsgStyle: CSSProperties = {
  padding: "24px 8px",
  fontSize: 12,
  color: "var(--text-subtle)",
  textAlign: "center",
};

export default ConversationHistory;

"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Brain,
  ChevronDown,
  SquarePen,
  Check,
  Database,
} from "lucide-react";
import { useChatStore, chatStore } from "@/store";
import { ConversationHistory } from "@/components/chat/ConversationHistory";
import {
  ALLOWED_MODELS,
  resolveInitialModel,
} from "@/lib/agent/harness/models";
import { SEARCH_DOMAINS, DOMAIN_SPEC } from "@/lib/searchlab/domains";
import { SQL_DOMAINS, SQL_DOMAIN_SPEC } from "@/lib/sqllab/domains";

// 인덱스검색 드롭다운 옵션 — 맨 앞 "안함"(도구 없음=기존 챗).
const IDX_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "인덱스검색 안함" },
  ...SEARCH_DOMAINS.map((d) => ({
    value: d,
    label: DOMAIN_SPEC[d].label,
  })),
];

// 데이터 조회(SQL) 드롭다운 옵션 — 맨 앞 "안함"(도구 없음).
const SQL_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "데이터조회 안함" },
  ...SQL_DOMAINS.map((d) => ({
    value: d,
    label: SQL_DOMAIN_SPEC[d].label,
  })),
];

/**
 * HeaderControls — 디자인 탑바 우측 액션 클러스터 (chat.jsx:183-225).
 *
 * 기능(실 백엔드 연결):
 *  - FR-07: active provider/model 표시. 값은 서버 환경변수에서 유래(props
 *    로 주입 — API 키 절대 미노출). store.provider/model 에 1회 하이드레이트.
 *  - FR-06: "새 대화" 버튼 → resetChat()(새 conversationId + messages 0) +
 *    입력창 포커스(onNewChat 콜백).
 *
 *  - 대화 기록(history): 실 동작(Slice 4). ConversationHistory Popover —
 *    checkpointer SQLite 재활용 목록/복원 + store.loadConversation(C1).
 *
 * 시각 전용 mock(미구현=mock): ModelPicker 드롭다운(표시만, 클릭 비활성).
 * (북마크 버튼은 실 기능 부재로 제거됨 — 디자인 chat.jsx:191 polyfill 폐기.)
 *
 * 픽셀값 인용(chat.jsx):
 *  - ModelPicker 버튼: padding 5px 10px, radius 8, border t-neutral-8 (:360)
 *  - 구분선: width 1, height 18, var(--t-neutral-12) (:186)
 *  - headerIconBtn: 32x32 radius 8 (:817)
 */

const headerIconBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background .12s",
};

export interface HeaderControlsProps {
  /** 서버 환경변수 유래(키 제외) — FR-07. */
  provider: string;
  model: string;
  /** "새 대화" 후 입력창 포커스 콜백(ChatPanel 연결) — FR-06. */
  onNewChat: () => void;
}

export function HeaderControls({
  provider,
  model,
  onNewChat,
}: HeaderControlsProps): ReactNode {
  // 서버 유래 값을 store 에 1회 하이드레이트(FR-07 — 키 미포함 식별자만).
  useEffect(() => {
    chatStore.setState({ provider, model });
  }, [provider, model]);

  const storeProvider = useChatStore((s) => s.provider);
  const storeModel = useChatStore((s) => s.model);
  const isStreaming = useChatStore((s) => s.isStreaming);

  // 표시는 props(서버 환경변수 유래 — 진실의 원천)를 1순위로 한다. store 는
  // useEffect 하이드레이션 이후에야 채워져 첫 렌더(SSR)에서 "모델 미설정"
  // 으로 굳는 버그가 있으므로 props 우선, store 2순위 폴백.
  const effProvider = provider || storeProvider;

  // FR-16/AD-15 — 선택 가능 모델은 화이트리스트로 한정. 서버 env model 이
  // 화이트리스트 밖(claude-* 등)이어도 드롭다운 현재 선택이 항상 화이트리스트
  // 멤버가 되도록 resolveInitialModel 로 정규화(Plan Critic C11 해소).
  const selectedModel = resolveInitialModel(storeModel || model);

  // store.model 이 비어 있으면(초기) 정규화된 선택 모델로 시드 — 드롭다운
  // 현재 표시와 useChat 이 보낼 model 을 일치시킨다.
  useEffect(() => {
    if (!chatStore.getState().model) {
      chatStore.getState().setModel(selectedModel);
    }
  }, [selectedModel]);

  const modelLabel = effProvider
    ? `${effProvider} · ${selectedModel}`
    : selectedModel;

  // C7/FR-17 — 스트리밍 중에는 모델 변경 잠금(진행 응답과 표시 모델 불일치
  // 방지). 드롭다운은 컴포넌트 로컬 상태.
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePickerToggle = (): void => {
    if (isStreaming) return; // 잠금 — 열지 않음
    setPickerOpen((v) => !v);
  };

  const handleSelectModel = (m: string): void => {
    chatStore.getState().setModel(m); // 같은 모델 재선택도 안전(no-op)
    setPickerOpen(false);
  };

  // 인덱스검색 드롭다운 — 로컬 open 상태(모델 픽커와 동형).
  const [idxOpen, setIdxOpen] = useState(false);
  const storeIdxDomain = useChatStore((s) => s.idxDomain);
  const idxLabel =
    IDX_OPTIONS.find((o) => o.value === storeIdxDomain)?.label ??
    "인덱스검색 안함";

  const handleSelectIdx = (v: string | null): void => {
    const st = chatStore.getState();
    if (st.idxDomain === v) {
      setIdxOpen(false);
      return; // 동일 선택 — no-op(불필요한 세션 리프레시 방지)
    }
    st.setIdxDomain(v);
    // 세션 리프레시: 새 conversationId → 다음 send 가 새 thread+
    // 변경된 idxDomain 동봉 → 서버 getGraph 캐시 키 변경=새 그래프
    // (MCP 도구 재인식 — 사용자 결정 2026-05-19).
    st.resetChat();
    onNewChat();
    setIdxOpen(false);
  };

  // 데이터 조회(SQL) 드롭다운 — 인덱스검색과 동형(독립 필드) +
  // 자동 적재(A안). 도메인 선택 시 미적재면 /api/sql-lab/load 를
  // SSE 완료까지 호출 → 그래야 그래프 빌드 시 getSchema 가 유효
  // 스키마를 반환해 도구 description 에 박힌다(타이밍 결함 해소).
  const [sqlOpen, setSqlOpen] = useState(false);
  // 적재 진행 표시 — 진행 중엔 드롭다운/선택 잠금(조기 send 방지).
  const [sqlLoading, setSqlLoading] = useState(false);
  const storeSqlDomain = useChatStore((s) => s.sqlDomain);
  const sqlLabel = sqlLoading
    ? "적재 중…"
    : (SQL_OPTIONS.find((o) => o.value === storeSqlDomain)?.label ??
      "데이터조회 안함");

  /** 한 도메인이 적재돼 있나 — tables API 로 확인(미적재면 자동 적재). */
  async function ensureSqlLoaded(domain: string): Promise<boolean> {
    try {
      const r = await fetch("/api/sql-lab/tables");
      const d = await r.json();
      const t = (d.tables ?? []).find(
        (x: { domain: string; loaded: boolean }) => x.domain === domain,
      );
      if (t?.loaded) return true; // 이미 적재됨 — 적재 불필요
      // 미적재 → SSE 적재를 done/error 까지 소비(완료 보장).
      const res = await fetch("/api/sql-lab/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (!res.ok || !res.body) return false;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let ok = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "done") ok = true;
          else if (ev.type === "error") return false;
        }
      }
      return ok;
    } catch {
      return false;
    }
  }

  const handleSelectSql = async (v: string | null): Promise<void> => {
    const st = chatStore.getState();
    if (st.sqlDomain === v || sqlLoading) {
      setSqlOpen(false);
      return; // 동일 선택·적재 중 — no-op
    }
    setSqlOpen(false);
    // "안함" 선택 → 도구 제거(적재 불필요). 그 외 → 적재 보장 후 선택.
    if (v !== null) {
      setSqlLoading(true);
      const loaded = await ensureSqlLoaded(v);
      setSqlLoading(false);
      if (!loaded) {
        // 적재 실패 — 선택 취소(스키마 못 박으면 의미 없음).
        // (조용한 실패 금지 — 사용자에게 표면화)
        chatStore
          .getState()
          .setError(
            `[${v}] 데이터 적재 실패 — 데이터 적재 메뉴에서 직접 ` +
              `적재 후 다시 선택하세요(인터넷·디스크 확인).`,
          );
        return;
      }
    }
    const s2 = chatStore.getState();
    s2.setSqlDomain(v);
    // 세션 리프레시 — 적재 완료 후이므로 다음 send 의 그래프 빌드
    // 시점에 getSchema 가 유효 스키마 반환 → description 에 박힘.
    s2.resetChat();
    onNewChat();
  };

  const handleNewChat = (): void => {
    chatStore.getState().resetChat(); // FR-06: 새 thread_id + 상태 초기화
    onNewChat();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {/* ModelPicker — 실 드롭다운(FR-16). 스트리밍 중 disabled(C7). */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={handlePickerToggle}
          disabled={isStreaming}
          title={isStreaming ? "응답 생성 중에는 변경할 수 없습니다" : "모델 선택"}
          aria-label={`모델: ${modelLabel}`}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--t-neutral-8)",
            background: "var(--surface-default)",
            fontSize: 12,
            color: "var(--text-default)",
            cursor: isStreaming ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: isStreaming ? 0.6 : 1,
          }}
        >
          <Brain size={12} style={{ color: "var(--agent-500)" }} aria-hidden />
          <span data-testid="model-label">{modelLabel}</span>
          <ChevronDown
            size={11}
            style={{ color: "var(--text-subtle)" }}
            aria-hidden
          />
        </button>

        {pickerOpen && !isStreaming && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 168,
              background: "var(--surface-default)",
              border: "1px solid var(--t-neutral-8)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              padding: 4,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {ALLOWED_MODELS.map((m) => {
              const active = m === selectedModel;
              return (
                <button
                  key={m}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectModel(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: active ? "var(--t-neutral-4)" : "transparent",
                    color: "var(--text-default)",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span>{m}</span>
                  {active && (
                    <Check
                      size={13}
                      style={{ color: "var(--agent-500)" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 인덱스검색 드롭다운 — 모델 픽커 동형. 변경 시 세션 리프레시
          (resetChat → 새 thread + 서버 그래프 재빌드, MCP 도구
          재인식). 스트리밍 중 잠금(도구셋 변경 불일치 방지). */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            if (isStreaming) return;
            setIdxOpen((v) => !v);
          }}
          disabled={isStreaming}
          title={
            isStreaming
              ? "응답 생성 중에는 변경할 수 없습니다"
              : "인덱스 검색 도구 도메인(변경 시 새 세션)"
          }
          aria-label={`인덱스검색: ${idxLabel}`}
          aria-haspopup="menu"
          aria-expanded={idxOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--t-neutral-8)",
            background: storeIdxDomain
              ? "var(--t-blue-6, #eef4ff)"
              : "var(--surface-default)",
            fontSize: 12,
            color: "var(--text-default)",
            cursor: isStreaming ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: isStreaming ? 0.6 : 1,
          }}
        >
          <Database
            size={12}
            style={{ color: "var(--agent-500)" }}
            aria-hidden
          />
          <span>{idxLabel}</span>
          <ChevronDown
            size={11}
            style={{ color: "var(--text-subtle)" }}
            aria-hidden
          />
        </button>

        {idxOpen && !isStreaming && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 184,
              background: "var(--surface-default)",
              border: "1px solid var(--t-neutral-8)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              padding: 4,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {IDX_OPTIONS.map((o) => {
              const active = o.value === storeIdxDomain;
              return (
                <button
                  key={o.value ?? "__none__"}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectIdx(o.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: active
                      ? "var(--t-neutral-4)"
                      : "transparent",
                    color: "var(--text-default)",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span>{o.label}</span>
                  {active && (
                    <Check
                      size={13}
                      style={{ color: "var(--agent-500)" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 데이터 조회(SQL) 드롭다운 — 인덱스검색과 동형(독립). */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            if (isStreaming || sqlLoading) return;
            setSqlOpen((v) => !v);
          }}
          disabled={isStreaming || sqlLoading}
          title={
            isStreaming
              ? "응답 생성 중에는 변경할 수 없습니다"
              : sqlLoading
                ? "데이터 적재 중 — 완료 후 자동으로 세션이 시작됩니다"
                : "데이터 조회(SQL) 도구 도메인(변경 시 새 세션)"
          }
          aria-label={`데이터조회: ${sqlLabel}`}
          aria-haspopup="menu"
          aria-expanded={sqlOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--t-neutral-8)",
            background: storeSqlDomain
              ? "var(--t-blue-6, #eef4ff)"
              : "var(--surface-default)",
            fontSize: 12,
            color: "var(--text-default)",
            cursor:
              isStreaming || sqlLoading ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: isStreaming || sqlLoading ? 0.6 : 1,
          }}
        >
          <Database
            size={12}
            style={{ color: "var(--agent-500)" }}
            aria-hidden
          />
          <span>{sqlLabel}</span>
          <ChevronDown
            size={11}
            style={{ color: "var(--text-subtle)" }}
            aria-hidden
          />
        </button>

        {sqlOpen && !isStreaming && !sqlLoading && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 184,
              background: "var(--surface-default)",
              border: "1px solid var(--t-neutral-8)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              padding: 4,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {SQL_OPTIONS.map((o) => {
              const active = o.value === storeSqlDomain;
              return (
                <button
                  key={o.value ?? "__none__"}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSelectSql(o.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: active
                      ? "var(--t-neutral-4)"
                      : "transparent",
                    color: "var(--text-default)",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span>{o.label}</span>
                  {active && (
                    <Check
                      size={13}
                      style={{ color: "var(--agent-500)" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span
        style={{
          width: 1,
          height: 18,
          background: "var(--t-neutral-12)",
          margin: "0 6px",
        }}
      />

      {/* 대화 기록 — 실 동작(Slice 4). checkpointer SQLite 재활용:
          목록/복원 API + store.loadConversation 원자 커밋(C1).
          (북마크 버튼은 실 기능 부재로 제거 — placeholder UI 폐기.) */}
      <ConversationHistory iconBtnStyle={headerIconBtn} />

      {/* 새 대화 — 실 동작(FR-06). */}
      <button
        type="button"
        onClick={handleNewChat}
        title="새 대화"
        aria-label="새 대화"
        style={{ ...headerIconBtn, color: "var(--text-default)", cursor: "pointer" }}
      >
        <SquarePen size={15} aria-hidden />
      </button>
    </div>
  );
}

export default HeaderControls;

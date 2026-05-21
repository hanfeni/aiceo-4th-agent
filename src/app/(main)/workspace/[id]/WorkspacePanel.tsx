"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check, ScrollText } from "lucide-react";
import {
  createChatStore,
  ChatStoreProvider,
  useChatStore,
  useChatStoreApi,
} from "@/store";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  HARNESS_ELEMENTS,
  HARNESS_ELEMENT_LABEL,
  type HarnessProfile,
  type HarnessElement,
} from "@/lib/agent/harness/profiles";
import { WorkspaceSelectionControls } from "./WorkspaceSelectionControls";

/**
 * WorkspacePanel — 챗 에이전트 복제본(에이전트 A/B/C) 클라이언트 래퍼.
 *
 * 격리: 에이전트마다 독립 store 인스턴스(createChatStore)를 useState 로
 * 1회 생성해 ChatStoreProvider 로 주입한다. messages/conversationId/
 * profileId/하네스 토글/인스트럭션이 다른 에이전트·기존 /chat 과 완전히
 * 분리된다(전역 싱글톤 공유 안 함 — 대화 섞임 0).
 *
 * 설계 전환(사용자 결정 2026-05-20): 고정 차단 배너 → 4요소 토글 컨트롤.
 * 세 에이전트 기능 동일(planning/filesystem/subagents/skills 전부 토글
 * 가능). 다른 건 profile.defaults(초기 토글값) 뿐(현재 모두 빈 객체 =
 * env 디폴트). 사용자가 토글을 바꾸면 store.harnessOverrides 갱신 후
 * resetChat 으로 세션 리프레시(서버 그래프 캐시 키 변경=재빌드).
 *
 * 인스트럭션: 하네스 관리에서 만든 시스템 인스트럭션을 드롭다운으로
 * 선택. 변경 시 store.instructionId 갱신 + resetChat. 실제 적용은 서버
 * buildHarnessConfig/getSystemPromptBody 가 한다(R2 단일 지점).
 */

export interface WorkspacePanelProps {
  profile: HarnessProfile;
  /** 서버 환경변수 유래(키 제외) — FR-07. page.tsx(Server)에서 주입. */
  provider: string;
  model: string;
}

interface InstructionMeta {
  id: string;
  label: string;
  builtin?: boolean;
}

export function WorkspacePanel({
  profile,
  provider,
  model,
}: WorkspacePanelProps): ReactNode {
  // 에이전트 전용 store 인스턴스 — 마운트 동안 안정(매 렌더 재생성 금지).
  const [store] = useState(() => createChatStore());

  return (
    <ChatStoreProvider store={store}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "var(--surface-default)",
          height: "100%",
        }}
      >
        <AgentControlBar profile={profile} />
        <ChatPanel provider={provider} model={model} />
      </div>
    </ChatStoreProvider>
  );
}

/**
 * 마운트 시 store 를 이 에이전트 정체성으로 1회 시드한다:
 * profileId + 프로필 defaults(초기 토글) + 기본 인스트럭션. Provider
 * 안쪽이어야 이 에이전트 store 를 잡는다.
 */
function useBindProfile(profile: HarnessProfile): void {
  const storeApi = useChatStoreApi();
  useEffect(() => {
    const st = storeApi.getState();
    st.setProfileId(profile.id);
    st.setHarnessOverrides({ ...profile.defaults });
    if (profile.defaultInstructionId)
      st.setInstructionId(profile.defaultInstructionId);
  }, [storeApi, profile]);
}

/** 에이전트 상단 컨트롤 바 — 4요소 토글 + 인스트럭션 선택. */
function AgentControlBar({ profile }: { profile: HarnessProfile }): ReactNode {
  useBindProfile(profile);
  const storeApi = useChatStoreApi();
  const overrides = useChatStore((s) => s.harnessOverrides);
  const instructionId = useChatStore((s) => s.instructionId);
  const isStreaming = useChatStore((s) => s.isStreaming);

  // 하네스 관리에서 만든 인스트럭션 목록(드롭다운). 마운트 시 1회 fetch.
  const [instructions, setInstructions] = useState<InstructionMeta[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/harness/instructions");
        const d = (await r.json()) as { instructions?: InstructionMeta[] };
        if (alive) setInstructions(d.instructions ?? []);
      } catch {
        if (alive) setInstructions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (el: HarnessElement): void => {
    if (isStreaming) return;
    const st = storeApi.getState();
    // override 미설정이면 env 디폴트(true 가정)에서 토글. 명시값 우선.
    const cur = st.harnessOverrides[el];
    const next = cur === undefined ? false : !cur;
    st.setHarnessOverride(el, next);
    st.resetChat(); // 세션 리프레시(서버 그래프 재빌드)
  };

  const selectInstruction = (id: string | null): void => {
    if (isStreaming) return;
    const st = storeApi.getState();
    st.setInstructionId(id);
    st.resetChat();
    setInsOpen(false);
  };

  // 인스트럭션 커스텀 드롭다운(HeaderControls 디자인) — open + 바깥 클릭 닫기.
  const [insOpen, setInsOpen] = useState(false);
  const insWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!insOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (insWrapRef.current && !insWrapRef.current.contains(e.target as Node)) {
        setInsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [insOpen]);

  // 드롭다운 옵션 — instructions 목록(없으면 default 합성). 현재 선택 라벨.
  const insOptions: InstructionMeta[] =
    instructions.length === 0
      ? [{ id: "default", label: "기본 인스트럭션", builtin: true }]
      : instructions;
  const selectedInsId = instructionId ?? "default";
  const selectedIns =
    insOptions.find((o) => o.id === selectedInsId) ?? insOptions[0];
  const insLabel = selectedIns
    ? `${selectedIns.label}${selectedIns.builtin ? " (기본)" : ""}`
    : "기본 인스트럭션";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        borderBottom: "1px solid var(--t-neutral-8)",
        background: "var(--surface-subtle, #fafafa)",
        flexShrink: 0,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-default)" }}
      >
        {profile.label}
      </span>

      {/* 4요소 토글 — 각 칩 클릭으로 on/off. override 미설정이면 env
          디폴트(켜짐)로 간주해 표시. */}
      <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 4 }}>
        하네스:
      </span>
      {HARNESS_ELEMENTS.map((el) => {
        // 표시 상태: override 명시값 우선, 미설정이면 env 디폴트(켜짐 가정).
        const on = overrides[el] ?? true;
        return (
          <button
            key={el}
            type="button"
            onClick={() => toggle(el)}
            disabled={isStreaming}
            title={`${HARNESS_ELEMENT_LABEL[el]} ${on ? "끄기" : "켜기"}`}
            style={{
              fontSize: 10.5,
              padding: "3px 9px",
              borderRadius: 999,
              border: "1px solid var(--t-neutral-8)",
              background: on
                ? "color-mix(in srgb, var(--agent-500) 14%, transparent)"
                : "var(--t-neutral-6)",
              color: on ? "var(--agent-700, #6d28d9)" : "var(--text-subtle)",
              fontWeight: 600,
              cursor: isStreaming ? "not-allowed" : "pointer",
              opacity: isStreaming ? 0.6 : 1,
              textDecoration: on ? "none" : "line-through",
            }}
          >
            {HARNESS_ELEMENT_LABEL[el]}
          </button>
        );
      })}

      <span style={{ flex: 1, minWidth: 8 }} />

      {/* 우측 드롭다운 그룹(인스트럭션·스킬·서브에이전트) — 한 묶음으로 wrap
          되게 inline-flex 로 감싼다(라벨과 select 가 따로 떨어져 깨지는 것
          방지). 좁은 폭에선 그룹 통째로 다음 줄로 안전하게 내려감. */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {/* 시스템 인스트럭션 선택 — HeaderControls 드롭다운 디자인(사용자
            결정 2026-05-21): ScrollText(보라) + 라벨 + ChevronDown 버튼 +
            Check 팝오버. 단일 선택(현재 1개에만 Check). 긴 라벨은 버튼
            maxWidth + ellipsis 로 영역 내 안전 표시. */}
        <div
          ref={insWrapRef}
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            인스트럭션:
          </span>
          <button
            type="button"
            onClick={() => !isStreaming && setInsOpen((v) => !v)}
            disabled={isStreaming}
            title={
              isStreaming
                ? "응답 생성 중에는 변경할 수 없습니다"
                : "시스템 인스트럭션 선택(변경 시 새 세션)"
            }
            aria-haspopup="menu"
            aria-expanded={insOpen}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 8,
              border: "1px solid var(--t-neutral-8)",
              // 비-기본 인스트럭션 선택 시 파란 활성 배경(default 면 흰 배경).
              background:
                selectedInsId !== "default"
                  ? "var(--t-blue-6, #eef4ff)"
                  : "var(--surface-default)",
              fontSize: 12,
              color: "var(--text-default)",
              cursor: isStreaming ? "not-allowed" : "pointer",
              fontWeight: 500,
              opacity: isStreaming ? 0.6 : 1,
              maxWidth: 240,
            }}
          >
            <ScrollText
              size={12}
              style={{ color: "var(--agent-500)", flexShrink: 0 }}
              aria-hidden
            />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {insLabel}
            </span>
            <ChevronDown
              size={11}
              style={{ color: "var(--text-subtle)", flexShrink: 0 }}
              aria-hidden
            />
          </button>

          {insOpen && !isStreaming && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                minWidth: 200,
                maxWidth: 320,
                maxHeight: 280,
                overflowY: "auto",
                background: "var(--surface-default)",
                border: "1px solid var(--t-neutral-8)",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                padding: 4,
                zIndex: 50,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {insOptions.map((ins) => {
                const active = ins.id === selectedInsId;
                return (
                  <button
                    key={ins.id}
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      selectInstruction(ins.id === "default" ? null : ins.id)
                    }
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
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ins.label}
                      {ins.builtin ? " (기본)" : ""}
                    </span>
                    {active && (
                      <Check
                        size={13}
                        style={{ color: "var(--agent-500)", flexShrink: 0 }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 스킬·서브에이전트 멀티선택 — 프로필별 .data/ 영속(서버 단일 소스).
            변경 시 PUT + resetChat → 다음 요청에서 서버가 새 selection 으로
            그래프 재빌드(agent.ts graphSig 에 selection 포함). */}
        <WorkspaceSelectionControls profileId={profile.id} />
      </div>
    </div>
  );
}

export default WorkspacePanel;

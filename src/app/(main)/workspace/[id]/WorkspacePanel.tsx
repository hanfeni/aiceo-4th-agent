"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  };

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

      <span style={{ flex: 1 }} />

      {/* 시스템 인스트럭션 선택 — 하네스 관리에서 만든 것 중. */}
      <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
        인스트럭션:
      </span>
      <select
        value={instructionId ?? "default"}
        onChange={(e) =>
          selectInstruction(
            e.target.value === "default" ? null : e.target.value,
          )
        }
        disabled={isStreaming}
        style={{
          fontSize: 11.5,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--t-neutral-8)",
          background: "var(--surface-default)",
          color: "var(--text-default)",
          cursor: isStreaming ? "not-allowed" : "pointer",
          maxWidth: 220,
        }}
      >
        {/* 기본(default) 옵션 — instructions 목록에 default(builtin)가
            이미 포함되면 중복 방지 위해 그것을 쓰고, 없으면 합성 표시. */}
        {instructions.length === 0 && (
          <option value="default">기본 인스트럭션</option>
        )}
        {instructions.map((ins) => (
          <option key={ins.id} value={ins.id}>
            {ins.label}
            {ins.builtin ? " (기본)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export default WorkspacePanel;

"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createChatStore,
  ChatStoreProvider,
  useChatStoreApi,
} from "@/store";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  HARNESS_ELEMENT_LABEL,
  type HarnessProfile,
} from "@/lib/agent/harness/profiles";

/**
 * WorkspacePanel — 챗 에이전트 복제본(워크스페이스) 클라이언트 래퍼.
 *
 * 격리: 워크스페이스마다 독립 store 인스턴스(createChatStore)를 useState 로
 * 1회 생성해 ChatStoreProvider 로 주입한다. 그래서 messages/conversationId/
 * profileId 가 다른 워크스페이스·기존 /chat 과 완전히 분리된다(전역 싱글톤
 * 공유 안 함 — 대화 섞임 0). 같은 워크스페이스 메뉴를 다시 열어도 store
 * 인스턴스는 페이지 마운트 동안 안정적으로 유지된다.
 *
 * 차단 표시: 상단 배너에 이 워크스페이스에서 차단된 하네스 요소를 칩으로
 * 보여준다(차단 없으면 "전체 사용" 안내). 실제 차단은 서버 buildHarnessConfig
 * 가 profileId 로 강제 적용하므로(R2 단일 지점), 이 배너는 표시 전용이다.
 *
 * ChatPanel 재사용: 기존 /chat 의 ChatPanel 을 그대로 렌더한다. ChatPanel
 * 이하(HeaderControls/MessageList/useChat/ConversationHistory)는 Context
 * 기반이라 Provider 가 주입한 워크스페이스 store 를 자동으로 쓴다.
 */

export interface WorkspacePanelProps {
  profile: HarnessProfile;
  /** 서버 환경변수 유래(키 제외) — FR-07. page.tsx(Server)에서 주입. */
  provider: string;
  model: string;
}

export function WorkspacePanel({
  profile,
  provider,
  model,
}: WorkspacePanelProps): ReactNode {
  // 워크스페이스 전용 store 인스턴스 — 마운트 동안 안정(매 렌더 재생성 금지).
  const [store] = useState(() => createChatStore());

  return (
    <ChatStoreProvider store={store}>
      {/* 래퍼는 div(중첩 main 금지 — ChatPanel 이 이미 <main> 렌더).
          배너 + ChatPanel 을 세로로 쌓는 flex 컨테이너. */}
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
        <WorkspaceBanner profile={profile} />
        <ChatPanel provider={provider} model={model} />
      </div>
    </ChatStoreProvider>
  );
}

/** 마운트 시 store.profileId 를 1회 세팅한다(이후 send 가 body 에 동봉). */
function useBindProfile(profileId: string): void {
  const storeApi = useChatStoreApi();
  useEffect(() => {
    storeApi.getState().setProfileId(profileId);
  }, [storeApi, profileId]);
}

/** 차단된 하네스 요소를 칩으로 표시하는 상단 배너. */
function WorkspaceBanner({ profile }: { profile: HarnessProfile }): ReactNode {
  // profileId 바인딩은 Provider 안쪽이어야 워크스페이스 store 를 잡는다.
  useBindProfile(profile.id);

  const hasBlocked = profile.blocked.length > 0;
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
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--text-default)",
        }}
      >
        {profile.label}
      </span>
      <span
        style={{
          fontSize: 11.5,
          color: "var(--text-subtle)",
        }}
      >
        {profile.description}
      </span>
      <span style={{ flex: 1 }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-subtle)",
        }}
      >
        차단된 요소:
      </span>
      {hasBlocked ? (
        profile.blocked.map((el) => (
          <span
            key={el}
            title="이 워크스페이스에서 강제 차단된 하네스 요소입니다(서버 적용)."
            style={{
              fontSize: 10.5,
              padding: "3px 8px",
              borderRadius: 6,
              background: "color-mix(in srgb, var(--red-500, #ef4444) 12%, transparent)",
              color: "var(--red-600, #dc2626)",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textDecoration: "line-through",
            }}
          >
            {HARNESS_ELEMENT_LABEL[el]}
          </span>
        ))
      ) : (
        <span
          style={{
            fontSize: 10.5,
            padding: "3px 8px",
            borderRadius: 6,
            background: "color-mix(in srgb, var(--green-500, #22c55e) 12%, transparent)",
            color: "var(--green-600, #16a34a)",
            fontWeight: 700,
          }}
        >
          없음 (전체 하네스 사용)
        </span>
      )}
    </div>
  );
}

export default WorkspacePanel;

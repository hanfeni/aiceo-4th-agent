"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createChatStore,
  ChatStoreProvider,
  useChatStoreApi,
} from "@/store";
import { ChatPanel } from "@/components/chat/ChatPanel";

/**
 * CustomAgentPanel — 커스텀 에이전트 챗 클라이언트 래퍼.
 *
 * WorkspacePanel.tsx 동형:
 *  - 에이전트별 독립 store 인스턴스(createChatStore)를 마운트 시 1회 생성.
 *  - ChatStoreProvider 로 ChatPanel 에 주입(다른 워크스페이스·/chat 과 격리).
 *  - customAgentId 를 마운트 시 store 에 1회 세팅(이후 불변).
 *    startStream 이 body.customAgentId 로 동봉 → 서버 resolveAgentComposition.
 *
 * 헤더: 에이전트 name + description(있으면) 표시.
 */

export interface CustomAgentPanelProps {
  agentId: string;
  agentName: string;
  agentDescription: string;
  /** 서버 환경변수 유래(키 제외) — FR-07. page.tsx(Server)에서 주입. */
  provider: string;
  model: string;
}

export function CustomAgentPanel({
  agentId,
  agentName,
  agentDescription,
  provider,
  model,
}: CustomAgentPanelProps): ReactNode {
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
        <AgentHeader
          agentId={agentId}
          agentName={agentName}
          agentDescription={agentDescription}
        />
        <ChatPanel provider={provider} model={model} />
      </div>
    </ChatStoreProvider>
  );
}

/**
 * 마운트 시 store 에 customAgentId 를 1회 세팅한다.
 * Provider 안쪽이어야 이 에이전트 store 를 잡는다(WorkspacePanel 패턴).
 */
function useBindCustomAgent(agentId: string): void {
  const storeApi = useChatStoreApi();
  useEffect(() => {
    const st = storeApi.getState();
    st.setCustomAgentId(agentId);
  }, [storeApi, agentId]);
}

/** 에이전트 상단 헤더 — name + description 표시. */
function AgentHeader({
  agentId,
  agentName,
  agentDescription,
}: {
  agentId: string;
  agentName: string;
  agentDescription: string;
}): ReactNode {
  useBindCustomAgent(agentId);

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
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.08em",
          color: "var(--agent-700)",
          textTransform: "uppercase",
          background: "var(--lab-agent-bg-2)",
          padding: "2px 7px",
          borderRadius: 4,
        }}
      >
        나의 에이전트
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-default)",
        }}
      >
        {agentName}
      </span>
      {agentDescription && (
        <span
          style={{
            fontSize: 11.5,
            color: "var(--text-subtle)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 400,
          }}
        >
          {agentDescription}
        </span>
      )}
    </div>
  );
}

export default CustomAgentPanel;

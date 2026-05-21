import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCustomAgent } from "@/lib/agent/harness/agents/customAgentStore";
import { CustomAgentPanel } from "./CustomAgentPanel";

/**
 * /custom-agent/[id] — 커스텀 에이전트 챗 페이지 (Server Component).
 *
 * workspace/[id]/page.tsx 동형:
 *  - id → getCustomAgent(id) → null 이면 notFound(404).
 *  - provider/model env 읽어서 CustomAgentPanel 에 주입(FR-07: 키 제외).
 *
 * Next 16 — 동적 route 의 params 는 Promise. await 로 푼다.
 * R7 — getCustomAgent 가 fs 의존 → runtime=nodejs.
 *
 * 보안(TC-53.5): id 형식 위반(traversal 등)은 getCustomAgent 내
 * isValidEntry 필터로 미적중 → null → notFound(파일시스템 접근 0).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const agent = getCustomAgent(id);
  if (!agent) notFound();

  const provider = (process.env.LLM_PROVIDER ?? "").trim();
  const model = (process.env.LLM_MODEL ?? "").trim();

  return (
    <CustomAgentPanel
      agentId={agent.id}
      agentName={agent.name}
      agentDescription={agent.description}
      provider={provider}
      model={model}
    />
  );
}

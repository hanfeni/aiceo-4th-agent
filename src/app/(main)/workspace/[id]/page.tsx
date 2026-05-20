import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { WorkspacePanel } from "./WorkspacePanel";
import { getProfile, WORKSPACE_IDS } from "@/lib/agent/harness/profiles";

/**
 * /workspace/[id] — 챗 에이전트 복제 워크스페이스 (Server Component).
 *
 * id 는 workspace1|2|3 화이트리스트. 그 외는 notFound(404). 유효 id 면
 * 해당 하네스 프로필 + 서버 env provider/model(키 제외 — FR-07)을 클라이언트
 * 래퍼(WorkspacePanel)에 주입한다. 차단 적용 자체는 서버 buildHarnessConfig
 * 가 profileId 로 수행하므로(R2), 여기서는 표시·전달만 한다.
 *
 * Next 16 — 동적 route 의 params 는 Promise. await 로 푼다.
 */

/** 정적 생성 힌트(화이트리스트 3개). 동적 진입도 안전하나 사전 생성. */
export function generateStaticParams(): { id: string }[] {
  return WORKSPACE_IDS.map((id) => ({ id }));
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const profile = getProfile(id);
  if (!profile) notFound();

  const provider = (process.env.LLM_PROVIDER ?? "").trim();
  const model = (process.env.LLM_MODEL ?? "").trim();

  return (
    <WorkspacePanel profile={profile} provider={provider} model={model} />
  );
}

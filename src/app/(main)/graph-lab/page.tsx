import type { ReactNode } from "react";
import { GraphLabView } from "@/components/graph-lab/GraphLabView";

/**
 * /graph-lab — 온톨로지 / GraphRAG 실습.
 *
 * View 가 client(SSE 진행·3패널 스트리밍)라 page 는 얇은 래퍼
 * (index-lab/page.tsx 동형). layout.tsx(server) 안 건드림 —
 * AgentNav 배열에 항목만 추가.
 */
export default function GraphLabPage(): ReactNode {
  return <GraphLabView />;
}

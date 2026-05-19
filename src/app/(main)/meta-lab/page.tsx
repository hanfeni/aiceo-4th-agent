import type { ReactNode } from "react";
import { MetaLabView } from "@/components/meta-lab/MetaLabView";

/**
 * /meta-lab — 메타 스키마/라벨링 실습 (LLM 실작동 + 시스템 인스트럭션 노출).
 *
 * View 가 client(SSE 스트림·상태)라 page 는 얇은 래퍼.
 * layout.tsx(server) 안 건드림 — AgentNav 배열에 항목만 추가.
 */
export default function MetaLabPage(): ReactNode {
  return <MetaLabView />;
}

import type { ReactNode } from "react";
import { IndexLabView } from "@/components/index-lab/IndexLabView";

/**
 * /index-lab — 도메인 색인 (검색 실습과 별도 메뉴).
 *
 * View 가 client(SSE 진행·상태)라 page 는 얇은 래퍼.
 * layout.tsx(server) 안 건드림 — AgentNav 배열에 항목만 추가.
 */
export default function IndexLabPage(): ReactNode {
  return <IndexLabView />;
}

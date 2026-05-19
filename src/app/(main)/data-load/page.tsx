import type { ReactNode } from "react";
import { DataLoadView } from "@/components/data-load/DataLoadView";

/**
 * /data-load — CSV → SQLite 데이터 적재 (Text-to-SQL 실습 준비).
 *
 * View 가 client(SSE 진행·상태)라 page 는 얇은 래퍼(index-lab
 * page 와 동일 패턴). layout.tsx 안 건드림 — AgentNav 에 항목만 추가.
 */
export default function DataLoadPage(): ReactNode {
  return <DataLoadView />;
}

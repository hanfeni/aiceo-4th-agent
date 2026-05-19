import type { ReactNode } from "react";
import { SearchLabView } from "@/components/search-lab/SearchLabView";

/**
 * /search-lab — 검색 실습 (렉시컬·벡터·하이브리드).
 *
 * View 가 client(검색 인터랙션·상태)라 page 는 얇은 래퍼.
 * layout.tsx(server) 는 안 건드림 — AgentNav 배열에 항목만 추가.
 */
export default function SearchLabPage(): ReactNode {
  return <SearchLabView />;
}

import type { ReactNode } from "react";
import { StoreExplorerView } from "@/components/store-explorer/StoreExplorerView";

/**
 * /store-explorer — 저장소 탐색기 (OpenSearch 색인 + SQLite 테이블 통합).
 *
 * 인덱스/테이블 목록 → 클릭 → 문서/행 → 상세 데이터 3단계 드릴다운.
 * 백엔드 신규 0 — 기존 search-lab/indices·docs, sql-lab/tables·rows API
 * 와 IndexDocsModal·PreviewModal 컴포넌트 재사용. View 가 client(목록·
 * 모달 상태)라 page 는 얇은 래퍼(다른 메뉴와 동일 패턴).
 */
export default function StoreExplorerPage(): ReactNode {
  return <StoreExplorerView />;
}

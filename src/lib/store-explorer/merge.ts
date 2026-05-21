/**
 * 저장소 탐색기 — 두 저장소(OpenSearch 색인 / SQLite 테이블)의 목록
 * 응답을 단일 통합 뷰모델로 합치는 순수 함수.
 *
 * 백엔드 신규 0: GET /api/search-lab/indices 와 GET /api/sql-lab/tables
 * 응답을 그대로 받아 화면용 한 배열로 정규화한다. 네트워크·LLM·DB 없음
 * → 단위 테스트 가능(CLAUDE.md "파서는 순수 함수" 원칙).
 *
 * kind 태그(discriminated union)로 두 저장소를 한 리스트에 담아, UI 는
 * 단일 렌더 + 클릭 시 kind 로 상세 분기. domain 이 있어야 문서/행 상세를
 * 조회할 수 있다(상세 API 가 domain 파라미터 기반) — domain 없으면
 * 목록엔 보이되 상세 진입은 비활성(drillable=false).
 */

/** GET /api/search-lab/indices 의 indices[] 항목 형태(admin.ts IndexInfo). */
export interface RawIndexInfo {
  index: string;
  domain?: string;
  label?: string;
  docCount: number;
  sizeBytes?: number;
}

/** GET /api/sql-lab/tables 의 tables[] 항목 형태(tables/route.ts). */
export interface RawTableInfo {
  domain: string;
  label: string;
  table: string;
  loaded: boolean;
  rowCount: number;
}

/** 통합 저장소 항목 — OpenSearch 색인 | SQLite 테이블 공통 뷰모델. */
export interface StoreItem {
  /** 저장소 종류 — UI 상세 분기·삭제 엔드포인트 선택의 기준. */
  kind: "opensearch" | "sqlite";
  /** 물리 식별자 — OpenSearch=인덱스명, SQLite=테이블명. 삭제 표시·키. */
  storeId: string;
  /** 상세 조회용 도메인(상세 API 파라미터). 매핑 실패 시 undefined. */
  domain?: string;
  /** 한글 라벨. 매핑 실패 시 storeId 로 대체. */
  label: string;
  /** 색인 문서 수(OpenSearch) 또는 행 수(SQLite). */
  count: number;
  /** 문서/행 상세로 진입 가능한가 — domain 이 있어야 상세 API 호출 가능. */
  drillable: boolean;
}

/**
 * OpenSearch 인덱스 목록 → StoreItem[].
 * domain 없는 인덱스(매핑 실패)도 목록엔 노출하되 drillable=false.
 * label 없으면 인덱스명으로 대체.
 */
export function mapIndices(indices: RawIndexInfo[]): StoreItem[] {
  return indices.map((i) => ({
    kind: "opensearch" as const,
    storeId: i.index,
    domain: i.domain,
    label: i.label ?? i.index,
    count: i.docCount,
    drillable: typeof i.domain === "string" && i.domain.length > 0,
  }));
}

/**
 * SQLite 테이블 목록 → StoreItem[].
 * 미적재(loaded=false) 테이블은 제외 — 빈 테이블은 탐색할 데이터가 없다
 * (tables API 는 미적재도 placeholder 로 주므로 여기서 거른다).
 * SQL 도메인은 항상 domain 이 있으므로 drillable=true.
 */
export function mapTables(tables: RawTableInfo[]): StoreItem[] {
  return tables
    .filter((t) => t.loaded)
    .map((t) => ({
      kind: "sqlite" as const,
      storeId: t.table,
      domain: t.domain,
      label: t.label,
      count: t.rowCount,
      drillable: true,
    }));
}

/**
 * 두 저장소 목록을 통합. 한쪽 fetch 가 실패(undefined)해도 다른 쪽은
 * 그대로 — OpenSearch 미기동 시 SQLite 섹션만이라도 렌더(R1 graceful).
 * 결과는 kind(opensearch 먼저) → label 순 정렬로 안정적 표시.
 */
export function mergeStores(
  indices: RawIndexInfo[] | undefined,
  tables: RawTableInfo[] | undefined,
): StoreItem[] {
  const a = indices ? mapIndices(indices) : [];
  const b = tables ? mapTables(tables) : [];
  return [...a, ...b].sort((x, y) => {
    if (x.kind !== y.kind) return x.kind === "opensearch" ? -1 : 1;
    return x.label.localeCompare(y.label);
  });
}

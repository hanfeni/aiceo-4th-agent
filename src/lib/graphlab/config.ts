/**
 * 온톨로지/GraphRAG 실습 — 설정 SSOT.
 *
 * 데이터: aiceo-4th-training 의 GitHub public raw (search-lab 의
 * domains.ts 와 동일 메커니즘 — 학생 노트북에 training 리포가
 * 없어도 인터넷만 되면 자기완결). SEC EDGAR 13F 2025Q3 유명기관
 * 64개 서브셋(build_subset.py 산출, 라이선스 = US 퍼블릭도메인).
 *
 * 왜 SEC EDGAR 인가: "GraphRAG > RAG·Text-to-SQL 우월성"을 시연
 * 하기 가장 좋은 케이스(사용자 결정). 기관-종목 보유는 다중홉
 * 추론이 자연스럽고, 같은 질문을 3방식으로 돌리면 결과가 극명히
 * 갈린다(RAG=텍스트만, SQL=다중 self-JOIN 지옥, GraphRAG=2홉).
 */

export const NEO4J_URL =
  process.env.NEO4J_URL ?? "bolt://localhost:7687";
export const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
export const NEO4J_PASSWORD =
  process.env.NEO4J_PASSWORD ?? "aiceo-graph-lab";

/**
 * GitHub public raw base. SEC EDGAR 서브셋은 여기서 fetch.
 * env GRAPH_RAW_BASE 로 재정의 가능(브랜치/포크 변경 — 끝 슬래시 X).
 * (search-lab domains.ts RAW_BASE 와 동일 정책)
 */
export const GRAPH_RAW_BASE =
  process.env.GRAPH_RAW_BASE ??
  "https://raw.githubusercontent.com/hanfeni/aiceo-4th-training/main/poc/data/sec-edgar";

/** 서브셋 파일 (build_subset.py 산출물명과 일치) */
export const SUBSET_FILES = {
  /** (기관)-[OWNS]->(종목) 엣지 460,674행 — 그래프 핵심 */
  holdings: "holdings_subset.csv",
  /** 기관(filer) 노드 64개 — 유명 13F-HR 자산운용사 */
  managers: "managers_subset.csv",
  /** 보유빈도 상위 종목 (RAG 코퍼스 대상 결정·UI 힌트) */
  topIssuers: "top_issuers_subset.csv",
} as const;

export function subsetUrl(file: keyof typeof SUBSET_FILES): string {
  return `${GRAPH_RAW_BASE}/${SUBSET_FILES[file]}`;
}

/**
 * Neo4j 그래프 노드/엣지 라벨 SSOT (Cypher·UI·LLM 프롬프트 일관).
 *
 * 스키마 진화(2026-05-20, 웹 사례 기반 — Neo4j 공식 mutual-fund
 * 패턴 + 13F crowding 실무):
 *  - Company 에 crowding 속성(holder_count·total_value) 부여
 *    → "허브 종목" 류 질의를 매번 count 재계산 않고 속성 직조회
 *  - (:Position) 중간 노드 — Neo4j 공식 Holdings 패턴.
 *    (Manager)-[HOLDS]->(Position {value_usd_k,shares,put_call})
 *    -[OF]->(Company). 포지션 자체에 대한 질의(옵션 보유 등) 가능.
 *    기존 (Manager)-[OWNS]->(Company) 는 호환 위해 유지(병존).
 */
export const GRAPH_SCHEMA = {
  managerLabel: "Manager",
  companyLabel: "Company",
  ownsRel: "OWNS",
  positionLabel: "Position",
  holdsRel: "HOLDS",
  ofRel: "OF",
} as const;

/**
 * Position 노드는 holder_count(인기) 상위 N개 종목에 대해서만
 * 적재 (사용자 결정 2026-05-20: "데이터량 줄이되 노드 종류 유지").
 *
 * 왜 상위 N: Slice1 의 holder_count 가 곧 종목 인기도 →
 * 인기 종목끼리는 공동보유·교집합 멀티홉이 조밀해 데모 질의가
 * 가장 잘 동작. 임의 샘플보다 교육 효과 큼. 실측(2026-05-20):
 * 상위 300종목 → Position ~10,266개(holder_count 32+ 종목만,
 * 유명기관 64개 중 절반+ 보유). 강의 단순성 유지 + 경로 풍부.
 * 전체 노드 ≈ 12,000(기관·종목) + 10,000(Position) ≈ 22,000.
 */
export const POSITION_TOP_N = Number(
  process.env.GRAPH_POSITION_TOP_N ?? 300,
);

/**
 * 강의 데모용 질의 프리셋. 3방식(RAG/SQL/GraphRAG)으로 돌렸을 때
 * 결과가 극명히 갈리도록 멀티홉 의도를 담음(사용자 핵심 요구:
 * "GraphRAG 우월성 설명하기 좋은 케이스"). UI 가 칩으로 제시.
 */
export const DEMO_QUERIES: { label: string; query: string }[] = [
  {
    label: "공동보유 (2홉)",
    query:
      "마이크로소프트와 엔비디아를 둘 다 보유한 유명 기관은 어디인가? 그 기관들이 함께 보유한 다른 종목은?",
  },
  {
    label: "운용그룹 내부 (3홉)",
    query:
      "같은 운용그룹(공동운용 관계)에 속한 기관들이 공통으로 보유한 종목은 무엇인가?",
  },
  {
    label: "포트폴리오 유사도",
    query:
      "버크셔 해서웨이와 보유 종목이 가장 많이 겹치는 다른 유명 기관 상위 3곳은?",
  },
];

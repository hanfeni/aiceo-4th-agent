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

/** Neo4j 그래프 노드/엣지 라벨 (Cypher·UI 일관) */
export const GRAPH_SCHEMA = {
  managerLabel: "Manager",
  companyLabel: "Company",
  ownsRel: "OWNS",
} as const;

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

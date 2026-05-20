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
 *
 * 데이터셋 SSOT 화(2026-05-20): 단일 SEC EDGAR 하드코딩 → GRAPH_DATASETS
 * 배열. base 는 RAW_ROOT 아래 데이터셋별 하위 폴더. SEC 만 기존 경로
 * 호환 위해 명시 override.
 */
const RAW_ROOT =
  process.env.GRAPH_RAW_ROOT ??
  "https://raw.githubusercontent.com/hanfeni/aiceo-4th-training/main/poc/data";

/** 서브셋 파일 (build_subset.py 산출물명과 일치) — 데이터셋 공통 형식.
 *  3-CSV 구조: 주체노드 / (주체)-[관계]->(대상) 엣지 / 대상 crowding. */
export const SUBSET_FILES = {
  /** (주체)-[관계]->(대상) 엣지 — 그래프 핵심 */
  holdings: "holdings_subset.csv",
  /** 주체 노드 — 식별/속성 */
  managers: "managers_subset.csv",
  /** 대상 빈도 상위 (crowding 속성·UI 힌트) */
  topIssuers: "top_issuers_subset.csv",
} as const;

/**
 * 그래프 데이터셋 1개의 정체성·표시 라벨 SSOT.
 *
 * 절충 설계(사용자 합의 2026-05-20): 노드/관계 구조는 SEC EDGAR 의
 * 2부 그래프 골격 `(주체)-[관계]->(대상)` + Position 중간노드를
 * **그대로 재사용**하고, 데이터(rawBase)와 표시 라벨(slots)·LLM
 * 스키마 서술(schemaPrompt)만 데이터셋별로 다르게 둔다. 따라서
 * load/compare 적재·비교 로직은 datasetId 파라미터화만으로 무변경
 * 재사용된다(코드 일반화 비용 0, 데이터셋 추가 = 이 배열 1항목).
 */
export interface GraphDataset {
  /** 데이터셋 식별자(라우트·캐시 키·도구 인자) */
  id: string;
  /** UI/도구 드롭다운 한글 라벨 */
  label: string;
  /** 한 줄 설명(UI 보조·강의 맥락) */
  blurb: string;
  /** 이 데이터셋 CSV 가 있는 raw base (끝 슬래시 X) */
  rawBase: string;
  /** 노드/관계 표시 라벨(주체·대상·관계). 코드 골격은 동일,
   *  UI·프롬프트 표기만 치환. */
  slots: {
    /** 주체 노드 한글명 (SEC: 기관) */
    subject: string;
    /** 대상 노드 한글명 (SEC: 종목) */
    object: string;
    /** 관계 한글명 (SEC: 보유) */
    relation: string;
  };
  /**
   * Neo4j 실제 노드/관계 라벨(데이터셋별 분리 — 사용자 결정 2026-05-20:
   * 여러 데이터셋 동시 공존). 데이터셋마다 고유 라벨을 써서 한 Neo4j 에
   * 영화·논문·SEC 가 섞이지 않고 공존한다(전환 시 재구축 불필요). SEC 는
   * 기존 라벨(Manager/Company/OWNS/...) 유지 — 기존 적재분 호환.
   * load/compare/도구/탐색/status 가 이 라벨을 데이터셋별로 사용한다.
   */
  cypher: {
    subjectLabel: string; // 주체 노드 라벨 (SEC: Manager)
    objectLabel: string; // 대상 노드 라벨 (SEC: Company)
    relType: string; // 단순 관계 타입 (SEC: OWNS)
    positionLabel: string; // 포지션 중간노드 (SEC: Position)
    holdsType: string; // 주체→포지션 (SEC: HOLDS)
    ofType: string; // 포지션→대상 (SEC: OF)
  };
  /** GraphRAG 패널 LLM 에게 줄 스키마 서술(데이터셋별 의미 부여). */
  schemaPrompt: string;
  /** SQL 대조군 LLM 에게 줄 테이블 서술. */
  sqlPrompt: string;
  /** 데모 질의 프리셋(멀티홉 의도 — 3방식 결과 갈림). */
  demoQueries: { label: string; query: string }[];
}

export const GRAPH_DATASETS: GraphDataset[] = [
  {
    id: "sec-edgar",
    label: "SEC EDGAR (기관-종목 보유)",
    blurb: "유명 13F 기관 64곳의 주식 보유 — 공동보유·교집합 멀티홉",
    rawBase: process.env.GRAPH_RAW_BASE ?? `${RAW_ROOT}/sec-edgar`,
    slots: { subject: "기관", object: "종목", relation: "보유" },
    cypher: {
      subjectLabel: "Manager",
      objectLabel: "Company",
      relType: "OWNS",
      positionLabel: "Position",
      holdsType: "HOLDS",
      ofType: "OF",
    },
    schemaPrompt:
      "(:Manager {accession, cik, name, city, state})\n" +
      "(:Company {cusip, name, holder_count, total_value_usd})\n" +
      "  └ holder_count = 이 종목을 보유한 13F 기관 수(인기/crowding " +
      "지표 — '허브 종목·인기 종목'은 count() 대신 이 속성 직조회).\n" +
      "  └ total_value_usd = 전체 보유가치 합계(USD).\n" +
      "(:Position {accession, cusip, value_usd, shares, put_call})\n" +
      "  └ value_usd = 보유가치(USD). put_call: ''=현물 / 'Call' / " +
      "'Put' (옵션 포지션 질의용).\n" +
      "관계(두 경로 병존 — 질문에 맞게 선택):\n" +
      "(:Manager)-[:OWNS {value_usd, shares}]->(:Company)\n" +
      "  └ 단순 보유 관계. 공동보유·교집합 멀티홉에 적합.\n" +
      "(:Manager)-[:HOLDS]->(:Position)-[:OF]->(:Company)\n" +
      "  └ 포지션 매개. 옵션/현물 구분, 포지션 단위 질의에 적합.\n" +
      "  (Position 은 인기 상위 종목만 적재 — 옵션 질문이 아니면 " +
      "OWNS 경로를 우선 쓰세요.)",
    sqlPrompt:
      "테이블은 holdings(accession, cusip, issuer, value_usd, shares, " +
      "put_call) 하나뿐입니다. value_usd=보유가치(USD). put_call: " +
      "''=현물 / 'Call' / 'Put'.\n" +
      "규칙:\n" +
      "- 기관은 accession 으로 식별합니다(1 accession = 1 기관 신고).\n" +
      "- '기관'을 물으면 issuer(종목)가 아니라 accession 기준으로 집계하세요.\n" +
      "- ETF·인덱스펀드(issuer 에 'ETF','TRUST','INDEX','SPDR'," +
      "'ISHARES' 등 포함)는 운용기관이 아니므로 '기관' 답에서 제외하세요.\n" +
      "- 포트폴리오 유사도는 두 accession 이 공유하는 cusip 수로 계산하세요.",
    demoQueries: [
      {
        label: "공동보유 2홉 🟦",
        query:
          "마이크로소프트와 엔비디아를 둘 다 보유한 유명 기관은 어디인가? 그 기관들이 함께 보유한 다른 종목은?",
      },
      {
        label: "포트폴리오 유사도 🟦",
        query:
          "버크셔 해서웨이와 보유 종목이 가장 많이 겹치는 다른 유명 기관 상위 3곳은?",
      },
      {
        label: "3홉 연쇄 🟦",
        query:
          "버크셔가 보유한 종목을 함께 보유한 다른 기관들이, 버크셔는 안 가졌지만 공통으로 많이 보유한 종목 상위 5개는?",
      },
      {
        label: "교집합 경로 🟦",
        query:
          "애플·마이크로소프트·아마존 세 종목을 모두 보유한 기관은 어디이며, 그 기관들의 다른 공통 보유 종목은?",
      },
      {
        label: "유사 기관 군집 🟦",
        query:
          "블랙록과 뱅가드 중 어느 쪽이 버크셔와 포트폴리오가 더 비슷한가? 겹치는 종목 수로 비교해 줘.",
      },
      {
        label: "경쟁사 공동보유(반독점) 🟦",
        query:
          "코카콜라와 펩시(경쟁사)를 둘 다 보유한 유명 기관은 어디인가? 같은 기관이 두 경쟁사를 동시 보유하면 어떤 의미가 있는지(common ownership)도 설명해 줘.",
      },
      {
        label: "허브 종목 🟨",
        query: "가장 많은 유명 기관이 공통으로 보유한 종목 상위 10개는?",
      },
      {
        label: "최대 보유가치 🟨",
        query: "보유 가치(value) 합계가 가장 큰 종목 상위 10개는?",
      },
      {
        label: "옵션 포지션 🟦",
        query:
          "옵션(Call 또는 Put)으로 보유한 포지션이 가장 많은 기관 상위 5곳과, 각각 어떤 종목에 옵션을 걸었는지 알려줘.",
      },
      {
        label: "기관 설명 질의 ⚪",
        query:
          "버크셔 해서웨이는 어떤 투자 철학을 가진 기관인가? 보유 내역으로 설명해 줘.",
      },
    ],
  },
  {
    id: "movies",
    label: "영화 (배우-영화 출연)",
    blurb: "유명 배우들의 영화 출연 — 공동출연·연결고리(케빈 베이컨) 멀티홉",
    rawBase: process.env.GRAPH_MOVIES_BASE ?? `${RAW_ROOT}/movies`,
    slots: { subject: "배우", object: "영화", relation: "출연" },
    cypher: {
      subjectLabel: "Actor",
      objectLabel: "Movie",
      relType: "ACTED_IN",
      positionLabel: "Role",
      holdsType: "PLAYED",
      ofType: "IN_MOVIE",
    },
    schemaPrompt:
      "(:Actor {accession, cik, name, city, state})\n" +
      "  └ 배우. name=배우명. accession=배우 고유 id.\n" +
      "(:Movie {cusip, name, holder_count, total_value_usd})\n" +
      "  └ 영화. name=영화 제목. holder_count=이 영화에 출연한 " +
      "배우 수(앙상블 규모). total_value_usd=흥행수익 등 가중치.\n" +
      "(:Role {accession, cusip, value_usd, shares, put_call})\n" +
      "  └ 한 배우의 한 영화 배역. value_usd=배역 비중.\n" +
      "관계:\n" +
      "(:Actor)-[:ACTED_IN]->(:Movie)\n" +
      "  └ 배우가 영화에 '출연'. 공동출연·연결고리 멀티홉에 적합.\n" +
      "(:Actor)-[:PLAYED]->(:Role)-[:IN_MOVIE]->(:Movie)\n" +
      "  └ 배역 단위 질의에 적합(인기 상위 영화만 Role 적재).",
    sqlPrompt:
      "테이블은 holdings(accession, cusip, issuer, value_usd, shares, " +
      "put_call) 하나뿐입니다. 이 데이터셋에서 accession=배우 식별, " +
      "issuer=영화 제목, value_usd=배역 비중.\n" +
      "규칙:\n" +
      "- 배우는 accession 으로 식별합니다.\n" +
      "- 공동출연은 두 영화(cusip)를 공유하는 accession 으로 계산.\n" +
      "- 배우 간 연결고리(공동출연 경로)는 단일 테이블 self-JOIN 으로 " +
      "표현이 어렵습니다 — 그 한계를 주석으로 남기세요.",
    demoQueries: [
      {
        label: "공동출연 (2홉)",
        query:
          "톰 행크스와 같은 영화에 함께 출연한 배우는 누구인가? 그 배우들이 함께 출연한 다른 영화는?",
      },
      {
        label: "연결고리 (3홉)",
        query:
          "톰 행크스와 레오나르도 디카프리오를 잇는 공동출연 경로(중간 배우)가 있는가?",
      },
      {
        label: "다작 배우",
        query: "가장 많은 영화에 출연한 배우 상위 5명과 그 영화들은?",
      },
    ],
  },
  {
    id: "papers",
    label: "논문 인용 (저자-논문 집필)",
    blurb: "연구자들의 논문 집필 — 공동연구·인용 네트워크 멀티홉",
    rawBase: process.env.GRAPH_PAPERS_BASE ?? `${RAW_ROOT}/papers`,
    slots: { subject: "저자", object: "논문", relation: "집필" },
    cypher: {
      subjectLabel: "Author",
      objectLabel: "Paper",
      relType: "AUTHORED",
      positionLabel: "Contribution",
      holdsType: "CONTRIBUTED",
      ofType: "TO_PAPER",
    },
    schemaPrompt:
      "(:Author {accession, cik, name, city, state})\n" +
      "  └ 저자/연구자. name=저자명. city/state=소속 기관.\n" +
      "(:Paper {cusip, name, holder_count, total_value_usd})\n" +
      "  └ 논문. name=논문 제목. holder_count=공저자 수. " +
      "total_value_usd=피인용 수 등 영향력 지표.\n" +
      "(:Contribution {accession, cusip, value_usd, shares, put_call})\n" +
      "  └ 한 저자의 한 논문 기여. value_usd=기여도.\n" +
      "관계:\n" +
      "(:Author)-[:AUTHORED]->(:Paper)\n" +
      "  └ 저자가 논문을 '집필'. 공동연구·공저 네트워크 멀티홉.\n" +
      "(:Author)-[:CONTRIBUTED]->(:Contribution)-[:TO_PAPER]->(:Paper)\n" +
      "  └ 기여 단위 질의에 적합(피인용 상위 논문만 Contribution 적재).",
    sqlPrompt:
      "테이블은 holdings(accession, cusip, issuer, value_usd, shares, " +
      "put_call) 하나뿐입니다. 이 데이터셋에서 accession=저자 식별, " +
      "issuer=논문 제목, value_usd=기여도.\n" +
      "규칙:\n" +
      "- 저자는 accession 으로 식별합니다.\n" +
      "- 공저는 같은 논문(cusip)을 공유하는 accession 으로 계산.\n" +
      "- 저자 간 공저 네트워크 경로(2홉 이상)는 단일 테이블에서 " +
      "self-JOIN 중첩이 필요합니다 — 그 한계를 주석으로 남기세요.",
    demoQueries: [
      {
        label: "공저자 (2홉)",
        query:
          "특정 유명 연구자와 같은 논문을 함께 쓴 공저자는 누구이며, 그들이 함께 쓴 다른 논문은?",
      },
      {
        label: "공저 네트워크 (3홉)",
        query:
          "두 연구자를 잇는 공저 경로(중간 저자)가 있는가? 협업 네트워크로 설명해줘.",
      },
      {
        label: "다작 저자",
        query: "가장 많은 논문을 집필한 저자 상위 5명과 그 논문들은?",
      },
    ],
  },
];

/** 데이터셋 id 목록(드롭다운·검증용). */
export const GRAPH_DATASET_IDS = GRAPH_DATASETS.map((d) => d.id);

/** 기본 데이터셋(미지정 시 — 기존 SEC EDGAR 회귀 0). */
export const DEFAULT_DATASET_ID = "sec-edgar";

/** id 로 데이터셋 조회. 없으면 기본 데이터셋. */
export function getDataset(id?: string): GraphDataset {
  return (
    GRAPH_DATASETS.find((d) => d.id === id) ??
    GRAPH_DATASETS.find((d) => d.id === DEFAULT_DATASET_ID) ??
    GRAPH_DATASETS[0]
  );
}

/** 데이터셋의 서브셋 파일 URL. */
export function subsetUrl(
  file: keyof typeof SUBSET_FILES,
  datasetId?: string,
): string {
  return `${getDataset(datasetId).rawBase}/${SUBSET_FILES[file]}`;
}

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

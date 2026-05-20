/**
 * Text-to-SQL 실습 — 5개 도메인 CSV 정의 (SSOT).
 *
 * lib/searchlab/domains.ts 의 SQL 버전. 검색은 *.jsonl(서술 문서),
 * 여기는 *.csv(구조화 데이터)를 SQLite 테이블로 적재한다. 같은 5
 * 도메인이지만 파일이 다르다(예: legal 검색=law_corpus.jsonl,
 * SQL=law_list.csv).
 *
 * 데이터 출처: aiceo-4th-training 의 GitHub public raw URL
 * (hanfeni/aiceo-4th-training, main, poc/data/<domain>/<csv>).
 * 검색 메뉴와 동일 전략 — 학생 노트북에 training 리포가 없어도
 * 인터넷만 되면 적재 가능(자기완결). RAW_BASE env 재사용.
 */

export const SQL_DOMAINS = [
  "sangkwon",
  "medical",
  "finance",
  "legal",
  "policy",
  // 동적 커스텀 슬롯 — 사용자가 로컬 CSV 를 업로드하면 이 슬롯이
  // 채워진다. 고정 5개와 달리 spec(csvFile/table/label)이 런타임에
  // 결정되므로 SQL_DOMAIN_SPEC 의 정적 항목은 placeholder 이고
  // 실제 값은 dynamicDomains.ts 의 레지스트리에서 getSqlDomainSpec
  // 이 덮어쓴다. as const 제약(런타임 추가 불가) 회피 — 슬롯은 1개로
  // 고정하되 내용만 동적(가장 신속한 단일 슬롯 방식).
  "custom",
] as const;

export type SqlDomain = (typeof SQL_DOMAINS)[number];

/** 동적 커스텀 도메인 식별자(단일 슬롯). */
export const CUSTOM_SQL_DOMAIN = "custom" as const satisfies SqlDomain;

export interface SqlDomainSpec {
  /** poc/data/<dir>/ 하위 구조화 CSV 파일명 */
  csvFile: string;
  /** SQLite 테이블명 (실습 전용 prefix — sqllab_) */
  table: string;
  /** SQLite 파일명 (도메인 1개 = 파일 1개, .data/sqllab/ 하위) */
  dbFile: string;
  /** 한글 라벨 (UI 표시) */
  label: string;
  /** 직군 힌트 (UI 보조) */
  audience: string;
  /** 자연어 질의 예시 (Text-to-SQL 실습 마중물) */
  sampleQuestion: string;
}

/**
 * 실습 전용 테이블 prefix. 적재·삭제·Text-to-SQL 실행이 모두 이
 * prefix 테이블만 대상으로 한다(임의 테이블 접근 차단).
 */
export const TABLE_PREFIX = "sqllab_";

export const SQL_DOMAIN_SPEC: Record<SqlDomain, SqlDomainSpec> = {
  sangkwon: {
    csvFile: "stores_sample.csv",
    table: "sqllab_sangkwon",
    dbFile: "sangkwon.db",
    label: "상권 / 소상공인",
    audience: "유통·소상공인",
    sampleQuestion: "강남구에서 카페가 가장 많은 행정동 상위 5곳은?",
  },
  medical: {
    csvFile: "drug_master_sample.csv",
    table: "sqllab_medical",
    dbFile: "medical.db",
    label: "의료 / 제약",
    audience: "의료·제약",
    sampleQuestion: "전문의약품을 가장 많이 보유한 업체 상위 10곳은?",
  },
  finance: {
    csvFile: "nps_sample.csv",
    table: "sqllab_finance",
    dbFile: "finance.db",
    label: "금융 / 연금 / 고용",
    audience: "금융·투자",
    sampleQuestion: "가입자 수가 가장 많은 사업장 업종 상위 10개는?",
  },
  legal: {
    csvFile: "law_list.csv",
    table: "sqllab_legal",
    dbFile: "legal.db",
    label: "법률 / 법령",
    audience: "법률·규제",
    sampleQuestion: "소관부처별 법령 개수를 많은 순으로 보여줘",
  },
  policy: {
    csvFile: "budget.csv",
    table: "sqllab_policy",
    dbFile: "policy.db",
    label: "정책 / 거버넌스",
    audience: "공공·정책",
    sampleQuestion: "기관별 예산 총액을 큰 순으로 보여줘",
  },
  // custom — placeholder. 실제 값은 업로드 시 동적 레지스트리에
  // 등록되고 getSqlDomainSpec 이 이 placeholder 대신 반환한다.
  // table/dbFile prefix(sqllab_)는 보안 가드(임의 테이블 차단)를
  // 위해 동적 등록 시에도 강제된다(dynamicDomains.ts).
  custom: {
    csvFile: "custom.csv",
    table: "sqllab_custom",
    dbFile: "custom.db",
    label: "내 데이터 (CSV 업로드)",
    audience: "사용자 업로드",
    sampleQuestion: "업로드한 데이터에서 무엇이든 물어보세요.",
  },
};

export function isSqlDomain(v: string): v is SqlDomain {
  return (SQL_DOMAINS as readonly string[]).includes(v);
}

/**
 * GitHub public raw base — 검색 메뉴(searchlab/domains.ts)와
 * 동일 env 를 공유한다. 한 곳만 바꾸면 두 메뉴 모두 따라간다.
 */
export const RAW_BASE =
  process.env.RAW_BASE ??
  "https://raw.githubusercontent.com/hanfeni/aiceo-4th-training/main/poc/data";

export function csvUrl(domain: SqlDomain): string {
  return `${RAW_BASE}/${domain}/${SQL_DOMAIN_SPEC[domain].csvFile}`;
}

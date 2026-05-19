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
] as const;

export type SqlDomain = (typeof SQL_DOMAINS)[number];

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

/**
 * 검색 실습 — 5개 도메인 정의 (SSOT).
 *
 * 데이터 출처: aiceo-4th-training 의 **GitHub public raw URL**
 * (hanfeni/aiceo-4th-training, main, poc/data/<domain>/<file>).
 * 2026-05-19 결정(사용자): 로컬 절대경로 참조 폐기 → web fetch.
 * 학생 노트북에 training 리포가 없어도 인터넷만 되면 색인 가능
 * (자기완결). env RAW_BASE 로 base 재정의 가능(브랜치 변경 등).
 */

export const SEARCH_DOMAINS = [
  "sangkwon",
  "medical",
  "finance",
  "legal",
  "policy",
] as const;

export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

export interface DomainSpec {
  /** OpenSearch 인덱스명 (실습 전용 prefix) */
  index: string;
  /** poc/data/<dir>/ 하위 검색문서 jsonl 파일명 */
  corpusFile: string;
  /** 한글 라벨 (UI 표시) */
  label: string;
  /** 직군 힌트 (UI 보조) */
  audience: string;
}

export const DOMAIN_SPEC: Record<SearchDomain, DomainSpec> = {
  sangkwon: {
    index: "searchlab-sangkwon",
    corpusFile: "policy_news.jsonl",
    label: "상권 / 소상공인",
    audience: "유통·소상공인",
  },
  medical: {
    index: "searchlab-medical",
    corpusFile: "drug_detail.jsonl",
    label: "의료 / 제약",
    audience: "의료·제약",
  },
  finance: {
    index: "searchlab-finance",
    corpusFile: "policy_news.jsonl",
    label: "금융 / 연금 / 고용",
    audience: "금융·투자",
  },
  legal: {
    index: "searchlab-legal",
    corpusFile: "law_corpus.jsonl",
    label: "법률 / 법령",
    audience: "법률·규제",
  },
  policy: {
    index: "searchlab-policy",
    corpusFile: "press_release.jsonl",
    label: "정책 / 거버넌스",
    audience: "공공·정책",
  },
};

export function isSearchDomain(v: string): v is SearchDomain {
  return (SEARCH_DOMAINS as readonly string[]).includes(v);
}

/** 모든 도메인 공통 검색문서 필드 (jsonl 1줄 = 1문서) */
export interface CorpusDoc {
  doc_id: string;
  title: string;
  body: string;
  /** 도메인별 부가 필드 — 색인엔 안 씀, 표시용 메타 */
  [k: string]: unknown;
}

/**
 * GitHub public raw base. 검색문서는 여기서 fetch 한다.
 * env RAW_BASE 로 재정의 가능(예: 브랜치/포크 변경 — 끝 슬래시 없이).
 */
export const RAW_BASE =
  process.env.RAW_BASE ??
  "https://raw.githubusercontent.com/hanfeni/aiceo-4th-training/main/poc/data";

export function corpusUrl(domain: SearchDomain): string {
  return `${RAW_BASE}/${domain}/${DOMAIN_SPEC[domain].corpusFile}`;
}

/**
 * 도메인 검색문서를 GitHub raw 에서 fetch → jsonl 파싱.
 * limit 지정 시 앞에서 N건만(색인 규모 제어). 실패는 명확한 에러
 * (404 = 데이터 미공개/브랜치 오류 — 학생이 원인 알게).
 */
export async function fetchCorpus(
  domain: SearchDomain,
  limit?: number,
): Promise<CorpusDoc[]> {
  const url = corpusUrl(domain);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[${domain}] 검색문서 fetch 실패 (HTTP ${res.status}) — ${url}\n` +
        `→ aiceo-4th-training main 에 poc/data 가 공개돼 있는지 확인.`,
    );
  }
  const text = await res.text();
  const docs = text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as CorpusDoc);
  return typeof limit === "number" ? docs.slice(0, limit) : docs;
}

/**
 * 도메인 원본 문서 총 개수만 조회(색인 전 "전체 N개" 안내용).
 * jsonl 1줄=1문서라 라인 수 = 개수. GitHub CDN 캐시되므로 이후
 * 색인 fetch 와 사실상 중복 비용 0.
 */
export async function corpusCount(domain: SearchDomain): Promise<number> {
  const url = corpusUrl(domain);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[${domain}] 검색문서 fetch 실패 (HTTP ${res.status}) — ${url}`,
    );
  }
  const text = await res.text();
  return text.split("\n").filter((l) => l.trim()).length;
}

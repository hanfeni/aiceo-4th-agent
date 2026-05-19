/**
 * 메타라벨링 실습 — 시스템 인스트럭션 (UI 에 그대로 노출).
 *
 * 학생이 "LLM에게 무엇을 시키는지"를 화면에서 직접 보는 게 실습의
 * 핵심 → 프롬프트를 코드 상수로 분리하고 API 가 SSE 로 함께 내보낸다.
 * 패턴 출처: aiceo-4th-training 02-LLM메타라벨링 / 03-메타스키마발굴
 * (사내 커뮤니티 AI검색 05-llm-metadata 1단계 분류 이식).
 */

// allinone = ①~④(발굴·수렴·픽스·실분류, 화면 확인만)
// allinone_index = 위 + ⑤ 메타 OpenSearch 색인 (사용자 결정
// 2026-05-19: 기존 올인원과 색인 올인원을 별개 작업으로 분리)
export type MetaTask =
  | "label"
  | "discover"
  | "allinone"
  | "allinone_index";

/** 1단계 분류 — 문서 1건에 메타 부착 */
export const LABEL_SYSTEM = `당신은 한국어 문서에 검색용 메타 정보를 붙이는 분류기입니다.
각 문서를 읽고 아래 JSON 스키마로만 응답하세요. 설명·코드펜스 금지.

{
  "main_category": "대분류 (예: 의료, 경제, 정책)",
  "mid_category": "중분류 (12개 중 택1, 아래 목록)",
  "sub_category": "소분류 (15자 이내 핵심 주제)",
  "description": "1줄 요약 (40자 내외)",
  "keywords": ["핵심어 3~5개"],
  "system_alert": false
}

mid_category 12개 선택지:
정치/행정/법률, 경제/산업/노동, 사회/인권/젠더, 보건/의료/복지,
국제/외교/안보, 과학/기술/환경, 교육/문화/종교, 미디어/언론,
연예/스포츠, 부동산/재테크/투자, 라이프스타일/소비, 기타

규칙: 추측 금지(본문 근거만). 이상·위험 신호 있으면 system_alert=true.`;

/** 메타 스키마 발굴 — 샘플 묶음에서 분류 체계 후보 제안 */
export const DISCOVER_SYSTEM = `당신은 문서 묶음을 보고 "이 데이터에 적합한 메타 분류 체계"를
설계하는 데이터 분석가입니다. 아래 문서들을 훑고, 이 도메인에
가장 잘 맞는 분류 후보를 JSON 으로만 제안하세요. 설명·코드펜스 금지.

{
  "domain_summary": "이 묶음이 어떤 성격의 문서인지 1줄",
  "mid_category_candidates": ["이 도메인에 맞는 중분류 후보 6~12개"],
  "key_fields": ["메타로 뽑으면 검색에 유용할 필드명 3~6개"],
  "rationale": "왜 이 분류가 적합한지 2~3문장"
}

규칙: 일반론(사내 12개 베끼기) 금지 — 이 묶음의 실제 내용에서
귀납하세요. 도메인이 특수하면(법령·약가 등) 특수한 분류가 나와야
정상입니다.`;

export function systemFor(task: MetaTask): string {
  // allinone 의 1단계는 발굴이므로 DISCOVER 를 시드 표시용으로 노출.
  return task === "label" ? LABEL_SYSTEM : DISCOVER_SYSTEM;
}

/**
 * 올인원 ② 수렴 — 발굴 N회 결과를 다시 LLM 에 던져 후보 라벨 선정.
 * 1회차 "5-에이전트 병렬 수렴"의 메타 버전: 여러 독립 발굴 결과에서
 * 반복·공통 등장한 분류를 채택해 최종 스키마를 fix 한다.
 */
export const CONVERGE_SYSTEM = `당신은 여러 번 독립 수행된 "메타 분류 체계 발굴" 결과들을
종합해 최종 분류 스키마를 확정하는 메타 분석가입니다.
아래는 같은 도메인 문서를 N개 묶음으로 나눠 각각 독립적으로
분류 체계를 제안한 결과들입니다. 여러 결과에서 반복·공통으로
등장한 분류를 신뢰도 높은 것으로 보고 최종 스키마를 JSON 으로만
확정하세요. 설명·코드펜스 금지.

{
  "domain_summary": "이 도메인 성격 1줄",
  "mid_category": ["여러 발굴에서 수렴한 최종 중분류 6~12개"],
  "key_fields": ["수렴한 메타 필드 3~6개"],
  "convergence_note": "어떤 후보가 몇 회 등장해 채택/탈락했는지 2~3문장"
}

규칙: 단일 발굴에만 1회 나온 후보는 보류(채택 신중). 다수 발굴에
반복 등장한 것 우선. 도메인 특수 분류가 수렴했으면 그대로 채택
(사내 12개로 억지 환원 금지).`;

/**
 * 올인원 ③ 분류기 인스트럭션 픽스 — ② 에서 확정된 스키마(JSON)로
 * 실분류용 시스템 프롬프트를 동적 생성한다. LABEL_SYSTEM 의 고정
 * 12개 대신 이 도메인에서 수렴한 mid_category 를 박는다.
 */
export function buildClassifierSystem(schema: {
  domain_summary?: string;
  mid_category?: string[];
}): string {
  const mids =
    Array.isArray(schema.mid_category) && schema.mid_category.length > 0
      ? schema.mid_category.join(", ")
      : "기타";
  const summary = schema.domain_summary?.trim()
    ? `대상 도메인: ${schema.domain_summary.trim()}\n`
    : "";
  return `당신은 한국어 문서에 검색용 메타 정보를 붙이는 분류기입니다.
${summary}이 도메인에 맞게 발굴·수렴된 분류 체계로만 분류하세요.
각 문서를 읽고 아래 JSON 스키마로만 응답하세요. 설명·코드펜스 금지.

{
  "main_category": "대분류",
  "mid_category": "중분류 (아래 확정 목록 중 택1)",
  "sub_category": "소분류 (15자 이내 핵심 주제)",
  "description": "1줄 요약 (40자 내외)",
  "keywords": ["핵심어 3~5개"],
  "system_alert": false
}

확정 mid_category 목록 (이 도메인 발굴·수렴 결과):
${mids}

규칙: 추측 금지(본문 근거만). 위 확정 목록 외 중분류 생성 금지.
이상·위험 신호 있으면 system_alert=true.`;
}

/** 분류기 LLM 출력에서 파싱한 메타 (OpenSearch 색인 필드원) */
export interface ParsedMeta {
  main_category: string;
  mid_category: string;
  sub_category: string;
  description: string;
  keywords: string[];
  system_alert: boolean;
}

/**
 * 분류기 LLM 출력 텍스트 → ParsedMeta.
 *
 * LLM 이 코드펜스(```json)·앞뒤 설명을 붙일 수 있어 첫 { … }
 * 블록만 추출해 JSON.parse. 실패·필드 누락은 안전 기본값(빈
 * 문자열·빈 배열)으로 — 색인 bulk 가 깨지지 않게(graceful).
 * buildClassifierSystem 스키마와 1:1 (같은 파일에 둬 응집).
 */
export function parseClassifierOutput(raw: string): ParsedMeta {
  const empty: ParsedMeta = {
    main_category: "",
    mid_category: "",
    sub_category: "",
    description: "",
    keywords: [],
    system_alert: false,
  };
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return empty;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return empty;
  }
  const str = (v: unknown): string =>
    typeof v === "string" ? v.trim() : "";
  return {
    main_category: str(o.main_category),
    mid_category: str(o.mid_category),
    sub_category: str(o.sub_category),
    description: str(o.description),
    keywords: Array.isArray(o.keywords)
      ? o.keywords
          .map((k) => (typeof k === "string" ? k.trim() : ""))
          .filter((k) => k.length > 0)
      : [],
    system_alert: o.system_alert === true,
  };
}

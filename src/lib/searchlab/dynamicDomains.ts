/**
 * 검색 실습 — 동적 커스텀 도메인 레지스트리 (단일 슬롯).
 *
 * 고정 5개 도메인은 GitHub raw jsonl 에서 색인되지만, 사용자가 로컬
 * jsonl 을 브라우저에서 업로드하면 6번째 "custom" 슬롯이 채워진다.
 * custom 의 spec(label)은 컴파일타임에 알 수 없으므로(domains.ts 의
 * DOMAIN_SPEC.custom 은 placeholder), 여기서 런타임 등록·조회한다.
 *
 * SQL 메뉴(sqllab/dynamicDomains.ts)의 검색 버전 — 동일 사상:
 *  - 실제 데이터는 OpenSearch 인덱스(searchlab-custom)에 색인되어
 *    OpenSearch 가 이미 영속화한다(서버 재시작에도 보존).
 *  - 메타(원본 파일명/라벨/등록시각)는 .data/searchlab/custom.meta.json
 *    에 별도 저장해 재시작 후에도 라벨이 복원되게 한다.
 *
 * R6(globalThis 싱글톤): dev HMR 시 메모리 캐시 재생성 방지. 캐시
 * 미스 시 메타 파일에서 lazy 복원.
 *
 * 보안: index 는 searchlab-custom 으로 고정(임의 인덱스 접근 차단 —
 * admin.ts 의 searchlab- prefix 가드와 동일 사상). 사용자 입력은
 * label·원본파일명뿐이며 식별자(index)에 절대 끼어들지 않는다.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  CUSTOM_SEARCH_DOMAIN,
  DOMAIN_SPEC,
  type DomainSpec,
} from "./domains";

const SEARCHLAB_DIR = join(process.cwd(), ".data", "searchlab");
const META_FILE = join(SEARCHLAB_DIR, "custom.meta.json");

/** custom 슬롯에 등록된 동적 도메인 메타(영속 직렬화형). */
export interface CustomSearchMeta {
  /** UI 표시용 라벨(사용자가 업로드 시 지정 — 기본은 원본 파일명). */
  label: string;
  /** 업로드 원본 파일명(표시·추적용. 식별자엔 미사용). */
  sourceFile: string;
  /** 등록(색인 완료) 시각 ISO. */
  registeredAt: string;
}

interface DynamicGlobal {
  /** null = 미등록. 메타 객체 = 등록됨. undefined = 아직 메타 미로드. */
  custom?: CustomSearchMeta | null;
}
const g = globalThis as unknown as { __searchlabDynamic?: DynamicGlobal };
g.__searchlabDynamic ??= {};

/** 메타 파일에서 1회 lazy 로드(없으면 null 캐시). */
function ensureLoaded(): void {
  if (g.__searchlabDynamic!.custom !== undefined) return;
  try {
    if (existsSync(META_FILE)) {
      const raw = readFileSync(META_FILE, "utf-8");
      const parsed = JSON.parse(raw) as CustomSearchMeta;
      g.__searchlabDynamic!.custom = parsed;
      return;
    }
  } catch {
    // 손상된 메타는 무시(미등록 취급 — graceful).
  }
  g.__searchlabDynamic!.custom = null;
}

/** 현재 등록된 custom 메타(미등록이면 null). */
export function getCustomSearchMeta(): CustomSearchMeta | null {
  ensureLoaded();
  return g.__searchlabDynamic!.custom ?? null;
}

/** custom 슬롯 등록 여부. */
export function isCustomSearchRegistered(): boolean {
  return getCustomSearchMeta() !== null;
}

/**
 * custom 도메인을 등록(또는 라벨/소스 갱신)한다. 메모리 캐시 +
 * 메타 파일을 함께 갱신해 재시작 후에도 복원되게 한다.
 * index 식별자는 placeholder(domains.ts)를 그대로 쓴다
 * (보안 — 사용자 입력이 식별자에 끼지 않음).
 */
export function registerCustomSearchDomain(meta: {
  label: string;
  sourceFile: string;
}): CustomSearchMeta {
  const full: CustomSearchMeta = {
    label: meta.label.trim() || "내 데이터 (업로드)",
    sourceFile: meta.sourceFile,
    registeredAt: new Date().toISOString(),
  };
  mkdirSync(SEARCHLAB_DIR, { recursive: true });
  writeFileSync(META_FILE, JSON.stringify(full, null, 2), "utf-8");
  g.__searchlabDynamic!.custom = full;
  return full;
}

/** custom 등록 해제(메타 파일 제거 + 캐시 null). 인덱스 삭제는 별도. */
export function unregisterCustomSearchDomain(): void {
  try {
    rmSync(META_FILE, { force: true });
  } catch {
    // 삭제 실패는 무시(다음 등록이 덮어씀).
  }
  g.__searchlabDynamic!.custom = null;
}

/**
 * 정적 + 동적을 합쳐 도메인 spec 을 반환한다. DOMAIN_SPEC 을 직접
 * 인덱싱하던 모든 소비처는 이 함수를 거쳐 custom 의 동적 라벨을
 * 보게 된다. custom 미등록 시엔 placeholder spec(domains.ts)을 그대로
 * 반환한다(index 는 항상 searchlab-custom 고정).
 */
export function getSearchDomainSpec(domain: string): DomainSpec {
  if (domain === CUSTOM_SEARCH_DOMAIN) {
    const base = DOMAIN_SPEC[CUSTOM_SEARCH_DOMAIN];
    const meta = getCustomSearchMeta();
    if (!meta) return base;
    // 식별자(index)는 placeholder 고정. 라벨·audience 만 동적.
    return {
      ...base,
      label: meta.label,
      audience: `업로드: ${meta.sourceFile}`,
    };
  }
  // 정적 5개 — 그대로.
  return DOMAIN_SPEC[domain as keyof typeof DOMAIN_SPEC];
}

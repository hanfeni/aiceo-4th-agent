/**
 * SEC EDGAR 서브셋 → Neo4j 그래프 적재 + 인메모리 테이블 준비.
 *
 * "그래프 구축" 버튼 흐름(search-lab 색인 정책과 동형):
 *   #1 GitHub raw 에서 서브셋 CSV fetch (자기완결)
 *   #2 Neo4j 에 (Manager)-[OWNS]->(Company) 적재 (UNWIND 배치)
 *   #3 holdings 를 인메모리 보관(SQL/RAG 패널 대조군용)
 *
 * 같은 데이터 1벌로 3방식(RAG/SQL/GraphRAG)을 돌려 비교하는 게
 * 강의 핵심 → 그래프(Neo4j)·표(인메모리 rows)를 함께 준비한다.
 */

import { runCypher, getNeo4jDriver } from "./client";
import {
  subsetUrl,
  POSITION_TOP_N,
  DEFAULT_DATASET_ID,
  getDataset,
  GRAPH_DATASETS,
} from "./config";

export type LoadEvent =
  | { type: "load"; phase: string; text: string }
  | { type: "load_progress"; done: number; total: number }
  | {
      type: "load_done";
      managers: number;
      companies: number;
      owns: number;
      /** crowding 속성이 부여된 Company 수(top_issuers 매칭분) */
      enriched?: number;
      /** 적재된 Position 중간 노드 수(인기 상위 N종목 한정) */
      positions?: number;
    }
  | { type: "load_error"; message: string };

/** holdings 1행 (CSV → 그래프 엣지 & SQL row 공용).
 *
 * 단위 주의(2026-05-20 실측 확정): SEC 원본 컬럼명은
 * value_usd_thousands 이지만 실제 단위는 그냥 USD 다.
 * value/shares = 종목 주당가($517≈MS주가)로 일정 →
 * 천 단위면 주가가 ×1000 폭발. 그래서 valueUsd(달러)로
 * 명명한다(이전 valueUsdK 는 오해 소지 — 정정). */
export interface HoldingRow {
  accession: string;
  cusip: string;
  issuer: string;
  /** 보유가치(USD). 원본 컬럼명은 _thousands 지만 실단위 USD. */
  valueUsd: number;
  shares: number;
  /** 옵션 포지션 구분: ""=현물(SH) / "Call" / "Put"
   *  (웹 사례: 옵션 보유만 따로 질의 — Position 노드 속성). */
  putCall: string;
}
/** managers 1행 (노드 속성) */
export interface ManagerRow {
  accession: string;
  cik: string;
  name: string;
  city: string;
  state: string;
}
/** top_issuers 1행 — Company crowding 속성 소스(웹 사례: 13F
 *  crowding score = distinct holder 수 + 보유가치 합계). */
export interface TopIssuerRow {
  cusip: string;
  issuer: string;
  /** 이 종목을 신고한 13F 기관 수 (crowding/인기도 지표) */
  holderCount: number;
  /** 보유가치 합계(USD). 원본 _thousands 지만 실단위 USD. */
  totalValueUsd: number;
}

/** 인메모리 보관소 — SQL/RAG 패널이 그래프와 같은 데이터를 쓰도록.
 *  globalThis 고정(HMR·요청 간 재사용, 매번 재fetch 방지).
 *
 *  데이터셋 SSOT 화: 단일 보관소 → datasetId 별 보관소(Neo4j 는 한
 *  번에 한 데이터셋만 적재되므로 활성 데이터셋 1개만 유효하나, 어느
 *  데이터셋이 적재됐는지 식별하려 datasetId 를 함께 보관). */
interface MemStore {
  datasetId: string;
  holdings: HoldingRow[];
  managers: ManagerRow[];
  loadedAt: number;
}
const MEM_KEY = "__graphlab_mem_store__";
export function getMemStore(): MemStore | null {
  return (
    ((globalThis as Record<string, unknown>)[MEM_KEY] as MemStore) ?? null
  );
}
function setMemStore(s: MemStore): void {
  (globalThis as Record<string, unknown>)[MEM_KEY] = s;
}
/** 그래프 삭제 시 인메모리 보관소도 비움(SQL/RAG 패널 동기). */
export function clearMemStore(): void {
  delete (globalThis as Record<string, unknown>)[MEM_KEY];
}

/** 아주 단순한 CSV 파서 (서브셋은 RFC4180 + 따옴표 escape 수준).
 *  build_subset.py 가 csv 모듈로 쓴 표준 형식이라 이 정도면 충분. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

async function fetchCsv(
  file: "holdings" | "managers" | "topIssuers",
  datasetId: string,
): Promise<string[][]> {
  const url = subsetUrl(file, datasetId);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[${file}] 데이터셋(${datasetId}) 서브셋 fetch 실패 (HTTP ${res.status}) — ${url}\n` +
        `→ aiceo-4th-training main 에 해당 데이터셋 서브셋 CSV 가 ` +
        `공개돼 있는지 확인.`,
    );
  }
  return parseCsv(await res.text());
}

/**
 * 메인 적재 제너레이터 — API route 가 SSE 로 직렬화.
 * Neo4j 가 이미 떠 있다고 가정(ensureNeo4j 가 선행).
 *
 * @param datasetId 적재할 데이터셋(미지정=기본 SEC EDGAR, 회귀 0).
 *   노드/관계 골격(2부 그래프+Position)은 데이터셋 공통이나, 실제
 *   Neo4j 라벨은 데이터셋별로 분리(config.cypher) — 여러 데이터셋이
 *   한 Neo4j 에 라벨로 격리돼 공존한다(전환 시 재구축 불필요).
 */
export async function* loadGraph(
  datasetId: string = DEFAULT_DATASET_ID,
): AsyncGenerator<LoadEvent> {
  const ds = getDataset(datasetId);
  // ── #1 서브셋 fetch ──────────────────────────────────
  yield { type: "load", phase: "fetch", text: `${ds.label} 서브셋 다운로드 중 (GitHub raw)…` };
  let mgrRows: string[][];
  let holdRows: string[][];
  try {
    [mgrRows, holdRows] = await Promise.all([
      fetchCsv("managers", ds.id),
      fetchCsv("holdings", ds.id),
    ]);
  } catch (e) {
    yield { type: "load_error", message: e instanceof Error ? e.message : String(e) };
    return;
  }

  // 헤더 제거 + 구조화 (build_subset.py 컬럼 순서와 일치)
  // managers: accession_number,cik,manager_name,city,state_or_country,zipcode,filing_date,submission_type,period_of_report
  const managers: ManagerRow[] = mgrRows.slice(1).map((r) => ({
    accession: r[0],
    cik: r[1],
    name: r[2],
    city: r[3] ?? "",
    state: r[4] ?? "",
  }));
  // holdings: accession_number,cusip,name_of_issuer,value_usd_thousands,shares,shares_type,put_call
  // r[3] 컬럼명은 _thousands 지만 실단위 USD(2026-05-20 실측).
  const holdings: HoldingRow[] = holdRows.slice(1).map((r) => ({
    accession: r[0],
    cusip: r[1],
    issuer: r[2],
    valueUsd: Number(r[3]) || 0,
    shares: Number(r[4]) || 0,
    putCall: (r[6] ?? "").trim(),
  }));
  yield {
    type: "load",
    phase: "fetched",
    text: `수신: 기관 ${managers.length}개 · 보유 ${holdings.length.toLocaleString()}건`,
  };

  // 데이터셋별 Cypher 라벨(공존 — 여러 데이터셋이 한 Neo4j 에
  // 섞이지 않게 라벨로 분리). SEC 는 기존 Manager/Company 유지.
  const L = ds.cypher;
  // 제약 이름은 라벨 기반으로 고유화(데이터셋마다 별도 제약).
  const cn = (suffix: string): string =>
    `${L.subjectLabel.toLowerCase()}_${suffix}`;

  // ── #2 Neo4j 적재 ───────────────────────────────────
  yield { type: "load", phase: "reset", text: `기존 ${ds.label} 그래프 정리 + 제약 생성…` };
  try {
    // 전체 삭제(MATCH (n))가 아니라 이 데이터셋 라벨 노드만 삭제 —
    // 다른 데이터셋(공존)을 건드리지 않는다(사용자 결정 2026-05-20).
    await runCypher(
      `MATCH (n) WHERE n:${L.subjectLabel} OR n:${L.objectLabel} OR n:${L.positionLabel} DETACH DELETE n`,
    );
    await runCypher(
      `CREATE CONSTRAINT ${cn("acc")} IF NOT EXISTS
       FOR (m:${L.subjectLabel}) REQUIRE m.accession IS UNIQUE`,
    );
    await runCypher(
      `CREATE CONSTRAINT ${cn("cusip")} IF NOT EXISTS
       FOR (c:${L.objectLabel}) REQUIRE c.cusip IS UNIQUE`,
    );

    // 주체 노드(기관/배우/저자)
    yield { type: "load", phase: "managers", text: `${ds.slots.subject}(${L.subjectLabel}) 노드 적재…` };
    await runCypher(
      `UNWIND $rows AS r
       MERGE (m:${L.subjectLabel} {accession: r.accession})
       SET m.cik=r.cik, m.name=r.name, m.city=r.city, m.state=r.state`,
      { rows: managers },
    );

    // 관계 엣지 (배치 — 청크 UNWIND)
    yield { type: "load", phase: "owns", text: `${ds.slots.relation}(${L.relType}) 엣지 적재…` };
    const BATCH = 5000;
    for (let i = 0; i < holdings.length; i += BATCH) {
      const chunk = holdings.slice(i, i + BATCH);
      await runCypher(
        `UNWIND $rows AS r
         MATCH (m:${L.subjectLabel} {accession: r.accession})
         MERGE (c:${L.objectLabel} {cusip: r.cusip})
           ON CREATE SET c.name = r.issuer
         MERGE (m)-[o:${L.relType}]->(c)
         SET o.value_usd = r.valueUsd, o.shares = r.shares`,
        { rows: chunk },
      );
      yield {
        type: "load_progress",
        done: Math.min(i + BATCH, holdings.length),
        total: holdings.length,
      };
    }

    // ── #2b Company crowding 속성 (top_issuers) ──────────
    // 웹 사례: 퀀트 리스크의 crowding score = distinct 13F
    // holder 수 + 보유가치 합계. top_issuers_subset.csv 가
    // 사전계산해 둔 값을 Company 노드 속성으로 박는다 → "허브
    // 종목" 류 질의가 매번 count 재계산 없이 속성 직조회.
    // Company 는 위 OWNS 적재에서 이미 MERGE 됨 → MATCH(없으면
    // skip, 유령 노드 생성 방지). top_issuers 가 서브셋이라
    // holdings 에 없을 수도 있어 MERGE 가 아니라 MATCH.
    yield { type: "load", phase: "crowding", text: `${ds.slots.object} 인기도(crowding) 속성 적재…` };
    // top_issuers: cusip,name_of_issuer,n_filer_managers,total_value_usd_thousands
    const tiRows = await fetchCsv("topIssuers", ds.id);
    // r[3] 컬럼명 total_value_usd_thousands 지만 실단위 USD.
    const topIssuers: TopIssuerRow[] = tiRows.slice(1).map((r) => ({
      cusip: r[0],
      issuer: r[1],
      holderCount: Number(r[2]) || 0,
      totalValueUsd: Number(r[3]) || 0,
    }));
    await runCypher(
      `UNWIND $rows AS r
       MATCH (c:${L.objectLabel} {cusip: r.cusip})
       SET c.holder_count = r.holderCount,
           c.total_value_usd = r.totalValueUsd`,
      { rows: topIssuers },
    );

    // ── #2c Position 중간 노드 (인기 상위 N종목 한정) ────
    // Neo4j 공식 mutual-fund 패턴: (Manager)-[HOLDS]->
    // (Position {value,shares,put_call})-[OF]->(Company).
    // 포지션 자체 질의(옵션만 보유 등) 가능. 사용자 결정:
    // holder_count 상위 N종목만(데이터량↓, 노드 종류 유지).
    // crowding 속성이 그래프 진실원 → Neo4j 에서 상위 cusip
    // 집합을 구해 JS 필터(배치 UNWIND 와 정합).
    yield { type: "load", phase: "positions", text: `${L.positionLabel} 중간 노드 적재(인기 상위 ${POSITION_TOP_N}${ds.slots.object})…` };
    const topCusipRows = (await runCypher(
      // LIMIT 은 정수만 허용. JS number 를 파라미터로 넘기면
      // 드라이버가 float('300.0')로 직렬화 → "not a valid value"
      // 런타임 에러. Cypher 내부 toInteger() 로 강제 정수화
      // (드라이버 의존 없는 가장 견고한 방식 — 실 HTTP 검증서 발견).
      `MATCH (c:${L.objectLabel})
       WHERE c.holder_count IS NOT NULL
       RETURN c.cusip AS cusip
       ORDER BY c.holder_count DESC LIMIT toInteger($n)`,
      { n: POSITION_TOP_N },
    )) as { cusip: string }[];
    const topSet = new Set(topCusipRows.map((r) => r.cusip));
    const posRows = holdings.filter((h) => topSet.has(h.cusip));
    const PBATCH = 5000;
    for (let i = 0; i < posRows.length; i += PBATCH) {
      const chunk = posRows.slice(i, i + PBATCH);
      // (accession,cusip) MERGE — 같은 주체·대상 여러 로트는
      // Position 1개로 합치되 value/shares 는 합산(로트 손실 X).
      await runCypher(
        `UNWIND $rows AS r
         MATCH (m:${L.subjectLabel} {accession: r.accession})
         MATCH (c:${L.objectLabel} {cusip: r.cusip})
         MERGE (m)-[:${L.holdsType}]->
               (p:${L.positionLabel} {accession: r.accession, cusip: r.cusip})
         MERGE (p)-[:${L.ofType}]->(c)
         ON CREATE SET p.value_usd = r.valueUsd, p.shares = r.shares,
                       p.put_call = r.putCall
         ON MATCH SET p.value_usd = p.value_usd + r.valueUsd,
                      p.shares = p.shares + r.shares`,
        { rows: chunk },
      );
      yield {
        type: "load_progress",
        done: Math.min(i + PBATCH, posRows.length),
        total: posRows.length,
      };
    }
  } catch (e) {
    yield { type: "load_error", message: e instanceof Error ? e.message : String(e) };
    return;
  }

  // ── #3 인메모리 보관 (SQL/RAG 패널 대조군) ───────────
  setMemStore({ datasetId: ds.id, holdings, managers, loadedAt: Date.now() });

  const [{ companies = 0 } = {}] = (await runCypher(
    `MATCH (c:${L.objectLabel}) RETURN count(c) AS companies`,
  )) as { companies?: number }[];
  // crowding 속성이 실제 부여된 대상 노드 수(UI 보고용)
  const [{ enriched = 0 } = {}] = (await runCypher(
    `MATCH (c:${L.objectLabel})
     WHERE c.holder_count IS NOT NULL
     RETURN count(c) AS enriched`,
  )) as { enriched?: number }[];
  // 적재된 Position 노드 수(UI 보고용)
  const [{ positions = 0 } = {}] = (await runCypher(
    `MATCH (p:${L.positionLabel}) RETURN count(p) AS positions`,
  )) as { positions?: number }[];

  yield {
    type: "load_done",
    managers: managers.length,
    companies,
    enriched,
    positions,
    owns: holdings.length,
  };
}

/** 특정 데이터셋의 그래프 현황 (UI "이미 구축됨" 표시용). 없으면 null.
 *
 *  데이터셋 공존(사용자 결정 2026-05-20): 여러 데이터셋이 라벨로 분리돼
 *  한 Neo4j 에 동시 적재된다 → 데이터셋별로 자기 라벨 노드만 카운트.
 *  @param datasetId 조회할 데이터셋(미지정=기본 SEC EDGAR).
 */
export async function graphStats(
  datasetId: string = DEFAULT_DATASET_ID,
): Promise<{
  managers: number;
  companies: number;
  owns: number;
  positions: number;
} | null> {
  const L = getDataset(datasetId).cypher;
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    // CALL 서브쿼리로 각 count 독립 산출(카테시안 곱 폭발 방지).
    // 이 데이터셋 라벨만 — 공존하는 다른 데이터셋은 미집계.
    const [row] = (await runCypher(
      `CALL { MATCH (m:${L.subjectLabel}) RETURN count(m) AS managers }
       CALL { MATCH (c:${L.objectLabel}) RETURN count(c) AS companies }
       CALL { MATCH ()-[o:${L.relType}]->() RETURN count(o) AS owns }
       CALL { MATCH (p:${L.positionLabel}) RETURN count(p) AS positions }
       RETURN managers, companies, owns, positions`,
    )) as {
      managers: number;
      companies: number;
      owns: number;
      positions: number;
    }[];
    if (!row || row.managers === 0) return null;
    return row;
  } catch {
    return null;
  }
}

/** 적재된 데이터셋 1건의 요약(리스트·삭제 UI 용). */
export interface LoadedDataset {
  id: string;
  /** 주체 노드 수(기관/배우/저자). */
  subjects: number;
  /** 대상 노드 수(종목/영화/논문). */
  objects: number;
}

/** 현재 Neo4j 에 적재된 데이터셋 목록(공존 — UI 가 어느 데이터셋이
 *  이미 구축됐는지 + 노드 수 표시). 주체 라벨 노드 존재로 판정. */
export async function loadedDatasetIds(): Promise<LoadedDataset[]> {
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    const loaded: LoadedDataset[] = [];
    for (const ds of GRAPH_DATASETS) {
      const [{ subjects = 0, objects = 0 } = {}] = (await runCypher(
        `CALL { MATCH (m:${ds.cypher.subjectLabel}) RETURN count(m) AS subjects }
         CALL { MATCH (c:${ds.cypher.objectLabel}) RETURN count(c) AS objects }
         RETURN subjects, objects`,
      )) as { subjects?: number; objects?: number }[];
      if (subjects > 0) loaded.push({ id: ds.id, subjects, objects });
    }
    return loaded;
  } catch {
    return [];
  }
}

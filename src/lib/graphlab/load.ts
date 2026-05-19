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
import { subsetUrl, GRAPH_SCHEMA } from "./config";

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
    }
  | { type: "load_error"; message: string };

/** holdings 1행 (CSV → 그래프 엣지 & SQL row 공용) */
export interface HoldingRow {
  accession: string;
  cusip: string;
  issuer: string;
  valueUsdK: number;
  shares: number;
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
  /** 보유가치 합계(USD 천 단위) */
  totalValueK: number;
}

/** 인메모리 보관소 — SQL/RAG 패널이 그래프와 같은 데이터를 쓰도록.
 *  globalThis 고정(HMR·요청 간 재사용, 매번 재fetch 방지). */
interface MemStore {
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
): Promise<string[][]> {
  const url = subsetUrl(file);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[${file}] SEC 서브셋 fetch 실패 (HTTP ${res.status}) — ${url}\n` +
        `→ aiceo-4th-training main 에 poc/data/sec-edgar 서브셋이 ` +
        `공개돼 있는지 확인.`,
    );
  }
  return parseCsv(await res.text());
}

/**
 * 메인 적재 제너레이터 — API route 가 SSE 로 직렬화.
 * Neo4j 가 이미 떠 있다고 가정(ensureNeo4j 가 선행).
 */
export async function* loadGraph(): AsyncGenerator<LoadEvent> {
  // ── #1 서브셋 fetch ──────────────────────────────────
  yield { type: "load", phase: "fetch", text: "SEC EDGAR 서브셋 다운로드 중 (GitHub raw)…" };
  let mgrRows: string[][];
  let holdRows: string[][];
  try {
    [mgrRows, holdRows] = await Promise.all([
      fetchCsv("managers"),
      fetchCsv("holdings"),
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
  const holdings: HoldingRow[] = holdRows.slice(1).map((r) => ({
    accession: r[0],
    cusip: r[1],
    issuer: r[2],
    valueUsdK: Number(r[3]) || 0,
    shares: Number(r[4]) || 0,
  }));
  yield {
    type: "load",
    phase: "fetched",
    text: `수신: 기관 ${managers.length}개 · 보유 ${holdings.length.toLocaleString()}건`,
  };

  // ── #2 Neo4j 적재 ───────────────────────────────────
  yield { type: "load", phase: "reset", text: "기존 그래프 정리 + 제약 생성…" };
  try {
    await runCypher("MATCH (n) DETACH DELETE n");
    await runCypher(
      `CREATE CONSTRAINT mgr_acc IF NOT EXISTS
       FOR (m:${GRAPH_SCHEMA.managerLabel}) REQUIRE m.accession IS UNIQUE`,
    );
    await runCypher(
      `CREATE CONSTRAINT co_cusip IF NOT EXISTS
       FOR (c:${GRAPH_SCHEMA.companyLabel}) REQUIRE c.cusip IS UNIQUE`,
    );

    // 기관 노드
    yield { type: "load", phase: "managers", text: "기관(Manager) 노드 적재…" };
    await runCypher(
      `UNWIND $rows AS r
       MERGE (m:${GRAPH_SCHEMA.managerLabel} {accession: r.accession})
       SET m.cik=r.cik, m.name=r.name, m.city=r.city, m.state=r.state`,
      { rows: managers },
    );

    // 보유 엣지 (배치 — 46만 행이라 청크 UNWIND)
    yield { type: "load", phase: "owns", text: "보유(OWNS) 엣지 적재…" };
    const BATCH = 5000;
    for (let i = 0; i < holdings.length; i += BATCH) {
      const chunk = holdings.slice(i, i + BATCH);
      await runCypher(
        `UNWIND $rows AS r
         MATCH (m:${GRAPH_SCHEMA.managerLabel} {accession: r.accession})
         MERGE (c:${GRAPH_SCHEMA.companyLabel} {cusip: r.cusip})
           ON CREATE SET c.name = r.issuer
         MERGE (m)-[o:${GRAPH_SCHEMA.ownsRel}]->(c)
         SET o.value_usd_k = r.valueUsdK, o.shares = r.shares`,
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
    yield { type: "load", phase: "crowding", text: "종목 인기도(crowding) 속성 적재…" };
    // top_issuers: cusip,name_of_issuer,n_filer_managers,total_value_usd_thousands
    const tiRows = await fetchCsv("topIssuers");
    const topIssuers: TopIssuerRow[] = tiRows.slice(1).map((r) => ({
      cusip: r[0],
      issuer: r[1],
      holderCount: Number(r[2]) || 0,
      totalValueK: Number(r[3]) || 0,
    }));
    await runCypher(
      `UNWIND $rows AS r
       MATCH (c:${GRAPH_SCHEMA.companyLabel} {cusip: r.cusip})
       SET c.holder_count = r.holderCount,
           c.total_value_k = r.totalValueK`,
      { rows: topIssuers },
    );
  } catch (e) {
    yield { type: "load_error", message: e instanceof Error ? e.message : String(e) };
    return;
  }

  // ── #3 인메모리 보관 (SQL/RAG 패널 대조군) ───────────
  setMemStore({ holdings, managers, loadedAt: Date.now() });

  const [{ companies = 0 } = {}] = (await runCypher(
    `MATCH (c:${GRAPH_SCHEMA.companyLabel}) RETURN count(c) AS companies`,
  )) as { companies?: number }[];
  // crowding 속성이 실제 부여된 Company 수(UI 보고용)
  const [{ enriched = 0 } = {}] = (await runCypher(
    `MATCH (c:${GRAPH_SCHEMA.companyLabel})
     WHERE c.holder_count IS NOT NULL
     RETURN count(c) AS enriched`,
  )) as { enriched?: number }[];

  yield {
    type: "load_done",
    managers: managers.length,
    companies,
    enriched,
    owns: holdings.length,
  };
}

/** 그래프 현황 (UI "이미 구축됨" 표시용). 없으면 0. */
export async function graphStats(): Promise<{
  managers: number;
  companies: number;
  owns: number;
} | null> {
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    // 3개 패턴을 한 MATCH 로 묶으면 카테시안 곱(64×11961×…)이
    // 되어 count 가 폭발한다(실측 7,985만). CALL 서브쿼리로 각
    // count 를 독립 산출 — 정확한 값.
    const [row] = (await runCypher(
      `CALL { MATCH (m:${GRAPH_SCHEMA.managerLabel}) RETURN count(m) AS managers }
       CALL { MATCH (c:${GRAPH_SCHEMA.companyLabel}) RETURN count(c) AS companies }
       CALL { MATCH ()-[o:${GRAPH_SCHEMA.ownsRel}]->() RETURN count(o) AS owns }
       RETURN managers, companies, owns`,
    )) as { managers: number; companies: number; owns: number }[];
    if (!row || row.managers === 0) return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * 온톨로지 실습 — 그래프 구조 샘플 API. GET /api/graph-lab/sample.
 *
 * "DB 구조 보기" 모달이 호출. 전체 46만 엣지는 렌더 불가·불필요
 * → 인터랙티브 탐색용 서브그래프만 반환.
 *
 * 토글 2모드(사용자 결정 2026-05-20):
 *  - mode=owns     : (Manager)-[OWNS]->(Company) 2-노드 (레거시·단순)
 *  - mode=position : (Manager)-[HOLDS]->(Position)-[OF]->(Company)
 *                     3-노드 (Neo4j 공식 패턴 — 포지션 매개 구조)
 *
 * seed = "<kind>:<raw>" — reactflow 노드 ID 와 동일 접두사:
 *  - m:<accession> (기관) / c:<cusip> (종목) / p:<accn>|<cusip> (포지션)
 * cusip·accession·position 은 의미가 다른 네임스페이스라 OR 매칭
 * (모호)이 아니라 접두사로 명시 분기 — 노드 정체성 보존(설계 의도).
 * seed 없으면 초기 뷰(인기 상위 종목 서브그래프).
 *
 * R7: Neo4j 의존 → runtime=nodejs.
 */

import { runCypher } from "@/lib/graphlab/client";
import {
  DEFAULT_DATASET_ID,
  GRAPH_DATASET_IDS,
  getDataset,
  type GraphDataset,
} from "@/lib/graphlab/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 데이터셋별 Neo4j 라벨 묶음(getDataset(id).cypher). 모듈 고정
 *  상수(SEC) 대신 요청 datasetId 로 해석해 헬퍼에 주입한다 —
 *  영화/논문 등 동시 공존 라벨 인지(2026-05-20). */
type GraphLabels = GraphDataset["cypher"];

interface GNode {
  id: string;
  label: string;
  kind: "manager" | "company" | "position";
}
interface GEdge {
  source: string;
  target: string;
}

type Mode = "owns" | "position";

/** 보유가치(USD) → 사람이 읽는 규모 ($1.2B / $340M).
 *  Position 라벨에서 보유 규모를 한눈에 보이게(엔티티 식별용).
 *
 * 실측 확정(2026-05-20): SEC 원본 컬럼명은 value_usd_thousands
 * 지만 실제 단위는 그냥 USD다. value/shares = 종목 주당가격이
 * 현실값($517≈MS주가)으로 일정 → 천 단위면 주가가 ×1000 폭발.
 * 따라서 ×1000 하지 않는다(이전 버전 표시 버그 정정 — 데이터·
 * 적재·MERGE 는 정상이고 표시 변환만 틀렸었음). */
function fmtUsd(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

/** OWNS 모드 행 → {mid,mname,cid,cname} 평면 행. 라벨은 데이터셋별
 *  주입(L) — 모듈 고정 상수 미사용. */
async function ownsRows(
  seed: string | null,
  L: GraphLabels,
): Promise<Record<string, unknown>[]> {
  const { subjectLabel: managerLabel, objectLabel: companyLabel, relType: ownsRel } =
    L;
  if (!seed) {
    return runCypher(
      `MATCH (c:${companyLabel})<-[:${ownsRel}]-(:${managerLabel})
       WITH c, count(*) AS pop ORDER BY pop DESC LIMIT 8
       MATCH (m:${managerLabel})-[:${ownsRel}]->(c)
       WITH c, collect(m)[0..6] AS ms
       UNWIND ms AS m
       RETURN c.cusip AS cid, c.name AS cname,
              m.accession AS mid, m.name AS mname`,
    );
  }
  const kind = seed.slice(0, 2);
  const raw = seed.slice(2);
  if (kind === "m:") {
    return runCypher(
      `MATCH (m:${managerLabel} {accession: $raw})-[:${ownsRel}]->(c:${companyLabel})
       RETURN c.cusip AS cid, c.name AS cname,
              m.accession AS mid, m.name AS mname
       LIMIT 40`,
      { raw },
    );
  }
  if (kind === "c:") {
    return runCypher(
      `MATCH (m:${managerLabel})-[:${ownsRel}]->(c:${companyLabel} {cusip: $raw})
       RETURN c.cusip AS cid, c.name AS cname,
              m.accession AS mid, m.name AS mname
       LIMIT 40`,
      { raw },
    );
  }
  throw new BadSeed(seed);
}

/** Position 모드 행 → {mid,mname,pid,pput,cid,cname} 평면 행.
 *  Position 식별자 pid = "<accession>|<cusip>" (load.ts MERGE 키).
 *  라벨은 데이터셋별 주입(L). */
async function positionRows(
  seed: string | null,
  L: GraphLabels,
): Promise<Record<string, unknown>[]> {
  const {
    subjectLabel: managerLabel,
    objectLabel: companyLabel,
    positionLabel,
    holdsType: holdsRel,
    ofType: ofRel,
  } = L;
  const ret = `RETURN m.accession AS mid, m.name AS mname,
              p.accession AS pa, p.cusip AS pc, p.put_call AS pput,
              p.value_usd AS pval, p.shares AS psh,
              c.cusip AS cid, c.name AS cname`;
  if (!seed) {
    // 초기 뷰: Position 보유 최다 종목 6개 + 그 Position·기관
    return runCypher(
      `MATCH (c:${companyLabel})<-[:${ofRel}]-(:${positionLabel})
       WITH c, count(*) AS pop ORDER BY pop DESC LIMIT 6
       MATCH (m:${managerLabel})-[:${holdsRel}]->
             (p:${positionLabel})-[:${ofRel}]->(c)
       WITH c, collect({m:m,p:p})[0..6] AS xs
       UNWIND xs AS x
       WITH x.m AS m, x.p AS p, c
       ${ret}`,
    );
  }
  const kind = seed.slice(0, 2);
  const raw = seed.slice(2);
  if (kind === "m:") {
    return runCypher(
      `MATCH (m:${managerLabel} {accession: $raw})-[:${holdsRel}]->
             (p:${positionLabel})-[:${ofRel}]->(c:${companyLabel})
       ${ret} LIMIT 40`,
      { raw },
    );
  }
  if (kind === "c:") {
    return runCypher(
      `MATCH (m:${managerLabel})-[:${holdsRel}]->
             (p:${positionLabel})-[:${ofRel}]->(c:${companyLabel} {cusip: $raw})
       ${ret} LIMIT 40`,
      { raw },
    );
  }
  if (kind === "p:") {
    // p:<accession>|<cusip> — 그 포지션의 기관·종목 양쪽
    const [pa, pc] = raw.split("|");
    return runCypher(
      `MATCH (m:${managerLabel})-[:${holdsRel}]->
             (p:${positionLabel} {accession: $pa, cusip: $pc})
             -[:${ofRel}]->(c:${companyLabel})
       ${ret} LIMIT 40`,
      { pa, pc },
    );
  }
  throw new BadSeed(seed);
}

/** seed 형식 오류 — 400 으로 변환되는 마커 에러 */
class BadSeed extends Error {
  constructor(seed: string) {
    super(`알 수 없는 seed 형식: "${seed}" (m:/c:/p: 접두사 필요)`);
    this.name = "BadSeed";
  }
}

export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const seed = sp.get("seed");
  const mode: Mode = sp.get("mode") === "position" ? "position" : "owns";
  // datasetId 화이트리스트 검증 — 임의 문자열이 Cypher 라벨로
  // 들어가면 인젝션. 미지정/미존재는 기본(SEC) → 회귀 0.
  const reqDataset = sp.get("datasetId");
  const datasetId =
    reqDataset && GRAPH_DATASET_IDS.includes(reqDataset)
      ? reqDataset
      : DEFAULT_DATASET_ID;
  const L = getDataset(datasetId).cypher;
  try {
    const nodeMap = new Map<string, GNode>();
    const edges: GEdge[] = [];
    const addEdge = (s: string, t: string): void => {
      edges.push({ source: s, target: t });
    };

    if (mode === "owns") {
      for (const r of await ownsRows(seed, L)) {
        const cid = `c:${r.cid as string}`;
        const mid = `m:${r.mid as string}`;
        if (!nodeMap.has(cid))
          nodeMap.set(cid, {
            id: cid,
            label: (r.cname as string) ?? (r.cid as string),
            kind: "company",
          });
        if (!nodeMap.has(mid))
          nodeMap.set(mid, {
            id: mid,
            label: (r.mname as string) ?? (r.mid as string),
            kind: "manager",
          });
        addEdge(mid, cid);
      }
    } else {
      for (const r of await positionRows(seed, L)) {
        const cid = `c:${r.cid as string}`;
        const mid = `m:${r.mid as string}`;
        const pid = `p:${r.pa as string}|${r.pc as string}`;
        if (!nodeMap.has(cid))
          nodeMap.set(cid, {
            id: cid,
            label: (r.cname as string) ?? (r.cid as string),
            kind: "company",
          });
        if (!nodeMap.has(mid))
          nodeMap.set(mid, {
            id: mid,
            label: (r.mname as string) ?? (r.mid as string),
            kind: "manager",
          });
        if (!nodeMap.has(pid)) {
          // Position 은 "어느 종목을 얼마나(어떤 성격으로) 보유"
          // 가 곧 정체성 → 라벨에 종목명·규모·옵션구분을 담아
          // 식별 가능한 엔티티로(Manager=기관명, Company=종목명
          // 과 대칭). put_call 빈값=현물, 'Call'/'Put'=옵션.
          const pc = (r.pput as string) || "";
          const cname = (r.cname as string) ?? (r.cid as string);
          const kind = pc || "현물";
          nodeMap.set(pid, {
            id: pid,
            label: `${cname} · ${kind} · ${fmtUsd(
              Number(r.pval) || 0,
            )}`,
            kind: "position",
          });
        }
        addEdge(mid, pid); // (Manager)-[HOLDS]->(Position)
        addEdge(pid, cid); // (Position)-[OF]->(Company)
      }
    }

    return new Response(
      JSON.stringify({
        nodes: [...nodeMap.values()],
        edges,
        seeded: !!seed,
        mode,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    const isBadSeed = e instanceof BadSeed;
    return new Response(
      JSON.stringify({
        error: isBadSeed
          ? (e as Error).message
          : (e instanceof Error ? e.message : String(e)) +
            " — Neo4j 가 떠 있고 그래프가 구축됐는지 확인하세요.",
      }),
      {
        status: isBadSeed ? 400 : 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

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
import { GRAPH_SCHEMA } from "@/lib/graphlab/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const { managerLabel, companyLabel, ownsRel, positionLabel, holdsRel, ofRel } =
  GRAPH_SCHEMA;

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

/** OWNS 모드 행 → {mid,mname,cid,cname} 평면 행 */
async function ownsRows(seed: string | null): Promise<Record<string, unknown>[]> {
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
 *  Position 식별자 pid = "<accession>|<cusip>" (load.ts MERGE 키). */
async function positionRows(
  seed: string | null,
): Promise<Record<string, unknown>[]> {
  const ret = `RETURN m.accession AS mid, m.name AS mname,
              p.accession AS pa, p.cusip AS pc, p.put_call AS pput,
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
  try {
    const nodeMap = new Map<string, GNode>();
    const edges: GEdge[] = [];
    const addEdge = (s: string, t: string): void => {
      edges.push({ source: s, target: t });
    };

    if (mode === "owns") {
      for (const r of await ownsRows(seed)) {
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
      for (const r of await positionRows(seed)) {
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
          const pc = (r.pput as string) || "";
          nodeMap.set(pid, {
            id: pid,
            label: pc ? `포지션 (${pc})` : "포지션",
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

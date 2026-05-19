/**
 * 온톨로지 실습 — 그래프 구조 샘플 API. GET /api/graph-lab/sample.
 *
 * "DB 구조 보기" 모달이 호출. 전체 46만 엣지는 렌더 불가·불필요
 * → 인터랙티브 탐색용 서브그래프만 반환:
 *   - seed=null  : 보유 기관 수 상위 종목 + 그 종목을 가진 기관 일부
 *                   (그래프가 어떻게 생겼는지 한눈에)
 *   - seed=<id>  : 그 노드(기관 accession 또는 종목 cusip)의 이웃
 *                   (사용자가 클릭해 확장 — 인터랙티브 탐색)
 *
 * 노드 라벨 Manager/Company, 엣지 OWNS 를 reactflow 가 쓰기 좋은
 * {nodes, edges} 형태로. R7 runtime=nodejs.
 */

import { runCypher } from "@/lib/graphlab/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GNode {
  id: string;
  label: string;
  kind: "manager" | "company";
}
interface GEdge {
  source: string;
  target: string;
}

export async function GET(req: Request): Promise<Response> {
  const seed = new URL(req.url).searchParams.get("seed");
  try {
    let rows: Record<string, unknown>[];
    if (!seed) {
      // 초기 뷰: 보유 기관 최다 종목 8개 + 각 종목을 가진 기관 6곳
      rows = await runCypher(
        `MATCH (c:Company)<-[:OWNS]-(:Manager)
         WITH c, count(*) AS pop ORDER BY pop DESC LIMIT 8
         MATCH (m:Manager)-[:OWNS]->(c)
         WITH c, collect(m)[0..6] AS ms
         UNWIND ms AS m
         RETURN c.cusip AS cid, c.name AS cname,
                m.accession AS mid, m.name AS mname`,
      );
    } else {
      // 확장: 클릭한 노드의 이웃 (기관이면 보유종목, 종목이면 보유기관)
      rows = await runCypher(
        `MATCH (m:Manager)-[:OWNS]->(c:Company)
         WHERE m.accession = $seed OR c.cusip = $seed
         RETURN c.cusip AS cid, c.name AS cname,
                m.accession AS mid, m.name AS mname
         LIMIT 40`,
        { seed },
      );
    }

    const nodeMap = new Map<string, GNode>();
    const edges: GEdge[] = [];
    for (const r of rows) {
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
      edges.push({ source: mid, target: cid });
    }

    return new Response(
      JSON.stringify({
        nodes: [...nodeMap.values()],
        edges,
        seeded: !!seed,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error:
          (e instanceof Error ? e.message : String(e)) +
          " — Neo4j 가 떠 있고 그래프가 구축됐는지 확인하세요.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * 온톨로지 실습 — 그래프 구조 샘플 API. GET /api/graph-lab/sample.
 *
 * "DB 구조 보기" 모달이 호출. 전체 46만 엣지는 렌더 불가·불필요
 * → 인터랙티브 탐색용 서브그래프만 반환:
 *   - seed=null      : 보유 기관 수 상위 종목 + 그 종목을 가진 기관 일부
 *                       (그래프가 어떻게 생겼는지 한눈에)
 *   - seed=m:<accn>  : 그 기관이 보유한 종목들의 이웃 (클릭 확장)
 *   - seed=c:<cusip> : 그 종목을 보유한 기관들의 이웃 (클릭 확장)
 *
 * seed 는 클라이언트 reactflow 노드 ID 와 동일한 접두사 형식
 * (m: / c:). cusip 과 accession 은 의미가 다른 네임스페이스라
 * OR 매칭(모호)이 아니라 접두사 1글자로 노드 종류를 명시 분기한다
 * — 지식그래프의 노드 정체성을 정확히 보존(설계 의도).
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
      // seed = "<kind>:<raw>" — 접두사로 노드 종류 분기(모호한 OR 제거).
      // m: 기관 → 그 기관 보유 종목 / c: 종목 → 그 종목 보유 기관.
      const kind = seed.slice(0, 2);
      const raw = seed.slice(2);
      if (kind === "m:") {
        rows = await runCypher(
          `MATCH (m:Manager {accession: $raw})-[:OWNS]->(c:Company)
           RETURN c.cusip AS cid, c.name AS cname,
                  m.accession AS mid, m.name AS mname
           LIMIT 40`,
          { raw },
        );
      } else if (kind === "c:") {
        rows = await runCypher(
          `MATCH (m:Manager)-[:OWNS]->(c:Company {cusip: $raw})
           RETURN c.cusip AS cid, c.name AS cname,
                  m.accession AS mid, m.name AS mname
           LIMIT 40`,
          { raw },
        );
      } else {
        return new Response(
          JSON.stringify({
            error: `알 수 없는 seed 형식: "${seed}" (m: 또는 c: 접두사 필요)`,
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
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

/**
 * Neo4j 드라이버 싱글톤.
 *
 * R6(앱 CLAUDE.md) 동형: 드라이버를 모듈 변수로 두면 dev HMR 시
 * 재생성돼 커넥션풀이 누수된다. globalThis 에 고정(Prisma 공식
 * 패턴) — search-lab client.ts 의 OpenSearch 싱글톤과 동일 사상.
 *
 * R7: neo4j-driver 는 node 전용 → 이걸 쓰는 API route 는
 * runtime="nodejs".
 */

import neo4j, { type Driver } from "neo4j-driver";
import { NEO4J_URL, NEO4J_USER, NEO4J_PASSWORD } from "./config";

const KEY = "__aiceo_graphlab_neo4j_driver__";

function makeDriver(): Driver {
  return neo4j.driver(
    NEO4J_URL,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    {
      // 강의 단일사용자라 풀 작게. 적재(대량 UNWIND)도 이 범위로 충분.
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 10_000,
    },
  );
}

export function getNeo4jDriver(): Driver {
  const g = globalThis as Record<string, unknown>;
  if (!g[KEY]) g[KEY] = makeDriver();
  return g[KEY] as Driver;
}

/** Neo4j Bolt 연결 1회 확인 (떠 있으면 true) — ensure-infra 가 사용 */
export async function isNeo4jUp(): Promise<boolean> {
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}

/**
 * 읽기 Cypher 1회 실행 → 레코드를 평범한 객체 배열로.
 * Neo4j Integer 는 JS number 로 안전 변환(toNumber, 64bit 주의).
 */
export async function runCypher(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(cypher, params);
    return res.records.map((rec) => {
      const obj: Record<string, unknown> = {};
      for (const key of rec.keys) {
        const v = rec.get(key);
        obj[String(key)] = neo4j.isInt(v)
          ? (v as { toNumber: () => number }).toNumber()
          : v;
      }
      return obj;
    });
  } finally {
    await session.close();
  }
}

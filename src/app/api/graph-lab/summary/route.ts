/**
 * 온톨로지 실습 — 그래프 해석 API. POST /api/graph-lab/summary.
 *
 * "DB 구조 보기"에서 노드 클릭 시 "그래서 이게 무슨 의미인가"를
 * 그래프 사실로 즉시 요약(사용자 결정 2026-05-20: LLM 없이
 * Neo4j 집계만 — 무과금·즉시·결정적, "그래프가 곧 답" 메시지
 * 보존). 사용자 추가 요구: 경로가 깊어질수록 해석도 멀티홉
 * 통찰로 진화(경로 전체 깊이 통찰).
 *
 * 입력: { path: [{id,label}, ...] }  (브레드크럼 클릭 경로)
 *   id 는 sample API 와 동일 접두사(m:/c:/p:).
 * 출력: { lines: string[], rebuildHint?: boolean }
 *   lines = 깊이별 해석 문장(0홉 전체 / 1홉 노드사실 / 2홉+
 *           멀티홉 통찰). rebuildHint = 옛 스키마(가치 0) 감지.
 *
 * 경로가 길수록 멀티홉 비용↑ → 최근 MAX_PATH 개만 통찰 계산
 * (R-2 완화, 사용자 '경로 전체 깊이' 요구와 비용의 절충).
 *
 * R7: Neo4j 의존 → runtime=nodejs.
 */

import { z } from "zod";
import { runCypher } from "@/lib/graphlab/client";
import { GRAPH_SCHEMA } from "@/lib/graphlab/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const { managerLabel, companyLabel, ownsRel } = GRAPH_SCHEMA;

/** 경로가 더 길어도 통찰은 최근 N개 노드까지만(비용 캡). */
const MAX_PATH = 6;

const bodySchema = z.object({
  path: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .max(50),
});

/** "<kind>:<raw>" → {kind,raw}. p: 는 raw 가 "accn|cusip". */
function parseId(id: string): { kind: string; raw: string } {
  return { kind: id.slice(0, 2), raw: id.slice(2) };
}

/** USD → 사람이 읽는 규모. value_usd 단위는 USD(2026-05-20 실측). */
function fmtUsd(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

/** 옛 스키마 감지: OWNS 엣지에 value_usd 가 하나도 없으면 true
 *  (그래프 재구축 전 — 가치 통찰은 0이라 안내 필요). */
async function needsRebuild(): Promise<boolean> {
  const [row] = (await runCypher(
    `MATCH ()-[o:${ownsRel}]->()
     WITH count(o) AS tot, count(o.value_usd) AS withV
     RETURN tot, withV`,
  )) as { tot: number; withV: number }[];
  return !!row && row.tot > 0 && row.withV === 0;
}

/** 1홉: 단일 노드의 사실 요약 문장(노드 종류별로 다른 통찰). */
async function nodeFact(
  kind: string,
  raw: string,
  hasValue: boolean,
): Promise<string[]> {
  if (kind === "c:") {
    const [r] = (await runCypher(
      `MATCH (c:${companyLabel} {cusip: $raw})
       OPTIONAL MATCH (m:${managerLabel})-[o:${ownsRel}]->(c)
       RETURN c.name AS name, count(DISTINCT m) AS holders,
              sum(o.value_usd) AS tot,
              c.holder_count AS hc, c.total_value_usd AS tv`,
      { raw },
    )) as {
      name: string;
      holders: number;
      tot: number | null;
      hc: number | null;
      tv: number | null;
    }[];
    if (!r) return [`이 종목 노드를 그래프에서 찾을 수 없습니다.`];
    const lines = [
      `📈 종목 「${r.name}」 — 13F 기관 ${
        r.hc ?? r.holders
      }곳이 보유(보유 기관이 많을수록 '인기/crowding'이 높은 종목).`,
    ];
    if (hasValue && r.tv)
      lines.push(`전체 보유가치 합계 ${fmtUsd(r.tv)}.`);
    return lines;
  }
  if (kind === "m:") {
    const [r] = (await runCypher(
      `MATCH (m:${managerLabel} {accession: $raw})-[o:${ownsRel}]->(c:${companyLabel})
       RETURN m.name AS name, count(c) AS ncos, sum(o.value_usd) AS tot`,
      { raw },
    )) as { name: string; ncos: number; tot: number | null }[];
    if (!r) return [`이 기관 노드를 그래프에서 찾을 수 없습니다.`];
    const lines = [
      `🏛 기관 「${r.name}」 — 종목 ${r.ncos}개 보유(이 기관의 포트폴리오 폭).`,
    ];
    if (hasValue && r.tot)
      lines.push(`포트폴리오 신고가치 합계 ${fmtUsd(r.tot)}.`);
    return lines;
  }
  if (kind === "p:") {
    // ── 학습 포인트 ──────────────────────────────────────
    // Position 노드의 해석 문장은 도메인 의미가 가장 짙은
    // 곳입니다. p: raw 는 "<accession>|<cusip>". 아래
    // positionFact 를 채워, "어느 기관이 어느 종목을 어떤
    // 성격(현물/Call/Put)으로 얼마 보유" 를 한 문장으로
    // 만드세요. 권장 Cypher:
    //   MATCH (m:Manager)-[:HOLDS]->
    //         (p:Position {accession:$pa,cusip:$pc})-[:OF]->(c:Company)
    //   RETURN m.name, c.name, p.put_call, p.value_usd
    // 옵션(Call/Put)이면 "옵션 베팅", 현물이면 "직접 보유"
    // 같이 의미를 덧붙이면 직관적입니다.
    // ─────────────────────────────────────────────────────
    const [pa, pc] = raw.split("|");
    const [r] = (await runCypher(
      `MATCH (m:${managerLabel})-[:${GRAPH_SCHEMA.holdsRel}]->
             (p:${GRAPH_SCHEMA.positionLabel} {accession:$pa, cusip:$pc})
             -[:${GRAPH_SCHEMA.ofRel}]->(c:${companyLabel})
       RETURN m.name AS mgr, c.name AS co,
              p.put_call AS pc, p.value_usd AS v`,
      { pa, pc },
    )) as {
      mgr: string;
      co: string;
      pc: string | null;
      v: number | null;
    }[];
    if (!r) return [`이 포지션 노드를 그래프에서 찾을 수 없습니다.`];
    const opt = r.pc || "";
    const kindWord = opt
      ? `${opt} 옵션 베팅`
      : "현물 직접 보유";
    const valPart = hasValue && r.v ? ` · ${fmtUsd(r.v)}` : "";
    return [
      `🔗 포지션 — 「${r.mgr}」가 「${r.co}」를 ${kindWord}${valPart}. ` +
        `(Position 노드는 보유 1건을 매개 — 같은 종목도 현물/옵션을 구별)`,
    ];
  }
  return [];
}

/**
 * 2홉+ 멀티홉 통찰 — 경로의 노드들이 함께 의미하는 것.
 * 경로에서 종목(c:)·기관(m:) ID 만 추려, "이들을 동시에
 * 만족하는 연결이 그래프에 얼마나/무엇이 있나"를 집계한다.
 * 이게 곧 GraphRAG 멀티홉(공동보유·연쇄)의 실체.
 */
async function multiHopInsight(
  ids: { kind: string; raw: string }[],
  hasValue: boolean,
): Promise<string[]> {
  const companies = ids.filter((x) => x.kind === "c:").map((x) => x.raw);
  const managers = ids.filter((x) => x.kind === "m:").map((x) => x.raw);
  const lines: string[] = [];

  // ── 0순위: 방금 밟은 마지막 두 노드의 "직접 연결" ────────
  // 사용자가 prev→last 를 클릭했으면 그 두 노드가 *어떻게*
  // 이어졌는지가 가장 직관적인 첫 정보(요구: "2개 사이 연결
  // 정보가 먼저"). 기관↔종목=OWNS 직접 엣지(가치 포함),
  // 기관↔기관·종목↔종목=직접 엣지 없음 → 매개(공통보유) 한 줄.
  if (ids.length >= 2) {
    const prev = ids[ids.length - 2];
    const last = ids[ids.length - 1];
    const mgr =
      prev.kind === "m:" ? prev : last.kind === "m:" ? last : null;
    const co =
      prev.kind === "c:" ? prev : last.kind === "c:" ? last : null;

    if (mgr && co) {
      // 기관 ↔ 종목 : OWNS 직접 엣지
      const [r] = (await runCypher(
        `MATCH (m:${managerLabel} {accession:$a})-[o:${ownsRel}]->
               (c:${companyLabel} {cusip:$cu})
         RETURN m.name AS mn, c.name AS cn, o.value_usd AS v`,
        { a: mgr.raw, cu: co.raw },
      )) as { mn: string; cn: string; v: number | null }[];
      if (r) {
        const valPart =
          hasValue && r.v ? ` (신고가치 ${fmtUsd(r.v)})` : "";
        lines.push(
          `➡ 연결: 「${r.mn}」 ──[보유]──▶ 「${r.cn}」${valPart}. ` +
            `방금 따라온 이 엣지가 "이 기관이 이 종목을 보유"라는 ` +
            `사실 1건 — 경로의 기본 단위입니다.`,
        );
      }
    } else if (prev.kind === "m:" && last.kind === "m:") {
      // 기관 ↔ 기관 : 직접 엣지 없음 → 공통 보유 종목이 매개
      const [r] = (await runCypher(
        `MATCH (a:${managerLabel} {accession:$a})-[:${ownsRel}]->(c:${companyLabel})
         MATCH (b:${managerLabel} {accession:$b})-[:${ownsRel}]->(c)
         RETURN a.name AS an, b.name AS bn,
                count(DISTINCT c) AS k, collect(DISTINCT c.name)[0..3] AS s`,
        { a: prev.raw, b: last.raw },
      )) as {
        an: string;
        bn: string;
        k: number;
        s: string[];
      }[];
      if (r && r.k > 0)
        lines.push(
          `➡ 연결: 「${r.an}」와 「${r.bn}」은 직접 엣지가 없습니다. ` +
            `대신 공통 보유 종목 ${r.k}개(${r.s.join(", ")}${
              r.k > 3 ? " 등" : ""
            })가 두 기관을 잇는 다리입니다.`,
        );
    } else if (prev.kind === "c:" && last.kind === "c:") {
      // 종목 ↔ 종목 : 직접 엣지 없음 → 공통 보유 기관이 매개
      const [r] = (await runCypher(
        `MATCH (m:${managerLabel})-[:${ownsRel}]->(:${companyLabel} {cusip:$a})
         MATCH (m)-[:${ownsRel}]->(:${companyLabel} {cusip:$b})
         RETURN count(DISTINCT m) AS k, collect(DISTINCT m.name)[0..3] AS s`,
        { a: prev.raw, b: last.raw },
      )) as { k: number; s: string[] }[];
      if (r && r.k > 0)
        lines.push(
          `➡ 연결: 이 두 종목은 직접 엣지가 없습니다. 대신 둘 다 ` +
            `보유한 기관 ${r.k}곳(${r.s.join(", ")}${
              r.k > 3 ? " 등" : ""
            })이 두 종목을 잇는 다리 — common ownership 신호입니다.`,
        );
    }
  }

  // 경로에 종목 2개+ → 그 종목들을 "모두" 보유한 기관 (common ownership)
  if (companies.length >= 2) {
    const uniq = [...new Set(companies)];
    const [r] = (await runCypher(
      `MATCH (m:${managerLabel})
       WHERE all(cu IN $cusips WHERE
         (m)-[:${ownsRel}]->(:${companyLabel} {cusip: cu}))
       RETURN count(DISTINCT m) AS both,
              collect(DISTINCT m.name)[0..4] AS sample`,
      { cusips: uniq },
    )) as { both: number; sample: string[] }[];
    if (r && r.both > 0) {
      lines.push(
        `🔀 멀티홉: 경로의 종목 ${uniq.length}개를 **모두** 보유한 ` +
          `기관이 ${r.both}곳 (${r.sample.join(", ")}${
            r.both > 4 ? " 등" : ""
          }). 같은 기관이 경쟁/유사 종목을 함께 쥐고 있으면 ` +
          `'common ownership' — 반독점 연구의 핵심 신호입니다. ` +
          `SQL이면 종목 수만큼 self-JOIN, GraphRAG는 경로 1줄.`,
      );
    }
  }

  // 경로에 기관 2개+ → 두 기관이 함께 보유한 종목 (포트폴리오 유사도)
  if (managers.length >= 2) {
    const [a, b] = [...new Set(managers)].slice(-2);
    const [r] = (await runCypher(
      `MATCH (m1:${managerLabel} {accession:$a})-[:${ownsRel}]->(c:${companyLabel})
       MATCH (m2:${managerLabel} {accession:$b})-[:${ownsRel}]->(c)
       RETURN count(DISTINCT c) AS shared,
              collect(DISTINCT c.name)[0..4] AS sample`,
      { a, b },
    )) as { shared: number; sample: string[] }[];
    if (r && r.shared > 0) {
      lines.push(
        `🔀 멀티홉: 경로의 두 기관이 **공통 보유**한 종목이 ` +
          `${r.shared}개 (${r.sample.join(", ")}${
            r.shared > 4 ? " 등" : ""
          }). 겹치는 종목 수가 곧 포트폴리오 유사도입니다.`,
      );
    }
  }

  // 경로에 종목 1개 + 깊이 → 그 종목 보유 기관들이 함께 많이
  // 보유한 다른 종목 (연쇄 통찰 — 경로가 길수록 자동 심화)
  if (companies.length === 1) {
    // runCypher 는 레코드 "배열"을 반환 → 구조분해([r]) 금지.
    // 상위 3개 종목을 모두 순회해야 하므로 배열 그대로 받는다.
    const rows = (await runCypher(
      `MATCH (m:${managerLabel})-[:${ownsRel}]->(:${companyLabel} {cusip:$cu})
       MATCH (m)-[:${ownsRel}]->(other:${companyLabel})
       WHERE other.cusip <> $cu
       RETURN other.name AS co, count(DISTINCT m) AS k
       ORDER BY k DESC LIMIT 3`,
      { cu: companies[0] },
    )) as { co: string; k: number }[];
    const top = rows.map((x) => `${x.co}(${x.k}곳)`).join(", ");
    if (top)
      lines.push(
        `🔀 연쇄: 이 종목 보유 기관들이 함께 가장 많이 보유한 ` +
          `다른 종목 — ${top}. "A를 가진 기관은 B도 갖더라"가 ` +
          `한 경로로 드러납니다.`,
      );
  }

  void hasValue;
  return lines;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 요청 본문" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "path 형식 오류" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const { path } = parsed.data;

  try {
    const rebuild = await needsRebuild();
    const hasValue = !rebuild;
    const lines: string[] = [];

    if (path.length === 0) {
      // 0홉 — 그래프 전체 구조 한눈 요약
      const [s] = (await runCypher(
        `CALL { MATCH (m:${managerLabel}) RETURN count(m) AS mgr }
         CALL { MATCH (c:${companyLabel}) RETURN count(c) AS co }
         CALL { MATCH ()-[o:${ownsRel}]->() RETURN count(o) AS owns }
         RETURN mgr, co, owns`,
      )) as { mgr: number; co: number; owns: number }[];
      lines.push(
        `🗺 전체 구조 — 기관 ${s.mgr}곳 · 종목 ${s.co.toLocaleString()}개 · ` +
          `보유관계 ${s.owns.toLocaleString()}개. 노드를 클릭하면 그 ` +
          `의미를, 계속 클릭해 경로를 이으면 멀티홉 통찰이 깊어집니다.`,
      );
    } else {
      // 1홉 — 마지막 클릭 노드의 사실
      const ids = path.map((c) => parseId(c.id));
      const last = ids[ids.length - 1];
      lines.push(...(await nodeFact(last.kind, last.raw, hasValue)));

      // 2홉+ — 경로 전체(최근 MAX_PATH) 멀티홉 통찰
      if (ids.length >= 2) {
        const recent = ids.slice(-MAX_PATH);
        lines.push(...(await multiHopInsight(recent, hasValue)));
      }
    }

    return new Response(
      JSON.stringify({ lines, rebuildHint: rebuild }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error:
          (e instanceof Error ? e.message : String(e)) +
          " — Neo4j·그래프 구축 상태를 확인하세요.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

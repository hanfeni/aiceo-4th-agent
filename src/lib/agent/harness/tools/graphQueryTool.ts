import { tool } from "langchain";
import { z } from "zod";
import { runCypher } from "@/lib/graphlab/client";
import { getDataset } from "@/lib/graphlab/config";
import { getMemStore } from "@/lib/graphlab/load";

/**
 * 온톨로지 조회(Cypher) ClientTool — **순수 그래프 쿼리 실행기**.
 *
 * 수업1 요구(사용자 결정 2026-05-20): 인덱스·SQL 이 이미 개별 도구로
 * 챗 에이전트에 래핑돼 있으니, Neo4j 온톨로지도 **같은 패턴의 세 번째
 * 도구**로 신설한다. sqlQueryTool 과 1:1 대응 사상:
 *   - 도구 내부 LLM 0. 메인 챗 LLM 이 description 의 스키마를 보고
 *     직접 Cypher 를 작성해 인자로 넘기면, 도구는 읽기전용 가드 후
 *     실행해 결과만 반환한다(이중 비용·블랙박스 제거).
 *   - 데이터셋은 makeGraphQueryTool(datasetId) 클로저 바인딩(세션
 *     정체성 — 변경 시 그래프 재빌드=세션 리프레시). 수업3 의
 *     GRAPH_DATASETS SSOT 가 드롭다운·도구 양쪽의 단일 소스.
 *
 * 스키마 주입: 데이터셋의 schemaPrompt(config SSOT)를 description 에
 * 박는다. Neo4j 는 한 번에 한 데이터셋만 적재되므로, 적재된 데이터셋과
 * 선택 데이터셋이 다르면 그 사실을 안내(graceful).
 *
 * 안전: 쓰기 키워드(CREATE/DELETE/MERGE/SET/REMOVE/DROP/DETACH) 차단
 * (compare.ts GraphRAG 패널과 동일 가드 — 학생 입력 LLM 생성물 보호).
 * graceful(throw 0 — NFR-18, 에이전트 진행 보장).
 */

export {
  graphQueryToolDisplayName,
  graphQueryToolDescription,
} from "./graphQueryTool.meta";
import { graphQueryToolDescription } from "./graphQueryTool.meta";

const TOOL_MAX_ROWS = 25; // 결과 행 상한(LLM 컨텍스트·폭주 방지)

/** 쓰기 키워드 차단 — 읽기 전용 Cypher 강제(compare.ts 동일 패턴). */
const WRITE_RE = /\b(CREATE|DELETE|MERGE|SET|REMOVE|DROP|DETACH)\b/i;

/**
 * 도구 사전 정보(description)에 박을 데이터셋 스키마 텍스트.
 * 적재된 데이터셋과 선택 데이터셋 불일치 시 안내(graceful).
 */
function schemaText(datasetId: string): string {
  const ds = getDataset(datasetId);
  const store = getMemStore();
  const mismatch =
    store && store.datasetId !== ds.id
      ? `\n\n⚠ 현재 Neo4j 에는 다른 데이터셋(${store.datasetId})이 ` +
        `적재돼 있습니다. 이 도구는 "${ds.label}" 스키마로 질의하므로, ` +
        `온톨로지 실습 메뉴에서 "${ds.label}"를 적재한 뒤 사용하세요.`
      : !store
        ? `\n\n⚠ 아직 그래프가 적재되지 않았습니다. 온톨로지 실습 메뉴 ` +
          `에서 "${ds.label}"를 적재한 뒤 사용하세요.`
        : "";
  return (
    `\n\n[세션 데이터셋: ${ds.label}] 아래 Neo4j 스키마로 읽기 전용 ` +
    `Cypher 를 직접 작성해 cypher 인자로 넘기세요.\n` +
    ds.schemaPrompt +
    `\n규칙: 읽기 전용(MATCH/RETURN/WITH 등)만, 쓰기 구문 금지. ` +
    `멀티홉 경로를 적극 활용하고 LIMIT ${TOOL_MAX_ROWS} 이하로 제한.` +
    mismatch
  );
}

/** Neo4j 레코드 배열을 LLM 가독 텍스트로(상한). */
function formatRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(결과 0행)";
  const body = rows
    .slice(0, TOOL_MAX_ROWS)
    .map((r) => JSON.stringify(r))
    .join("\n");
  const more =
    rows.length > TOOL_MAX_ROWS
      ? `\n… 외 ${rows.length - TOOL_MAX_ROWS}행(상한 ${TOOL_MAX_ROWS})`
      : "";
  return `${body}${more}`;
}

/**
 * 데이터셋 바인딩 Cypher 실행기 도구 생성. 스키마는 생성 시점
 * description 에 박는다(세션 동안 고정).
 * @param datasetId 세션에서 고른 온톨로지 데이터셋(클로저 바인딩).
 */
export function makeGraphQueryTool(datasetId: string) {
  const ds = getDataset(datasetId);
  const description = graphQueryToolDescription + schemaText(datasetId);

  return tool(
    async ({ cypher }: { cypher: string }): Promise<string> => {
      const q = cypher?.trim();
      if (!q) {
        return "Cypher 가 비어 있어 조회를 건너뜁니다.";
      }
      // ── 읽기 전용 가드 ──
      if (WRITE_RE.test(q)) {
        return (
          `[${ds.label}] 안전 검증 실패: 쓰기 키워드(CREATE/DELETE/` +
          `MERGE/SET/REMOVE/DROP/DETACH) 감지 — 읽기 전용 Cypher 만 ` +
          `허용됩니다. 쿼리를 수정해 다시 호출하세요.`
        );
      }
      // ── 실행 ──
      try {
        const rows = await runCypher(q);
        return (
          `[${ds.label}] 실행한 Cypher:\n${q}\n\n결과:\n` +
          formatRows(rows)
        );
      } catch (e) {
        // 미적재·문법 오류·연결 실패 등 — graceful 안내(NFR-18).
        return (
          `[${ds.label}] Cypher 실행 오류: ` +
          `${e instanceof Error ? e.message : String(e)}\n` +
          `→ 스키마(도구 설명)와 안 맞거나 그래프 미적재일 수 있습니다. ` +
          `라벨·관계명을 확인해 쿼리를 고쳐 다시 호출하세요.`
        );
      }
    },
    {
      name: "graph_query",
      description,
      schema: z.object({
        cypher: z
          .string()
          .describe(
            "실행할 읽기 전용 Cypher. 도구 설명의 스키마(노드 라벨·" +
              "속성·관계)를 보고 직접 작성. MATCH/RETURN/WITH 등 읽기 " +
              "구문만, 쓰기 구문 금지. 멀티홉 경로를 적극 활용.",
          ),
      }),
    },
  );
}

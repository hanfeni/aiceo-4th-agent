import { tool } from "langchain";
import { z } from "zod";
import { search } from "@/lib/searchlab/search";
import {
  DOMAIN_SPEC,
  type SearchDomain,
} from "@/lib/searchlab/domains";

/**
 * 인덱스 검색 ClientTool — 챗 에이전트에 검색 실습 코퍼스를 도구로
 * 부여(사용자 결정 2026-05-19: 챗 에이전트에 도구 옵션 추가가
 * 별도 자율 에이전트 재현보다 용이). webSearchTool 동형 패턴.
 *
 * 도메인은 **세션에서 사전 선택**(우측 드롭다운) → 도구를 도메인별
 * 팩토리로 생성, domain 을 클로저로 바인딩(LLM 인자 아님 — 도메인은
 * 세션 정체성, 변경 시 그래프 재빌드=세션 리프레시).
 * mode 는 **LLM 이 질문 성격에 따라 선택**(사용자 결정 — 도구 스키마
 * enum). domain 수명=세션 / mode 수명=호출.
 *
 * 실행: searchlab.search() 직호출 → top-N 스니펫을 문자열 1개로
 * 메인 LLM 에 반환(webSearchTool 과 동일 — 도구 내부 완결, 사고패널
 * step 1개). graceful(throw 0 — NFR-18, 에이전트 진행 보장).
 */

export {
  indexSearchToolDisplayName,
  indexSearchToolDescription,
} from "./indexSearchTool.meta";
import { indexSearchToolDescription } from "./indexSearchTool.meta";

const TOOL_TOP_K = 6; // 컨텍스트로 넣을 상위 문서 수(웹검색 정제 동형)

/**
 * 도메인 바인딩 인덱스 검색 도구 생성.
 * @param domain 세션에서 고른 검색 코퍼스(클로저 바인딩).
 */
export function makeIndexSearchTool(domain: SearchDomain) {
  const label = DOMAIN_SPEC[domain].label;
  return tool(
    async ({
      query,
      mode,
    }: {
      query: string;
      mode?: "lexical" | "vector" | "hybrid";
    }): Promise<string> => {
      const q = query?.trim();
      if (!q) {
        return "검색어가 비어 있어 인덱스 검색을 건너뜁니다.";
      }
      try {
        const hits = await search({
          domain,
          query: q,
          mode: mode ?? "hybrid",
          // 하이브리드 기본 RRF(검색 실습 디폴트와 동일)
          ...(mode === "hybrid" || !mode
            ? { hybridMethod: "default" as const }
            : {}),
          topK: TOOL_TOP_K,
        });
        if (hits.length === 0) {
          return (
            `[${label}] 인덱스 검색 결과 없음 (질의: "${q}", ` +
            `방식: ${mode ?? "hybrid"}). 색인 전이거나 매칭 문서가 ` +
            `없습니다 — 근거 부족을 답변에 명시하세요.`
          );
        }
        const body = hits
          .map(
            (h, i) =>
              `[${i + 1}] ${h.title}\n${h.snippet}` +
              (h.via ? ` (경로: ${h.via.join("+")})` : ""),
          )
          .join("\n\n");
        return (
          `[${label}] 인덱스 검색 ${hits.length}건 ` +
          `(질의: "${q}", 방식: ${mode ?? "hybrid"}):\n\n${body}`
        );
      } catch (e) {
        // search() 가 OpenSearch 미기동·미색인 시 throw — 도구는
        // 흡수해 안내(NFR-18, 내부 에러 LLM 미노출, 에이전트 진행).
        void e;
        return (
          `[${label}] 인덱스 검색을 수행할 수 없습니다 ` +
          `(OpenSearch 미기동 또는 이 도메인 미색인). 도메인 색인 ` +
          `메뉴에서 색인 후 다시 시도하도록 사용자에게 안내하세요.`
        );
      }
    },
    {
      name: "index_search",
      description:
        indexSearchToolDescription + ` (현재 세션 도메인: ${label})`,
      schema: z.object({
        query: z
          .string()
          .describe(
            "검색할 질의(자연어). 사용자 질문에서 핵심 키워드·의도를 " +
              "추출해 전달.",
          ),
        mode: z
          .enum(["lexical", "vector", "hybrid"])
          .optional()
          .describe(
            "검색 방식. lexical=키워드 정확매칭(고유명사·법조문 번호 " +
              "등), vector=의미 유사(개념·동의어), hybrid=둘 결합(기본·" +
              "애매할 때 권장). 미지정 시 hybrid.",
          ),
      }),
    },
  );
}

import { tool } from "langchain";
import { z } from "zod";
import { runWebSearch, formatWebSearchContext } from "@/lib/web-search";

/**
 * 웹검색 ClientTool (H4 커스텀 도구 — ServerTool→ClientTool 교체, Slice 3).
 *
 * 이전: `tools.webSearch()` ServerTool 선언 객체 — 실행 주체가 OpenAI
 * 서버라 우리가 통제 불가. OpenAI 가 내부에서 N번 검색하면 SSE 가
 * N개 web_search_call 로 흘러 사고패널에 N줄로 보였다(에이전트 1회
 * 의도를 N호출로 오인).
 *
 * 현재: dartTool 동형 ClientTool. 실행 함수가 OpenAI Responses API
 * web_search 를 **직호출**(@/lib/web-search/client)하고, OpenAI 가
 * 내부에서 한 N검색·본문·출처를 정제(@/lib/web-search/context-formatter)
 * 해 **문자열 1개**로 메인 LLM 에 반환한다. 메인 LLM 은 web_search 를
 * 1회 호출로만 본다(N검색은 도구 내부 완결 — 사고패널 step 1개).
 *
 * 패턴: exampleTool/dartTool 동일 — `tool()` from langchain, zod^4
 * (R1), 실행함수 Promise<string>, graceful 실패(throw 0 — NFR-18).
 * 심볼명(webSearchTool/*DisplayName/*Description) 보존 — import 5곳
 * (index.ts/webSearcher.ts/thinkingLabels.ts 등) 무변경(회귀 0).
 */

// 표시 메타는 경량 모듈로 분리(보안 — 클라이언트가 openai SDK 를
// 번들하지 않도록). 심볼명 보존 위해 여기서 re-export: index.ts 등
// 서버 경로는 기존대로 webSearchTool.ts 에서 import(무변경), 클라
// 이언트(thinkingLabels)는 webSearchTool.meta 에서 직접 import.
export {
  webSearchToolDisplayName,
  webSearchToolDescription,
} from "./webSearchTool.meta";
import { webSearchToolDescription } from "./webSearchTool.meta";

export const webSearchTool = tool(
  async ({ query }: { query: string }): Promise<string> => {
    const q = query?.trim();
    if (!q) {
      // 빈 질의 — 호출 0, 안내(graceful, throw 금지)
      return "검색어가 비어 있어 웹 검색을 건너뜁니다.";
    }
    try {
      const raw = await runWebSearch(q);
      return formatWebSearchContext(raw);
    } catch (e) {
      // runWebSearch 는 자체 graceful(ok:false)이나, 예기치 못한
      // throw 도 도구는 흡수해야 한다(NFR-18 — 에이전트 진행 보장,
      // 내부 에러 메시지 LLM 미노출).
      void e;
      return formatWebSearchContext({ ok: false, reason: "api_error" });
    }
  },
  {
    name: "web_search",
    description: webSearchToolDescription,
    schema: z.object({
      query: z
        .string()
        .describe(
          "검색할 질의. 자연어 그대로(예: '삼성전자 최근 주가', " +
            "'2026년 5월 OpenAI 발표'). OpenAI 가 내부에서 다단계 검색.",
        ),
    }),
  },
);

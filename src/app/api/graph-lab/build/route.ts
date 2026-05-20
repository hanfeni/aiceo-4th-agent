/**
 * 온톨로지 실습 — 그래프 구축 API. POST /api/graph-lab/build (SSE).
 *
 * "그래프 구축" 버튼의 백엔드. 2단계를 순차로 SSE 직렬화한다:
 *   1) ensureNeo4j()  — Docker→Neo4j 컨테이너 보장 (infra* 이벤트)
 *   2) loadGraph()    — SEC EDGAR 서브셋 적재 (load* 이벤트)
 * 인프라 보장이 실패(return false)하면 적재로 넘어가지 않고 중단한다.
 *
 * compare/route.ts 와 동형(SSE 인코딩·헤더·controller 패턴). 재구현 0,
 * lib 제너레이터 호출만 — graphlab 적재 로직은 src/lib/graphlab 에 보유.
 * R7 — Neo4j 드라이버/네이티브 의존 → edge 불가. runtime=nodejs.
 */

import { ensureNeo4j } from "@/lib/graphlab/ensure-infra";
import { loadGraph } from "@/lib/graphlab/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeSse(ev: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`);
}

export async function POST(): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1) 인프라 보장 — 제너레이터의 최종 return(boolean)으로 성공 판정.
        //    for-await 는 return 값을 버리므로 수동 iterator 로 done.value 수신.
        const infra = ensureNeo4j();
        let infraOk = false;
        for (;;) {
          const { value, done } = await infra.next();
          if (done) {
            infraOk = value;
            break;
          }
          controller.enqueue(encodeSse(value));
        }
        if (!infraOk) {
          // ensureNeo4j 가 이미 infra_error 를 yield 했다. 클라이언트가
          // err 상태로 인식하도록 load_error 로 한 번 더 종결 신호를 준다.
          controller.enqueue(
            encodeSse({
              type: "load_error",
              message:
                "Neo4j 준비 실패 — Docker Desktop 실행 여부를 확인하고 버튼을 다시 누르세요.",
            }),
          );
          return;
        }

        // 2) 데이터 적재 — load* 이벤트를 그대로 흘려보낸다.
        for await (const ev of loadGraph()) {
          controller.enqueue(encodeSse(ev));
        }
      } catch (e) {
        controller.enqueue(
          encodeSse({
            type: "load_error",
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

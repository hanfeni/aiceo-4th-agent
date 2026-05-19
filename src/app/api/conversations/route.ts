export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getCheckpointer, type CheckpointerEnv } from "@/lib/agent/harness/checkpointer";
import { listConversationRows } from "@/lib/conversations/list";

/**
 * GET /api/conversations — 과거 대화 목록 (Slice 3 / Plan Critic C2·C3·C10).
 *
 * R7 — SQLite/네이티브 의존 → edge 불가. 최상단 runtime="nodejs" /
 *      dynamic="force-dynamic".
 *
 * C2 — getCheckpointer(env) 는 registry 가 그래프에 주입한 것과 **동일한**
 *      SqliteSaver 싱글톤을 돌려준다(checkpointer.ts globalThis 메모이즈).
 *      별도 DB 핸들을 새로 열지 않으므로 채팅이 쓰는 바로 그 SQLite 를 읽는다.
 *
 * C3 — :memory: 모드(HARNESS_CHECKPOINTER=memory)는 프로세스 메모리에만
 *      존재하고 HMR 시 소실된다. 빈 목록 + mode:"memory" 로 응답해 UI 가
 *      "메모리 모드에서는 대화 기록이 보존되지 않습니다" 를 안내하게 한다.
 *
 * C10 — 채팅 0건/테이블 부재(setup 전)도 listConversationRows 가 빈 배열로
 *      방어. 어떤 경우도 500 으로 터지지 않는다.
 *
 * AD-5(b) — 경로/백엔드는 env 에서만. 요청 입력이 SQLite 접근에 영향 0
 *      (path traversal·thread 위조 0 — GET 은 본문/쿼리 미사용).
 */

function isMemoryBackend(env: CheckpointerEnv): boolean {
  return (env.HARNESS_CHECKPOINTER ?? "sqlite").trim().toLowerCase() === "memory";
}

export async function GET(): Promise<Response> {
  const env = process.env as unknown as CheckpointerEnv;

  // C3 — :memory: 는 파일 영속이 없어 새로고침/HMR 시 사라진다. 빈 목록 +
  // 플래그로 명시(에러 아님 — UI 안내 메시지 분기용).
  if (isMemoryBackend(env)) {
    return Response.json({ conversations: [], mode: "memory" });
  }

  try {
    // getCheckpointer().db = 채팅 그래프와 공유되는 better-sqlite3 핸들(C2).
    // Proxy get-trap 이 첫 .db 접근에 실제 saver 를 1회 생성(AD-2 lazy).
    const saver = getCheckpointer(env);
    const conversations = listConversationRows(saver.db);
    return Response.json({ conversations, mode: "sqlite" });
  } catch (err) {
    // 보안(route.ts 선례): 상세는 서버 로그만, 클라이언트엔 일반 메시지.
    console.error("[/api/conversations] list error:", err);
    return Response.json(
      { conversations: [], mode: "sqlite", error: "대화 목록을 불러오지 못했습니다." },
      { status: 200 },
    );
  }
}

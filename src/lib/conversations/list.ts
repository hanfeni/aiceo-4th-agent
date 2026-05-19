import type { Database } from "better-sqlite3";
import { extractTitle } from "./replay";

/**
 * 대화 목록 DB 어댑터 (Slice 2 / Plan Critic C8·C10).
 *
 * checkpointer 가 쓰는 동일 SQLite(LangGraph checkpoints 테이블)를 **읽기만**
 * 한다. 신규 테이블 0 — "최소 코드" 정책. Database 핸들을 인자로 주입받아
 * (프로덕션: getCheckpointer().db, 테스트: in-memory fixture) 결정적 단위
 * 테스트가 가능하다(replay.ts 와 함께 better-sqlite3 직접 의존은 이 파일뿐).
 *
 * 실측 스키마(docs/notes/conversation-history-probe.md):
 *  checkpoints(thread_id, checkpoint_ns, checkpoint_id[UUIDv6 단조증가],
 *              parent_checkpoint_id, type, checkpoint BLOB[평문 JSON], metadata)
 *  - timestamp 컬럼 없음 → 시각은 BLOB.ts, "최신"은 MAX(checkpoint_id)
 *    (UUIDv6 가 시간정렬 가능하므로 문자열 MAX = 최신 checkpoint).
 *  - thread 의 마지막 checkpoint 에 전체 누적 messages 보존.
 *
 * C10: 채팅 0건/테이블 부재(setup 전)에도 throw 0 — 빈 배열.
 */

export interface ConversationRow {
  /** thread_id = conversationId. 복원 시 그대로 graph thread 로 재사용. */
  id: string;
  /** 첫 HumanMessage 50자(extractTitle). */
  title: string;
  /** 최신 checkpoint 의 BLOB.ts(ISO). 정렬·표시용. */
  ts: string;
  /** 최신 checkpoint 의 messages 길이(목록 보조 표시). */
  messageCount: number;
}

/** checkpoints 테이블 존재 여부(setup 전/빈 DB 방어 — C10). */
function hasCheckpointsTable(db: Database): boolean {
  try {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'",
      )
      .get();
    return !!row;
  } catch {
    return false;
  }
}

/** BLOB(Buffer|string) → 파싱된 checkpoint 객체 또는 null(깨진 행 skip). */
function parseCheckpoint(blob: unknown): { ts?: string; messages?: unknown[] } | null {
  try {
    const text =
      typeof blob === "string"
        ? blob
        : Buffer.isBuffer(blob)
          ? blob.toString("utf8")
          : null;
    if (!text) return null;
    const j = JSON.parse(text) as {
      ts?: string;
      channel_values?: { messages?: unknown };
    };
    const messages = Array.isArray(j.channel_values?.messages)
      ? (j.channel_values?.messages as unknown[])
      : [];
    return { ts: typeof j.ts === "string" ? j.ts : undefined, messages };
  } catch {
    return null;
  }
}

/**
 * thread 별 **최신** checkpoint 1행씩, 최근순(updatedAt DESC) 목록.
 * 최신 판별 = checkpoint_id(UUIDv6) 문자열 MAX. checkpoint_ns 는 ''(루트)
 * 만 대상(서브그래프 ns 제외 — 메인 대화 thread 만).
 */
export function listConversationRows(db: Database): ConversationRow[] {
  if (!hasCheckpointsTable(db)) return [];

  // 각 thread_id 의 최대 checkpoint_id 행만 선택(상관 서브쿼리).
  // UUIDv6 단조증가라 MAX(checkpoint_id) = 최신 checkpoint.
  const sql =
    "SELECT c.thread_id AS threadId, c.checkpoint AS blob " +
    "FROM checkpoints c " +
    "WHERE c.checkpoint_ns = '' " +
    "AND c.checkpoint_id = (" +
    "  SELECT MAX(c2.checkpoint_id) FROM checkpoints c2 " +
    "  WHERE c2.thread_id = c.thread_id AND c2.checkpoint_ns = ''" +
    ")";

  let rows: Array<{ threadId: string; blob: unknown }>;
  try {
    rows = db.prepare(sql).all() as Array<{ threadId: string; blob: unknown }>;
  } catch {
    return [];
  }

  const out: ConversationRow[] = [];
  for (const r of rows) {
    const parsed = parseCheckpoint(r.blob);
    if (!parsed) continue; // 깨진 BLOB skip(C10)
    const messages = parsed.messages ?? [];
    out.push({
      id: r.threadId,
      title: extractTitle(messages),
      ts: parsed.ts ?? "",
      messageCount: messages.length,
    });
  }

  // 최근순: ts(ISO) DESC. ts 누락 행은 뒤로.
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out;
}

/**
 * 단건 thread 의 최신 checkpoint messages[](복원용 raw). 없으면 빈 배열.
 * 복원 변환은 replay.replayMessages 가 담당(이 함수는 raw 추출만).
 */
export function getLatestCheckpointMessages(
  db: Database,
  threadId: string,
): unknown[] {
  if (!hasCheckpointsTable(db)) return [];
  try {
    const row = db
      .prepare(
        "SELECT checkpoint AS blob FROM checkpoints " +
          "WHERE thread_id = ? AND checkpoint_ns = '' " +
          "ORDER BY checkpoint_id DESC LIMIT 1",
      )
      .get(threadId) as { blob: unknown } | undefined;
    if (!row) return [];
    const parsed = parseCheckpoint(row.blob);
    return parsed?.messages ?? [];
  } catch {
    return [];
  }
}

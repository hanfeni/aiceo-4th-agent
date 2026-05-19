import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// Slice 2 — DB 어댑터 단위 테스트. 실 .sqlite 파일 비의존(C8): in-memory
// better-sqlite3 에 실측 스키마(docs/notes/conversation-history-probe.md)를
// 그대로 세팅해 결정적으로 검증. checkpoint 테이블 컬럼/정렬 규칙
// (UUIDv6 checkpoint_id 단조증가 -> 최신 = MAX) 회귀 가드 역할도 겸한다.

import {
  listConversationRows,
  getLatestCheckpointMessages,
} from "@/lib/conversations/list";

type DB = InstanceType<typeof Database>;

function makeDb(): DB {
  const db = new Database(":memory:");
  // 실측 스키마 미러 (checkpointer.ts 가 만드는 LangGraph 스키마와 동일).
  db.exec(
    "CREATE TABLE checkpoints (" +
      "thread_id TEXT NOT NULL," +
      "checkpoint_ns TEXT NOT NULL DEFAULT ''," +
      "checkpoint_id TEXT NOT NULL," +
      "parent_checkpoint_id TEXT," +
      "type TEXT," +
      "checkpoint BLOB," +
      "metadata BLOB," +
      "PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id))",
  );
  return db;
}

function cp(threadId: string, cpId: string, ts: string, messages: unknown[]) {
  const blob = JSON.stringify({
    v: 4,
    id: cpId,
    ts,
    channel_values: { messages },
    channel_versions: {},
    versions_seen: {},
  });
  return { threadId, cpId, ts, blob };
}

function insert(db: DB, row: ReturnType<typeof cp>) {
  db.prepare(
    "INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, type, checkpoint) VALUES (?, '', ?, 'json', ?)",
  ).run(row.threadId, row.cpId, Buffer.from(row.blob, "utf8"));
}

const human = (c: string) => ({
  id: ["langchain_core", "messages", "HumanMessage"],
  kwargs: { content: c },
});

describe("listConversationRows — thread별 최신 checkpoint 요약 (C4/C10)", () => {
  let db: DB;
  beforeEach(() => {
    db = makeDb();
  });

  it("thread 별로 1행, 최신 checkpoint(UUIDv6 MAX)의 ts/messages 기준", () => {
    // UUIDv6 는 단조증가 — ...a < ...b < ...c
    insert(db, cp("t1", "1f00-a", "2026-05-19T00:00:01Z", [human("질문A")]));
    insert(db, cp("t1", "1f00-b", "2026-05-19T00:00:09Z", [human("질문A"), human("추가")]));
    insert(db, cp("t2", "1f00-c", "2026-05-19T00:05:00Z", [human("질문B")]));

    const rows = listConversationRows(db);
    expect(rows).toHaveLength(2); // thread 2개
    const t1 = rows.find((r) => r.id === "t1");
    expect(t1?.ts).toBe("2026-05-19T00:00:09Z"); // 최신 cp(...b)
    expect(t1?.title).toBe("질문A");
  });

  it("최근순(updatedAt DESC) 정렬", () => {
    insert(db, cp("old", "1f00-a", "2026-05-19T00:00:01Z", [human("옛날")]));
    insert(db, cp("new", "1f00-z", "2026-05-19T09:00:00Z", [human("최근")]));
    const rows = listConversationRows(db);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("messageCount 집계(checkpoint messages 길이)", () => {
    insert(db, cp("t1", "1f00-b", "2026-05-19T00:00:09Z", [human("a"), human("b")]));
    const rows = listConversationRows(db);
    expect(rows[0].messageCount).toBe(2);
  });

  it("checkpoints 테이블 부재 → 빈 배열(C10, 크래시 0)", () => {
    const empty = new Database(":memory:");
    expect(listConversationRows(empty)).toEqual([]);
    empty.close();
  });

  it("대화 0건 → 빈 배열", () => {
    expect(listConversationRows(db)).toEqual([]);
  });

  it("깨진 BLOB 행은 skip(다른 정상 thread 는 유지)", () => {
    insert(db, cp("ok", "1f00-a", "2026-05-19T00:00:01Z", [human("정상")]));
    db.prepare(
      "INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, type, checkpoint) VALUES ('broken', '', '1f00-b', 'json', ?)",
    ).run(Buffer.from("not-json{", "utf8"));
    const rows = listConversationRows(db);
    expect(rows.map((r) => r.id)).toContain("ok");
    // broken 은 제목/ts 추출 불가 → skip 또는 fallback. 크래시만 없으면 OK.
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe("getLatestCheckpointMessages — 단건 thread 복원용 messages", () => {
  let db: DB;
  beforeEach(() => {
    db = makeDb();
  });

  it("해당 thread 최신 checkpoint 의 messages 배열 반환", () => {
    insert(db, cp("t1", "1f00-a", "2026-05-19T00:00:01Z", [human("초기")]));
    insert(db, cp("t1", "1f00-c", "2026-05-19T00:00:09Z", [human("초기"), human("최신")]));
    const msgs = getLatestCheckpointMessages(db, "t1");
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs).toHaveLength(2); // 최신 cp(...c)
  });

  it("없는 thread → 빈 배열", () => {
    expect(getLatestCheckpointMessages(db, "nope")).toEqual([]);
  });

  it("테이블 부재 → 빈 배열(C10)", () => {
    const empty = new Database(":memory:");
    expect(getLatestCheckpointMessages(empty, "t1")).toEqual([]);
    empty.close();
  });
});

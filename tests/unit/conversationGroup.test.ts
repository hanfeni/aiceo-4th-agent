import { describe, it, expect } from "vitest";
import { dateGroup, groupConversations } from "@/lib/conversations/group";
import type { ConversationRow } from "@/lib/conversations/list";

// Slice 4 순수 코어 — 날짜 그룹 + 검색 필터. now 주입으로 결정적.
// KST(UTC+9) 기준. 기준시각 = 2026-05-19T05:00:00Z (= KST 05-19 14:00).

const NOW = Date.parse("2026-05-19T05:00:00Z");

const row = (id: string, title: string, ts: string): ConversationRow => ({
  id,
  title,
  ts,
  messageCount: 2,
});

describe("dateGroup — KST 날짜 경계 (전역 시간대 규칙)", () => {
  it("오늘(KST 05-19) → '오늘'", () => {
    expect(dateGroup("2026-05-19T01:00:00Z", NOW)).toBe("오늘"); // KST 10:00
  });

  it("어제(KST 05-18) → '어제'", () => {
    expect(dateGroup("2026-05-18T05:00:00Z", NOW)).toBe("어제");
  });

  it("KST 자정 경계: 2026-05-19T00:00 KST (=05-18T15:00Z) 는 '오늘'", () => {
    expect(dateGroup("2026-05-18T15:00:00Z", NOW)).toBe("오늘");
  });

  it("3일 전 → '지난 7일'", () => {
    expect(dateGroup("2026-05-16T05:00:00Z", NOW)).toBe("지난 7일");
  });

  it("10일 전 → '이전'", () => {
    expect(dateGroup("2026-05-09T05:00:00Z", NOW)).toBe("이전");
  });

  it("불량 ts → '이전' (graceful)", () => {
    expect(dateGroup("", NOW)).toBe("이전");
    expect(dateGroup("not-a-date", NOW)).toBe("이전");
  });
});

describe("groupConversations — 검색 + 그룹화 (디자인 grouped 계약)", () => {
  it("그룹 순서 고정: 오늘 → 어제 → 지난 7일 → 이전, 빈 그룹 제외", () => {
    const rows = [
      row("a", "오늘 대화", "2026-05-19T01:00:00Z"),
      row("b", "어제 대화", "2026-05-18T05:00:00Z"),
      row("c", "옛날 대화", "2026-05-01T05:00:00Z"),
    ];
    const g = groupConversations(rows, "", NOW);
    expect(g.map(([label]) => label)).toEqual(["오늘", "어제", "이전"]); // 지난7일 비어 제외
  });

  it("검색어 title 부분일치(대소문자 무시)", () => {
    const rows = [
      row("a", "삼성전자 분석", "2026-05-19T01:00:00Z"),
      row("b", "LG화학 리포트", "2026-05-19T02:00:00Z"),
    ];
    const g = groupConversations(rows, "삼성", NOW);
    const flat = g.flatMap(([, items]) => items);
    expect(flat).toHaveLength(1);
    expect(flat[0].id).toBe("a");
  });

  it("검색 결과 0건 → 빈 배열", () => {
    const rows = [row("a", "삼성전자", "2026-05-19T01:00:00Z")];
    expect(groupConversations(rows, "없는키워드", NOW)).toEqual([]);
  });

  it("같은 그룹 내 복수 대화 보존(list.ts ts DESC 순서 유지)", () => {
    const rows = [
      row("a", "오늘1", "2026-05-19T03:00:00Z"),
      row("b", "오늘2", "2026-05-19T01:00:00Z"),
    ];
    const g = groupConversations(rows, "", NOW);
    expect(g).toHaveLength(1);
    expect(g[0][0]).toBe("오늘");
    expect(g[0][1].map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(groupConversations([], "", NOW)).toEqual([]);
  });
});

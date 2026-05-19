import type { ConversationRow } from "./list";

/**
 * 대화 목록 날짜 그룹화 + 검색 필터 (Slice 4 순수 코어).
 *
 * 디자인(chat.jsx:23-32 grouped useMemo)은 conversations 에 박힌 c.group
 * 필드로 그룹화했으나, 우리 실 데이터(checkpoint)에는 group 이 없고 ts(ISO)
 * 만 있다. 그래서 ts 를 KST(Asia/Seoul, UTC+9 — 전역 시간대 규칙) 기준
 * "오늘 / 어제 / 지난 7일 / 이전" 으로 동적 분류한다. 디자인의 그룹 라벨
 * 어휘를 그대로 따른다(시각 일관성).
 *
 * 순수 함수(now 주입 가능) — 단위 테스트 결정적. UI 컴포넌트는 이 결과를
 * 그대로 [group, items][] 로 렌더(디자인 ConvHistoryPopover grouped 계약).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 자정(00:00)의 epoch ms. 날짜 경계 비교용. */
function kstMidnight(epochMs: number): number {
  const shifted = epochMs + KST_OFFSET_MS;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStart - KST_OFFSET_MS;
}

export type ConversationGroup = "오늘" | "어제" | "지난 7일" | "이전";

/** ts(ISO) 를 KST 날짜 경계로 그룹 라벨에 매핑. ts 불량 시 "이전". */
export function dateGroup(ts: string, now: number = Date.now()): ConversationGroup {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "이전";
  const todayStart = kstMidnight(now);
  if (t >= todayStart) return "오늘";
  if (t >= todayStart - DAY_MS) return "어제";
  if (t >= todayStart - 7 * DAY_MS) return "지난 7일";
  return "이전";
}

const GROUP_ORDER: ConversationGroup[] = ["오늘", "어제", "지난 7일", "이전"];

/**
 * 검색 필터(title 부분일치, 대소문자 무시 — 디자인 chat.jsx:27) 후
 * 날짜 그룹화. 반환 = [groupLabel, rows][] (디자인 grouped 계약 동일).
 * 그룹 순서는 최신(오늘)→과거(이전) 고정. 빈 그룹은 제외.
 */
export function groupConversations(
  rows: ConversationRow[],
  searchQuery: string,
  now: number = Date.now(),
): Array<[ConversationGroup, ConversationRow[]]> {
  const q = searchQuery.trim().toLowerCase();
  const map = new Map<ConversationGroup, ConversationRow[]>();

  for (const r of rows) {
    if (q && !r.title.toLowerCase().includes(q)) continue;
    const g = dateGroup(r.ts, now);
    const bucket = map.get(g);
    if (bucket) bucket.push(r);
    else map.set(g, [r]);
  }

  // 그룹 순서 고정(최신→과거). rows 는 list.ts 에서 이미 ts DESC 정렬됨.
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [
    g,
    map.get(g) as ConversationRow[],
  ]);
}

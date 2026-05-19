/**
 * recQueries — LLM 응답에서 [REC_QUERY]…[/REC_QUERY] 마커를 본문과
 * 분리하는 순수 함수 (LLM 비의존 → 단위 테스트 가능, NFR-11).
 *
 * 레퍼런스: medigate-new AgentMessage.parseMessageContent 의 rec_query
 * 규칙(여는 정규식 + 종료 태그 indexOf). 단 medigate 는 **비스트리밍**
 * 후처리라 미완 마커를 신경 안 쓴다. 우리는 SSE 스트리밍이라 누적
 * content 가 매 토큰마다 이 함수를 통과하므로, **여는 태그(또는 그
 * 부분 prefix)가 보이면 그 지점부터 본문에서 즉시 절단**해야 사용자
 * 에게 마커·미완 질문이 노출되지 않는다(누출 0 — 우리 환경 추가 요구).
 *
 * store.appendToLastAssistant 가 누적 content 에 대해 이 함수를 호출,
 * body 만 메시지 content 로, recQueries 는 별도 필드로 분리한다.
 */

const OPEN_TAG = "[REC_QUERY]";
const CLOSE_TAG = "[/REC_QUERY]";
const MAX_REC = 3; // 인스트럭션 계약: 정확히 3개(초과분 절단).

export interface SplitResult {
  /** 사용자에게 보일 본문(마커·추천질문 완전 제거). */
  body: string;
  /** 확정된 추천 질문(닫는 태그 도착 전엔 빈 배열). 최대 3개. */
  recQueries: string[];
}

/** 한 질문 줄에서 번호·불릿·따옴표·공백을 정리(medigate 톤 정합). */
function cleanQuestion(line: string): string {
  return line
    .trim()
    .replace(/^[0-9]+[.)]\s*/, "") // "1. " / "2) "
    .replace(/^[-*•]\s*/, "") // "- " / "* " / "• "
    .replace(/^["'“”]+|["'“”]+$/g, "") // 감싼 따옴표
    .trim();
}

/**
 * 누적 content 가 여는 태그의 **부분 prefix** 로 끝나는지 검사한다.
 * 예: content 가 "...본문[REC_QU" 면 "[REC_QU" 는 OPEN_TAG 의 prefix →
 * 마커가 토큰 경계로 쪼개진 중간 상태. 그 시작 위치를 반환(없으면 -1).
 *
 * TODO(learning): 이 부분 prefix 검출 정책을 확정하라 (5~10줄).
 * 핵심 — 너무 짧은 prefix("[" 한 글자)까지 절단하면 본문에 정상적으로
 * 등장하는 "[" (코드·마크다운 링크 등)가 깜빡 사라질 수 있다. 반대로
 * 너무 보수적이면 "[REC_QU" 가 잠깐 노출된다. 트레이드오프:
 *  (a) "[" 부터 모두 prefix 검사 — 가장 안전하나 정상 "[" 오절단 위험
 *  (b) 최소 길이(예: "[REC" 이상)부터만 — 오절단 적으나 짧은 노출 허용
 *  (c) 마지막 줄에서만 prefix 검사 — 본문 중간 "[" 보호
 * 아래는 (b) 골격(>=4글자 prefix). 정책 확정 후 교체.
 */
function partialOpenTagStart(content: string): number {
  // PLACEHOLDER — 사용자가 부분 prefix 검출 정책을 확정할 지점.
  for (let len = OPEN_TAG.length - 1; len >= 4; len--) {
    const prefix = OPEN_TAG.slice(0, len);
    if (content.endsWith(prefix)) {
      return content.length - len;
    }
  }
  return -1;
}

/**
 * content 를 {body, recQueries} 로 분리한다(스트리밍 누적 안전).
 *
 * 1) 완결: OPEN…CLOSE 둘 다 있으면 사이를 줄 단위 split → 최대 3개.
 * 2) 미완(OPEN 만): OPEN 이후 전부 잘라냄(누출 0), recQueries=[].
 * 3) 부분 마커(OPEN prefix 로 끝남): 그 지점부터 잘라냄, recQueries=[].
 * 4) 마커 없음: 그대로.
 */
export function splitRecQueries(content: string): SplitResult {
  const openIdx = content.indexOf(OPEN_TAG);

  if (openIdx === -1) {
    // 완전한 여는 태그는 없음 — 부분 prefix(토큰 쪼개짐)만 방어.
    const partIdx = partialOpenTagStart(content);
    if (partIdx === -1) return { body: content, recQueries: [] };
    return { body: content.slice(0, partIdx).trimEnd(), recQueries: [] };
  }

  const body = content.slice(0, openIdx).trimEnd();
  const closeIdx = content.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length);

  if (closeIdx === -1) {
    // 미완(스트리밍 중) — 닫는 태그 대기. 본문만 노출, 추천 미확정.
    return { body, recQueries: [] };
  }

  const inner = content.slice(openIdx + OPEN_TAG.length, closeIdx);
  const recQueries = inner
    .split("\n")
    .map(cleanQuestion)
    .filter((q) => q.length > 0)
    .slice(0, MAX_REC);
  return { body, recQueries };
}

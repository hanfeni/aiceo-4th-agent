import { describe, it, expect } from "vitest";
import { splitRecQueries } from "@/lib/agent/utils/recQueries";

/**
 * splitRecQueries 단위 테스트 (LLM 비의존 — 순수 함수, NFR-11).
 *
 * 정답지: medigate-new AgentMessage.parseMessageContent 의 rec_query
 * 규칙 + 우리 SSE 스트리밍 추가 요구(여는 태그 즉시 절단 — 누출 0).
 * 마커: [REC_QUERY] … [/REC_QUERY], 줄 단위 질문.
 */
describe("splitRecQueries — 본문/추천질문 분리", () => {
  it("완결: 본문 + 3개 질문 정확 분리, 본문에 마커 0", () => {
    const raw =
      "답변 본문입니다.\n[REC_QUERY]\n첫 질문?\n둘째 질문?\n셋째 질문?\n[/REC_QUERY]";
    const r = splitRecQueries(raw);
    expect(r.body).toBe("답변 본문입니다.");
    expect(r.recQueries).toEqual(["첫 질문?", "둘째 질문?", "셋째 질문?"]);
  });

  it("마커 없음: 본문 그대로, recQueries 빈 배열", () => {
    const r = splitRecQueries("그냥 답변. 추천 없음.");
    expect(r.body).toBe("그냥 답변. 추천 없음.");
    expect(r.recQueries).toEqual([]);
  });

  it("스트리밍 중간(닫는 태그 미도착): 여는 태그부터 본문에서 즉시 절단", () => {
    // 누출 0 — 사용자에게 [REC_QUERY] 와 미완 질문이 보이면 안 됨.
    const r = splitRecQueries("본문 끝.\n[REC_QUERY]\n첫 질문? 둘째 질");
    expect(r.body).toBe("본문 끝.");
    expect(r.recQueries).toEqual([]); // 미확정 — 닫는 태그 전엔 빈 배열
  });

  it("여는 태그가 토큰 경계로 쪼개진 직후(부분 마커)도 본문 미노출", () => {
    // 누적 content 가 "...본문[REC_QU" 처럼 부분 마커로 끝나는 경우.
    const r = splitRecQueries("본문입니다[REC_QU");
    expect(r.body).toBe("본문입니다");
    expect(r.recQueries).toEqual([]);
  });

  it("질문 줄의 번호·불릿·따옴표·공백을 정리", () => {
    const raw =
      "본문.\n[REC_QUERY]\n1. 첫 질문?\n- 둘째 질문?\n  \"셋째 질문?\"  \n[/REC_QUERY]";
    const r = splitRecQueries(raw);
    expect(r.recQueries).toEqual(["첫 질문?", "둘째 질문?", "셋째 질문?"]);
  });

  it("빈 줄·공백 줄은 질문에서 제외", () => {
    const raw = "본문.\n[REC_QUERY]\n\nQ1?\n\n   \nQ2?\n[/REC_QUERY]";
    expect(splitRecQueries(raw).recQueries).toEqual(["Q1?", "Q2?"]);
  });

  it("3개 초과 생성돼도 최대 3개로 제한(인스트럭션 계약)", () => {
    const raw =
      "본문.\n[REC_QUERY]\nA?\nB?\nC?\nD?\nE?\n[/REC_QUERY]";
    expect(splitRecQueries(raw).recQueries).toEqual(["A?", "B?", "C?"]);
  });

  it("본문이 비어도(마커만) 안전 — body 빈 문자열", () => {
    const r = splitRecQueries("[REC_QUERY]\nQ?\n[/REC_QUERY]");
    expect(r.body).toBe("");
    expect(r.recQueries).toEqual(["Q?"]);
  });

  it("마커 내부가 비면 recQueries 빈 배열(잘못된 출력 방어)", () => {
    const r = splitRecQueries("본문.\n[REC_QUERY]\n\n[/REC_QUERY]");
    expect(r.body).toBe("본문.");
    expect(r.recQueries).toEqual([]);
  });
});

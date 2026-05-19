import { describe, it, expect } from "vitest";
import {
  toolDisplayName,
  reasoningTitle,
  toolTitle,
  isInProgress,
} from "@/lib/agent/utils/thinkingLabels";

// 사고 패널 한글 안내문구 생성 — 순수 함수(LLM/React 무관, NFR-11).
// medigate-new useAgentService.ts 규칙 모방:
//   reasoning: order 0 → '질문 분석 중'(완료 '질문 분석'),
//              order≥1 → '결과 분석 중'(완료 '결과 분석')
//   tool:      '{한글라벨} 도구 실행 중'(완료 '{한글라벨} 도구 완료')
// 한글 라벨은 도구 파일 *DisplayName export 에서 수집, 미매핑은
// 원본 도구명 폴백(FR-08 — 새 도구 추가해도 안 깨짐).

describe("toolDisplayName — 도구명 → 한글 라벨", () => {
  it("current_time → '현재 시각'", () => {
    expect(toolDisplayName("current_time")).toBe("현재 시각");
  });

  it("web_search → '웹 검색'", () => {
    expect(toolDisplayName("web_search")).toBe("웹 검색");
  });

  it("미매핑 도구 → 원본 도구명 폴백(FR-08 안전)", () => {
    expect(toolDisplayName("unknown_future_tool")).toBe(
      "unknown_future_tool",
    );
  });

  it("빈 문자열 → '도구' 폴백(빈 제목 방지)", () => {
    expect(toolDisplayName("")).toBe("도구");
  });
});

describe("reasoningTitle — order 기반 사고 단계 제목", () => {
  it("order 0, 진행 중 → '질문 분석 중'", () => {
    expect(reasoningTitle(0, false)).toBe("질문 분석 중");
  });

  it("order 0, 완료 → '질문 분석' ('중' 제거)", () => {
    expect(reasoningTitle(0, true)).toBe("질문 분석");
  });

  it("order 1, 진행 중 → '결과 분석 중'", () => {
    expect(reasoningTitle(1, false)).toBe("결과 분석 중");
  });

  it("order 5, 완료 → '결과 분석'", () => {
    expect(reasoningTitle(5, true)).toBe("결과 분석");
  });
});

describe("toolTitle — 도구 단계 제목", () => {
  it("web_search, 진행 중 → '웹 검색 도구 실행 중'", () => {
    expect(toolTitle("web_search", false)).toBe("웹 검색 도구 실행 중");
  });

  it("web_search, 완료 → '웹 검색 도구 완료'", () => {
    expect(toolTitle("web_search", true)).toBe("웹 검색 도구 완료");
  });

  it("current_time, 진행 중 → '현재 시각 도구 실행 중'", () => {
    expect(toolTitle("current_time", false)).toBe(
      "현재 시각 도구 실행 중",
    );
  });

  it("미매핑 도구, 완료 → '{원본명} 도구 완료'", () => {
    expect(toolTitle("foo_bar", true)).toBe("foo_bar 도구 완료");
  });
});

describe("isInProgress — 제목이 '중'으로 끝나는가(스태틱 ... 부착 판정)", () => {
  it("'질문 분석 중' → true", () => {
    expect(isInProgress("질문 분석 중")).toBe(true);
  });

  it("'웹 검색 도구 실행 중' → true", () => {
    expect(isInProgress("웹 검색 도구 실행 중")).toBe(true);
  });

  it("'질문 분석'(완료) → false", () => {
    expect(isInProgress("질문 분석")).toBe(false);
  });

  it("'웹 검색 도구 완료' → false", () => {
    expect(isInProgress("웹 검색 도구 완료")).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isInProgress("")).toBe(false);
  });
});

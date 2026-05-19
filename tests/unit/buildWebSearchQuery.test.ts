import { describe, it, expect } from "vitest";
import {
  buildWebSearchQuery,
  PERSPECTIVES,
} from "@/lib/dart/analyze-pipeline";

// buildWebSearchQuery 순수 함수 단위 테스트 (웹검색 정성 단계 S2).
//
// 검색→취합 분리 복원: 라우트가 LLM 자율 도구 루프 없이 결정론적으로
// runWebSearch(query) 를 호출. query 는 corpName + 관점라벨 기반의
// 고정 템플릿(정성 의도어 포함). 순수 함수 → 8관점 정답지 fixture.
//
// 매핑(PRD §3.11): FR-29 buildWebSearchQuery / AC-31 query 템플릿.
// 정답지: 템플릿 = `${corpName} ${관점라벨} 관련 최근 뉴스·이슈·리스크`
//   관점라벨은 analyze-pipeline PERSPECTIVE_LABELS 와 동일 SSOT.

const LABELS: Record<string, string> = {
  comprehensive: "종합 분석",
  financial_health: "재무건전성",
  growth: "성장성",
  profitability: "수익성",
  valuation: "밸류에이션",
  governance: "지배구조",
  risk: "리스크",
  workforce: "인력/조직",
};

describe("buildWebSearchQuery (웹검색 정성 단계 — 순수 헬퍼)", () => {
  it("8관점 전부에 대해 고정 템플릿을 생성한다(정답지 fixture)", () => {
    for (const p of PERSPECTIVES) {
      const q = buildWebSearchQuery("삼성전자", p);
      expect(q).toBe(`삼성전자 ${LABELS[p]} 관련 최근 뉴스·이슈·리스크`);
    }
  });

  it("결정론적 — 동일 입력 동일 출력(LLM/IO 0, 순수)", () => {
    const a = buildWebSearchQuery("카카오", "risk");
    const b = buildWebSearchQuery("카카오", "risk");
    expect(a).toBe(b);
    expect(a).toBe("카카오 리스크 관련 최근 뉴스·이슈·리스크");
  });

  it("corpName 은 trim 되어 질의에 반영된다(라우트 입력 정합)", () => {
    expect(buildWebSearchQuery("  네이버  ", "growth")).toBe(
      "네이버 성장성 관련 최근 뉴스·이슈·리스크",
    );
  });

  it("관점 라벨은 analyze-pipeline PERSPECTIVE_LABELS 와 동일 SSOT", () => {
    // workforce 는 라벨에 슬래시 포함 — 그대로 보존(인코딩 변형 0).
    expect(buildWebSearchQuery("LG", "workforce")).toBe(
      "LG 인력/조직 관련 최근 뉴스·이슈·리스크",
    );
  });
});

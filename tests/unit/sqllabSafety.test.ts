/**
 * Text-to-SQL 안전 가드 + CSV 파서 단위 테스트.
 *
 * assertReadOnly 는 강의장 30명이 LLM 생성 SQL 을 실행하는
 * 안전의 핵심 → 우회 시도를 회귀로 굳힌다. parseCsv 는 한국
 * 공공데이터의 따옴표·콤마·한자·BOM 엣지를 검증(LLM/DB 없이
 * 순수 함수만 — model.test.ts 패턴).
 */

import { describe, it, expect } from "vitest";
import { assertReadOnly } from "@/lib/sqllab/text2sql";
import { assertChartSpec } from "@/lib/sqllab/text2sqlChart";
import { parseCsv } from "@/lib/sqllab/load";

describe("assertReadOnly — 읽기 전용 가드", () => {
  it("정상 SELECT 는 통과", () => {
    expect(() =>
      assertReadOnly('SELECT * FROM "sqllab_legal" LIMIT 10'),
    ).not.toThrow();
  });

  it("CTE(WITH) 도 통과", () => {
    expect(() =>
      assertReadOnly('WITH x AS (SELECT 1) SELECT * FROM x'),
    ).not.toThrow();
  });

  it("SELECT 로 시작 안 하면 거부", () => {
    expect(() => assertReadOnly('DROP TABLE "sqllab_legal"')).toThrow();
    expect(() => assertReadOnly("UPDATE t SET a=1")).toThrow();
  });

  it("세미콜론 다중문 거부 (가장 위험한 우회)", () => {
    expect(() =>
      assertReadOnly('SELECT 1; DROP TABLE "sqllab_legal"'),
    ).toThrow(/여러 문장/);
  });

  it("SELECT 내부에 숨긴 위험 키워드도 거부", () => {
    expect(() =>
      assertReadOnly("SELECT 1 WHERE 1=1 UNION SELECT 1; PRAGMA table_info(x)"),
    ).toThrow();
    expect(() =>
      assertReadOnly("SELECT * FROM t WHERE x IN (DELETE FROM t)"),
    ).toThrow(/읽기 전용/);
  });

  it("PRAGMA/ATTACH 단독도 거부", () => {
    expect(() => assertReadOnly("PRAGMA table_info(x)")).toThrow();
    expect(() =>
      assertReadOnly("ATTACH DATABASE 'x.db' AS y"),
    ).toThrow();
  });

  it("대소문자 혼용 우회도 거부", () => {
    expect(() => assertReadOnly("DeLeTe FROM t")).toThrow();
    expect(() =>
      assertReadOnly("select 1; dRoP table t"),
    ).toThrow();
  });
});

describe("parseCsv — 한국 공공데이터 엣지", () => {
  it("기본 헤더+행 파싱", () => {
    const r = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(r).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("따옴표 안의 콤마는 필드 분리 안 함", () => {
    const r = parseCsv('name,desc\n"가나다","서울, 강남구"');
    expect(r[1]).toEqual(["가나다", "서울, 강남구"]);
  });

  it('따옴표 이스케이프("")', () => {
    const r = parseCsv('q\n"그는 ""안녕"" 했다"');
    expect(r[1]).toEqual(['그는 "안녕" 했다']);
  });

  it("따옴표 안의 줄바꿈 보존", () => {
    const r = parseCsv('a,b\n1,"여러\n줄"');
    expect(r[1]).toEqual(["1", "여러\n줄"]);
  });

  it("UTF-8 BOM 제거 (법령 CSV 함정)", () => {
    const r = parseCsv("﻿a,b\n1,2");
    expect(r[0]).toEqual(["a", "b"]);
  });

  it("CRLF 줄바꿈 처리", () => {
    const r = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(r).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("한자·특수문자 값 보존 (법령분야명 第3章 등)", () => {
    const r = parseCsv("법령명,분야\n법률,第3章 賞勳·禮式");
    expect(r[1]).toEqual(["법률", "第3章 賞勳·禮式"]);
  });

  it("빈 줄 무시", () => {
    const r = parseCsv("a,b\n\n1,2\n\n");
    expect(r).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("assertChartSpec — 차트 스펙 화이트리스트+스키마 가드", () => {
  const cols = ["행정동명", "카페수"];

  it("정상 스펙 통과 + 정규화", () => {
    const spec = assertChartSpec(
      { chartType: "bar", x: "행정동명", y: ["카페수"], title: "T" },
      cols,
    );
    expect(spec.chartType).toBe("bar");
    expect(spec.y).toEqual(["카페수"]);
  });

  it("y 가 배열 아닌 단일 문자열도 허용(배열 정규화)", () => {
    const spec = assertChartSpec(
      { chartType: "pie", x: "행정동명", y: "카페수", title: "T" },
      cols,
    );
    expect(spec.y).toEqual(["카페수"]);
  });

  it("허용 외 chartType 거부 (화이트리스트)", () => {
    expect(() =>
      assertChartSpec(
        { chartType: "radar", x: "행정동명", y: ["카페수"] },
        cols,
      ),
    ).toThrow(/허용되지 않은 chartType/);
  });

  it("x 가 결과 컬럼에 없으면 거부 (스키마 대조)", () => {
    expect(() =>
      assertChartSpec(
        { chartType: "bar", x: "없는컬럼", y: ["카페수"] },
        cols,
      ),
    ).toThrow(/x 축 컬럼/);
  });

  it("y 컬럼이 결과에 없으면 거부 (LLM 환각 컬럼 차단)", () => {
    expect(() =>
      assertChartSpec(
        { chartType: "bar", x: "행정동명", y: ["매출액"] },
        cols,
      ),
    ).toThrow(/y 축 컬럼/);
  });

  it("객체가 아니면 거부", () => {
    expect(() => assertChartSpec("bar chart", cols)).toThrow();
    expect(() => assertChartSpec(null, cols)).toThrow();
  });

  it("y 빈 배열 거부", () => {
    expect(() =>
      assertChartSpec(
        { chartType: "bar", x: "행정동명", y: [] },
        cols,
      ),
    ).toThrow(/y 축 컬럼이 비어/);
  });
});

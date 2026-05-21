import { describe, it, expect } from "vitest";
import {
  mapIndices,
  mapTables,
  mergeStores,
  type RawIndexInfo,
  type RawTableInfo,
} from "@/lib/store-explorer/merge";

// 저장소 탐색기 통합 매핑 단위 테스트 (순수 함수, fetch/DB 비의존).
// AC1(두 저장소 통합 목록) / AC5(한쪽 실패 graceful) 커버.
// 검증: 인덱스→StoreItem 매핑, custom(domain 없음) drillable=false,
//       미적재 SQL 테이블 제외, 한쪽 undefined graceful, 정렬 안정.

const idx = (o: Partial<RawIndexInfo>): RawIndexInfo => ({
  index: "searchlab-x",
  docCount: 0,
  ...o,
});
const tbl = (o: Partial<RawTableInfo>): RawTableInfo => ({
  domain: "x",
  label: "X",
  table: "sqllab_x",
  loaded: true,
  rowCount: 0,
  ...o,
});

describe("mapIndices", () => {
  it("domain 있는 인덱스는 drillable=true, 라벨·count 매핑", () => {
    const out = mapIndices([
      idx({ index: "searchlab-finance", domain: "finance", label: "금융", docCount: 300 }),
    ]);
    expect(out).toEqual([
      {
        kind: "opensearch",
        storeId: "searchlab-finance",
        domain: "finance",
        label: "금융",
        count: 300,
        drillable: true,
      },
    ]);
  });

  it("domain 없는(매핑 실패) 인덱스는 drillable=false, label 은 인덱스명 대체", () => {
    const [item] = mapIndices([idx({ index: "searchlab-orphan", domain: undefined, label: undefined })]);
    expect(item.drillable).toBe(false);
    expect(item.label).toBe("searchlab-orphan");
    expect(item.domain).toBeUndefined();
  });

  it("custom 인덱스도 domain 이 있으면 drillable=true", () => {
    const [item] = mapIndices([idx({ index: "searchlab-custom", domain: "custom", label: "내 데이터" })]);
    expect(item.drillable).toBe(true);
  });
});

describe("mapTables", () => {
  it("적재된 테이블만 포함(미적재는 제외)", () => {
    const out = mapTables([
      tbl({ domain: "medical", label: "의료", table: "sqllab_medical", loaded: true, rowCount: 50 }),
      tbl({ domain: "legal", loaded: false, rowCount: 0 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      kind: "sqlite",
      storeId: "sqllab_medical",
      domain: "medical",
      label: "의료",
      count: 50,
      drillable: true,
    });
  });
});

describe("mergeStores", () => {
  it("두 저장소를 합치고 kind(opensearch 먼저)→label 순 정렬", () => {
    const out = mergeStores(
      [idx({ index: "searchlab-policy", domain: "policy", label: "정책" }),
       idx({ index: "searchlab-finance", domain: "finance", label: "금융" })],
      [tbl({ domain: "medical", label: "의료", table: "sqllab_medical", rowCount: 1 })],
    );
    expect(out.map((i) => `${i.kind}:${i.label}`)).toEqual([
      "opensearch:금융",
      "opensearch:정책",
      "sqlite:의료",
    ]);
  });

  it("OpenSearch 실패(undefined)여도 SQLite 만 graceful 반환 — R1", () => {
    const out = mergeStores(undefined, [tbl({ domain: "finance", label: "금융", rowCount: 9 })]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("sqlite");
  });

  it("둘 다 undefined 면 빈 배열", () => {
    expect(mergeStores(undefined, undefined)).toEqual([]);
  });

  it("둘 다 빈 배열이면 빈 배열", () => {
    expect(mergeStores([], [])).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  DART_STAGE_NODES,
  stageColor,
  type StageStatus,
} from "@/components/dart/dartStageNodes";

// dartStageNodes 순수 상수 + stageColor() 단위 테스트 (D14b).
// React/IO/LLM 의존 0 — 순수 데이터·함수라 결정성(같은 입력 → 같은 출력)
// 단언 가능. DartPipelineGraph 가 이 상수 + 런타임 stage 상태로 노드 구동.
//
// 매핑:
//   - D14b 노드-엣지 시각화 정적 정의 (5단계 = SseEvent stage 1..5 1:1)
//   - stage 4(OpenAI 8관점) emphasis:true — 교육 강조(사용자 HITL)
//   - stageColor: 상태(error/done/running/idle) → 색. 상태가 emphasis 지배.

const STATUSES: StageStatus[] = ["idle", "running", "done", "error"];

// ---------------------------------------------------------------------------
// 1. DART_STAGE_NODES 구조 (5단계, 순서, emphasis)
// ---------------------------------------------------------------------------
describe("DART_STAGE_NODES — 5단계 정적 메타 구조", () => {
  it("정확히 5개 노드를 가진다", () => {
    expect(DART_STAGE_NODES).toHaveLength(5);
  });

  it("stage 번호가 1..5 순서대로다 (라우트 emit 순서 1:1)", () => {
    expect(DART_STAGE_NODES.map((n) => n.stage)).toEqual([1, 2, 3, 4, 5]);
  });

  it("stage 4(OpenAI 8관점)만 emphasis:true, 나머지는 false", () => {
    for (const n of DART_STAGE_NODES) {
      expect(n.emphasis).toBe(n.stage === 4);
    }
    // 명시적 단언: emphasis=true 인 노드는 정확히 1개(stage 4)
    const emphasized = DART_STAGE_NODES.filter((n) => n.emphasis);
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].stage).toBe(4);
  });

  it("모든 노드가 비어있지 않은 label 과 hint 를 가진다", () => {
    for (const n of DART_STAGE_NODES) {
      expect(typeof n.label).toBe("string");
      expect(n.label.trim().length).toBeGreaterThan(0);
      expect(typeof n.hint).toBe("string");
      expect(n.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("stage 번호가 중복 없이 유일하다", () => {
    const stages = DART_STAGE_NODES.map((n) => n.stage);
    expect(new Set(stages).size).toBe(stages.length);
  });
});

// ---------------------------------------------------------------------------
// 2. stageColor() — 상태별 분리된 색
// ---------------------------------------------------------------------------
describe("stageColor() — 상태(StageStatus)별 분리된 {border,bg,text}", () => {
  it("border/bg/text 3개 키를 가진 비어있지 않은 색 문자열을 반환한다", () => {
    for (const status of STATUSES) {
      for (const emphasis of [false, true]) {
        const c = stageColor(status, emphasis);
        expect(Object.keys(c).sort()).toEqual(["bg", "border", "text"]);
        expect(c.border.length).toBeGreaterThan(0);
        expect(c.bg.length).toBeGreaterThan(0);
        expect(c.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("4개 상태가 서로 구별되는 색을 반환한다 (emphasis=false 기준)", () => {
    const keys = STATUSES.map((s) => {
      const c = stageColor(s, false);
      return `${c.border}|${c.bg}|${c.text}`;
    });
    // 4개 상태 → 4개 고유 색 조합 (대기/진행/완료/실패 가독성 분리)
    expect(new Set(keys).size).toBe(4);
  });

  it("4개 상태가 서로 구별되는 색을 반환한다 (emphasis=true 기준)", () => {
    const keys = STATUSES.map((s) => {
      const c = stageColor(s, true);
      return `${c.border}|${c.bg}|${c.text}`;
    });
    expect(new Set(keys).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. emphasis 영향 — idle/running 만 차이, done/error 는 상태 지배
// ---------------------------------------------------------------------------
describe("stageColor() — emphasis 영향 (상태가 emphasis 를 지배)", () => {
  it("idle: emphasis=true(보라) ≠ emphasis=false(회색)", () => {
    const off = stageColor("idle", false);
    const on = stageColor("idle", true);
    expect(on).not.toEqual(off);
    // 강조 idle 은 보라 계열 테두리(#a78bfa), 일반 idle 은 회색(#d4d4d8)
    expect(on.border).toBe("#a78bfa");
    expect(off.border).toBe("#d4d4d8");
  });

  it("running: emphasis=true(보라) ≠ emphasis=false(파랑)", () => {
    const off = stageColor("running", false);
    const on = stageColor("running", true);
    expect(on).not.toEqual(off);
    // 강조 running 은 보라(#7c3aed), 일반 running 은 파랑(#2563eb)
    expect(on.border).toBe("#7c3aed");
    expect(off.border).toBe("#2563eb");
  });

  it("done: emphasis 무관 — 동일 색 (상태가 emphasis 지배)", () => {
    expect(stageColor("done", true)).toEqual(stageColor("done", false));
  });

  it("error: emphasis 무관 — 동일 색 (상태가 emphasis 지배)", () => {
    expect(stageColor("error", true)).toEqual(stageColor("error", false));
  });
});

// ---------------------------------------------------------------------------
// 4. 결정성 — 순수 함수 (같은 입력 → 같은 출력)
// ---------------------------------------------------------------------------
describe("stageColor() — 결정성 (순수 함수)", () => {
  it("동일 인자 반복 호출 시 항상 동일한 객체값을 반환한다", () => {
    for (const status of STATUSES) {
      for (const emphasis of [false, true]) {
        const a = stageColor(status, emphasis);
        const b = stageColor(status, emphasis);
        expect(a).toEqual(b);
      }
    }
  });

  it("DART_STAGE_NODES 는 호출 간 동일 참조다 (모듈 상수 불변)", () => {
    // 두 번째 import 도 동일 참조 — 재생성 없음(순수 상수 보증)
    expect(DART_STAGE_NODES).toBe(DART_STAGE_NODES);
    expect(DART_STAGE_NODES).toHaveLength(5);
  });
});

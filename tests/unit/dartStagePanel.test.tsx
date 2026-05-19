import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// DartStagePanel 단위 테스트 (D14c — 노드 클릭 입출력 패널).
//
// 사용자 HITL: 노드 클릭 시 해당 단계의 입력 프롬프트 + 출력 확인.
// LLM 단계(emphasis)는 [SYSTEM]/[USER] 프롬프트 원문 그대로 노출,
// 출력은 마크다운 리포트. 비-LLM 단계는 입출력 모두 짧은 산출물 텍스트.
//
// 검증 계약(architect D14c 설계 PASS):
//   (a) stage=null → 아무것도 렌더 안 함
//   (b) stage 지정 → 라벨/힌트 + INPUT/OUTPUT 섹션
//   (c) 입력은 항상 <pre>(우리 산출물 원문 — 마크다운 렌더 금지,
//       React 텍스트 노드라 XSS 안전). 비-emphasis 출력도 <pre>.
//   (d) emphasis 단계 출력만 ChatMarkdown 경유(LLM 마크다운 — 기존
//       rehype-sanitize XSS 가드 재사용). 마크다운/<pre> 분기는
//       meta.emphasis 기준(stage===4 하드코딩 금지 — 단일 진실원).
//   (e) stage!=null 이나 io 미수신 → 빈/대기 상태(공백 패널 금지)
//   (f) 닫기 → onClose 호출

// ChatMarkdown 모킹: 실제 rehype 파이프라인 대신 입력 content 를
// data-testid 로 노출(이 단위테스트는 "emphasis 출력이 ChatMarkdown
// 으로 전달되는가" 계약만 검증 — sanitize 자체는 ChatMarkdown 단위
// 테스트 책임).
vi.mock("@/components/common/ChatMarkdown", () => ({
  ChatMarkdown: ({ content }: { content: string }): ReactNode => (
    <div data-testid="md">{content}</div>
  ),
}));

import { DartStagePanel } from "@/components/dart/DartStagePanel";
import { DART_STAGE_NODES, type StageIO } from "@/components/dart/dartStageNodes";

const META1 = DART_STAGE_NODES.find((n) => n.stage === 1)!; // 기업 식별 (비LLM)
const META4 = DART_STAGE_NODES.find((n) => n.stage === 4)!; // OpenAI (emphasis)

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DartStagePanel (D14c 노드 클릭 입출력 패널)", () => {
  it("(a) stage=null 이면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <DartStagePanel
        stage={null}
        meta={undefined}
        io={undefined}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("(b) stage 지정 시 라벨/힌트 + 입력/출력 텍스트가 보인다", () => {
    const io: StageIO = {
      status: "done",
      input: "기업명: 삼성전자",
      output: "corp_code: 00126380",
    };
    render(
      <DartStagePanel
        stage={1}
        meta={META1}
        io={io}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(META1.label)).toBeTruthy();
    expect(screen.getByText(META1.hint)).toBeTruthy();
    expect(screen.getByText("기업명: 삼성전자")).toBeTruthy();
    expect(screen.getByText("corp_code: 00126380")).toBeTruthy();
  });

  it("(c) 입력은 마크다운이 아닌 <pre> 원문으로 렌더(특수문자 비해석)", () => {
    // 프롬프트에 마크다운 메타문자가 있어도 그대로 노출돼야 함.
    const raw = "[SYSTEM]\n# 너는 분석가 *강조* `code`\n\n[USER]\n분석해줘";
    render(
      <DartStagePanel
        stage={4}
        meta={META4}
        io={{ status: "running", input: raw }}
        onClose={() => {}}
      />,
    );
    // 원문 그대로(마크다운 헤더/강조 비해석) — 텍스트 노드로 존재.
    const pre = screen.getByText(/# 너는 분석가 \*강조\* `code`/);
    expect(pre).toBeTruthy();
    expect(pre.tagName).toBe("PRE");
    // 입력은 ChatMarkdown 을 거치지 않는다.
    expect(screen.queryByTestId("md")).toBeNull();
  });

  it("(d) emphasis 단계의 출력만 ChatMarkdown 으로 렌더된다", () => {
    render(
      <DartStagePanel
        stage={4}
        meta={META4}
        io={{ status: "done", output: "## 분석 리포트\n- 항목" }}
        onClose={() => {}}
      />,
    );
    const md = screen.getByTestId("md");
    expect(md).toBeTruthy();
    expect(md.textContent).toContain("## 분석 리포트");
  });

  it("(d') 비-emphasis 단계 출력은 ChatMarkdown 이 아닌 <pre>", () => {
    render(
      <DartStagePanel
        stage={1}
        meta={META1}
        io={{ status: "done", output: "corp_code: 00126380" }}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("md")).toBeNull();
    const out = screen.getByText("corp_code: 00126380");
    expect(out.tagName).toBe("PRE");
  });

  it("(e) stage!=null 이나 io 미수신이면 대기 상태를 표시(공백 금지)", () => {
    const { container } = render(
      <DartStagePanel
        stage={5}
        meta={DART_STAGE_NODES.find((n) => n.stage === 5)!}
        io={undefined}
        onClose={() => {}}
      />,
    );
    // 패널 자체는 렌더(공백 아님) + 입력/출력 양 섹션 모두
    // 데이터 없음 안내 문구(공백 패널 금지 — 2개 hint).
    expect(container.firstChild).not.toBeNull();
    const hints = screen.getAllByText(/아직.*데이터.*수신 전/);
    expect(hints.length).toBe(2);
  });

  it("(f) 닫기 버튼 클릭 → onClose 호출", () => {
    const onClose = vi.fn();
    render(
      <DartStagePanel
        stage={1}
        meta={META1}
        io={{ status: "done", input: "기업명: 삼성전자" }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

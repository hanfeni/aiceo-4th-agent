"use client";

import type { CSSProperties, ReactNode } from "react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";
import type { DartStageNodeMeta, StageIO } from "./dartStageNodes";

/**
 * DART 파이프라인 단계 입출력 패널 (교육용 — D14c).
 *
 * DartPipelineGraph 노드 클릭 → DartAnalyzeView 가 선택 stage 의
 * 누적 입출력(stageIO)을 이 패널에 주입. 교육생이 "각 단계에 무엇이
 * 들어가고 무엇이 나오는가"를 단계별로 확인 — 특히 LLM 단계는
 * system+human 프롬프트 원문을 그대로 본다(HITL 핵심 요구).
 *
 * 보안/렌더 경계(architect D14c 설계 PASS):
 *  - 입력(우리 산출물 — 기업명/압축컨텍스트/[SYSTEM]+[USER] 프롬프트)은
 *    항상 <pre>{string} — React 텍스트 노드라 XSS 구조적 안전 +
 *    프롬프트 원문 충실(마크다운 메타문자 비해석. ChatMarkdown 경유 X).
 *  - 출력: emphasis(LLM) 단계만 ChatMarkdown(기존 rehype-raw→
 *    rehype-sanitize XSS 가드 재사용 — 신규 raw HTML 0). 비-LLM
 *    출력(corp_code/길이 등 짧은 산출물)은 <pre> 텍스트.
 *  - 분기 기준 = meta.emphasis(dartStageNodes 단일 진실원 —
 *    stage===4 하드코딩 금지, LLM 단계 추가 시 자동 정합).
 *
 * 상태 0(순수 제어 컴포넌트 — 선택 stage 는 DartAnalyzeView 소유).
 * 신규 CSS 0(DartAnalyzeView 동형 인라인 + .cf-* 규약).
 */

export interface DartStagePanelProps {
  /** 선택된 stage 번호(1..5). null 이면 패널 비표시. */
  stage: number | null;
  /** 선택 stage 의 정적 메타(라벨/힌트/emphasis). */
  meta: DartStageNodeMeta | undefined;
  /** 선택 stage 의 누적 입출력. 미수신이면 undefined. */
  io: StageIO | undefined;
  /** 닫기(선택 해제) 콜백. */
  onClose: () => void;
}

const overlay: CSSProperties = {
  marginBottom: 16,
  border: "1px solid var(--border, #e4e4e7)",
  borderRadius: 10,
  background: "#fff",
  overflow: "hidden",
};
const headRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
  borderBottom: "1px solid var(--border, #e4e4e7)",
  background: "#fafafa",
};
const sectionWrap: CSSProperties = { padding: "14px 16px" };
const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  color: "#71717a",
  textTransform: "uppercase",
  marginBottom: 6,
};
const preBox: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  background: "#f7f7f8",
  border: "1px solid var(--border, #e4e4e7)",
  borderRadius: 8,
  fontSize: 12.5,
  lineHeight: 1.55,
  // 프롬프트 원문 줄바꿈 보존 + 가로 넘침 방지.
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};
const emptyHint: CSSProperties = {
  fontSize: 13,
  color: "#a1a1aa",
  padding: "4px 0",
};

export function DartStagePanel({
  stage,
  meta,
  io,
  onClose,
}: DartStagePanelProps): ReactNode {
  if (stage === null) return null;

  // emphasis(LLM) 단계의 출력만 마크다운 렌더 — 그 외 전부 <pre>.
  const isLlm = meta?.emphasis === true;
  const hasInput = io?.input != null && io.input !== "";
  const hasOutput = io?.output != null && io.output !== "";

  return (
    <div style={overlay} role="region" aria-label="단계 입출력 상세">
      <div style={headRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {isLlm ? "🤖 " : ""}
            {meta?.label ?? `단계 ${stage}`}
          </div>
          {meta?.hint && (
            <div
              style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}
            >
              {meta.hint}
            </div>
          )}
        </div>
        <button
          className="cf-btn"
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
        >
          닫기
        </button>
      </div>

      <div style={sectionWrap}>
        <div style={sectionLabel}>입력</div>
        {hasInput ? (
          // 우리 산출물 — <pre> 원문(React 텍스트 노드, XSS 안전).
          <pre style={preBox}>{io!.input}</pre>
        ) : (
          <div style={emptyHint}>아직 입력 데이터를 수신 전입니다.</div>
        )}
      </div>

      <div style={{ ...sectionWrap, paddingTop: 0 }}>
        <div style={sectionLabel}>출력</div>
        {hasOutput ? (
          isLlm ? (
            // LLM 마크다운 — 검증된 ChatMarkdown(rehype-sanitize) 경유.
            <ChatMarkdown content={io!.output as string} />
          ) : (
            <pre style={preBox}>{io!.output}</pre>
          )
        ) : (
          <div style={emptyHint}>아직 출력 데이터를 수신 전입니다.</div>
        )}
      </div>
    </div>
  );
}

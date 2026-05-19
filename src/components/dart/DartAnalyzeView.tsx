"use client";

import {
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";
import { DartPipelineGraph } from "./DartPipelineGraph";
import { DartStagePanel } from "./DartStagePanel";
// StageIO 는 dartStageNodes(DART 타입 단일 진실원)에서 import —
// DartStagePanel 과 공유(D14c, 중복 interface 제거).
import {
  DART_STAGE_NODES,
  type StageStatus,
  type StageIO,
} from "./dartStageNodes";

/**
 * DART 기업 펀더멘털 분석 전용 폼 UI (고정흐름 — D12).
 *
 * MetaLabView 동형 패턴(client SSE 소비 — fetch→getReader→`\n\n`
 * split→`data:` 파싱→type 분기). /api/dart/analyze(D11, 고정 라우트)
 * 를 호출 — corpName + 8관점 → DART OpenAPI 고정 파이프라인 →
 * OpenAI 8관점 리포트 스트리밍. deepagents/챗 무관(전용 진입점).
 *
 * 보안: 결과는 ChatMarkdown(rehype-raw→rehype-sanitize, secure
 * allowlist) 경유 — XSS 차단(검증된 컴포넌트 재사용, 신규 raw HTML 0).
 * 신규 차트 위젯 0(§1.8 규약 — 스트리밍 텍스트 리포트가 산출물).
 *
 * SseEvent 처리: token(누적 — Strict Mode 중복 방지 함수형 업데이트)
 * / tool_call·tool_result(진행 표시) / done(완료) / error(배너).
 */

const PERSPECTIVES = [
  { key: "comprehensive", label: "종합 분석" },
  { key: "financial_health", label: "재무건전성" },
  { key: "growth", label: "성장성" },
  { key: "profitability", label: "수익성" },
  { key: "valuation", label: "밸류에이션" },
  { key: "governance", label: "지배구조" },
  { key: "risk", label: "리스크" },
  { key: "workforce", label: "인력/조직" },
] as const;

const wrap: CSSProperties = {
  maxWidth: 880,
  margin: "0 auto",
  padding: "24px 20px 64px",
};
const formRow: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 16,
};
// input/select/버튼은 globals.css 의 .cf-field / .cf-select /
// .cf-btn 클래스로 통일(인라인 한계인 :hover / :focus-within ring /
// select 커스텀 화살표를 클래스로 재현 — medigate Control Atoms 정합).
// 레이아웃 인라인(flex/minWidth)만 컴포넌트에 잔류.

export function DartAnalyzeView(): ReactNode {
  const [corpName, setCorpName] = useState("");
  const [perspective, setPerspective] = useState<string>("comprehensive");
  const [result, setResult] = useState("");
  // progress 텍스트 배너 → 노드-엣지 그래프(D14b). stage 이벤트로
  // 단계별 상태+입출력 누적(D14c 노드 클릭 패널이 stageIO 참조).
  const [stageIO, setStageIO] = useState<Record<number, StageIO>>({});
  // D14c: 노드 클릭 시 선택 stage(입출력 패널 열기). null = 닫힘.
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(): Promise<void> {
    if (running) return;
    const name = corpName.trim();
    if (!name) {
      setErr("기업명을 입력해 주세요.");
      return;
    }
    setRunning(true);
    setErr(null);
    setResult("");
    setStageIO({});
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/dart/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ corpName: name, perspective }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `분석 실패 (HTTP ${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "stage") {
            // D14a 라우트 stage 이벤트 → 노드 상태+입출력 누적.
            // status: start→running / done→done / error→error.
            // Strict Mode 2회 호출 방어: 함수형 불변 업데이트.
            const st: StageStatus =
              ev.status === "start"
                ? "running"
                : ev.status === "done"
                  ? "done"
                  : "error";
            setStageIO((m) => ({
              ...m,
              [ev.stage]: {
                status: st,
                // input/output 은 들어온 것만 갱신(다음 이벤트가
                // 덮어쓰지 않게 기존 값 보존 — start 의 input +
                // done 의 output 합성).
                input: ev.input ?? m[ev.stage]?.input,
                output: ev.output ?? m[ev.stage]?.output,
              },
            }));
          } else if (ev.type === "token") {
            // Strict Mode 업데이터 2회 호출 방어: 함수형 누적(외부 변이 0).
            setResult((r) => r + ev.text);
          } else if (ev.type === "tool_call" || ev.type === "tool_result") {
            // D12 호환 이벤트 — 노드-엣지(D14b)가 진행 표시를 대체.
            // 무시(stage 이벤트가 시각화 데이터원).
          } else if (ev.type === "error") {
            setErr(ev.message);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setErr(e instanceof Error ? e.message : "네트워크 오류");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop(): void {
    abortRef.current?.abort();
  }

  return (
    // layout.tsx overflow:hidden+100dvh → 자체 스크롤 컨테이너 필요
    // (search-lab/meta-lab/harness 와 동일 패턴, 챗만 예외).
    // cf-scope--agent: DART 는 "AI 에이전트" 그룹 → 그 안 cf-*
    // (input/select/버튼)이 보라 accent 상속(검색·라벨링은 기본 blue).
    <div
      className="thin-scroll cf-scope--agent"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        DART 기업 펀더멘털 분석
      </h1>
      <p style={{ fontSize: 13, color: "#71717a", marginBottom: 20 }}>
        금융감독원 DART 전자공시 기반 8관점 분석. 실시간 시세는 제공되지
        않으며, 투자 판단의 근거로 사용할 수 없습니다.
      </p>

      <div style={formRow}>
        <input
          className="cf-field"
          style={{ flex: "1 1 220px", minWidth: 200 }}
          placeholder="기업명 (예: 삼성전자)"
          value={corpName}
          onChange={(e) => setCorpName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !running) void run();
          }}
          disabled={running}
          aria-label="분석 대상 기업명"
        />
        <select
          className="cf-field cf-select"
          style={{ flex: "0 0 160px" }}
          value={perspective}
          onChange={(e) => setPerspective(e.target.value)}
          disabled={running}
          aria-label="분석 관점"
        >
          {PERSPECTIVES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {running ? (
          <button className="cf-btn" onClick={stop} type="button">
            중지
          </button>
        ) : (
          <button
            className="cf-btn cf-btn--primary"
            onClick={() => void run()}
            type="button"
          >
            분석
          </button>
        )}
      </div>

      {err && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {err}
        </div>
      )}

      {/* 교육용 노드-엣지 파이프라인 시각화(D14b). 분석 전에도
          5단계 구조를 idle 노드로 항상 표시(교육생이 흐름 미리
          인지) → 분석 중 stage 이벤트로 색 전이. stageStates 는
          stageIO 의 status 만 추출(입출력은 D14c 노드 클릭 패널). */}
      <DartPipelineGraph
        stageStates={Object.fromEntries(
          Object.entries(stageIO).map(([k, v]) => [k, v.status]),
        )}
        onStageClick={setSelectedStage}
      />

      {/* D14c: 노드 클릭 → 해당 단계 입력 프롬프트 + 출력 패널.
          LLM(emphasis) 단계는 system+human 프롬프트 원문/마크다운
          리포트, 비-LLM 은 짧은 산출물 텍스트. stage=null 이면
          DartStagePanel 이 null 반환(미선택 시 비표시). */}
      <DartStagePanel
        stage={selectedStage}
        meta={DART_STAGE_NODES.find((n) => n.stage === selectedStage)}
        io={selectedStage !== null ? stageIO[selectedStage] : undefined}
        onClose={() => setSelectedStage(null)}
      />

      {result && (
        <div
          style={{
            border: "1px solid var(--border, #e4e4e7)",
            borderRadius: 10,
            padding: "18px 22px",
            background: "#fff",
          }}
        >
          <ChatMarkdown content={result} />
        </div>
      )}
      </div>
    </div>
  );
}

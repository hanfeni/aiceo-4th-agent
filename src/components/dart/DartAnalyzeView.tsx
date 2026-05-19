"use client";

import {
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";

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
const inputStyle: CSSProperties = {
  flex: "1 1 220px",
  minWidth: 200,
  padding: "9px 12px",
  border: "1px solid var(--border, #d4d4d8)",
  borderRadius: 8,
  fontSize: 14,
};
const selectStyle: CSSProperties = { ...inputStyle, flex: "0 0 160px" };
const btnStyle = (disabled: boolean): CSSProperties => ({
  padding: "9px 18px",
  borderRadius: 8,
  border: "none",
  background: disabled ? "#a1a1aa" : "var(--agent-500, #4f46e5)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
});

export function DartAnalyzeView(): ReactNode {
  const [corpName, setCorpName] = useState("");
  const [perspective, setPerspective] = useState<string>("comprehensive");
  const [result, setResult] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
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
    setProgress(null);
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
          if (ev.type === "tool_call") {
            setProgress(`DART 공시 데이터 수집 중… (${name})`);
          } else if (ev.type === "tool_result") {
            setProgress("데이터 수집 완료 — 분석 생성 중…");
          } else if (ev.type === "token") {
            // Strict Mode 업데이터 2회 호출 방어: 함수형 누적(외부 변이 0).
            setResult((r) => r + ev.text);
            setProgress(null);
          } else if (ev.type === "done") {
            setProgress(null);
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
          style={inputStyle}
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
          style={selectStyle}
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
          <button style={btnStyle(false)} onClick={stop} type="button">
            중지
          </button>
        ) : (
          <button
            style={btnStyle(false)}
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

      {progress && (
        <div
          style={{
            padding: "10px 14px",
            background: "#f4f4f5",
            borderRadius: 8,
            fontSize: 13,
            color: "#52525b",
            marginBottom: 16,
          }}
        >
          {progress}
        </div>
      )}

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
  );
}

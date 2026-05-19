"use client";

import { useState, useRef, type CSSProperties, type ReactNode } from "react";
import { JsonResultView } from "./JsonResultView";
import { PipelineGraph } from "@/components/common/PipelineGraph";
import type { StageStatus, StageIO } from "@/components/common/pipelineNodes";
import {
  META_STAGE_NODES,
  STEP_TO_STAGE,
} from "./metaStageNodes";
import { StageModal } from "./StageModal";

/**
 * MetaLabView — 메타 스키마/라벨링 실습 (client).
 *
 * 학생이 ①도메인 ②작업 ③문서 수 를 고르고 실행하면 LLM 이 실제로
 * 작동한다. **시스템 인스트럭션을 화면에서 직접 확인**하는 게 실습
 * 핵심(LLM 에게 무엇을 시키는지 노출).
 *
 * 작업별 UX 분기 (사용자 결정 2026-05-19):
 *  - label/discover : 기존 페이드인-아웃 + 완료 후 접이식 (미변경)
 *  - allinone       : DART식 노드 그래프 4단계 + 노드 클릭 모달.
 *    기존 결과 렌더는 모달로 이식되므로 올인원에선 안 띄움.
 *    SSE 도 stage_start/stage_io 로 단계 상태·입출력만 받음.
 */

const DOMAINS = [
  { id: "sangkwon", label: "상권 / 소상공인" },
  { id: "medical", label: "의료 / 제약" },
  { id: "finance", label: "금융 / 연금 / 고용" },
  { id: "legal", label: "법률 / 법령" },
  { id: "policy", label: "정책 / 거버넌스" },
] as const;

const TASKS = [
  {
    id: "label",
    label: "메타 라벨링",
    hint: "문서 1건씩 분류 메타 부착",
  },
  {
    id: "discover",
    label: "스키마 발굴",
    hint: "묶음에서 분류 체계 후보 제안",
  },
  {
    id: "allinone",
    label: "올인원",
    hint: "발굴20×10회 → 수렴 → 분류기픽스 → 실분류5건 (자동 4단계)",
  },
] as const;

const COUNTS = [1, 3, 5, 10] as const;

const card: CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  marginBottom: 16,
};
const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-default)",
  marginBottom: 10,
};
const chipRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

// chip/버튼은 globals.css .cf-pill / .cf-btn 클래스로 통일
// (SearchLabView·DART 와 동일 — "동일 컴포넌트=동일 디자인").

interface DocBlock {
  /** 안정적 고유 key (phase/doc 무관 단조 증가 — key 충돌 0) */
  uid: number;
  /** phase 헤더 여부 (true=단계 구분, false=LLM 결과) */
  phase: boolean;
  title: string;
  text: string;
  done: boolean;
}

/** 빈 stageIO 레코드 (4단계 모두 idle) — 실행 시작마다 리셋 */
function emptyStageIO(): Record<number, StageIO> {
  const r: Record<number, StageIO> = {};
  for (const n of META_STAGE_NODES) r[n.stage] = { status: "idle" };
  return r;
}

export function MetaLabView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [task, setTask] = useState<string>("label");
  const [count, setCount] = useState<number>(3);
  const [system, setSystem] = useState<string>("");
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 올인원 전용: 단계별 입출력(노드 그래프·모달 데이터원)
  const [stageIO, setStageIO] = useState<Record<number, StageIO>>(
    emptyStageIO,
  );
  const [openStage, setOpenStage] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uidRef = useRef(0); // 블록 고유 key 카운터 (충돌 0)

  // 그래프 노드 상태(stage→status). stageIO 에서 파생.
  const stageStates: Record<number, StageStatus> = {};
  for (const n of META_STAGE_NODES) {
    stageStates[n.stage] = stageIO[n.stage]?.status ?? "idle";
  }

  async function run(): Promise<void> {
    if (running) return;
    const isAllInOne = task === "allinone";
    setRunning(true);
    setErr(null);
    setSystem("");
    setBlocks([]);
    setStageIO(emptyStageIO());
    setOpenStage(null);
    uidRef.current = 0;
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/meta-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // allinone 은 발굴20×10·실분류5 고정 → count 미전송.
        body: JSON.stringify(
          isAllInOne ? { domain, task } : { domain, task, count },
        ),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `실행 실패 (HTTP ${res.status})`);
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
          if (ev.type === "system") {
            setSystem(ev.text);
          } else if (ev.type === "stage_start") {
            // 올인원: 단계 시작 → 그 노드 running
            const st = STEP_TO_STAGE[ev.step];
            if (st)
              setStageIO((s) => ({
                ...s,
                [st]: { ...s[st], status: "running" },
              }));
          } else if (ev.type === "stage_io") {
            // 올인원: 단계 완료 → 입출력 확정 + done.
            // cases 있으면(발굴·실분류) 모달이 스와이프, 없으면 단일.
            const st = STEP_TO_STAGE[ev.step];
            if (st)
              setStageIO((s) => ({
                ...s,
                [st]: {
                  status: "done",
                  input: ev.input,
                  output: ev.output,
                  cases: ev.cases,
                },
              }));
          } else if (ev.type === "phase") {
            // label/discover 단계 헤더 (올인원은 phase 미사용,
            // 단 코퍼스 부족 warn 은 phase 로 옴 → 에러로 표면화)
            if (ev.step === "warn") {
              setErr(ev.text);
            } else {
              setBlocks((b) => [
                ...b,
                {
                  uid: ++uidRef.current,
                  phase: true,
                  title: ev.text,
                  text: "",
                  done: true,
                },
              ]);
            }
          } else if (ev.type === "doc_start") {
            setBlocks((b) => [
              ...b,
              {
                uid: ++uidRef.current,
                phase: false,
                title: ev.title,
                text: "",
                done: false,
              },
            ]);
          } else if (ev.type === "token") {
            // 불변 업데이트(원소 객체까지 새로). [...b] 만 하면 원소는
            // 공유 참조 → last.text += 는 외부 변이. React Strict Mode
            // 가 업데이터를 2회 호출(순수성 검사)하면 토큰이 2번 누적돼
            // "domaindomain" 중복. map 으로 해당 원소만 새 객체 교체.
            setBlocks((b) =>
              b.map((blk, i) =>
                i === b.length - 1
                  ? { ...blk, text: blk.text + ev.text }
                  : blk,
              ),
            );
          } else if (ev.type === "doc_end") {
            setBlocks((b) =>
              b.map((blk, i) =>
                i === b.length - 1 ? { ...blk, done: true } : blk,
              ),
            );
          } else if (ev.type === "error") {
            setErr(ev.message);
            // 올인원: 실행 중이던 단계 error 로 (마지막 running)
            setStageIO((s) => {
              const next = { ...s };
              for (const n of META_STAGE_NODES) {
                if (next[n.stage]?.status === "running") {
                  next[n.stage] = { ...next[n.stage], status: "error" };
                }
              }
              return next;
            });
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
    setRunning(false);
  }

  const isAllInOne = task === "allinone";

  return (
    // layout.tsx overflow:hidden+100dvh → 자체 스크롤 컨테이너 필요
    // (ChatPanel 선례). .thin-scroll 재사용(기존 클래스).
    <div
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
      <h1
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "var(--text-default)",
          marginBottom: 4,
        }}
      >
        메타 스키마 · 라벨링 실습
      </h1>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--text-subtle)",
          marginBottom: 20,
        }}
      >
        LLM 이 실제로 작동하며 문서에 메타를 붙이거나(라벨링) 분류
        체계를 제안하는(스키마 발굴) 모습을 직접 봅니다. 아래에서
        LLM 에게 주는 시스템 인스트럭션도 그대로 확인됩니다.
      </p>

      <div style={card}>
        <div style={sectionTitle}>① 도메인</div>
        <div style={chipRow}>
          {DOMAINS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="cf-pill"
              aria-pressed={domain === d.id}
              onClick={() => setDomain(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>② 작업</div>
        <div style={chipRow}>
          {TASKS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="cf-pill"
              aria-pressed={task === t.id}
              onClick={() => setTask(t.id)}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>③ 문서 수</div>
        {isAllInOne ? (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-subtle)",
              lineHeight: 1.6,
            }}
          >
            올인원은 자동 진행입니다 — ① 발굴 20개씩 ×10회(비복원,
            중복 없음) → ② 10개 결과 수렴 → ③ 분류기 인스트럭션 픽스
            → ④ 실분류 5건. 문서 수는 고정이라 선택 불필요.
          </div>
        ) : (
          <div style={chipRow}>
            {COUNTS.map((c) => (
              <button
                key={c}
                type="button"
                className="cf-pill"
                aria-pressed={count === c}
                onClick={() => setCount(c)}
              >
                {c}건
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 실행 버튼 — 설정 카드 밖 독립 줄(설정 ≠ 액션 시각 분리,
          사용자 요청). 우측 정렬 유지. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        {!running ? (
          <button
            type="button"
            onClick={run}
            className="cf-btn cf-btn--primary"
          >
            실행 (LLM 작동)
          </button>
        ) : (
          <button type="button" onClick={stop} className="cf-btn">
            중지
          </button>
        )}
      </div>

      {system && (
        <div
          style={{
            ...card,
            // medigate t-blue-6 강조 배경(보라 agent → blue 통일)
            background: "var(--t-blue-6)",
          }}
        >
          <div style={sectionTitle}>
            🛈 시스템 인스트럭션 (LLM 에게 주는 지시 — 실습 핵심)
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 11.5,
              lineHeight: 1.55,
              color: "var(--text-subtle)",
              margin: 0,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {system}
          </pre>
        </div>
      )}

      {err && (
        <div
          style={{
            ...card,
            borderColor: "var(--t-danger-8, #e5484d)",
            color: "var(--t-danger-11, #e5484d)",
            fontSize: 12.5,
          }}
        >
          ⚠️ {err}
        </div>
      )}

      {/* ── 올인원: DART식 노드 그래프 + 클릭 모달 ──
          (사용자 결정 2026-05-19) 페이드/접이식 대신 그래프가
          결과 표면. 노드 클릭 → StageModal 로 입출력 확인. */}
      {isAllInOne && (
        <div style={card}>
          <div style={sectionTitle}>
            자동 4단계 파이프라인 (노드를 클릭하면 입력·출력 확인)
          </div>
          <PipelineGraph
            stageNodes={META_STAGE_NODES}
            stageStates={stageStates}
            onStageClick={(st) => setOpenStage(st)}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--text-subtle)",
              lineHeight: 1.6,
            }}
          >
            {META_STAGE_NODES.map((n) => (
              <div key={n.stage}>
                <strong>{n.stage}. {n.label}</strong> — {n.hint}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── label/discover: 기존 페이드인-아웃 (미변경) ── */}
      {!isAllInOne && running && blocks.length > 0 && (() => {
        const b = blocks[blocks.length - 1];
        return (
          <div key={b.uid} className="cf-meta-fade" style={card}>
            <div style={sectionTitle}>
              {b.phase ? "▌ " : b.done ? "✓ " : "▶ "}
              {b.title}
            </div>
            {!b.phase && (
              <>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--text-default)",
                    margin: 0,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {b.text || "…"}
                </pre>
                <JsonResultView raw={b.text} />
              </>
            )}
          </div>
        );
      })()}

      {/* label/discover 완료 후: 결과 아카이브(접힘 시작). */}
      {!isAllInOne && !running && blocks.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>실행 결과 (펼쳐서 확인)</div>
          {blocks.map((b) =>
            b.phase ? (
              <div
                key={b.uid}
                style={{
                  margin: "14px 0 6px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--text-default)",
                }}
              >
                ▌ {b.title}
              </div>
            ) : (
              <details
                key={b.uid}
                style={{
                  borderTop: "1px solid var(--t-neutral-8)",
                  padding: "8px 0",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--text-subtle)",
                  }}
                >
                  {b.done ? "✓ " : "▶ "}
                  {b.title}
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--text-default)",
                    margin: "8px 0 0",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {b.text}
                </pre>
                <JsonResultView raw={b.text} />
              </details>
            ),
          )}
        </div>
      )}
      </div>

      {/* 올인원 노드 클릭 모달 (포털 불필요 — fixed overlay) */}
      {isAllInOne && openStage != null && (() => {
        const meta = META_STAGE_NODES.find((n) => n.stage === openStage);
        if (!meta) return null;
        return (
          <StageModal
            // 단계별 강제 리마운트 → 모달 내부 케이스 인덱스 리셋
            key={openStage}
            meta={meta}
            io={stageIO[openStage] ?? { status: "idle" }}
            onClose={() => setOpenStage(null)}
          />
        );
      })()}
    </div>
  );
}

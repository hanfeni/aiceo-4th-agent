"use client";

import {
  useState,
  useRef,
  useEffect,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";
import { JsonResultView, extractJson } from "./JsonResultView";
import type {
  StageStatus,
  StageIO,
  StageCase,
} from "@/components/common/pipelineNodes";
import {
  META_STAGE_NODES,
  META_LABEL_NODES,
  META_DISCOVER_NODES,
  STEP_TO_STAGE,
} from "./metaStageNodes";
import { StageModal } from "./StageModal";
import {
  StatusPill,
  PipelineNode,
  PipelineConnector,
} from "@/components/common/LabWorkbench";

/**
 * MetaLabView — 메타 스키마/라벨링 실습 (client).
 *
 * 학생이 ①도메인 ②작업 ③문서 수 를 고르고 실행하면 LLM 이 실제로
 * 작동한다. **시스템 인스트럭션을 화면에서 직접 확인**하는 게 실습
 * 핵심(LLM 에게 무엇을 시키는지 노출).
 *
 * 작업별 UX 분기 (사용자 결정 2026-05-19):
 *  - label/discover : 기존 페이드인-아웃 + 완료 후 접이식 (미변경)
 *  - allinone       : DART식 노드 그래프 5단계 + 노드 클릭 모달.
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
    id: "discover",
    label: "스키마 발굴",
    hint: "묶음에서 분류 체계 후보 제안",
  },
  {
    id: "label",
    label: "메타 라벨링",
    hint: "문서 1건씩 분류 메타 부착",
  },
  {
    id: "allinone",
    label: "올인원",
    hint: "발굴20×10회 → 수렴 → 분류기픽스 → 실분류5건 (자동 4단계, 화면 확인만)",
  },
  {
    id: "allinone_index",
    label: "올인원 색인",
    hint: "올인원 4단계 + ⑤ 메타를 OpenSearch 에 동적 색인 (자동 5단계, 검색 실습 메타 필터원)",
  },
] as const;

/**
 * 단발(discover/label) 문서 수. "전체" 제거(사용자 결정 2026-05-21):
 * discover 는 한 묶음이라 전체 시 토큰 폭증, label 도 호출 폭증 위험.
 */
const COUNTS = [1, 3, 5, 10] as const;
type CountValue = (typeof COUNTS)[number];

/**
 * 올인원 발굴 규모 프리셋 — 한 선택으로 발굴 회당·횟수 동시 결정.
 * 기본 = "표준"(20×10=200, 기존 하드코딩값 → 회귀 0).
 */
const ALLINONE_PRESETS = [
  { id: "fast", label: "빠름", perSet: 10, sets: 5, hint: "10×5=50건 발굴" },
  { id: "standard", label: "표준", perSet: 20, sets: 10, hint: "20×10=200건 발굴" },
  { id: "deep", label: "정밀", perSet: 20, sets: 15, hint: "20×15=300건 발굴" },
] as const;
type AllInOnePresetId = (typeof ALLINONE_PRESETS)[number]["id"];

/** discover 발굴 회수 선택지. 1=단일 묶음(기본·기존), >1=분할 병렬. */
const DISCOVER_ROUNDS = [1, 2, 3, 5] as const;

/** 올인원 실분류 건수 선택지. 기본 5(기존값). */
const CLASSIFY_COUNTS = [3, 5, 10] as const;

/** 올인원색인 ⑤ 메타 색인 상한. "all"=발굴 미사용분 전체. 기본 60(기존값). */
const META_LIMITS = [30, 60, "all"] as const;
type MetaLimitValue = (typeof META_LIMITS)[number];

/** 칩 한 줄 공통 스타일(문서수·프리셋·실분류·색인 상한 동일 톤). */
const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 14,
};
/** "전체" 선택 시 비용·시간 경고 문구 스타일. */
const warnHintStyle: CSSProperties = {
  fontSize: 10.5,
  color: "var(--amber-700, #b45309)",
  marginTop: -8,
  marginBottom: 14,
  lineHeight: 1.5,
};

/** discover 출처 글 목록 — 결과 카드 하단 영역. */
const sourceListWrapStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px dashed var(--t-neutral-12)",
};
const sourceListLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--text-subtle)",
  marginBottom: 6,
};
const sourceListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};
const sourceItemStyle: CSSProperties = {
  maxWidth: 260,
  cursor: "pointer",
};
const sourceItemTextStyle: CSSProperties = {
  display: "inline-block",
  maxWidth: 240,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  verticalAlign: "bottom",
};

// chip/버튼·카드는 globals.css .cf-* / .il-* 클래스로 통일
// (실험 B 워크벤치 — "동일 컴포넌트=동일 디자인").

/** discover 출처 문서 1건(제목 리스트 + 모달 전체보기). */
interface SourceDoc {
  docId: string;
  title: string;
  body: string;
}

interface DocBlock {
  /** 안정적 고유 key (phase/doc 무관 단조 증가 — key 충돌 0) */
  uid: number;
  /** phase 헤더 여부 (true=단계 구분, false=LLM 결과) */
  phase: boolean;
  title: string;
  text: string;
  done: boolean;
  /** discover 출처 문서 목록(doc_sources 이벤트). 없으면 미표시. */
  sources?: SourceDoc[];
}

/** 빈 stageIO 레코드 (5단계 모두 idle) — 실행 시작마다 리셋 */
function emptyStageIO(): Record<number, StageIO> {
  const r: Record<number, StageIO> = {};
  for (const n of META_STAGE_NODES) r[n.stage] = { status: "idle" };
  return r;
}

export function MetaLabView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [task, setTask] = useState<string>("discover");
  const [count, setCount] = useState<CountValue>(3);
  // discover 발굴 회수(1=단일 묶음·기본, >1=비복원 분할 병렬).
  const [discoverRounds, setDiscoverRounds] = useState<number>(1);
  // 올인원 규모 — 발굴 프리셋·실분류·색인 상한(작업모드별 문서수 파라미터화).
  const [presetId, setPresetId] = useState<AllInOnePresetId>("standard");
  const [classifyCount, setClassifyCount] = useState<number>(5);
  const [metaLimit, setMetaLimit] = useState<MetaLimitValue>(60);
  const [system, setSystem] = useState<string>("");
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 올인원 전용: 단계별 입출력(노드 그래프·모달 데이터원)
  const [stageIO, setStageIO] = useState<Record<number, StageIO>>(
    emptyStageIO,
  );
  const [openStage, setOpenStage] = useState<number | null>(null);
  // discover 출처 모달 — 선택된 출처 문서(제목 클릭 시 전체 본문).
  const [openSource, setOpenSource] = useState<SourceDoc | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uidRef = useRef(0); // 블록 고유 key 카운터 (충돌 0)
  // 결과 자동스크롤: 페이지 스크롤 컨테이너 ref + "바닥 근처" 추적.
  // 사용자가 위로 올려 과거 결과를 읽는 중이면 따라가지 않음(채팅 표준).
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // 자동스크롤 ①: 스크롤할 때마다 "바닥 근처" 여부 갱신. 위로 올려
  // 과거 결과를 읽는 중(near=false)이면 자동스크롤 안 함.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      nearBottomRef.current = gap < 80; // 80px 이내면 바닥으로 간주
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 자동스크롤 ②: "새 블록 시작" + "콘텐트 분석 완료" 두 시점에만 말단
  // 정렬(사용자 결정 2026-05-21). 토큰 스트리밍 중(text 변경)에는 안 움직임
  // — 의존성을 blocks 전체가 아닌 두 파생 카운트로 좁혀 스트리밍 재실행 0.
  //  · blocks.length      = doc_start(새 카드) 시 증가
  //  · doneCount(완료 수) = doc_end(done:true) 시 증가
  const blockCount = blocks.length;
  const doneCount = blocks.filter((b) => b.done).length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [blockCount, doneCount]);

  // 그래프 노드 상태(stage→status). stageIO 에서 파생.
  const stageStates: Record<number, StageStatus> = {};
  for (const n of META_STAGE_NODES) {
    stageStates[n.stage] = stageIO[n.stage]?.status ?? "idle";
  }

  async function run(): Promise<void> {
    if (running) return;
    const isAllInOne =
      task === "allinone" || task === "allinone_index";
    setRunning(true);
    setErr(null);
    setSystem("");
    setBlocks([]);
    setStageIO(emptyStageIO());
    setOpenStage(null);
    uidRef.current = 0;
    nearBottomRef.current = true; // 새 실행 = 결과 따라가기 의도(리셋)
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // 모드별 파라미터: 단발은 count, 올인원은 발굴 프리셋·실분류
      // (+색인 상한은 allinone_index 만). 미전송 항목은 서버 기본값.
      const preset = ALLINONE_PRESETS.find((p) => p.id === presetId)!;
      const reqBody = isAllInOne
        ? {
            domain,
            task,
            discoverPerSet: preset.perSet,
            discoverSets: preset.sets,
            classifyCount,
            ...(task === "allinone_index" ? { metaLimit } : {}),
          }
        : {
            domain,
            task,
            count,
            // discover 만 회수 전송(label 은 무의미 — 건수=반복).
            ...(task === "discover" ? { discoverRounds } : {}),
          };
      const res = await fetch("/api/meta-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqBody),
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
          } else if (ev.type === "doc_sources") {
            // discover 출처 — 방금 끝난 발굴 블록(마지막)에 문서 목록 부착.
            setBlocks((b) =>
              b.map((blk, i) =>
                i === b.length - 1 ? { ...blk, sources: ev.sources } : blk,
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

  // allinone(④까지) · allinone_index(⑤ 메타색인 포함) 둘 다
  // 그래프+모달 UX. 그래프 노드만 task 별 4 vs 5 로 분기(노드
  // 정의는 1벌, 표시만 슬라이스 — ⑤ 메타색인 노드 idle 잔존 방지).
  const isAllInOne =
    task === "allinone" || task === "allinone_index";
  const graphNodes =
    task === "allinone_index"
      ? META_STAGE_NODES
      : META_STAGE_NODES.slice(0, 4);

  // 작업 메타(현 task) — 좌측 리스트·헤더·hero 요약에 사용.
  const curTask = TASKS.find((t) => t.id === task);
  const curDomain = DOMAINS.find((d) => d.id === domain);
  // ④ 실분류(stage 4)의 케이스 — 시안 SAMPLE_LABEL_CASES 자리에
  // 실제 stageIO 데이터를 꽂는다(목업 금지). 없으면 빈 배열.
  const classifyCases: StageCase[] = stageIO[4]?.cases ?? [];

  // hero 노드그래프 — 실험 B 는 task 무관 항상 표시(레퍼런스 충실,
  // 사용자 결정 2026-05-20). 올인원은 stageStates 로, 단발(label/
  // discover)은 blocks 진행으로 상태 파생. 단발은 클릭 모달 비활성.
  const heroNodes = isAllInOne
    ? graphNodes
    : task === "discover"
      ? META_DISCOVER_NODES
      : META_LABEL_NODES;
  const hasResultBlock = blocks.some((b) => !b.phase);
  const allDone = hasResultBlock && blocks.every((b) => b.phase || b.done);
  const singleStatus: StageStatus = running
    ? "running"
    : allDone
      ? "done"
      : "idle";
  // hero 노드 stage→status (올인원은 파생 stageStates, 단발은 단일 상태).
  const heroState = (stage: number): StageStatus =>
    isAllInOne ? (stageStates[stage] ?? "idle") : singleStatus;

  return (
    // layout.tsx overflow:hidden+100dvh → 자체 스크롤 컨테이너 필요
    // (ChatPanel 선례). .thin-scroll 재사용(기존 클래스).
    <div
      ref={scrollRef}
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div
        style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 24px 64px" }}
      >
        {/* 헤더(시안 LabPage) — accent 칩 + 타이틀 + 서브타이틀 */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--blue-600)",
              textTransform: "uppercase",
              background: "var(--lab-blue-bg-2)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            ③ 검색 · 라벨링 실습
          </span>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-default)",
              margin: "8px 0 0",
              letterSpacing: "-0.015em",
            }}
          >
            메타 스키마 · 라벨링 실습
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-subtle)",
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            LLM 이 실제로 작동하며 문서에 메타를 붙이거나(라벨링) 분류
            체계를 제안하는(스키마 발굴) 모습을 직접 봅니다. 좌측에서
            LLM 에게 주는 시스템 인스트럭션도 그대로 확인됩니다.
          </p>
        </div>

        {/* ── hero 노드그래프(시안 B) — task 무관 항상 표시.
            올인원: 4~5단계 + 노드 클릭 모달. 단발(label/discover):
            단일 노드 + blocks 진행 파생, 클릭 모달 비활성.
            라이트 통일 + 카드 노드 + SVG 화살표 커넥터. */}
        <div className="il-hero">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="il-hero-eyebrow">
                {isAllInOne
                  ? `auto pipeline · ${heroNodes.length} stages`
                  : `${curTask?.label ?? "실행"} · 단발 LLM`}
              </div>
              <div className="il-hero-title">
                {curDomain?.label ?? domain} —{" "}
                {isAllInOne
                  ? "메타 스키마 발굴 → 색인"
                  : (curTask?.label ?? task)}
              </div>
              <div className="il-hero-sub">
                {isAllInOne
                  ? `발굴 ×10회 → 수렴 → 분류기 픽스 → 실분류 5건${task === "allinone_index" ? " → 메타 색인" : ""} · 노드 클릭 → 입력·출력 모달`
                  : "LLM 이 시스템 인스트럭션으로 문서에 메타를 부착합니다 · 결과는 우측 OUTPUT 카드에서 확인"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {running && <StatusPill status="running" />}
              {!running ? (
                <button
                  type="button"
                  onClick={run}
                  className="cf-btn cf-btn--primary"
                >
                  {isAllInOne ? "파이프라인 재실행" : "실행 (LLM 작동)"}
                </button>
              ) : (
                <button type="button" onClick={stop} className="cf-btn">
                  중지
                </button>
              )}
            </div>
          </div>
          <div className="il-pipe">
            {heroNodes.map((n, i) => (
              <Fragment key={n.stage}>
                <PipelineNode
                  node={n}
                  status={heroState(n.stage)}
                  // 모든 노드 클릭 가능 — 입출력 모달(단발은 합성 io).
                  onClick={() => setOpenStage(n.stage)}
                />
                {i < heroNodes.length - 1 && (
                  <PipelineConnector
                    fromStatus={heroState(n.stage)}
                    toStatus={heroState(heroNodes[i + 1].stage)}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="il-bench">
          {/* ─── 좌측: 설정 패널 (sticky) ─── */}
          <div className="il-bench-aside">
            <div className="il-card il-config">
              <div className="il-config-title">실행 설정</div>

              <div className="il-flabel">도메인</div>
              <select
                className="cf-field cf-select"
                style={{ width: "100%", marginBottom: 14 }}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={running}
              >
                {DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>

              <div className="il-flabel">작업 모드</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {TASKS.map((t) => {
                  const isPipe =
                    t.id === "allinone" || t.id === "allinone_index";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="il-domain-btn"
                      aria-pressed={task === t.id}
                      onClick={() => setTask(t.id)}
                      disabled={running}
                      title={t.hint}
                    >
                      <span>{t.label}</span>
                      {isPipe && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: "var(--blue-700)",
                          }}
                        >
                          · auto
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 단발(discover/label): 문서 수(+전체). 전체는 비용 경고.
                  discover 는 추가로 발굴 회수(1회당 N개 × M회). */}
              {!isAllInOne && (
                <>
                  <div className="il-flabel">
                    {task === "discover" ? "1회당 문서 수" : "문서 수"}
                  </div>
                  <div style={pillRowStyle}>
                    {COUNTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="cf-pill"
                        aria-pressed={count === c}
                        onClick={() => setCount(c)}
                        disabled={running}
                      >
                        <span className="il-mono">{c}</span>건
                      </button>
                    ))}
                  </div>

                  {/* discover 발굴 회수 — 올인원 발굴과 동형(회마다 다른
                      비복원 묶음 병렬). 1=단일 묶음(기존). */}
                  {task === "discover" && (
                    <>
                      <div className="il-flabel">발굴 회수</div>
                      <div style={pillRowStyle}>
                        {DISCOVER_ROUNDS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            className="cf-pill"
                            aria-pressed={discoverRounds === r}
                            onClick={() => setDiscoverRounds(r)}
                            disabled={running}
                          >
                            <span className="il-mono">{r}</span>회
                          </button>
                        ))}
                      </div>
                      {discoverRounds > 1 && (
                        <div style={warnHintStyle}>
                          1회당 {count}건 × {discoverRounds}회 = 총{" "}
                          {count * discoverRounds}건을 회마다 다른 묶음으로 병렬
                          발굴(LLM {discoverRounds}회 호출).
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* 올인원/올인원색인: 발굴 규모 프리셋 + 실분류 + (색인 상한). */}
              {isAllInOne && (
                <>
                  <div className="il-flabel">발굴 규모</div>
                  <div style={pillRowStyle}>
                    {ALLINONE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="cf-pill"
                        aria-pressed={presetId === p.id}
                        onClick={() => setPresetId(p.id)}
                        disabled={running}
                        title={p.hint}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="il-flabel">실분류</div>
                  <div style={pillRowStyle}>
                    {CLASSIFY_COUNTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="cf-pill"
                        aria-pressed={classifyCount === c}
                        onClick={() => setClassifyCount(c)}
                        disabled={running}
                      >
                        <span className="il-mono">{c}</span>건
                      </button>
                    ))}
                  </div>

                  {task === "allinone_index" && (
                    <>
                      <div className="il-flabel">색인 상한</div>
                      <div style={pillRowStyle}>
                        {META_LIMITS.map((m) => (
                          <button
                            key={String(m)}
                            type="button"
                            className="cf-pill"
                            aria-pressed={metaLimit === m}
                            onClick={() => setMetaLimit(m)}
                            disabled={running}
                          >
                            {m === "all" ? (
                              "전체"
                            ) : (
                              <>
                                <span className="il-mono">{m}</span>건
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                      {metaLimit === "all" && (
                        <div style={warnHintStyle}>
                          ⚠ 색인 전체는 발굴 미사용분 전부를 분류·임베딩합니다 —
                          시간·비용이 코퍼스 크기에 비례합니다.
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {!running ? (
                <button
                  type="button"
                  className="cf-btn cf-btn--primary"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={run}
                >
                  실행 (LLM 작동)
                </button>
              ) : (
                <button
                  type="button"
                  className="cf-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={stop}
                >
                  중지
                </button>
              )}
            </div>

            {/* 시스템 인스트럭션 카드(시안 B 좌측 하단) */}
            <div
              className="il-card il-config"
              style={{ marginTop: 12 }}
            >
              <div className="il-config-title">
                {isAllInOne
                  ? "현 단계 시스템 인스트럭션"
                  : "시스템 인스트럭션"}
              </div>
              {system ? (
                <pre className="il-code" style={{ maxHeight: 240, overflow: "auto" }}>
                  {system}
                </pre>
              ) : (
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-subtle)",
                    lineHeight: 1.6,
                  }}
                >
                  실행하면 LLM 에게 주는 시스템 인스트럭션이 여기에
                  표시됩니다 — 이 지시가 곧 분류 품질의 상한입니다.
                </div>
              )}
            </div>
          </div>

          {/* ─── 우측: 워크벤치 ─── */}
          <div style={{ minWidth: 0 }}>
            {err && (
              <div className="il-error" style={{ marginBottom: 16 }}>
                ⚠️ {err}
              </div>
            )}

            {/* ── 올인원: OUTPUT 카드(실분류 케이스 = stageIO[4]) +
                노드별 설명. 파이프라인은 hero 에 있으므로 여기엔
                결과만. ── */}
            {isAllInOne ? (
              <>
                <div className="il-card" style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 14,
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span className="il-bench-label">OUTPUT</span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: "var(--text-default)",
                        }}
                      >
                        ④ 실분류 — 케이스별 결과
                      </span>
                    </div>
                    <StatusPill status={stageStates[4]} />
                  </div>

                  {classifyCases.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {classifyCases.map((c, i) => (
                        <CaseCard key={i} item={c} />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-subtle)",
                        padding: "16px 0",
                        textAlign: "center",
                        lineHeight: 1.6,
                      }}
                    >
                      좌측 또는 hero 에서 <strong>실행</strong> 하면
                      실분류 결과가 케이스별로 여기에 쌓입니다. 각 단계
                      입·출력은 위 파이프라인 노드를 클릭해 확인하세요.
                    </div>
                  )}
                </div>

                {/* SCHEMA 카드(시안 MetaLab_B) — ② 수렴된 분류 스키마.
                    실데이터: stageIO[2].output(수렴 단계 LLM 출력). 없으면
                    안내. 시안의 ML_SAMPLE_SCHEMA 목업 대신 실 stageIO. */}
                <div className="il-card">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span className="il-bench-label">SCHEMA</span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: "var(--text-default)",
                        }}
                      >
                        ② 수렴된 분류 스키마
                      </span>
                    </div>
                    <StatusPill status={stageStates[2]} />
                  </div>
                  {stageIO[2]?.output ? (
                    <pre className="il-code">{stageIO[2].output}</pre>
                  ) : (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-subtle)",
                        lineHeight: 1.6,
                        padding: "8px 0",
                      }}
                    >
                      ② 수렴 단계가 완료되면 통합 분류 스키마가 여기에
                      표시됩니다. ② 노드를 클릭하면 입·출력 전체를 확인할 수
                      있습니다.
                    </div>
                  )}
                </div>
              </>
            ) : (
              // ── label/discover: 실험 B 카드 톤 통일(레퍼런스와 일관).
              //    OUTPUT 카드 안에 결과 블록(phase 헤더 + 케이스 카드).
              //    데이터(blocks)·JsonResultView 보존, 시각만 il-* 카드.
              <div className="il-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span className="il-bench-label">OUTPUT</span>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-default)",
                      }}
                    >
                      {curTask?.label ?? "실행"} — 결과
                    </span>
                  </div>
                  {blocks.length > 0 && (
                    <StatusPill status={running ? "running" : "done"} />
                  )}
                </div>

                {blocks.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-subtle)",
                      padding: "20px 0",
                      textAlign: "center",
                      lineHeight: 1.6,
                    }}
                  >
                    좌측에서 도메인·작업·문서 수를 고르고{" "}
                    <strong>실행</strong> 을 누르면 LLM 결과가 여기에 케이스별로
                    쌓입니다.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {blocks.map((b) =>
                      b.phase ? (
                        // 단계 헤더 — 케이스 묶음 구분
                        <div
                          key={b.uid}
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--blue-700)",
                            marginTop: 4,
                          }}
                        >
                          ▌ {b.title}
                        </div>
                      ) : (
                        // 결과 케이스 카드 — 실행 중 마지막 블록은 페이드.
                        <div
                          key={b.uid}
                          className={
                            running && !b.done
                              ? "il-case-card cf-meta-fade"
                              : "il-case-card"
                          }
                          data-active={running && !b.done ? "true" : "false"}
                        >
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: "var(--text-default)",
                              marginBottom: 8,
                            }}
                          >
                            {b.done ? "✓ " : "▶ "}
                            {b.title}
                          </div>
                          <pre className="il-code">{b.text || "…"}</pre>
                          <JsonResultView raw={b.text} />
                          {/* 출처 글 목록 — discover 발굴에 들어간 문서.
                              제목 클릭 시 모달로 전체 본문(누가 출처인지). */}
                          {b.sources && b.sources.length > 0 && (
                            <div style={sourceListWrapStyle}>
                              <div style={sourceListLabelStyle}>
                                출처 글 {b.sources.length}건 (클릭 시 전체 보기)
                              </div>
                              <div style={sourceListStyle}>
                                {b.sources.map((s) => (
                                  <button
                                    key={s.docId}
                                    type="button"
                                    className="cf-pill"
                                    style={sourceItemStyle}
                                    onClick={() => setOpenSource(s)}
                                    title={s.title}
                                  >
                                    <span style={sourceItemTextStyle}>
                                      {s.title}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 노드 클릭 모달 (포털 불필요 — fixed overlay).
          올인원: stageIO[stage] 사용. 단발(label/discover): stageIO 가
          없으므로 system(입력) + blocks(출력 케이스)로 io 를 합성. */}
      {openStage != null &&
        (() => {
          const meta = heroNodes.find((n) => n.stage === openStage);
          if (!meta) return null;
          const io: StageIO = isAllInOne
            ? (stageIO[openStage] ?? { status: "idle" })
            : {
                status: singleStatus,
                input: system || undefined,
                // 결과 블록(phase 제외)을 케이스로 — 여러 문서면 스와이프.
                cases: blocks
                  .filter((b) => !b.phase)
                  .map((b) => ({ label: b.title, text: b.text })),
              };
          return (
            <StageModal
              // 단계별 강제 리마운트 → 모달 내부 케이스 인덱스 리셋
              key={openStage}
              meta={meta}
              io={io}
              onClose={() => setOpenStage(null)}
            />
          );
        })()}

      {/* discover/label 출처 글 모달 — 제목 클릭 시 전체 본문(누가 출처인지). */}
      {openSource && (
        <SourceModal source={openSource} onClose={() => setOpenSource(null)} />
      )}
    </div>
  );
}

/** discover/label 출처 문서 전체보기 모달(fixed overlay — StageModal 톤 동형). */
function SourceModal({
  source,
  onClose,
}: {
  source: SourceDoc;
  onClose: () => void;
}): ReactNode {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "rgba(15,23,42,0.45)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          borderRadius: "var(--r-lg, 12px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--t-neutral-8)",
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
              출처 글 · {source.docId}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-default)",
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {source.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid var(--t-neutral-8)",
              background: "var(--surface-default)",
              color: "var(--text-subtle)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div
          className="thin-scroll"
          style={{
            overflowY: "auto",
            padding: "16px 20px",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--text-default)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {source.body || "(본문 없음)"}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CaseCard — 실분류 1건 카드(시안 il-case-card + LabelChip).
// 데이터원: stageIO[4].cases[i].text (LLM raw JSON). extractJson 으로
// 파싱 성공하면 원시값(string/number/boolean) 필드를 LabelChip 으로,
// 실패하면 raw 텍스트를 그대로 보여준다(목업 SAMPLE 금지).
// ─────────────────────────────────────────────────────────────
function CaseCard({ item }: { item: StageCase }): ReactNode {
  const parsed = extractJson(item.text);
  // 칩으로 표시할 원시값 필드만 추출(중첩 객체·배열은 제외 — JSON 뷰어용).
  const chips: { k: string; v: string }[] =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.entries(parsed as Record<string, unknown>)
          .filter(
            ([, v]) =>
              typeof v === "string" ||
              typeof v === "number" ||
              typeof v === "boolean",
          )
          .map(([k, v]) => ({ k, v: String(v) }))
      : [];
  return (
    <div className="il-case-card">
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: "var(--text-default)",
          marginBottom: chips.length > 0 ? 8 : 0,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </div>
      {chips.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => (
            <span key={c.k} className="il-label-chip">
              <span className="il-label-chip-k">{c.k}</span>
              <span className="il-label-chip-v">{c.v}</span>
            </span>
          ))}
        </div>
      ) : (
        <pre className="il-code" style={{ marginTop: 8 }}>
          {item.text || "…"}
        </pre>
      )}
    </div>
  );
}

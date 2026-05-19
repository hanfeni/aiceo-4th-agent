"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";
import { formatDuration } from "@/lib/agent/utils/formatDuration";
import { ioSummary, needsFold } from "@/lib/agent/utils/ioSummary";
import { isInProgress } from "@/lib/agent/utils/thinkingLabels";
import { selectLiveSteps } from "@/lib/agent/utils/liveSteps";
import { useThinkingLabelCycler } from "@/components/common/useThinkingLabelCycler";
import type { ThinkingStep } from "@/types";

/**
 * ThinkingPanel — 디자인 "A · 인라인 미니멀" + 두 레퍼런스
 * (medigate-manager/new ThinkingPanel) 상태 머신을 모방한다.
 *
 * 데이터: 단일 thinkingSteps[] — reasoning step 과 tool step 이
 * **발생 순서대로 한 배열에** 섞여 교차(사고→도구→사고→도구)가
 * 보존된다(store reduceReasoning/reduceToolCall). FR-09 유지(본문과
 * 분리 채널 — extractThinking/extractToolCalls/extractToolOutputs).
 *
 * 실시간 vs 히스토리 (medigate StreamingView/HistoryView):
 *  - 스트리밍 중(사용자 미조작): **마지막 step 만** 표시 → 단계가
 *    진행될 때마다 화면이 교체(리플레이스). 자동 펼침.
 *  - 완료(또는 사용자 토글): **전체 step 누적** 표시. 토글로 열람.
 *  - 토글 버튼은 step 이 한 번이라도 생기면 영속(완료 후 안 사라짐).
 *
 * 사고 텍스트도 마크다운(ChatMarkdown rehype-sanitize — XSS/FR-09)
 * + 사고 톤(12.5px italic gray, 헤딩 not-italic) + 단일개행 hard
 * break 전처리(medigate-new ThinkingMarkdown 모방).
 */

export interface ThinkingPanelProps {
  /** 시간순 사고 step(reasoning/tool 교차). 비면 패널 미표시. */
  steps: ThinkingStep[];
  /** 스트리밍 중이면 실시간 뷰(마지막 step 리플레이스)+진행 표시. */
  streaming: boolean;
  /**
   * Slice M — 답변 본문 출력 중인가(직전 SSE 이벤트가 token).
   * true 면 **스트리밍 중 사고 패널을 노출하지 않는다**(사용자
   * 규칙: 출력 중엔 숨김). 출력이 멈추고 사고/도구가 재개되면
   * false 로 바뀌어 다시 표시(동적 토글). 완료 후(streaming=false)
   * 엔 무관 — 토글 열람 모드. 미전달 시 false(기존 동작 호환).
   */
  outputting?: boolean;
}

function DotPulse(): ReactNode {
  // 부모(헤더 버튼)는 flex+alignItems:center. 점 3개를 감싸는 래퍼는
  // 텍스트 line-height 와 같은 광학 높이를 갖도록 inline-flex +
  // alignItems:center 로 점을 세로 중앙에 고정한다(verticalAlign 은
  // flex 컨텍스트에서 무시되므로 제거 — 텍스트와 점 어긋남의 원인).
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        height: "1em",
        lineHeight: 1,
      }}
    >
      {[0, 0.15, 0.3].map((d) => (
        <span
          key={d}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "currentColor",
            animation: `pulse 1.2s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

/** 사고 텍스트 전처리 — 단일 개행 → hard break(medigate-new). */
function preprocessThinking(text: string): string {
  return text.replace(/~~/g, "").replace(/(?<!\n)\n(?!\n)/g, "  \n");
}

const THINKING_MD_CLASS =
  "text-[12.5px] italic leading-[1.7] !text-[color:var(--neutral-600)] " +
  "[&_h1]:not-italic [&_h2]:not-italic [&_h3]:not-italic " +
  "[&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[13px] " +
  "[&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1 " +
  "[&_strong]:not-italic [&_strong]:font-semibold " +
  "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_code]:not-italic";

/**
 * reasoning step 본문 (디자인 StepInline reasoning 인용 :152-158).
 * medigate-new useAgentService 모방: 제목은 reducer 가 order 기반
 * 한글 안내문구로 생성('질문 분석 중' / '결과 분석 중'). 영문
 * reasoning 텍스트는 제목이 아니라 content(본문)에 그대로 렌더.
 *
 * 진행 표시: 제목이 '… 중'으로 끝나면(isInProgress) 그 뒤에 **스태틱
 * '...'** 를 텍스트로 붙인다(사용자 요구 — 점 애니메이션 컴포넌트
 * 아님, 컨테이너 밖 제목 라인에). 완료되면 reducer 가 '중' 을 뗀
 * 제목으로 바꾸므로 자동으로 '...' 도 사라진다(상태=제목 텍스트).
 */
function ReasoningBlock({
  title,
  content,
}: {
  title: string;
  content: string;
}): ReactNode {
  const inProgress = isInProgress(title);
  return (
    <div>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--text-default)",
          marginBottom: 6,
        }}
      >
        {title}
        {inProgress && <span aria-hidden> ...</span>}
      </div>
      {content.trim().length > 0 && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            background: "rgba(156,163,175,0.10)",
            color: "var(--neutral-600)",
          }}
        >
          <ChatMarkdown
            content={preprocessThinking(content)}
            className={THINKING_MD_CLASS}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 접을 수 있는 I/O 값 (medigate-new IOPairPrimitives.FoldableValue
 * 모방). 한 줄 요약(ioSummary)만 노출하고, 정보가 잘렸으면(needsFold)
 * ▽ 토글로 원문 전체를 <pre> 펼침. 짧으면 요약만(클릭 불가).
 * 사용자 요구: "I/O 는 간단히 표기하고 누르면 확장".
 */
function FoldableValue({ raw }: { raw: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const summary = ioSummary(raw);
  const foldable = needsFold(raw);

  // 접힌 요약은 패널 폭에 맞춰 무조건 1줄 + 말줄임(…). ioSummary 가
  // 120자에서 자르지만 패널 폭은 가변이라 CSS 로 한 줄 강제(사용자
  // 요구: "폴딩 전 I/O 각각 한 줄, 길어지면 말줄임").
  const oneLine: React.CSSProperties = {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  if (!foldable) {
    return (
      <span
        style={{ ...oneLine, fontSize: 12, color: "var(--neutral-600)" }}
      >
        {summary}
      </span>
    );
  }
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{
          fontSize: 12,
          color: "var(--neutral-600)",
          cursor: "pointer",
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          minWidth: 0,
        }}
        aria-expanded={open}
      >
        {/* 요약 텍스트만 한 줄+말줄임(…), ▼ 아이콘은 고정폭 분리.
            펼침(open) 시엔 전체 <pre> 가 따로 나오므로 요약은 항상
            1줄 유지(사용자 요구: 폴딩 전 한 줄). */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </span>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            fontSize: 10,
            color: "var(--neutral-600)",
            opacity: 0.7,
          }}
        >
          {open ? "▲" : "▼"}
        </span>
      </span>
      {open && (
        <pre
          style={{
            marginTop: 6,
            padding: 8,
            background: "rgba(156,163,175,0.12)",
            border: "1px solid var(--t-neutral-8)",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--neutral-600)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {raw}
        </pre>
      )}
    </span>
  );
}

/** tool step IN/OUT (디자인 IOMini :168-197) + 서브타이틀. */
function ToolBlock({
  step,
}: {
  step: Extract<ThinkingStep, { kind: "tool" }>;
}): ReactNode {
  const ioCell: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "44px 1fr",
    gap: 10,
    alignItems: "baseline",
    padding: "7px 10px",
  };
  const ioLabel: React.CSSProperties = {
    fontSize: 10,
    color: "var(--neutral-600)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    textAlign: "right",
  };
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--text-default)",
          marginBottom: 6,
        }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          {step.title || step.name}
          {isInProgress(step.title) && <span aria-hidden> ...</span>}
        </span>
        {/* 소요시간 — 제목 줄 우측정렬 배지(OUT 칸 (n초) 대체).
            완료된 step 만 표시(진행 중엔 elapsed 미확정). */}
        {step.result !== undefined && step.elapsedMs !== undefined && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 500,
              color: "var(--neutral-600)",
              opacity: 0.75,
            }}
          >
            {formatDuration(step.elapsedMs)}
          </span>
        )}
      </div>
      <div
        style={{
          background: "rgba(156,163,175,0.10)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div style={ioCell}>
          <span style={ioLabel}>IN</span>
          {/* 도구명 + args 요약을 한 줄에(사용자 요구: 합쳐서 1줄).
              도구명은 고정폭, args 요약은 flex:1 로 패널폭 내 한 줄
              +말줄임(FoldableValue 내부가 nowrap+ellipsis). 펼치면
              FoldableValue 가 <pre> 를 세로로 — 접힘만 한 줄. */}
          <span
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              minWidth: 0,
            }}
          >
            <strong
              style={{
                flexShrink: 0,
                color: "var(--text-default)",
                fontSize: 12,
              }}
            >
              {step.name}
            </strong>
            {step.args && step.args !== "{}" ? (
              <span style={{ flex: 1, minWidth: 0 }}>
                <FoldableValue raw={step.args} />
              </span>
            ) : null}
          </span>
        </div>
        <div style={{ borderTop: "1px solid var(--t-neutral-8)" }} />
        <div style={ioCell}>
          <span style={ioLabel}>OUT</span>
          <span style={{ minWidth: 0 }}>
            {step.result !== undefined ? (
              // 모든 도구 동일 경로 — 요약 한 줄 + 클릭 시 원문 전체
              // 펼침. web_search 는 ClientTool 로 교체되어 정제 string
              // (■ 수행한 검색 / ■ 본문 / ■ 참고 출처 섹션)이 OUT 으로
              // 와 FoldableValue 가 그대로 표시(구조화 가시성 유지 —
              // dartTool 동형, 특수 렌더 불요). 소요시간(n초)은 제목
              // 줄 우측 배지로 이동(OUT 칸 중복 제거).
              <FoldableValue raw={step.result} />
            ) : (
              <span
                style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  opacity: 0.7,
                  color: "var(--neutral-600)",
                }}
              >
                실행 중…
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function StepView({ step }: { step: ThinkingStep }): ReactNode {
  return step.kind === "reasoning" ? (
    <ReasoningBlock title={step.title} content={step.content} />
  ) : (
    <ToolBlock step={step} />
  );
}

export function ThinkingPanel({
  steps,
  streaming,
  outputting = false,
}: ThinkingPanelProps): ReactNode {
  const hasAny = steps.length > 0;

  // userToggled === null → 자동(스트리밍 중 펼침, 완료 접힘).
  // userToggled === bool → 사용자 의도 우선(medigate manualExpand).
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  // 답변 토큰 출력 중(outputting)엔 강제 접힘 — 패널을 제거하지
  // 않고(레이아웃 시프트 0) 접힌 헤더만 자리 유지, 토글 비활성
  // (사용자 요구: '사라지는 게 아니라 폴딩 상태에서 열기 불가').
  // 사고/도구 재개되면 outputting=false → 다시 자동 펼침(동적).
  const streamOutputting = streaming && outputting;
  const autoOpen = streaming && hasAny && !streamOutputting;
  const open = streamOutputting ? false : (userToggled ?? autoOpen);
  const userControlled = userToggled !== null;

  // 스트리밍 중에는 토글을 완전히 비활성(사용자 결정): 실시간엔 자동
  // 펼침 고정, 완료 후에만 접기/펴기 가능. 따라서 핸들러는 streaming
  // 일 때 no-op 이고, chevron(폴딩 마크)도 렌더하지 않는다 — 진행 중
  // 폴딩 상태 표시가 혼란을 주므로(요구사항).
  const handleToggle = (): void => {
    if (streaming) return;
    setUserToggled(!open);
  };

  // 실시간 뷰(사용자 확정 규칙): 마지막=reasoning → 그 1개(도구
  // 영역 즉시 리플레이스). 마지막=tool → 진행 중 + OUT 후 grace(0.6s)
  // 내 tool 을 start 최근 3개 노출(병렬 도구 가시화 — 이전 1개만
  // 보이던 사용자 보고 해소). 판정은 순수 함수 selectLiveSteps,
  // 컴포넌트는 outSeenAt 추적 + grace 만료 리렌더만(상태/타이머).
  const liveMode = streaming && !userControlled;

  // 라이브 visible step 을 이펙트가 계산해 state 로 둔다(렌더는 이
  // state 만 읽어 순수 — ref/Date.now() 렌더 직접사용 회피). 이펙트는
  // 외부 시스템(시간) 동기화: steps 변화 시 OUT 감지 시각 누적 +
  // grace(0.6s) 타이머 1개. 타이머 만료 시에만 setState(콜백 — lint
  // 의 "이펙트 내 동기 setState" 안티패턴 회피, 외부 이벤트 동기화).
  const outSeenAtRef = useRef<Map<number, number>>(new Map());
  const [liveVisible, setLiveVisible] = useState<ThinkingStep[]>([]);

  useEffect(() => {
    if (!liveMode || !hasAny) {
      outSeenAtRef.current = new Map();
      return;
    }
    const seen = outSeenAtRef.current;
    const recompute = (): void => {
      const now = Date.now();
      steps.forEach((s, idx) => {
        if (s.kind === "tool" && s.result !== undefined && !seen.has(idx)) {
          seen.set(idx, now); // OUT 최초 감지 시각(멱등 — 1회만).
        }
      });
      setLiveVisible(selectLiveSteps(steps, seen, now));
    };
    recompute(); // steps 변화 즉시 1회(외부 시간 캡처 — 이펙트 경계).
    // grace 경과 시 재계산 → OUT 후 0.6s 지난 tool 탈락 반영.
    const t = setTimeout(recompute, 620);
    return () => clearTimeout(t);
  }, [steps, liveMode, hasAny]);

  const visibleSteps = liveMode && hasAny ? liveVisible : steps;

  // 상단 토글 라벨을 스트리밍 중 타이핑 순환 문구로 대체(medigate
  // StreamingView 타이틀 위치 모방). 패널이 접혀 있어도 보이는 위치라
  // "작동 중" 신호 전달이 하단보다 효과적. 훅은 조건부 호출 불가 →
  // early return 보다 위에서 호출(rules-of-hooks). streaming 자체를
  // isActive 로 — 사용자가 수동 토글해도 순환 유지(liveMode 아님).
  const cyclingLabel = useThinkingLabelCycler(streaming);

  // 토글 영속: step 이 한 번이라도 생기면 streaming 무관 표시.
  // (모든 훅 호출 이후에 early return — rules-of-hooks 준수.)
  if (!hasAny && !streaming) return null;

  // (이전 Slice M "출력 중 return null 숨김" 폐기 — 사용자 보고:
  //  outputting 이 토큰 흐름 중 true↔false 왕복해 패널이 깜빡이고
  //  답변 텍스트가 위아래 점프(레이아웃 시프트). 이제 제거 대신
  //  open=false 강제(streamOutputting)로 접힌 헤더만 자리 유지 +
  //  토글 비활성 → 레이아웃 안정. 사용자 요구: '사라지는 게 아니라
  //  폴딩 상태에서 열기 불가'.)

  // 라벨 규칙:
  //  - 사고/도구 진행 중(streaming && !outputting): 순환 문구
  //    (cyclingLabel — '뇌 오버클럭 중…' 등 작동 신호).
  //  - 출력 중(streamOutputting): 정적 '답변 과정'. 답변 토큰이
  //    흐르는 동안엔 사고/도구가 안 도는데 순환 문구가 뜨면
  //    어색(사용자 보고). 접힌 헤더는 '답변 과정' 버튼이어야 함.
  //  - 완료(streaming=false): 정적 '답변 과정'(토글 열람).
  // 첫 tick 전 폴백도 '답변 과정'으로 통일(깜빡임 0).
  const label =
    streaming && !streamOutputting
      ? cyclingLabel || "답변 과정"
      : "답변 과정";

  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-disabled={streaming}
        disabled={streaming}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 4px 4px 0",
          border: "none",
          background: "transparent",
          fontSize: 12.5,
          color: "var(--text-subtle)",
          // 스트리밍 중엔 토글 불가 → 클릭 가능 신호(pointer) 제거.
          cursor: streaming ? "default" : "pointer",
          fontWeight: 500,
        }}
      >
        <span>{label}</span>
        {/* 점 펄스 색을 헤더 텍스트(--text-subtle)와 통일 — DotPulse 는
            currentColor 상속이므로 별도 color 오버라이드를 두지 않는다. */}
        {streaming && <DotPulse />}
        {/* 폴딩 마크(chevron)는 스트리밍 중 미렌더 — 실시간엔 자동
            펼침 고정이라 폴딩 상태 표시가 혼란을 준다(요구사항).
            완료 후에만 접기/펴기 마크 노출 → 그때부터 토글 가능. */}
        {!streaming &&
          (open ? (
            <ChevronUp
              size={13}
              style={{ color: "var(--neutral-600)" }}
              aria-hidden
            />
          ) : (
            <ChevronDown
              size={13}
              style={{ color: "var(--neutral-600)" }}
              aria-hidden
            />
          ))}
      </button>
      {open && hasAny && (
        <div
          style={{
            marginTop: 8,
            padding: "14px 16px",
            border: "1px solid var(--t-neutral-8)",
            background: "var(--t-neutral-4)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* 진행/완료 상태는 step.title 텍스트에 인코딩됨('… 중' →
              완료 시 reducer 가 '중' 제거). 별도 active 판정 불필요
              — StepView 가 isInProgress(title)로 스태틱 '...' 표시. */}
          {visibleSteps.map((s, i) => (
            <div key={s.kind === "tool" ? s.id || s.order : s.order}>
              {i > 0 && (
                <div
                  style={{
                    borderTop: "1px dashed var(--t-neutral-12)",
                    marginBottom: 14,
                  }}
                />
              )}
              <StepView step={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ThinkingPanel;

"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";
import { formatDuration } from "@/lib/agent/utils/formatDuration";
import { ioSummary, needsFold } from "@/lib/agent/utils/ioSummary";
import { collectWebSearchRefs } from "@/lib/agent/utils/webSearchRefs";
import { isInProgress } from "@/lib/agent/utils/thinkingLabels";
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
 * web_search 그룹 step 의 IN 전용 렌더 (S3 / Plan Critic 항목5).
 *
 * web_search 는 S2 에서 1 그룹 step 으로 합쳐지고 args 는
 * `{actions:[{type, ...raw필드}]}` 형태다. FoldableValue 에 그대로
 * 넘기면 raw JSON 이 노출돼 못 읽는다. action.type 별로 사람이 읽는
 * 한 줄로 표시. graceful: 비-JSON·미지 type 도 크래시 0(passthrough).
 *
 * R5 경계: find_in_page.pattern 은 모델 추론 산물에 가까우나 사용자
 * 결정(투명성 우선 — docs/notes/ws-id-format-probe.md)으로 표시한다.
 */
function WebSearchActions({ args }: { args: string }): ReactNode {
  let actions: Record<string, unknown>[] = [];
  try {
    const p = JSON.parse(args) as { actions?: unknown };
    if (Array.isArray(p.actions)) {
      actions = p.actions.filter(
        (a): a is Record<string, unknown> =>
          typeof a === "object" && a !== null,
      );
    }
  } catch {
    /* 비-JSON(빈 args 등) — actions 빈 배열 유지 */
  }
  if (actions.length === 0) {
    return (
      <span style={{ fontSize: 12, color: "var(--neutral-600)" }}>
        검색 준비 중…
      </span>
    );
  }
  // action.type → 한 줄 요약. 미지 type 은 type 만(passthrough).
  const describe = (a: Record<string, unknown>): string => {
    const type = typeof a.type === "string" ? a.type : "(unknown)";
    if (type === "search") {
      const qs = Array.isArray(a.queries)
        ? a.queries.filter((q): q is string => typeof q === "string")
        : [];
      return qs.length > 0 ? `🔍 검색: ${qs.join(" / ")}` : "🔍 검색";
    }
    if (type === "open_page") {
      return `📄 페이지 열기: ${typeof a.url === "string" ? a.url : "(url)"}`;
    }
    if (type === "find_in_page") {
      const pat = typeof a.pattern === "string" ? a.pattern : "";
      const u = typeof a.url === "string" ? a.url : "(url)";
      return pat
        ? `🔎 페이지 내 검색: "${pat}" @ ${u}`
        : `🔎 페이지 내 검색 @ ${u}`;
    }
    return `• ${type}`; // 미지 action — passthrough(크래시 0)
  };
  return (
    <span style={{ display: "block", marginTop: 2 }}>
      <span
        style={{ fontSize: 11, color: "var(--neutral-600)", fontWeight: 600 }}
      >
        {actions.length}개 동작
      </span>
      {actions.map((a, i) => (
        <span
          key={i}
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--neutral-600)",
            marginTop: 2,
            wordBreak: "break-all",
          }}
        >
          {describe(a)}
        </span>
      ))}
    </span>
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

  if (!foldable) {
    return (
      <span style={{ fontSize: 12, color: "var(--neutral-600)" }}>
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
          display: "block",
        }}
        aria-expanded={open}
      >
        {summary}
        <span
          aria-hidden
          style={{
            fontSize: 10,
            color: "var(--neutral-600)",
            marginLeft: 4,
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

/**
 * web_search OUT 전용 — 시도한 URL 전부 + 인용 건 [인용] 라벨
 * (사용자 요구: "검색한 URL 모두 출력 + 인용한 것만 별도 라벨").
 * collectWebSearchRefs(순수)로 args(open_page/find URL)+result
 * (url_citation)를 통합. cited 면 강조+[인용], 아니면 [참조].
 * 참조 0(검색만 하고 연 페이지·인용 없음)이면 원문 그대로
 * (FoldableValue) — graceful 폴백.
 */
function WebSearchRefs({
  args,
  result,
}: {
  args: string;
  result: string;
}): ReactNode {
  const refs = collectWebSearchRefs(args, result);
  if (refs.length === 0) {
    // 연 페이지·인용 0 — 원문(상태/메시지) 그대로.
    return <FoldableValue raw={result} />;
  }
  const cited = refs.filter((r) => r.cited).length;
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--neutral-600)",
          fontWeight: 600,
        }}
      >
        참조 {refs.length}건 (인용 {cited}건)
      </span>
      {refs.map((r, i) => (
        <span
          key={i}
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--neutral-600)",
            marginTop: 2,
            wordBreak: "break-all",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              marginRight: 4,
              color: r.cited
                ? "var(--agent-600, #4f46e5)"
                : "var(--neutral-500, #9ca3af)",
            }}
          >
            {r.cited ? "[인용]" : "[참조]"}
          </span>
          {r.title.length > 0 ? `${r.title} — ` : ""}
          {r.url}
        </span>
      ))}
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
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--text-default)",
          marginBottom: 6,
        }}
      >
        {step.title || step.name}
        {isInProgress(step.title) && <span aria-hidden> ...</span>}
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
          <span style={{ minWidth: 0 }}>
            <strong
              style={{ color: "var(--text-default)", fontSize: 12 }}
            >
              {step.name}
            </strong>
            {step.name === "web_search" ? (
              <WebSearchActions args={step.args} />
            ) : step.args && step.args !== "{}" ? (
              <span style={{ display: "block", marginTop: 2 }}>
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
              step.name === "web_search" ? (
                // web_search: 시도 URL 전부 + 인용 [인용]/[참조]
                // 구분(사용자 요구). 비-web_search 는 기존 그대로.
                <WebSearchRefs args={step.args} result={step.result} />
              ) : (
                <FoldableValue raw={step.result} />
              )
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
            {step.result !== undefined &&
              step.elapsedMs !== undefined && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color: "var(--neutral-600)",
                    opacity: 0.75,
                  }}
                >
                  ({formatDuration(step.elapsedMs)})
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
  const autoOpen = streaming && hasAny;
  const open = userToggled ?? autoOpen;
  const userControlled = userToggled !== null;

  // 스트리밍 중에는 토글을 완전히 비활성(사용자 결정): 실시간엔 자동
  // 펼침 고정, 완료 후에만 접기/펴기 가능. 따라서 핸들러는 streaming
  // 일 때 no-op 이고, chevron(폴딩 마크)도 렌더하지 않는다 — 진행 중
  // 폴딩 상태 표시가 혼란을 주므로(요구사항).
  const handleToggle = (): void => {
    if (streaming) return;
    setUserToggled(!open);
  };

  // 실시간 뷰: 스트리밍 중 + 사용자 미조작 → **최근 N개 윈도우**
  // (medigate-manager ThinkingPanel PAGE=3 벤치마킹 — 이전 '마지막
  // 1개 리플레이스'는 web_search 가 O 대기 중 task 가 끼면 사라지는
  // 버그. 사용자 요구: 도구 2개+ 연달아 보여도 됨, 진행 중 도구는
  // O 올 때까지 유지). 히스토리 뷰(완료/사용자토글)는 전체 누적.
  //
  // 보존 규칙: (1) 진행 중(result===undefined) tool step 은 윈도우
  // 밖이어도 항상 포함(O 기다리는 web_search 가 안 사라짐 — medigate
  // '진행 중 도구 안 사라지기'). (2) 그 외 최근 LIVE_WINDOW 개.
  // 원래 순서(order) 유지. web_search 는 S2 에서 1 그룹이라 보통
  // 윈도우 안이지만 (1)이 이중 안전망.
  const LIVE_WINDOW = 3;
  const liveMode = streaming && !userControlled;
  const visibleSteps =
    liveMode && hasAny
      ? (() => {
          const pending = new Set(
            steps
              .map((s, i) =>
                s.kind === "tool" && s.result === undefined ? i : -1,
              )
              .filter((i) => i >= 0),
          );
          const windowStart = Math.max(0, steps.length - LIVE_WINDOW);
          return steps.filter(
            (_, i) => i >= windowStart || pending.has(i),
          );
        })()
      : steps;

  // 상단 토글 라벨을 스트리밍 중 타이핑 순환 문구로 대체(medigate
  // StreamingView 타이틀 위치 모방). 패널이 접혀 있어도 보이는 위치라
  // "작동 중" 신호 전달이 하단보다 효과적. 훅은 조건부 호출 불가 →
  // early return 보다 위에서 호출(rules-of-hooks). streaming 자체를
  // isActive 로 — 사용자가 수동 토글해도 순환 유지(liveMode 아님).
  const cyclingLabel = useThinkingLabelCycler(streaming);

  // 토글 영속: step 이 한 번이라도 생기면 streaming 무관 표시.
  // (모든 훅 호출 이후에 early return — rules-of-hooks 준수.)
  if (!hasAny && !streaming) return null;

  // Slice M — 출력 중 숨김(사용자 규칙: 답변 본문 토큰이 흐르는
  // 동안엔 사고 패널을 노출하지 않음). 스트리밍 중 + outputting
  // 일 때만 숨긴다. 출력이 멈추고 사고/도구가 재개되면 outputting
  // 이 false 가 돼 다시 표시(동적). 완료 후(streaming=false)엔
  // 토글 열람이라 outputting 무관 — 항상 표시.
  if (streaming && outputting) return null;

  // 스트리밍 중에는 순환 레이블이 라벨을 대체. 첫 tick 전(훅이
  // 아직 값 없음)엔 '(진행 중)' 같은 표현이 깜빡이지 않도록
  // 정적 폴백을 완료 후와 동일 톤 '답변 과정'으로 통일(사용자
  // 보고 — '(진행 중)' 깜빡임 제거). 훅은 빈 문자열을 절대
  // 반환 안 하므로(useThinkingLabelCycler) 폴백은 첫 80ms 만.
  const label = streaming ? cyclingLabel || "답변 과정" : "답변 과정";

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

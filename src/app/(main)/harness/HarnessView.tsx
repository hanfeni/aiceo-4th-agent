"use client";

import type { CSSProperties, ReactNode } from "react";
import type { HarnessView as HarnessViewData } from "@/lib/harness-introspect/view";
import { InstructionManager } from "@/components/harness/InstructionManager";
import { SkillManager } from "@/components/harness/SkillManager";
import { SubagentManager } from "@/components/harness/SubagentManager";

/**
 * HarnessView — 하네스 요소 표시 전용 client 컴포넌트 (Slice 2).
 *
 * 데이터는 server page(page.tsx)가 toHarnessView 로 만든 직렬화 안전
 * HarnessViewData props 1개. 자체 fetch/state 없음(정적 표시 — API
 * route 불필요, Plan Critic A1). 디자인 핸드오프에 하네스 화면 스펙이
 * 없으므로(스펙 외 UI) 기존 디자인 토큰(--surface/--text/--agent/--r-*)
 * 으로 ChatPanel 과 시각 일관성만 맞춘다. 스펙 추가 판단은 구현하지
 * 않고 docs/notes/ui-suggestions.md 기록 대상(CLAUDE.md 작업 원칙).
 */

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
  letterSpacing: "-0.01em",
  marginBottom: 4,
};

const sectionDesc: CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-subtle)",
  marginBottom: 14,
};

const badge = (on: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  // 하네스는 "AI 에이전트" 그룹 → 그룹 고유색 보라(agent) 유지.
  // (blue 통일은 "검색·라벨링 실습" 그룹 전용 — 그룹 색 규칙).
  background: on
    ? "color-mix(in srgb, var(--agent-500) 14%, transparent)"
    : "var(--t-neutral-8)",
  color: on ? "var(--agent-700)" : "var(--text-subtle)",
});

const kindChip: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--t-neutral-8)",
  color: "var(--text-subtle)",
  fontFamily: "var(--font-mono)",
};

function Toggle({ label, on }: { label: string; on: boolean }): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid var(--t-neutral-6)",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--text-default)" }}>
        {label}
      </span>
      <span style={badge(on)}>{on ? "활성" : "비활성"}</span>
    </div>
  );
}

export function HarnessView({
  view,
}: {
  view: HarnessViewData;
}): ReactNode {
  return (
    // cf-scope--agent: 하네스는 "AI 에이전트" 그룹 → cf-* 보라 accent
    // 상속. Toggle 등 그룹 고유색 보라 일관(검색·라벨링은 기본 blue).
    <div
      className="thin-scroll cf-scope--agent"
      style={{
        flex: 1,
        overflowY: "auto",
        background: "var(--surface-subtle)",
        padding: "28px 0",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 28px" }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-default)",
            letterSpacing: "-0.01em",
            marginBottom: 4,
          }}
        >
          하네스 구성
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 20 }}>
          현재 챗 에이전트에 설정된 하네스 요소입니다. 환경변수 토글로
          제어되며, 이 화면은 읽기 전용입니다.
        </p>

        {/* 토글 */}
        <div style={card}>
          <div style={sectionTitle}>요소 토글</div>
          <div style={sectionDesc}>
            registry.ts buildHarnessConfig 가 env 로 조립하는 on/off 상태.
          </div>
          <Toggle label="Planning (계획 수립 미들웨어)" on={view.toggles.planning} />
          <Toggle label="Filesystem (파일 도구)" on={view.toggles.filesystem} />
          <Toggle label="Subagents (서브에이전트)" on={view.toggles.subagents} />
          <Toggle label="Skills (스킬 미들웨어)" on={view.toggles.skills} />
        </div>

        {/* 도구 */}
        <div style={card}>
          <div style={sectionTitle}>도구 ({view.tools.length})</div>
          <div style={sectionDesc}>
            에이전트가 호출 가능한 도구. ClientTool(우리 측 실행) /
            ServerTool(provider 측 실행).
          </div>
          {view.tools.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              등록된 도구가 없습니다.
            </div>
          ) : (
            view.tools.map((t) => (
              <div
                key={t.name}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--t-neutral-6)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text-default)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {t.name}
                  </span>
                  {t.displayName && (
                    <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
                      {t.displayName}
                    </span>
                  )}
                  <span style={kindChip}>{t.kind}</span>
                </div>
                {t.description && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-subtle)",
                      marginTop: 3,
                    }}
                  >
                    {t.description}
                  </div>
                )}

                {/* LLM 사용 명세(parameters) — LLM 이 도구 호출 시 참조하는
                    JSON Schema. ClientTool 만 보유. zod .describe() 텍스트
                    까지 그대로(LLM 이 보는 사용 설명서 = 이것). */}
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--text-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 4,
                    }}
                  >
                    LLM 사용 명세 (parameters)
                  </div>
                  {t.parametersSchema ? (
                    <pre
                      style={{
                        margin: 0,
                        padding: "10px 12px",
                        background: "var(--surface-subtle)",
                        border: "1px solid var(--t-neutral-6)",
                        borderRadius: "var(--r-md)",
                        fontSize: 11,
                        lineHeight: 1.55,
                        color: "var(--text-default)",
                        fontFamily: "var(--font-mono)",
                        overflowX: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      {JSON.stringify(t.parametersSchema, null, 2)}
                    </pre>
                  ) : t.kind === "server" ? (
                    // ServerTool(OpenAI 내장): LLM 입력 명세(zod)는
                    // provider 관리라 표시 불가. 대신 **우리 구성값**
                    // (buildWebSearchOptions 가 보내는 설정 — 실측:
                    // search_context_size 등)을 표시한다.
                    <>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-subtle)",
                          fontStyle: "italic",
                          marginBottom: t.configValues ? 6 : 0,
                        }}
                      >
                        OpenAI 내장 도구 — LLM 입력 명세는 provider 가
                        관리. 아래는 우리가 보내는 구성값.
                      </div>
                      {t.configValues ? (
                        <pre
                          style={{
                            margin: 0,
                            padding: "10px 12px",
                            background: "var(--surface-subtle)",
                            border: "1px solid var(--t-neutral-6)",
                            borderRadius: "var(--r-md)",
                            fontSize: 11,
                            lineHeight: 1.55,
                            color: "var(--text-default)",
                            fontFamily: "var(--font-mono)",
                            overflowX: "auto",
                            whiteSpace: "pre",
                          }}
                        >
                          {JSON.stringify(t.configValues, null, 2)}
                        </pre>
                      ) : (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-subtle)",
                            fontStyle: "italic",
                          }}
                        >
                          구성 옵션 없음(기본 동작).
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-subtle)",
                        fontStyle: "italic",
                      }}
                    >
                      표시 가능한 파라미터 명세가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 서브에이전트 */}
        <div style={card}>
          <div style={sectionTitle}>
            서브에이전트 ({view.subagents.length})
          </div>
          <div style={sectionDesc}>
            메인 에이전트가 task 도구로 위임하는 일꾼 에이전트.
          </div>
          {view.subagents.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              등록된 서브에이전트가 없습니다.
            </div>
          ) : (
            view.subagents.map((s) => (
              <div
                key={s.name}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--t-neutral-6)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text-default)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {s.name}
                  </span>
                  {s.isPlaceholder && (
                    <span
                      style={{
                        ...badge(false),
                        background: "#fef3c7",
                        color: "#92400e",
                      }}
                      title="systemPrompt 가 미확정 placeholder 입니다"
                    >
                      ⚠ PLACEHOLDER
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-subtle)",
                    marginTop: 3,
                  }}
                >
                  {s.description}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-subtle)",
                    marginTop: 4,
                  }}
                >
                  모델: {s.modelLabel}
                </div>
                {s.toolNames.length > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-subtle)",
                      marginTop: 2,
                    }}
                  >
                    도구: {s.toolNames.join(", ")}
                  </div>
                )}
                <pre
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    background: "var(--surface-subtle)",
                    border: "1px solid var(--t-neutral-6)",
                    borderRadius: "var(--r-md)",
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: "var(--text-default)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {s.systemPrompt}
                </pre>
              </div>
            ))
          )}
        </div>

        {/* 스킬 — 상세(SKILL.md frontmatter + 본문) 노출. frontmatter
            name/description = LLM 이 스킬 사용 시점 판단 근거(시스템
            프롬프트 주입분), 본문 = 에이전트가 read_file 로 읽는 가이드. */}
        <div style={card}>
          <div style={sectionTitle}>
            스킬 ({view.skills.details.length})
          </div>
          <div style={sectionDesc}>
            progressive disclosure. frontmatter(name/description)가 LLM
            프롬프트에 주입되고 본문은 에이전트가 read_file 로 읽는다.
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={badge(view.skills.enabled)}>
              {view.skills.enabled ? "활성" : "비활성"}
            </span>
          </div>
          {view.skills.details.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              활성 스킬이 없습니다.
            </div>
          ) : (
            view.skills.details.map((sk) => (
              <div
                key={sk.source}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--t-neutral-6)",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--text-default)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {sk.name ?? sk.source}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-subtle)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {sk.source}
                  </span>
                </div>
                {sk.description && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-subtle)",
                      marginTop: 4,
                      lineHeight: 1.6,
                    }}
                  >
                    {sk.description}
                  </div>
                )}
                {sk.body && (
                  <>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "var(--text-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginTop: 10,
                        marginBottom: 4,
                      }}
                    >
                      SKILL.md 본문 (에이전트가 read_file 로 읽음)
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "12px 14px",
                        background: "var(--surface-subtle)",
                        border: "1px solid var(--t-neutral-6)",
                        borderRadius: "var(--r-md)",
                        fontSize: 11,
                        lineHeight: 1.65,
                        color: "var(--text-default)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {sk.body}
                    </pre>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* 시스템 인스트럭션 */}
        <div style={card}>
          <div style={sectionTitle}>시스템 인스트럭션</div>
          <div style={sectionDesc}>
            메인 에이전트에 주입되는 시스템 프롬프트 전문(정적 상수).
          </div>
          <pre
            style={{
              padding: "14px 16px",
              background: "var(--surface-subtle)",
              border: "1px solid var(--t-neutral-6)",
              borderRadius: "var(--r-md)",
              fontSize: 12,
              lineHeight: 1.7,
              color: "var(--text-default)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
            }}
          >
            {view.systemPrompt}
          </pre>
        </div>

        {/* 관리(CRUD) 패널 — 위쪽 표시 전용 카드와 달리 자체 fetch/state 로
            인스트럭션·스킬·서브에이전트를 생성·편집·삭제한다. 각 패널은
            별도 client 컴포넌트(components/harness/*)로 분리해 이 파일의
            1000줄 한도와 표시/편집 책임 분리를 지킨다. */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: "2px solid var(--t-neutral-8)",
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-default)",
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}
          >
            하네스 관리
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-subtle)",
              marginBottom: 16,
            }}
          >
            인스트럭션·스킬·서브에이전트를 직접 만들고 편집·삭제합니다.
            변경은 즉시 저장되며 다음 대화부터 반영됩니다.
          </p>
          <InstructionManager />
          <SkillManager />
          <SubagentManager />
        </div>
      </div>
    </div>
  );
}

export default HarnessView;

/* ==============================================
   Thinking Panel — 5 variations
   "답변 과정" — reasoning + tool I/O visualisation
   Adapted to fit the existing chat agent's neutral / agent-violet tone
   ============================================== */

/* ---------- Shared mock data (mirrors the spec's ThinkingStep) ---------- */
const SAMPLE_STEPS = [
  {
    id: 's1',
    kind: 'reasoning',
    title: '질문 분석',
    elapsed: 1200,
    content:
      '사용자가 **당뇨 커뮤니티 핫토픽**을 묻고 있다. OpenSearch 인덱스 `medi-community`에서 최근 30일 게시글을 가져와야 한다. 의사 인증 회원만 필터링하는 것이 핵심.',
  },
  {
    id: 's2',
    kind: 'tool',
    tool: 'WebSearch',
    label: '웹 검색',
    icon: 'search',
    count: 3,
    elapsed: 2400,
    inputs: [
      { in: 'GLP-1 부작용 의사 처방', out: '관련 게시글 412건 · 평균 댓글 18.4', elapsed: 800 },
      { in: '위고비 처방 경험 한국',    out: '관련 게시글 287건',                  elapsed: 720 },
      { in: '옴니팟 5 인슐린 펌프',     out: '관련 게시글 198건',                  elapsed: 880 },
    ],
  },
  {
    id: 's3',
    kind: 'tool',
    tool: 'task',
    label: '서브에이전트',
    icon: 'bot',
    elapsed: 8300,
    inputs: [
      {
        in: '의사 인증 회원 게시글만 필터링하고 토픽별 클러스터링',
        out: '3개 토픽으로 분류 · GLP-1(34%) / 인슐린 펌프(22%) / 자유 토픽(18%)',
        elapsed: 8300,
        detail: JSON.stringify({
          subagent_type: 'research',
          prompt: '의사 인증 회원 게시글만 필터링 후 토픽 클러스터링',
          task_id: 'ses_8q3kx2',
        }, null, 2),
      },
    ],
  },
  {
    id: 's4',
    kind: 'reasoning',
    title: '결과 정리',
    elapsed: 900,
    active: true,
    content:
      'GLP-1 카테고리(34%)가 가장 활발. 1형 당뇨 인슐린 펌프(22%)가 다음 토픽. 답변은 상위 3개 토픽으로 제한하고 출처는 의사 커뮤니티 원문으로 인용.',
  },
];

const TOTAL_ELAPSED = SAMPLE_STEPS.reduce((s, x) => s + x.elapsed, 0);

/* ---------- helpers ---------- */
function formatDur(ms) {
  const sec = ms / 1000;
  if (sec >= 10) return Math.round(sec) + '초';
  return sec.toFixed(1) + '초';
}

function renderInline(text) {
  /* very small **bold** + `code` renderer for previews */
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 600, color: 'var(--text-default)' }}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92em', padding: '1px 5px', background: 'var(--t-neutral-8)', borderRadius: 4 }}>{p.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const tpDotPulse = (
  <span style={{ display: 'inline-flex', gap: 3, marginLeft: 4 }}>
    {[0, 0.15, 0.3].map((d, i) => (
      <span key={i} style={{
        width: 4, height: 4, borderRadius: '50%',
        background: 'currentColor', opacity: 0.6,
        animation: `pulse 1.2s ease-in-out ${d}s infinite`,
      }} />
    ))}
  </span>
);

/* ============================================================
   A · 인라인 미니멀 — 본문 흐름을 가장 적게 흐트리는 사양.
   현재 SourcesPanel("References") 패턴과 동일한 위계.
   ============================================================ */
function ThinkingPanel_A({ steps = SAMPLE_STEPS, totalElapsed = TOTAL_ELAPSED, isStreaming = false, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 4px 4px 0', border: 'none', background: 'transparent',
          fontSize: 12.5, color: 'var(--text-subtle)', cursor: 'pointer', fontWeight: 500,
        }}
      >
        <span>{open ? '답변 과정' : '답변 과정 보기'}</span>
        {!isStreaming && <span style={{ color: 'var(--neutral-400)', fontWeight: 400 }}>({formatDur(totalElapsed)})</span>}
        {isStreaming && <span style={{ color: 'var(--agent-500)' }}>{tpDotPulse}</span>}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} style={{ color: 'var(--neutral-400)' }} />
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '14px 16px',
          border: '1px solid var(--t-neutral-8)',
          background: 'var(--t-neutral-4)',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <div style={{ borderTop: '1px dashed var(--t-neutral-12)' }} />}
              <StepInline step={s} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function StepInline({ step }) {
  const isReason = step.kind === 'reasoning';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>
          {isReason ? step.title : step.label}
        </span>
        {step.count > 1 && (
          <span style={{ fontSize: 10.5, color: 'var(--neutral-400)', fontWeight: 600 }}>×{step.count}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--neutral-400)' }}>· {formatDur(step.elapsed)}</span>
        {step.active && <span style={{ color: 'var(--agent-500)', fontSize: 11 }}>{tpDotPulse}</span>}
      </div>
      {isReason ? (
        <div style={{
          padding: '10px 12px', borderRadius: 6,
          background: 'rgba(156,163,175,0.10)',
          fontSize: 12.5, lineHeight: 1.7, fontStyle: 'italic',
          color: 'var(--neutral-700)',
        }}>{renderInline(step.content)}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {step.inputs.map((io, k) => <IOMini key={k} io={io} />)}
        </div>
      )}
    </div>
  );
}

function IOMini({ io }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'rgba(156,163,175,0.10)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={ioRow}>
        <span style={ioLabel}>IN</span>
        <span style={ioVal}>{io.in} {io.elapsed && <span style={{ color: 'var(--neutral-400)' }}>({formatDur(io.elapsed)})</span>}</span>
      </div>
      <div style={{ borderTop: '1px solid var(--t-neutral-8)' }} />
      <div style={ioRow}>
        <span style={ioLabel}>OUT</span>
        <span style={ioVal} onClick={io.detail ? () => setOpen(o => !o) : undefined}
          {...(io.detail ? { role: 'button' } : {})}>
          {io.out}{io.detail && <span style={{ color: 'var(--neutral-400)', marginLeft: 4, cursor: 'pointer' }}>{open ? '△' : '▽'}</span>}
        </span>
      </div>
      {io.detail && open && (
        <pre style={{
          margin: 0, padding: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5,
          background: 'rgba(67,73,78,0.06)', color: 'var(--neutral-700)',
          whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto',
        }}>{io.detail}</pre>
      )}
    </div>
  );
}

const ioRow = { display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'baseline', padding: '7px 10px' };
const ioLabel = { fontSize: 10, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' };
const ioVal = { fontSize: 12, color: 'var(--neutral-700)', lineHeight: 1.5 };

/* ============================================================
   B · 카드 스택 — 각 단계가 독립 카드. agent-violet 좌측 액센트.
   AssistMsg_C(좌측 그라데이션 액센트 바) 컨셉과 어울림.
   ============================================================ */
function ThinkingPanel_B({ steps = SAMPLE_STEPS, totalElapsed = TOTAL_ELAPSED, isStreaming = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px 6px 8px', borderRadius: 8,
          border: '1px solid var(--t-neutral-8)', background: 'white',
          fontSize: 12, color: 'var(--text-default)', cursor: 'pointer', fontWeight: 500,
        }}
      >
        <Icon name="brain" size={12} style={{ color: 'var(--agent-500)' }} />
        <span>답변 과정</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
          background: 'var(--agent-50)', color: 'var(--agent-700)',
        }}>{steps.length}단계</span>
        {!isStreaming && <span style={{ color: 'var(--neutral-400)' }}>{formatDur(totalElapsed)}</span>}
        {isStreaming && <span style={{ color: 'var(--agent-500)' }}>{tpDotPulse}</span>}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} style={{ color: 'var(--text-subtle)' }} />
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {steps.map(s => <StepCardB key={s.id} step={s} />)}
        </div>
      )}
    </div>
  );
}

function StepCardB({ step }) {
  const isReason = step.kind === 'reasoning';
  return (
    <div style={{
      position: 'relative', borderRadius: 10,
      border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)',
      padding: '10px 14px 12px 16px', overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: isReason ? 'var(--agent-300)' : 'var(--blue-300)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 7,
          background: isReason ? 'var(--agent-50)' : 'var(--blue-50)',
          color: isReason ? 'var(--agent-600)' : 'var(--blue-600)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={isReason ? 'brain' : step.icon} size={12} strokeWidth={2.1} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)' }}>
          {isReason ? step.title : step.label}
        </span>
        {step.count > 1 && (
          <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 600 }}>×{step.count}</span>
        )}
        {step.active && (
          <span style={{ color: 'var(--agent-500)', fontSize: 11 }}>{tpDotPulse}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--neutral-400)', fontFamily: 'var(--font-mono)' }}>{formatDur(step.elapsed)}</span>
      </div>
      {isReason ? (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: 'var(--neutral-700)' }}>
          {renderInline(step.content)}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {step.inputs.map((io, k) => <IOMini key={k} io={io} />)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   C · 타임라인 레일 — 좌측 세로 라인 + dot 마커.
   단계 흐름을 시각화. 도구 / 추론을 dot 모양으로 구분.
   ============================================================ */
function ThinkingPanel_C({ steps = SAMPLE_STEPS, totalElapsed = TOTAL_ELAPSED, isStreaming = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ width: '100%' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 0', border: 'none', background: 'transparent',
        fontSize: 12.5, color: 'var(--text-default)', cursor: 'pointer', fontWeight: 600,
      }}>
        <Icon name="activity" size={13} style={{ color: 'var(--agent-500)' }} />
        <span>답변 과정</span>
        <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>
          · {steps.length}단계 · {isStreaming ? '진행 중' : formatDur(totalElapsed)}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} style={{ color: 'var(--text-subtle)' }} />
      </button>

      {open && (
        <div style={{
          marginTop: 10, padding: '14px 16px 6px',
          border: '1px solid var(--t-neutral-8)',
          background: 'var(--surface-tertiary)',
          borderRadius: 12,
          position: 'relative',
        }}>
          {/* the rail */}
          <span style={{ position: 'absolute', left: 28, top: 22, bottom: 22, width: 1.5, background: 'var(--t-neutral-12)' }} />
          {steps.map((s, i) => <StepRailC key={s.id} step={s} isLast={i === steps.length - 1} />)}
        </div>
      )}
    </div>
  );
}

function StepRailC({ step, isLast }) {
  const isReason = step.kind === 'reasoning';
  const accent = isReason ? 'var(--agent-500)' : 'var(--blue-500)';
  return (
    <div style={{ display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' }}>
      {/* marker */}
      <div style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
        <span style={{
          width: 11, height: 11, borderRadius: '50%',
          background: 'white',
          border: `2px solid ${step.active ? 'var(--agent-500)' : accent}`,
          boxShadow: step.active ? '0 0 0 4px color-mix(in srgb, var(--agent-300) 30%, transparent)' : 'none',
          position: 'relative', zIndex: 1,
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>
            {isReason ? step.title : step.label}
          </span>
          {step.count > 1 && (
            <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 600 }}>×{step.count}</span>
          )}
          {step.active && <span style={{ color: 'var(--agent-500)', fontSize: 11 }}>{tpDotPulse}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--neutral-400)', fontFamily: 'var(--font-mono)' }}>{formatDur(step.elapsed)}</span>
        </div>
        {isReason ? (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--neutral-700)', fontStyle: 'italic' }}>
            {renderInline(step.content)}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {step.inputs.map((io, k) => (
              <div key={k} style={{
                fontSize: 11.5, color: 'var(--neutral-700)',
                padding: '6px 10px', borderRadius: 6,
                background: 'white', border: '1px solid var(--t-neutral-8)',
                lineHeight: 1.55,
              }}>
                <div><span style={{ color: 'var(--neutral-400)', marginRight: 6 }}>→</span>{io.in}</div>
                <div><span style={{ color: 'var(--neutral-400)', marginRight: 6 }}>←</span>{io.out}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   D · 단계 칩 (Pills) — 한 줄 가로 칩. 클릭으로 상세 확장.
   답변 본문 위쪽에 자연스럽게 어울리는 컴팩트 사양.
   ============================================================ */
function ThinkingPanel_D({ steps = SAMPLE_STEPS, totalElapsed = TOTAL_ELAPSED, isStreaming = false, defaultOpen = false }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const activeStep = activeIdx != null ? steps[activeIdx] : null;
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 4px',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          답변 과정 {!isStreaming && <span style={{ color: 'var(--neutral-400)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {formatDur(totalElapsed)}</span>}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {steps.map((s, i) => {
            const isOn = i === activeIdx;
            const isReason = s.kind === 'reasoning';
            return (
              <button
                key={s.id}
                onClick={() => setActiveIdx(isOn ? null : i)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 999,
                  border: '1px solid ' + (isOn ? 'var(--agent-300)' : 'var(--t-neutral-8)'),
                  background: isOn ? 'var(--agent-50)' : 'white',
                  fontSize: 11.5, fontWeight: 500,
                  color: isOn ? 'var(--agent-700)' : 'var(--text-default)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                <Icon name={isReason ? 'brain' : s.icon} size={10} style={{ color: isReason ? 'var(--agent-500)' : 'var(--blue-500)' }} />
                <span>{isReason ? s.title : s.label}</span>
                {s.count > 1 && <span style={{ color: 'var(--neutral-400)', fontWeight: 600, fontSize: 10 }}>×{s.count}</span>}
                <span style={{ color: 'var(--neutral-400)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{formatDur(s.elapsed)}</span>
                {s.active && <span style={{ color: 'var(--agent-500)' }}>{tpDotPulse}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {activeStep && (
        <div style={{
          marginTop: 4, padding: '12px 14px',
          border: '1px solid var(--agent-200)',
          background: 'var(--agent-50)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 11, color: 'var(--agent-700)', fontWeight: 600, marginBottom: 6 }}>
            {activeStep.kind === 'reasoning' ? activeStep.title : activeStep.label}
          </div>
          {activeStep.kind === 'reasoning' ? (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: 'var(--neutral-700)', fontStyle: 'italic' }}>
              {renderInline(activeStep.content)}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeStep.inputs.map((io, k) => <IOMini key={k} io={io} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   E · 사이드 드로어 — 본문은 깨끗하게 유지하고, 토글 시 우측 드로어에 풀버전.
   기존 SourceDrawer 패턴 재사용. 긴 사고 흐름·디버깅에 적합.
   ============================================================ */
function ThinkingPanel_E({ steps = SAMPLE_STEPS, totalElapsed = TOTAL_ELAPSED, isStreaming = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* trigger sample — sits beside the assistant response */}
      <button onClick={() => setOpen(v => !v)} style={{
        alignSelf: 'flex-start',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px 6px 10px', borderRadius: 999,
        border: '1px solid var(--t-neutral-8)', background: 'white',
        fontSize: 12, color: 'var(--text-default)', cursor: 'pointer', fontWeight: 500,
        boxShadow: 'var(--shadow-xs)',
      }}>
        <Icon name="panelRight" size={12} style={{ color: 'var(--agent-500)' }} />
        <span>답변 과정 보기</span>
        <span style={{ color: 'var(--neutral-400)' }}>· {steps.length}단계</span>
        {!isStreaming && <span style={{ color: 'var(--neutral-400)' }}>· {formatDur(totalElapsed)}</span>}
        {isStreaming && <span style={{ color: 'var(--agent-500)' }}>{tpDotPulse}</span>}
      </button>

      <div style={{ flex: 1, position: 'relative', marginTop: 14, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--t-neutral-8)' }}>
        {/* faded chat preview */}
        <div style={{ padding: 18, height: '100%', background: 'var(--surface-default)', opacity: open ? 0.45 : 1, transition: 'opacity .15s' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Icon name="sparkles" size={12} />
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', fontWeight: 600 }}>에이전트 · 응답 중</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 8, background: 'var(--t-neutral-8)', borderRadius: 4, width: '70%' }} />
            <div style={{ height: 8, background: 'var(--t-neutral-8)', borderRadius: 4, width: '92%' }} />
            <div style={{ height: 8, background: 'var(--t-neutral-8)', borderRadius: 4, width: '55%' }} />
          </div>
        </div>

        {/* drawer */}
        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '62%',
            background: 'var(--surface-default)', borderLeft: '1px solid var(--t-neutral-8)',
            boxShadow: '-12px 0 32px -16px rgba(15,23,42,.12)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--t-neutral-8)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="brain" size={13} style={{ color: 'var(--agent-600)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-default)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>답변 과정</span>
                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· {formatDur(totalElapsed)}</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {steps.map(s => <StepCardB key={s.id} step={s} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- expose to canvas ---------- */
Object.assign(window, {
  ThinkingPanel_A,
  ThinkingPanel_B,
  ThinkingPanel_C,
  ThinkingPanel_D,
  ThinkingPanel_E,
  SAMPLE_THINKING_STEPS: SAMPLE_STEPS,
});

/* ==============================================
   Full screen layouts for AI 기업정보 분석 redesign
   ============================================== */

/* ============================================
   Helper: Tab bar (flat - all 11 tabs)
   ============================================ */
const FLAT_TABS = [
  { id: 'overview',  label: '개요',     icon: 'layout',     active: true },
  { id: 'disc',      label: '공시',     icon: 'fileText' },
  { id: 'krx',       label: 'KRX공시',  icon: 'building' },
  { id: 'fin',       label: '재무',     icon: 'barChart' },
  { id: 'share',     label: '주주',     icon: 'users' },
  { id: 'exec',      label: '임원',     icon: 'briefcase' },
  { id: 'emp',       label: '직원',     icon: 'users' },
  { id: 'div',       label: '배당',     icon: 'pill' },
  { id: 'chart',     label: '차트',     icon: 'activity' },
  { id: 'mna',       label: 'M&A',      icon: 'building' },
  { id: 'sec',       label: '증권발행', icon: 'fileText' },
  { id: 'audit',     label: '감사의견', icon: 'check' },
];

/* ============================================
   Helper: Grouped tabs (5 supergroups + sub-nav)
   ============================================ */
const GROUPED_TABS = [
  {
    id: 'overview',  label: '개요',       icon: 'layout',   active: true,
    desc: '기업개요 · KPI 한눈에',
  },
  {
    id: 'disc',      label: '공시',       icon: 'fileText',
    desc: 'DART · KRX 통합 공시',
    sub: [{ id: 'dart-d', label: 'DART 공시' }, { id: 'krx-d', label: 'KRX 공시' }],
  },
  {
    id: 'fin',       label: '재무 · 차트', icon: 'barChart',
    desc: '재무제표 · 시계열 · 배당',
    sub: [{ id: 'f1', label: '재무제표' }, { id: 'f2', label: '추세 차트' }, { id: 'f3', label: '배당' }],
  },
  {
    id: 'gov',       label: '거버넌스',   icon: 'users',
    desc: '주주 · 임원 · 직원 구조',
    sub: [{ id: 'g1', label: '주주' }, { id: 'g2', label: '임원' }, { id: 'g3', label: '직원' }],
  },
  {
    id: 'event',     label: '이벤트',     icon: 'zap',
    desc: 'M&A · 증권발행 · 감사의견',
    sub: [{ id: 'e1', label: 'M&A' }, { id: 'e2', label: '증권발행' }, { id: 'e3', label: '감사의견' }],
  },
];

/* ============================================
   AI Analysis side panel
   ============================================ */
function AIAnalysisPanel({ variant = 'A', width = 380, onClose }) {
  return (
    <aside style={{
      width, flexShrink: 0, background: 'var(--surface-default)',
      borderLeft: '1px solid var(--t-neutral-8)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--t-neutral-8)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="sparkles" size={13} strokeWidth={2.2} />
        </span>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>AI 분석</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>셀트리온 · 컨텍스트 자동 주입</div>
        </div>
        <button style={{
          width: 26, height: 26, borderRadius: 7, border: 'none',
          background: 'transparent', cursor: 'pointer', color: 'var(--text-subtle)',
        }} onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Analysis modes */}
      <div style={{
        padding: '10px 12px', display: 'flex', gap: 6,
        borderBottom: '1px solid var(--t-neutral-8)',
      }}>
        {['웹검색', 'DART 분석', '통합', '교차검증'].map((m, i) => (
          <button key={m} style={{
            flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            border: '1px solid',
            borderColor: i === 2 ? 'var(--agent-500)' : 'var(--t-neutral-12)',
            background: i === 2 ? 'var(--agent-50)' : 'var(--surface-default)',
            color: i === 2 ? 'var(--agent-700)' : 'var(--text-subtle)',
            cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>

      {/* Messages */}
      <div className="thin-scroll" style={{
        flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {AI_MESSAGES.map((msg, mi) => msg.role === 'user' ? (
          <div key={mi} style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              maxWidth: '85%',
              padding: '8px 12px', borderRadius: 12,
              background: 'var(--t-neutral-6)',
              fontSize: 12.5, color: 'var(--text-default)', lineHeight: 1.55,
            }}>{msg.content}</div>
          </div>
        ) : (
          <div key={mi} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Thinking trace */}
            <div style={{
              background: 'var(--agent-50)', border: '1px solid var(--agent-100)',
              borderRadius: 10, padding: 10,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10.5, fontWeight: 700, color: 'var(--agent-700)',
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
              }}>
                <Icon name="brain" size={11} strokeWidth={2.2} />
                <span>분석 과정 · 4단계 완료</span>
                <span style={{ marginLeft: 'auto', color: 'var(--agent-500)', fontWeight: 500, textTransform: 'none' }}>3.2s</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {msg.thinking.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-subtle)' }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: 'var(--agent-100)', color: 'var(--agent-600)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={t.kind === 'agent' ? 'bot' : 'search'} size={8} strokeWidth={2.4} />
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-default)' }}>{t.label}</span>
                    <span style={{ color: 'var(--text-subtle)' }}>· {t.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response */}
            <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-default)' }}>
              {msg.content.split('\n\n').map((para, pi) => (
                <p key={pi} style={{ margin: pi === 0 ? '0 0 8px' : '8px 0' }}
                   dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </div>

            {/* Citations */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 5,
              padding: '8px 10px', background: 'var(--t-neutral-4)',
              borderRadius: 10, fontSize: 10.5,
            }}>
              <span style={{ fontWeight: 600, color: 'var(--text-subtle)', marginRight: 4 }}>출처 ·</span>
              {msg.citations.map((c, ci) => (
                <span key={ci} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 7px', borderRadius: 999,
                  background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
                  cursor: 'pointer',
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--agent-600)' }}>[{c.id}]</span>
                  <span style={{ color: 'var(--text-default)' }}>{c.label}</span>
                </span>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['copy', 'thumbsUp', 'thumbsDown', 'refresh'].map(ic => (
                <button key={ic} style={{
                  width: 28, height: 28, borderRadius: 7, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: 'var(--text-subtle)',
                }}>
                  <Icon name={ic} size={13} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid var(--t-neutral-8)' }}>
        <div style={{
          border: '1px solid var(--t-neutral-12)', borderRadius: 12,
          padding: '8px 10px', background: 'var(--surface-default)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)', padding: '4px 2px' }}>
            기업에 대해 추가 질문을 입력하세요…
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <button style={iconBtn}><Icon name="paperclip" size={14} /></button>
            <button style={{
              ...iconBtn,
              display: 'flex', alignItems: 'center', gap: 4, width: 'auto', padding: '0 8px',
              fontSize: 11, color: 'var(--text-subtle)', borderRadius: 7,
            }}>
              <Icon name="database" size={12} />
              <span>DART</span>
            </button>
            <div style={{ flex: 1 }} />
            <button style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--agent-500)', color: 'white', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Icon name="arrowUp" size={13} strokeWidth={2.3} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ============================================
   Header (page header with search, AI 분석 button)
   ============================================ */
function DartPageHeader({ aiPanelOpen, onToggleAI }) {
  return (
    <div style={{
      padding: '14px 24px',
      borderBottom: '1px solid var(--t-neutral-8)',
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'var(--surface-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="building" size={13} strokeWidth={2.2} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>AI 기업정보 분석</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>DART · KRX 공시 통합 분석</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <CompanySearchCompact />

      <button style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 36, padding: '0 14px', borderRadius: 10,
        background: aiPanelOpen ? 'var(--agent-50)' : 'var(--agent-500)',
        color: aiPanelOpen ? 'var(--agent-700)' : 'white',
        border: aiPanelOpen ? '1px solid var(--agent-200)' : 'none',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        boxShadow: aiPanelOpen ? 'none' : '0 1px 2px rgba(124, 58, 237, 0.18)',
      }} onClick={onToggleAI}>
        <Icon name="sparkles" size={14} strokeWidth={2.2} />
        <span>AI 분석</span>
      </button>

      <button style={iconBtn}><Icon name="bookmark" size={15} /></button>
      <button style={iconBtn}><Icon name="share" size={15} /></button>
      <button style={iconBtn}><Icon name="more" size={15} /></button>
    </div>
  );
}

/* ============================================
   Tab bar — flat version (all 11)
   ============================================ */
function FlatTabBar() {
  return (
    <div style={{
      padding: '0 24px',
      borderBottom: '1px solid var(--t-neutral-8)',
      background: 'var(--surface-default)',
      display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto',
    }}>
      {FLAT_TABS.map(t => (
        <a key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '12px 12px', fontSize: 12.5, cursor: 'pointer',
          color: t.active ? 'var(--text-default)' : 'var(--text-subtle)',
          fontWeight: t.active ? 600 : 500,
          borderBottom: '2px solid',
          borderColor: t.active ? 'var(--agent-500)' : 'transparent',
          marginBottom: -1, whiteSpace: 'nowrap',
        }}>
          <Icon name={t.icon} size={13} style={t.active ? { color: 'var(--agent-500)' } : null} />
          <span>{t.label}</span>
        </a>
      ))}
    </div>
  );
}

/* ============================================
   Tab bar — grouped (5 supergroups)
   ============================================ */
function GroupedTabBar({ activeId = 'overview' }) {
  return (
    <div style={{
      padding: '0 24px',
      borderBottom: '1px solid var(--t-neutral-8)',
      background: 'var(--surface-default)',
      display: 'flex', alignItems: 'stretch', gap: 4,
    }}>
      {GROUPED_TABS.map(t => {
        const active = t.id === activeId;
        return (
          <a key={t.id} style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            padding: '11px 16px 10px', fontSize: 12.5, cursor: 'pointer',
            color: active ? 'var(--text-default)' : 'var(--text-subtle)',
            borderBottom: '2px solid',
            borderColor: active ? 'var(--agent-500)' : 'transparent',
            marginBottom: -1, minWidth: 120,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: active ? 600 : 500 }}>
              <Icon name={t.icon} size={13} style={active ? { color: 'var(--agent-500)' } : null} />
              <span>{t.label}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', fontWeight: 400 }}>{t.desc}</div>
          </a>
        );
      })}
    </div>
  );
}

/* ============================================
   Sub-nav under grouped tab (when applicable)
   ============================================ */
function GroupSubNav({ items, activeId }) {
  return (
    <div style={{
      padding: '10px 24px',
      borderBottom: '1px solid var(--t-neutral-8)',
      background: 'var(--surface-subtle)',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {items.map(it => {
        const active = it.id === activeId;
        return (
          <button key={it.id} style={{
            padding: '5px 12px', borderRadius: 999, fontSize: 11.5,
            border: '1px solid',
            borderColor: active ? 'var(--agent-300)' : 'var(--t-neutral-12)',
            background: active ? 'var(--agent-50)' : 'var(--surface-default)',
            color: active ? 'var(--agent-700)' : 'var(--text-subtle)',
            fontWeight: active ? 600 : 500, cursor: 'pointer',
          }}>{it.label}</button>
        );
      })}
    </div>
  );
}

/* ============================================
   Disclosure list (compact)
   ============================================ */
function DisclosureList({ limit = 6 }) {
  return (
    <div style={{
      background: 'var(--surface-default)',
      border: '1px solid var(--t-neutral-8)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)' }}>최근 공시</span>
          <span style={{
            fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
            background: 'var(--t-neutral-6)', color: 'var(--text-subtle)', fontWeight: 600,
          }}>{DISCLOSURES.length}건</span>
        </div>
        <button style={{
          fontSize: 11, color: 'var(--agent-700)', fontWeight: 600,
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3,
        }}>전체 보기 <Icon name="arrowRight" size={11} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {DISCLOSURES.slice(0, limit).map((d, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 8px', borderRadius: 8, cursor: 'pointer',
          }}>
            <span style={{
              fontSize: 11, color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)', fontWeight: 500, width: 80, flexShrink: 0,
            }}>{d.date}</span>
            <DiscBadge type={d.type} color={d.badge} />
            <span className="truncate" style={{ flex: 1, fontSize: 12, color: 'var(--text-default)', fontWeight: 500 }}>{d.title}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-subtle)', flexShrink: 0 }}>{d.filer}</span>
            <Icon name="externalLink" size={11} style={{ color: 'var(--text-subtle)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================
   Shareholder donut + table
   ============================================ */
function ShareholderBlock() {
  const total = SHAREHOLDERS.reduce((a, b) => a + b.ratio, 0);
  const colors = ['#1e3a8a', '#3b82f6', '#a78bfa', '#60a5fa', '#cbd5e1'];
  let cumulative = 0;
  const slices = SHAREHOLDERS.map((s, i) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += s.ratio;
    const endAngle = (cumulative / total) * 360;
    return { ...s, startAngle, endAngle, color: colors[i] };
  });

  // Build SVG arcs
  function arcPath(r, startAngle, endAngle, innerR = 40) {
    const cx = 60, cy = 60;
    const a1 = ((startAngle - 90) * Math.PI) / 180;
    const a2 = ((endAngle - 90) * Math.PI) / 180;
    const large = endAngle - startAngle > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const xi1 = cx + innerR * Math.cos(a1), yi1 = cy + innerR * Math.sin(a1);
    const xi2 = cx + innerR * Math.cos(a2), yi2 = cy + innerR * Math.sin(a2);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1} Z`;
  }

  return (
    <div style={{
      background: 'var(--surface-default)',
      border: '1px solid var(--t-neutral-8)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)' }}>주주 구성</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>2025.12 기준</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <svg width={120} height={120} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
          {slices.map((s, i) => (
            <path key={i} d={arcPath(56, s.startAngle, s.endAngle, 36)} fill={s.color} />
          ))}
          <circle cx={60} cy={60} r={36} fill="var(--surface-default)" />
          <text x={60} y={56} textAnchor="middle" fontSize="10" fill="var(--text-subtle)">최대주주</text>
          <text x={60} y={72} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text-default)">39.9%</text>
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-default)', fontWeight: 500, flex: 1 }} className="truncate">{s.name}</span>
              <span style={{ color: 'var(--text-subtle)', fontSize: 10.5 }}>{s.relate}</span>
              <span style={{ color: 'var(--text-default)', fontWeight: 700, width: 50, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.ratio.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================
   AI insight strip (small inline AI summary above tabs)
   ============================================ */
function AIInsightStrip() {
  return (
    <div style={{
      background: 'linear-gradient(90deg, var(--agent-50), var(--surface-default) 80%)',
      border: '1px solid var(--agent-100)',
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="sparkles" size={13} strokeWidth={2.2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--agent-700)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI 요약</span>
          <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>· 3.2초 전 자동 생성</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-default)', lineHeight: 1.55 }}>
          매출 +12.4%, 영업이익률 23.4%로 의약품 업종 평균 대비 <strong>2.7배</strong>. 5월 단일판매계약과 CB발행이 주요 이슈입니다.
          최대주주(서정진 외) 지분 <strong>39.9%</strong>로 지배구조 안정적.
        </div>
      </div>
      <button style={{
        padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        background: 'var(--surface-default)', border: '1px solid var(--agent-200)',
        color: 'var(--agent-700)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span>자세히</span>
        <Icon name="arrowRight" size={11} />
      </button>
    </div>
  );
}

/* ============================================
   Body content for "개요" tab (KPIs + insights)
   ============================================ */
function OverviewBody({ headerVariant = 'A' }) {
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', flex: 1 }} className="thin-scroll">
      {/* AI insight strip */}
      <AIInsightStrip />

      {/* Company info */}
      <CompanyHeader variant={headerVariant} />

      {/* KPI grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)' }}>주요 지표</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>2025년 연간 · 단위: 보고서 기준</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['2025', '2024', '2023'].map((y, i) => (
              <button key={y} style={{
                padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: '1px solid',
                borderColor: i === 0 ? 'var(--agent-300)' : 'var(--t-neutral-12)',
                background: i === 0 ? 'var(--agent-50)' : 'var(--surface-default)',
                color: i === 0 ? 'var(--agent-700)' : 'var(--text-subtle)',
                cursor: 'pointer',
              }}>{y}</button>
            ))}
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
        }}>
          {INDICATORS.map(ind => <KPICard key={ind.id} ind={ind} compact />)}
        </div>
      </div>

      {/* Bottom row: disclosures + shareholders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        <DisclosureList limit={6} />
        <ShareholderBlock />
      </div>
    </div>
  );
}

window.FLAT_TABS = FLAT_TABS;
window.GROUPED_TABS = GROUPED_TABS;
window.AIAnalysisPanel = AIAnalysisPanel;
window.DartPageHeader = DartPageHeader;
window.FlatTabBar = FlatTabBar;
window.GroupedTabBar = GroupedTabBar;
window.GroupSubNav = GroupSubNav;
window.DisclosureList = DisclosureList;
window.ShareholderBlock = ShareholderBlock;
window.AIInsightStrip = AIInsightStrip;
window.OverviewBody = OverviewBody;

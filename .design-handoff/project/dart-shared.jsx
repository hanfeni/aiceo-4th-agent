/* ==============================================
   Shared building blocks for DART (AI 기업정보 분석) redesign
   - Sidebar with dart menu active
   - Reusable parts (search, company header, KPI cards, etc.)
   ============================================== */

/* ----- Modified NAV with AI 기업정보 분석 menu ----- */
const DART_NAV = [
  { kind: 'single', id: 'home', icon: 'home', label: '홈', href: '/' },
  {
    kind: 'group',
    id: 'search-ad',
    label: '검색 광고',
    accent: 'var(--blue-500)',
    items: [
      { id: 'sa-companies', icon: 'building', label: '광고주' },
      { id: 'sa-campaigns', icon: 'search',   label: '캠페인' },
      { id: 'sa-ads',       icon: 'megaphone',label: '광고' },
      { id: 'sa-dashboard', icon: 'barChart', label: '성과 대시보드' },
    ],
  },
  {
    kind: 'group',
    id: 'agent',
    label: 'AI 에이전트',
    accent: 'var(--agent-500)',
    items: [
      { id: 'agent-chat', icon: 'message',  label: '에이전트 챗' },
      { id: 'dart',       icon: 'building', label: 'AI 기업정보 분석', active: true },
      { id: 'pharma',     icon: 'pill',     label: '제약 인사이트' },
      { id: 'usage',      icon: 'activity', label: '사용성 지표' },
    ],
  },
  {
    kind: 'group',
    id: 'tools',
    label: '도구',
    accent: 'var(--neutral-400)',
    items: [
      { id: 'style-lab',     icon: 'palette', label: '스타일 실험실' },
      { id: 'component-lab', icon: 'boxes',   label: '컴포넌트 실험실' },
    ],
  },
];

/* ----- Sidebar (matches ShellA style from chat agent design) ----- */
function DartSidebar({ width = 256 }) {
  return (
    <aside style={{
      width, background: 'var(--surface-default)',
      borderRight: '1px solid var(--t-neutral-8)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 12px 10px' }}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 10,
          background: 'var(--t-neutral-4)', border: '1px solid var(--t-neutral-8)',
          cursor: 'pointer',
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: 7,
            background: 'var(--blue-500)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 11,
          }}>M</span>
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'flex-start', lineHeight: 1.2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>Medigate Manager</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>Client Manager</span>
          </span>
          <Icon name="chevronDown" size={12} />
        </button>
      </div>

      <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {DART_NAV.map(node => node.kind === 'single' ? (
          <a key={node.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 9, fontSize: 12.5,
            color: 'var(--text-subtle)', cursor: 'pointer', marginBottom: 2,
          }}>
            <Icon name={node.icon} size={15} />
            <span>{node.label}</span>
          </a>
        ) : (
          <div key={node.id} style={{ marginTop: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px 6px', fontSize: 10.5, fontWeight: 600,
              color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: node.accent }} />
              <span>{node.label}</span>
            </div>
            {node.items.map(it => {
              const active = it.active;
              return (
                <div key={it.id} style={{ position: 'relative' }}>
                  {active && (
                    <span style={{
                      position: 'absolute', left: -8, top: 6, bottom: 6,
                      width: 3, borderRadius: 2, background: node.accent,
                    }} />
                  )}
                  <a style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 8, marginBottom: 1,
                    fontSize: 12.5, cursor: 'pointer',
                    color: active ? 'var(--text-default)' : 'var(--text-subtle)',
                    background: active ? 'var(--t-neutral-6)' : 'transparent',
                    fontWeight: active ? 600 : 500,
                  }}>
                    <Icon name={it.icon} size={14} style={{ color: active ? node.accent : undefined }} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.badge && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 999, fontSize: 9.5, fontWeight: 700,
                        background: 'var(--agent-100)', color: 'var(--agent-700)',
                      }}>{it.badge}</span>
                    )}
                  </a>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User pill */}
      <div style={{
        padding: '10px', borderTop: '1px solid var(--t-neutral-8)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--agent-500)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 11,
        }}>DK</div>
        <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-default)' }}>김두환</div>
          <div className="truncate" style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>dhkim@medicnc.co.kr</div>
        </div>
        <Icon name="more" size={14} style={{ color: 'var(--text-subtle)' }} />
      </div>
    </aside>
  );
}

/* ----- Compact company search bar (top right) ----- */
function CompanySearchCompact({ value = '셀트리온' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
      borderRadius: 10, padding: '7px 12px',
      width: 320, height: 36,
    }}>
      <Icon name="search" size={14} style={{ color: 'var(--text-subtle)' }} />
      <input
        defaultValue={value}
        placeholder="기업명 또는 종목코드로 검색"
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 12.5, color: 'var(--text-default)', minWidth: 0,
        }}
      />
      <kbd style={{
        fontSize: 10, padding: '1px 5px', borderRadius: 5,
        background: 'var(--t-neutral-6)', color: 'var(--text-subtle)',
        fontFamily: 'var(--font-mono)', fontWeight: 600,
      }}>⌘K</kbd>
    </div>
  );
}

/* ----- Tiny sparkline (for KPI cards) ----- */
function Sparkline({ data, color = 'var(--agent-500)', width = 64, height = 22 }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

/* ----- KPI card (compact) ----- */
function KPICard({ ind, accent = 'var(--agent-500)', compact = false }) {
  const deltaColor = ind.positive ? 'var(--green-600)' : 'var(--red-600)';
  return (
    <div style={{
      padding: compact ? '12px 13px' : '14px 16px',
      background: 'var(--surface-default)',
      border: '1px solid var(--t-neutral-8)',
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 6,
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-subtle)' }}>{ind.label}</span>
        <Sparkline data={ind.trend} color={ind.positive ? 'var(--green-500)' : 'var(--red-500)'} width={48} height={16} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: compact ? 17 : 20, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.015em' }}>
          {ind.value}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: deltaColor, fontWeight: 600 }}>
        <span style={{ transform: ind.positive ? 'none' : 'rotate(180deg)', display: 'inline-block' }}>▲</span>
        <span>{ind.delta}</span>
        <span style={{ color: 'var(--text-subtle)', fontWeight: 400, marginLeft: 2 }}>전년 동기</span>
      </div>
    </div>
  );
}

/* ----- Company header card ----- */
function CompanyHeader({ variant = 'A' }) {
  const c = SELECTED_COMPANY;
  if (variant === 'A') {
    // Variant A — info-rich card with logo placeholder + grid info
    return (
      <div style={{
        background: 'var(--surface-default)',
        border: '1px solid var(--t-neutral-8)',
        borderRadius: 14, padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18, flexShrink: 0, letterSpacing: '-0.02em',
          }}>셀</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.015em' }}>{c.corpName}</h2>
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                background: 'var(--blue-50)', color: 'var(--blue-700)',
              }}>{c.market}</span>
              <span style={{
                fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
                background: 'var(--t-neutral-6)', color: 'var(--text-subtle)',
                fontFamily: 'var(--font-mono)', fontWeight: 600,
              }}>{c.stockCode}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 3 }}>{c.corpNameEng} · {c.industry}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href="#" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 8,
              border: '1px solid var(--t-neutral-12)',
              fontSize: 11.5, color: 'var(--text-subtle)', textDecoration: 'none',
            }}>
              <Icon name="globe" size={12} /><span>홈페이지</span>
            </a>
            <a href="#" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 8,
              border: '1px solid var(--t-neutral-12)',
              fontSize: 11.5, color: 'var(--text-subtle)', textDecoration: 'none',
            }}>
              <Icon name="externalLink" size={12} /><span>DART 원문</span>
            </a>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px 24px', paddingTop: 14, borderTop: '1px dashed var(--t-neutral-12)',
        }}>
          {[
            { l: '대표자', v: c.ceoName },
            { l: '설립일', v: c.estDate },
            { l: '업종코드', v: c.industryCode },
            { l: '결산월', v: `${c.accMonth}월` },
            { l: '주소', v: c.address },
            { l: '전화', v: c.phoneNo },
            { l: '사업자번호', v: c.bizrNo },
            { l: '임직원수', v: `${c.employees}명` },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-subtle)', fontWeight: 500 }}>{row.l}</span>
              <span className="truncate" style={{ fontSize: 12, color: 'var(--text-default)', fontWeight: 500 }}>{row.v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Variant B — compact horizontal bar with quote-strip
  return (
    <div style={{
      background: 'var(--surface-default)',
      border: '1px solid var(--t-neutral-8)',
      borderRadius: 14, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 18,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 16, flexShrink: 0,
      }}>셀</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-default)' }}>{c.corpName}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6,
            background: 'var(--blue-50)', color: 'var(--blue-700)',
          }}>{c.market}</span>
          <span style={{
            fontSize: 10.5, color: 'var(--text-subtle)',
            fontFamily: 'var(--font-mono)', fontWeight: 600,
          }}>{c.stockCode}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{c.industry} · {c.ceoName} · {c.address.split(' ').slice(0,2).join(' ')}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 16, paddingLeft: 18, borderLeft: '1px solid var(--t-neutral-8)' }}>
        {[
          { l: '시가총액', v: c.marketCap, color: 'var(--text-default)' },
          { l: 'PER',     v: c.per,        color: 'var(--text-default)' },
          { l: 'PBR',     v: c.pbr,        color: 'var(--text-default)' },
          { l: 'ROE',     v: c.roe,        color: 'var(--text-default)' },
        ].map((m, i) => (
          <div key={i} style={{ textAlign: 'right', minWidth: 50 }}>
            <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 500 }}>{m.l}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: m.color, letterSpacing: '-0.01em' }}>{m.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Disclosure badge ----- */
function DiscBadge({ type, color }) {
  const palette = {
    blue:   { bg: 'var(--blue-50)',  fg: 'var(--blue-700)' },
    purple: { bg: '#f5f3ff',         fg: '#6d28d9' },
    red:    { bg: '#fef2f2',         fg: '#b91c1c' },
    pink:   { bg: '#fdf2f8',         fg: '#be185d' },
    amber:  { bg: '#fffbeb',         fg: '#b45309' },
    orange: { bg: '#fff7ed',         fg: '#c2410c' },
    green:  { bg: '#f0fdf4',         fg: '#15803d' },
    gray:   { bg: 'var(--t-neutral-6)', fg: 'var(--text-subtle)' },
  }[color] || { bg: 'var(--t-neutral-6)', fg: 'var(--text-subtle)' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      background: palette.bg, color: palette.fg, letterSpacing: '0.02em',
    }}>{type}</span>
  );
}

window.DART_NAV = DART_NAV;
window.DartSidebar = DartSidebar;
window.CompanySearchCompact = CompanySearchCompact;
window.Sparkline = Sparkline;
window.KPICard = KPICard;
window.CompanyHeader = CompanyHeader;
window.DiscBadge = DiscBadge;

/* ==============================================
   Five admin shell variations.
   Each is sized to fit 1280×760 artboard.
   ============================================== */

/* ----- A. Indented Tree (conservative — refined current style) ----- */
function ShellA() {
  return (
    <div className="dc-shell" style={{ ...shellRoot, background: 'var(--surface-subtle)' }}>
      <aside style={{ width: 256, background: 'var(--surface-default)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
        {/* Workspace pill */}
        <div style={{ padding: '14px 12px 10px' }}>
          <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--t-neutral-4)', border: '1px solid var(--t-neutral-8)', cursor: 'pointer' }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--blue-500)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>M</span>
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'flex-start', lineHeight: 1.2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>Medigate Manager</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>Client Manager</span>
            </span>
            <Icon name="chevronDown" size={12} />
          </button>
        </div>

        {/* Nav */}
        <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {NAV.map(node => node.kind === 'single' ? (
            <a key={node.id} style={singleRow}>
              <Icon name={node.icon} size={15} />
              <span>{node.label}</span>
            </a>
          ) : (
            <div key={node.id} style={{ marginTop: 14 }}>
              <div style={groupCaption}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: node.accent }} />
                <span>{node.label}</span>
              </div>
              {node.items.map(it => {
                const active = it.active;
                return (
                  <div key={it.id} style={{ position: 'relative' }}>
                    {active && <span style={{ position: 'absolute', left: -8, top: 6, bottom: 6, width: 3, borderRadius: 2, background: node.accent }} />}
                    <a style={{ ...itemRow, color: active ? 'var(--text-default)' : 'var(--text-subtle)', background: active ? 'var(--t-neutral-6)' : 'transparent', fontWeight: active ? 600 : 500 }}>
                      <Icon name={it.icon} size={14} style={{ color: active ? node.accent : undefined }} />
                      <span style={{ flex: 1 }}>{it.label}</span>
                      {it.badge && <span style={badgeChip(node.accent)}>{it.badge}</span>}
                    </a>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer user */}
        <UserPill />
      </aside>
      <main style={shellMain}>
        <ChatPreview />
      </main>
    </div>
  );
}

/* ----- B. Card Group (groups inside soft cards) ----- */
function ShellB() {
  return (
    <div className="dc-shell" style={{ ...shellRoot, background: 'var(--medi-gray-50)' }}>
      <aside style={{ width: 280, background: 'var(--medi-gray-50)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column', padding: '12px 10px' }}>
        {/* Workspace */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px 12px' }}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg, var(--blue-400), var(--blue-700))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>M</span>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Medigate Manager</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>관리자 워크스페이스</div>
          </div>
          <button style={iconBtn}><Icon name="chevronDown" size={12} /></button>
        </div>

        <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {NAV.map(node => node.kind === 'single' ? (
            <a key={node.id} style={{ ...singleRow, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)' }}>
              <Icon name={node.icon} size={15} />
              <span style={{ fontWeight: 600 }}>{node.label}</span>
            </a>
          ) : (
            <div key={node.id} style={{
              background: 'var(--surface-default)',
              border: '1px solid var(--t-neutral-8)',
              borderRadius: 12,
              padding: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 6px' }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: hexAlpha(node.accent, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: node.accent }}>
                  <Icon name={node.items[0].icon} size={10} strokeWidth={2.4} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-default)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{node.label}</span>
              </div>
              {node.items.map(it => {
                const active = it.active;
                return (
                  <a key={it.id} style={{
                    ...itemRow,
                    padding: '8px 10px',
                    color: active ? 'white' : 'var(--text-default)',
                    background: active ? node.accent : 'transparent',
                    fontWeight: active ? 600 : 500,
                    borderRadius: 8,
                  }}>
                    <Icon name={it.icon} size={14} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.badge && <span style={{
                      fontSize: 9, padding: '2px 5px', borderRadius: 4,
                      background: active ? 'rgba(255,255,255,.25)' : hexAlpha(node.accent, 0.12),
                      color: active ? 'white' : node.accent, fontWeight: 700, letterSpacing: '0.04em',
                    }}>{it.badge}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <UserPill variant="card" />
      </aside>
      <main style={shellMain}>
        <ChatPreview />
      </main>
    </div>
  );
}

/* ----- C. Compact Pill (tight, full-pill rows) ----- */
function ShellC() {
  return (
    <div className="dc-shell" style={{ ...shellRoot, background: 'var(--surface-default)' }}>
      <aside style={{ width: 224, background: 'var(--surface-default)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 12px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--neutral-900)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10 }}>M</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Medigate</span>
          <button style={{ ...iconBtn, width: 22, height: 22, marginLeft: 'auto' }}><Icon name="chevronDown" size={11} /></button>
        </div>

        {/* search */}
        <div style={{ padding: '4px 12px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'var(--t-neutral-6)', fontSize: 11, color: 'var(--text-subtle)' }}>
            <Icon name="search" size={12} />
            <span style={{ flex: 1 }}>검색</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, background: 'var(--surface-default)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--t-neutral-8)' }}>⌘K</span>
          </div>
        </div>

        <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '2px 8px' }}>
          {NAV.map(node => node.kind === 'single' ? (
            <a key={node.id} style={{ ...pillRow }}>
              <Icon name={node.icon} size={13} />
              <span>{node.label}</span>
            </a>
          ) : (
            <div key={node.id} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 12px 4px' }}>
                {node.label}
              </div>
              {node.items.map(it => {
                const active = it.active;
                return (
                  <a key={it.id} style={{
                    ...pillRow,
                    background: active ? node.accent : 'transparent',
                    color: active ? 'white' : 'var(--text-default)',
                    fontWeight: active ? 600 : 500,
                  }}>
                    <Icon name={it.icon} size={13} style={{ color: active ? 'white' : 'var(--text-subtle)' }} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.badge && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999, background: active ? 'rgba(255,255,255,.22)' : hexAlpha(node.accent, 0.12), color: active ? 'white' : node.accent, fontWeight: 700 }}>{it.badge}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <UserPill variant="tight" />
      </aside>
      <main style={shellMain}>
        <ChatPreview density="tight" />
      </main>
    </div>
  );
}

/* ----- D. Rail + Drawer (experimental — icon rail + group panel) ----- */
function ShellD() {
  const groups = NAV.filter(n => n.kind === 'group');
  const activeGroup = groups.find(g => g.items.some(i => i.active));

  return (
    <div className="dc-shell" style={{ ...shellRoot, background: 'var(--surface-default)' }}>
      {/* Rail */}
      <aside style={{ width: 64, background: 'var(--darkblue-900)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg, var(--blue-400), var(--blue-700))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>M</span>
        <div style={{ width: 32, height: 1, background: 'rgba(255,255,255,.12)', margin: '4px 0' }} />

        {/* Home */}
        <RailBtn icon="home" label="홈" />
        {/* Group icons */}
        {groups.map(g => (
          <RailBtn key={g.id}
            icon={g.items[0].icon}
            label={g.label}
            active={g === activeGroup}
            accent={g.accent}
          />
        ))}

        <div style={{ flex: 1 }} />
        <RailBtn icon="bell" label="알림" />
        <RailBtn icon="settings" label="설정" />
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--agent-500)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11.5, marginTop: 6, border: '2px solid rgba(255,255,255,.12)'
        }}>{USER.initials}</div>
      </aside>

      {/* Drawer */}
      <aside style={{ width: 244, background: 'var(--surface-default)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 18px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: hexAlpha(activeGroup.accent, 0.14), color: activeGroup.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={activeGroup.items[0].icon} size={13} strokeWidth={2.3} />
            </span>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>그룹</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>{activeGroup.label}</div>
            </div>
          </div>
        </div>

        <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 10px' }}>
          {activeGroup.items.map(it => {
            const active = it.active;
            return (
              <a key={it.id} style={{
                ...itemRow,
                padding: '9px 12px',
                marginBottom: 2,
                borderRadius: 10,
                background: active ? hexAlpha(activeGroup.accent, 0.10) : 'transparent',
                color: active ? 'var(--text-default)' : 'var(--text-default)',
                fontWeight: active ? 600 : 500,
                position: 'relative',
              }}>
                {active && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 4, height: 4, borderRadius: 99, background: activeGroup.accent }} />}
                <Icon name={it.icon} size={14} style={{ color: active ? activeGroup.accent : 'var(--text-subtle)' }} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.badge && <span style={badgeChip(activeGroup.accent)}>{it.badge}</span>}
              </a>
            );
          })}

          <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--t-neutral-8)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', padding: '0 12px 8px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>최근 대화</div>
            {['오늘의 캠페인 KPI', 'GPT-4 vs Claude 비교', '제약 마케팅 트렌드'].map((t, i) => (
              <a key={i} style={{ ...itemRow, padding: '7px 12px', color: 'var(--text-subtle)', fontSize: 12, fontWeight: 500 }}>
                <Icon name="message" size={12} />
                <span className="truncate" style={{ flex: 1 }}>{t}</span>
              </a>
            ))}
          </div>
        </nav>
      </aside>

      <main style={shellMain}>
        <ChatPreview />
      </main>
    </div>
  );
}

function RailBtn({ icon, label, active, accent }) {
  return (
    <button title={label} style={{
      width: 40, height: 40, borderRadius: 12, border: 'none',
      background: active ? hexAlpha(accent || '#fff', 0.20) : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,.62)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', position: 'relative',
    }}>
      {active && <span style={{ position: 'absolute', left: -8, top: 10, bottom: 10, width: 3, borderRadius: 2, background: accent }} />}
      <Icon name={icon} size={17} strokeWidth={1.9} />
    </button>
  );
}

/* ----- E. Command Workspace (Linear/Notion-inspired with prominent search) ----- */
function ShellE() {
  return (
    <div className="dc-shell" style={{ ...shellRoot, background: 'var(--surface-tertiary)' }}>
      <aside style={{ width: 288, background: 'var(--surface-tertiary)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column', padding: '14px 14px 10px' }}>
        {/* Workspace block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 12px' }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--neutral-900)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>M</span>
          <div style={{ flex: 1, lineHeight: 1.25 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.005em' }}>Medigate</div>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{USER.email}</div>
          </div>
          <button style={iconBtn}><Icon name="chevronDown" size={12} /></button>
        </div>

        {/* Cmd+K search bar */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10,
          background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)', cursor: 'pointer',
          fontSize: 12, color: 'var(--text-subtle)', marginBottom: 14,
        }}>
          <Icon name="search" size={13} />
          <span style={{ flex: 1, textAlign: 'left' }}>검색 또는 명령 실행</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--t-neutral-6)', padding: '2px 6px', borderRadius: 4 }}>⌘K</span>
        </button>

        {/* Pinned/quick */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', padding: '0 4px 6px', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            <Icon name="pin" size={11} />
            <span>고정</span>
          </div>
          {[
            { icon: 'message', label: '에이전트 챗', active: true, accent: 'var(--agent-500)' },
            { icon: 'barChart', label: '성과 대시보드', accent: 'var(--blue-500)' },
          ].map((p, i) => (
            <a key={i} style={{
              ...pillRow,
              padding: '7px 10px',
              borderRadius: 8,
              background: p.active ? hexAlpha(p.accent, 0.10) : 'transparent',
              fontWeight: p.active ? 600 : 500,
            }}>
              <Icon name={p.icon} size={13} style={{ color: p.active ? p.accent : 'var(--text-subtle)' }} />
              <span style={{ flex: 1 }}>{p.label}</span>
              {p.active && <span style={{ width: 4, height: 4, borderRadius: 99, background: p.accent }} />}
            </a>
          ))}
        </div>

        {/* Spaces (groups, minimal) */}
        <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', padding: '0 4px 6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>스페이스</div>
          {NAV.filter(n => n.kind === 'group').map(g => (
            <details key={g.id} open={g.id === 'agent'} style={{ marginBottom: 4 }}>
              <summary style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)',
                listStyle: 'none',
              }}>
                <Icon name="chevronRight" size={11} style={{ transform: 'rotate(90deg)', color: 'var(--text-subtle)' }} />
                <span style={{ color: g.accent, fontFamily: 'var(--font-mono)', fontSize: 12 }}>#</span>
                <span style={{ flex: 1 }}>{g.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{g.items.length}</span>
              </summary>
              <div style={{ paddingLeft: 14 }}>
                {g.items.map(it => {
                  const active = it.active;
                  return (
                    <a key={it.id} style={{
                      ...pillRow,
                      padding: '6px 10px',
                      borderRadius: 7,
                      fontSize: 12.5,
                      color: active ? 'var(--text-default)' : 'var(--text-subtle)',
                      background: active ? 'var(--t-neutral-6)' : 'transparent',
                      fontWeight: active ? 600 : 500,
                    }}>
                      <Icon name={it.icon} size={12} style={{ color: active ? g.accent : 'var(--text-subtle)' }} />
                      <span style={{ flex: 1 }}>{it.label}</span>
                      {it.badge && <span style={badgeChip(g.accent)}>{it.badge}</span>}
                    </a>
                  );
                })}
              </div>
            </details>
          ))}
        </nav>

        <UserPill variant="minimal" />
      </aside>
      <main style={shellMain}>
        <ChatPreview />
      </main>
    </div>
  );
}

/* ----- Shared user pill in multiple flavors ----- */
function UserPill({ variant = 'default' }) {
  const base = (
    <>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{USER.initials}</div>
      <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }} className="truncate">{USER.name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }} className="truncate">{USER.email}</div>
      </div>
      <button style={iconBtn}><Icon name="more" size={13} /></button>
    </>
  );
  if (variant === 'card') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-default)', border: '1px solid var(--t-neutral-8)', marginTop: 8 }}>{base}</div>;
  }
  if (variant === 'tight') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: '1px solid var(--t-neutral-8)' }}>{base}</div>;
  }
  if (variant === 'minimal') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px', borderTop: '1px solid var(--t-neutral-8)', marginTop: 6 }}>{base}</div>;
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--t-neutral-8)' }}>{base}</div>;
}

/* ----- Shared style objects ----- */
const shellRoot = { width: '100%', height: '100%', display: 'flex', overflow: 'hidden' };
const shellMain = { flex: 1, display: 'flex', minWidth: 0 };

const groupCaption = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 12px 4px', fontSize: 10.5, fontWeight: 600,
  color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em',
};

const singleRow = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 12px', borderRadius: 8, color: 'var(--text-default)',
  fontSize: 13, cursor: 'pointer', textDecoration: 'none', fontWeight: 500,
};

const itemRow = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '7px 12px', borderRadius: 8, color: 'var(--text-default)',
  fontSize: 12.5, cursor: 'pointer', textDecoration: 'none', fontWeight: 500,
};

const pillRow = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 12px', borderRadius: 999, color: 'var(--text-default)',
  fontSize: 12, cursor: 'pointer', textDecoration: 'none', fontWeight: 500,
};

function badgeChip(accent) {
  return {
    fontSize: 9, padding: '1px 5px', borderRadius: 4,
    background: hexAlpha(accent, 0.16), color: accent, fontWeight: 700, letterSpacing: '0.04em',
  };
}

function hexAlpha(c, a) {
  // accept css var() — fall back to neutral; use color-mix
  if (c.startsWith('var(')) return `color-mix(in srgb, ${c} ${Math.round(a*100)}%, transparent)`;
  return c;
}

Object.assign(window, { ShellA, ShellB, ShellC, ShellD, ShellE });

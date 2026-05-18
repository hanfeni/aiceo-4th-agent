/* ==============================================
   Chat UI — interactive
   ============================================== */

const { useState, useRef, useEffect, useMemo, useCallback } = React;

function ChatAgentUI() {
  const [conversations, setConversations] = useState(() => makeInitialConversations());
  const [activeId, setActiveId] = useState('c-today-1');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [openSource, setOpenSource] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [convOpen, setConvOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const convWrapRef = useRef(null);

  const active = conversations.find(c => c.id === activeId) || conversations[0];

  /* group conversations for display */
  const grouped = useMemo(() => {
    const map = new Map();
    const q = searchQuery.trim().toLowerCase();
    conversations.forEach(c => {
      if (q && !c.title.toLowerCase().includes(q)) return;
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group).push(c);
    });
    return Array.from(map.entries());
  }, [conversations, searchQuery]);

  /* scroll to bottom on message change */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active.messages.length, streaming, active.id]);

  /* close conv popover on outside click */
  useEffect(() => {
    if (!convOpen) return;
    function onClick(e) {
      if (convWrapRef.current && !convWrapRef.current.contains(e.target)) {
        setConvOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [convOpen]);

  /* ---------- streaming response simulation ---------- */
  const streamResponse = useCallback((convId, userPrompt) => {
    setStreaming(true);
    const fullResponse = fakeAnswerFor(userPrompt);
    const sources = pickSources(userPrompt);

    // Insert empty assistant message
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c,
      messages: [...c.messages, { role: 'assistant', content: '', sources, ts: nowStr(), liked: null, streaming: true }],
    } : c));

    let i = 0;
    const tick = () => {
      const chunk = fullResponse.slice(0, i);
      setConversations(prev => prev.map(c => {
        if (c.id !== convId) return c;
        const msgs = c.messages.slice();
        const lastIdx = msgs.length - 1;
        msgs[lastIdx] = { ...msgs[lastIdx], content: chunk };
        return { ...c, messages: msgs };
      }));
      if (i >= fullResponse.length) {
        // done
        setConversations(prev => prev.map(c => {
          if (c.id !== convId) return c;
          const msgs = c.messages.slice();
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false };
          return { ...c, messages: msgs };
        }));
        setStreaming(false);
        return;
      }
      // variable chunk size
      i = Math.min(fullResponse.length, i + Math.floor(Math.random() * 8) + 6);
      setTimeout(tick, 28);
    };
    setTimeout(tick, 200);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming) return;
    const userMsg = {
      role: 'user',
      content: input.trim(),
      attachments,
      ts: nowStr(),
    };
    const convId = active.id;
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c, messages: [...c.messages, userMsg],
    } : c));
    setInput('');
    setAttachments([]);
    streamResponse(convId, userMsg.content);
  }, [input, attachments, streaming, active.id, streamResponse]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNew = () => {
    const id = 'c-new-' + Date.now();
    const fresh = { id, title: '새 대화', group: '오늘', preview: '', messages: [] };
    setConversations(prev => [fresh, ...prev]);
    setActiveId(id);
    setInput('');
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  };

  const onChip = (txt) => {
    setInput(txt);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  };

  const onAttach = () => {
    // Mock pick
    const candidates = [
      { name: '캠페인_요약_2025Q2.pdf', size: '184 KB' },
      { name: '의사_커뮤니티_샘플.csv', size: '42 KB' },
      { name: 'screen-2026-05-12.png', size: '1.1 MB' },
    ];
    const next = candidates[attachments.length % candidates.length];
    setAttachments(prev => [...prev, next]);
  };

  const onLike = (idx, dir) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== active.id) return c;
      const msgs = c.messages.slice();
      msgs[idx] = { ...msgs[idx], liked: msgs[idx].liked === dir ? null : dir };
      return { ...c, messages: msgs };
    }));
  };

  const onRegenerate = (idx) => {
    // Take previous user message
    const userIdx = idx - 1;
    if (userIdx < 0) return;
    const userMsg = active.messages[userIdx];
    setConversations(prev => prev.map(c => {
      if (c.id !== active.id) return c;
      return { ...c, messages: c.messages.slice(0, idx) };
    }));
    streamResponse(active.id, userMsg.content);
  };

  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--surface-default)', overflow: 'hidden' }}>
      {/* ---------- Outer admin sidebar (compact) ---------- */}
      <AdminCompactSidebar />

      {/* ---------- Main chat ---------- */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface-default)' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderBottom: '1px solid var(--t-neutral-8)',
          background: 'var(--surface-default)',
          height: 56, flexShrink: 0,
        }}>
          {/* Left — title only */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <span className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-default)', letterSpacing: '-0.005em' }}>{active.title}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>· {active.messages.length}개 메시지</span>
          </div>

          {/* Right — actions cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ModelPicker />
            <span style={{ width: 1, height: 18, background: 'var(--t-neutral-12)', margin: '0 6px' }} />

            <button style={headerIconBtn} title="북마크"
              onMouseOver={e => e.currentTarget.style.background = 'var(--t-neutral-8)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <Icon name="bookmark" size={15} />
            </button>

            {/* History toggle + popover (anchored container) */}
            <div ref={convWrapRef} style={{ position: 'relative', display: 'flex' }}>
              <button
                onClick={() => setConvOpen(v => !v)}
                title={`대화 기록 (${conversations.length})`}
                style={{
                  ...headerIconBtn,
                  background: convOpen ? 'var(--t-neutral-8)' : 'transparent',
                }}
                onMouseOver={e => { if (!convOpen) e.currentTarget.style.background = 'var(--t-neutral-8)'; }}
                onMouseOut={e => { if (!convOpen) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name="history" size={15} />
              </button>
              {convOpen && (
                <ConvHistoryPopover
                  activeId={active.id}
                  onSelect={(id) => { setActiveId(id); setConvOpen(false); }}
                  onClose={() => setConvOpen(false)}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  grouped={grouped}
                />
              )}
            </div>

            <button onClick={startNew} style={headerIconBtn} title="새 대화"
              onMouseOver={e => e.currentTarget.style.background = 'var(--t-neutral-8)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <Icon name="edit" size={15} />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 0', background: 'var(--surface-default)' }}>
          {active.messages.length === 0 ? (
            <EmptyState onChip={onChip} />
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {active.messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  msg={m}
                  index={i}
                  onSourceClick={setOpenSource}
                  onLike={onLike}
                  onRegenerate={onRegenerate}
                />
              ))}
              {streaming && active.messages[active.messages.length - 1]?.role === 'assistant' && (
                <div style={{ paddingLeft: 38, color: 'var(--agent-500)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DotPulse />
                  <span>응답 생성 중…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input bar */}
        <InputBar
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onKey={handleKey}
          attachments={attachments}
          onAttach={onAttach}
          onRemoveAttach={(i) => setAttachments(prev => prev.filter((_, k) => k !== i))}
          streaming={streaming}
        />
      </main>

      {/* Source detail drawer */}
      {openSource && <SourceDrawer sourceId={openSource} onClose={() => setOpenSource(null)} />}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function AdminCompactSidebar() {
  /* B · Card Group — 280px wide, groups as soft cards */
  return (
    <aside style={{ width: 280, background: 'var(--medi-gray-50)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column', padding: '12px 10px', flexShrink: 0 }}>
      {/* Workspace pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px 12px' }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg, var(--blue-400), var(--blue-700))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>M</span>
        <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-default)' }}>Medigate Manager</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>관리자 워크스페이스</div>
        </div>
        <button style={iconBtn}><Icon name="chevronDown" size={12} /></button>
      </div>

      {/* Nav — single + groups in cards */}
      <nav className="thin-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {NAV.map(node => node.kind === 'single' ? (
          <a key={node.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)',
            color: 'var(--text-default)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'none',
          }}>
            <Icon name={node.icon} size={15} />
            <span>{node.label}</span>
          </a>
        ) : (
          <div key={node.id} style={{
            background: 'var(--surface-default)',
            border: '1px solid var(--t-neutral-8)',
            borderRadius: 12,
            padding: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 6px' }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, background: 'color-mix(in srgb, ' + node.accent + ' 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: node.accent }}>
                <Icon name={node.items[0].icon} size={10} strokeWidth={2.4} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-default)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{node.label}</span>
            </div>
            {node.items.map(it => {
              const active = it.active;
              return (
                <a key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  color: active ? 'white' : 'var(--text-default)',
                  background: active ? node.accent : 'transparent',
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  textDecoration: 'none', cursor: 'pointer',
                }}>
                  <Icon name={it.icon} size={14} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.badge && <span style={{
                    fontSize: 9, padding: '2px 5px', borderRadius: 4,
                    background: active ? 'rgba(255,255,255,.25)' : 'color-mix(in srgb, ' + node.accent + ' 12%, transparent)',
                    color: active ? 'white' : node.accent, fontWeight: 700, letterSpacing: '0.04em',
                  }}>{it.badge}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-default)', border: '1px solid var(--t-neutral-8)', marginTop: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{USER.initials}</div>
        <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
          <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>{USER.name}</div>
          <div className="truncate" style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>{USER.email}</div>
        </div>
        <button style={iconBtn}><Icon name="more" size={13} /></button>
      </div>
    </aside>
  );
}

function ModelPicker() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState('GPT-4');
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        borderRadius: 8, border: '1px solid var(--t-neutral-8)',
        background: 'var(--surface-default)', fontSize: 12, color: 'var(--text-default)',
        cursor: 'pointer', fontWeight: 500,
      }}>
        <Icon name="brain" size={12} style={{ color: 'var(--agent-500)' }} />
        {model}
        <Icon name="chevronDown" size={11} style={{ color: 'var(--text-subtle)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20,
          background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
          borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 6, minWidth: 220,
        }}>
          {['GPT-4', 'Claude 3.5 Sonnet', '내부 모델 (Medi-7B)'].map(m => (
            <button key={m} onClick={() => { setModel(m); setOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              width: '100%', border: 'none', background: model === m ? 'var(--agent-50)' : 'transparent',
              borderRadius: 7, fontSize: 12.5, cursor: 'pointer', color: 'var(--text-default)', textAlign: 'left',
            }}>
              {model === m ? <Icon name="check" size={13} style={{ color: 'var(--agent-600)' }} /> : <span style={{ width: 13 }} />}
              <span style={{ flex: 1 }}>{m}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onChip }) {
  return (
    <div style={{
      maxWidth: 720, margin: '0 auto', padding: '20px 28px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
      minHeight: '100%', justifyContent: 'center',
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 20,
        background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', boxShadow: '0 10px 30px -10px var(--agent-400)',
      }}>
        <Icon name="sparkles" size={28} strokeWidth={2} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>
          안녕하세요, {USER.name}님
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-subtle)', marginTop: 6, lineHeight: 1.6 }}>
          광고주 · 캠페인 · 의사 커뮤니티 · 사용성 데이터를 자연어로 질문하세요.
          <br />추천 질문을 선택하거나 직접 입력하실 수 있습니다.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 600 }}>
        {SUGGESTED_PROMPTS.map((p, i) => (
          <button key={i} onClick={() => onChip(p.text)} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', borderRadius: 12,
            border: '1px solid var(--t-neutral-8)',
            background: 'var(--surface-default)',
            fontSize: 12.5, color: 'var(--text-default)',
            cursor: 'pointer', textAlign: 'left', lineHeight: 1.45,
            transition: 'all .15s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--agent-300)'; e.currentTarget.style.background = 'var(--agent-50)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--t-neutral-8)'; e.currentTarget.style.background = 'var(--surface-default)'; }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 7, flexShrink: 0,
              background: 'var(--agent-100)', color: 'var(--agent-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name={p.icon} size={12} strokeWidth={2.1} /></span>
            <span style={{ flex: 1 }}>{p.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg, index, onSourceClick, onLike, onRegenerate }) {
  if (msg.role === 'user') {
    /* Always A · right gray bubble for text; file cards use Slack-style chip design */
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{
            background: 'var(--medi-gray-100)',
            padding: '10px 14px', borderRadius: 14,
            fontSize: 14, lineHeight: 1.55, color: 'var(--text-default)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{msg.content}</div>

          {msg.attachments && msg.attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
              {msg.attachments.map((f, i) => (
                <div key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px 6px 8px', borderRadius: 8,
                  background: 'var(--surface-tertiary)', border: '1px solid var(--t-neutral-8)',
                  fontSize: 11.5,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: 'var(--t-neutral-8)', color: 'var(--text-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name="fileText" size={12} /></span>
                  <span style={{ fontWeight: 600, color: 'var(--text-default)' }}>{f.name}</span>
                  <span style={{ color: 'var(--text-subtle)' }}>{f.size}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>{msg.ts}</div>
        </div>
      </div>
    );
  }
  /* assistant */
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
        background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 2,
      }}>
        <Icon name="sparkles" size={14} strokeWidth={2.1} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-default)' }}>에이전트</span>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· {msg.ts}</span>
        </div>
        <div style={{ minHeight: 22 }}>
          {renderMarkdown(msg.content, msg.sources, onSourceClick)}
          {msg.streaming && <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--agent-500)', marginLeft: 2, verticalAlign: '-2px', animation: 'blink 1s steps(2) infinite' }} />}
        </div>

        {msg.sources && msg.sources.length > 0 && !msg.streaming && (
          <SourcesPanel sources={msg.sources} onClick={onSourceClick} />
        )}

        {!msg.streaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 10, color: 'var(--text-subtle)' }}>
            <button style={msgAction} onClick={() => onLike(index, 'up')}>
              <Icon name="thumbsUp" size={13} style={msg.liked === 'up' ? { color: 'var(--agent-600)' } : null} />
            </button>
            <button style={msgAction} onClick={() => onLike(index, 'down')}>
              <Icon name="thumbsDown" size={13} style={msg.liked === 'down' ? { color: 'var(--red-500)' } : null} />
            </button>
            <button style={msgAction} title="복사"><Icon name="copy" size={13} /></button>
            <button style={msgAction} onClick={() => onRegenerate(index)} title="재생성"><Icon name="refresh" size={13} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function SourcesPanel({ sources, onClick }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px dashed var(--t-neutral-16)' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
        References · {sources.length}
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sources.map((sid, i) => {
          const s = SOURCE_LIBRARY[sid];
          if (!s) return null;
          return (
            <li key={sid} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, lineHeight: 1.55 }}>
              <sup style={{
                color: 'var(--agent-600)', fontWeight: 700, fontSize: 10,
                minWidth: 16, textAlign: 'right', flexShrink: 0,
              }}>[{i + 1}]</sup>
              <span style={{ color: 'var(--text-default)' }}>
                <strong style={{ fontWeight: 600 }}>{s.title}</strong>
                <span style={{ color: 'var(--text-subtle)' }}> — {s.author}, {s.date}</span>
                <button
                  onClick={() => onClick(sid)}
                  style={{
                    marginLeft: 6, color: 'var(--agent-600)',
                    textDecoration: 'underline', cursor: 'pointer',
                    background: 'none', border: 'none', padding: 0,
                    font: 'inherit', fontSize: 11.5,
                  }}
                >원문 열기 ↗</button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ConvHistoryPopover({ activeId, onSelect, onClose, searchQuery, setSearchQuery, grouped }) {
  return (
    <div style={{
      position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 100,
      width: 340, maxHeight: 520,
      background: 'var(--surface-default)',
      border: '1px solid var(--t-neutral-12)',
      borderRadius: 12,
      boxShadow: '0 16px 48px -16px rgba(15,23,42,.18), 0 4px 12px -4px rgba(15,23,42,.06)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'popoverIn .15s ease-out',
    }}>
      {/* Search */}
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
          background: 'var(--t-neutral-6)', borderRadius: 8, fontSize: 12,
        }}>
          <Icon name="search" size={12} style={{ color: 'var(--text-subtle)' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="대화 검색"
            autoFocus
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-default)', minWidth: 0 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{
              width: 16, height: 16, borderRadius: 5, border: 'none',
              background: 'var(--t-neutral-12)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-subtle)',
            }}>
              <Icon name="x" size={9} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
        {grouped.length === 0 ? (
          <div style={{ padding: '24px 8px', fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center' }}>
            일치하는 대화가 없습니다
          </div>
        ) : grouped.map(([group, items]) => (
          <div key={group} style={{ marginTop: 4 }}>
            <div style={{ padding: '6px 8px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</div>
            {items.map(c => {
              const isActive = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: isActive ? 'var(--agent-50)' : 'transparent',
                    color: 'var(--text-default)',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    marginBottom: 1, position: 'relative',
                    transition: 'background .12s',
                  }}
                  onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'var(--t-neutral-6)'; }}
                  onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {isActive && <span style={{ position: 'absolute', left: -4, top: 6, bottom: 6, width: 3, borderRadius: 2, background: 'var(--agent-500)' }} />}
                  <span className="truncate" style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: 'var(--text-default)' }}>{c.title}</span>
                  {c.preview && (
                    <span className="truncate" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{c.preview}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--t-neutral-8)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10.5, color: 'var(--text-subtle)',
      }}>
        <span>총 {grouped.reduce((s, [_, items]) => s + items.length, 0)}개 대화</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>ESC ↵ 닫기</span>
      </div>
    </div>
  );
}

function SourceDrawer({ sourceId, onClose }) {
  const s = SOURCE_LIBRARY[sourceId];
  if (!s) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.32)', zIndex: 50 }} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, zIndex: 60,
        background: 'var(--surface-default)', borderLeft: '1px solid var(--t-neutral-8)',
        boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
        animation: 'slideIn .18s ease-out',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--t-neutral-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={SOURCE_ICONS[s.type]} size={14} style={{ color: 'var(--agent-600)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-default)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{SOURCE_LABELS[s.type]} 원본</span>
          </div>
          <button onClick={onClose} style={iconBtn}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.01em', marginBottom: 6 }}>{s.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 16 }}>{s.author} · {s.date}</div>
          <div style={{ padding: '14px 16px', background: 'var(--surface-tertiary)', borderRadius: 10, fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-default)' }}>
            {s.snippet}
          </div>
          <button style={{
            marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 9,
            background: 'var(--agent-500)', color: 'white', border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600,
          }}>
            <Icon name="externalLink" size={12} />
            원본에서 열기
          </button>
        </div>
      </div>
    </>
  );
}

function InputBar({ inputRef, value, onChange, onSend, onKey, attachments, onAttach, onRemoveAttach, streaming }) {
  const canSend = !!value.trim() && !streaming;
  return (
    <div style={{ padding: '14px 24px 20px', background: 'var(--surface-default)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{
          border: '1.5px solid var(--agent-200)',
          borderRadius: 22, background: 'white',
          boxShadow: '0 14px 40px -12px color-mix(in srgb, var(--agent-300) 60%, transparent), 0 4px 10px -4px rgba(15,23,42,.05)',
          padding: '12px 14px',
          transition: 'border-color .15s, box-shadow .15s',
        }}>
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 2px 8px' }}>
              {attachments.map((f, i) => (
                <div key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 8px 5px 10px', borderRadius: 8,
                  background: 'var(--agent-50)', color: 'var(--agent-700)',
                  fontSize: 11.5, fontWeight: 500, border: '1px solid var(--agent-200)',
                }}>
                  <Icon name="paperclip" size={11} />
                  <span>{f.name}</span>
                  <button onClick={() => onRemoveAttach(i)} style={{
                    width: 16, height: 16, borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--agent-700)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name="x" size={10} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '4px 2px' }}>
            <Icon name="sparkles" size={16} style={{ color: 'var(--agent-500)', marginBottom: 10, flexShrink: 0 }} strokeWidth={2.1} />
            <textarea
              ref={inputRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={onKey}
              placeholder="무엇을 도와드릴까요? (Shift+Enter 줄바꿈)"
              rows={1}
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14.5, lineHeight: 1.5, color: 'var(--text-default)',
                fontFamily: 'inherit', resize: 'none', padding: '6px 0', maxHeight: 160,
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
            />
            <button
              onClick={onSend}
              disabled={!canSend}
              style={{
                width: 36, height: 36, borderRadius: 12, border: 'none',
                background: canSend ? 'linear-gradient(135deg, var(--agent-400), var(--agent-600))' : 'var(--t-neutral-12)',
                color: canSend ? 'white' : 'var(--text-subtle)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: canSend ? '0 4px 12px -4px var(--agent-500)' : 'none',
                transition: 'all .15s',
              }}
              title="전송 (Enter)"
            >
              <Icon name="arrowUp" size={17} strokeWidth={2.3} />
            </button>
          </div>

          {/* Tool chips */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--t-neutral-6)',
          }}>
            <button onClick={onAttach} style={toolChip}>
              <Icon name="paperclip" size={11} />
              첨부
            </button>
            <button style={toolChip}>
              <Icon name="image" size={11} />
              이미지
            </button>
            <button style={toolChip}>
              <Icon name="database" size={11} />
              데이터 소스
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
              GPT-4 · 컨텍스트 8K
            </span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-subtle)', textAlign: 'center' }}>
          에이전트 응답은 검토 후 사용하세요. 출처를 항상 확인해주세요.
        </div>
      </div>
    </div>
  );
}

const toolChip = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 999,
  border: '1px solid var(--t-neutral-8)', background: 'white',
  fontSize: 11.5, fontWeight: 500, color: 'var(--text-default)', cursor: 'pointer',
};

function DotPulse() {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.2s ease-in-out infinite' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.2s ease-in-out infinite .15s' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.2s ease-in-out infinite .30s' }} />
    </span>
  );
}

const msgAction = {
  width: 26, height: 26, borderRadius: 7, border: 'none',
  background: 'transparent', color: 'var(--text-subtle)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const headerIconBtn = {
  width: 32, height: 32, borderRadius: 8, border: 'none',
  background: 'transparent', color: 'var(--text-default)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .12s',
};

/* ---------- helpers ---------- */
function nowStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fakeAnswerFor(prompt) {
  const p = prompt.toLowerCase();
  if (/roas|광고주|캠페인/.test(p)) {
    return `## 캠페인 ROAS 상위 5개 광고주

직전 30일 검색광고 기준, **ROAS 상위 5개 광고주**는 다음과 같습니다. {{1}}

### 1위 — 한미제약 (당뇨/대사)
- ROAS **5.8x**, 노출 의사 인증 비중 **71%**
- 핵심 키워드: \`위고비\`, \`마운자로\`, \`GLP-1\`

### 2위 — 종근당 (순환기)
- ROAS **4.7x**, 캠페인 12건 운영
- 인라인 광고 CTR 대비 검색광고 CTR이 **3.2배** 높음

### 3위 — JW중외 (소화기)
- ROAS **4.1x**
- 의사 커뮤니티 게시글과 키워드 동조성 가장 높음

> 위 분석은 \`agentbar_session_history\` 와 \`campaign_perf\` 조인 결과 기준입니다.`;
  }
  return `질문을 잘 이해했습니다. 관련 데이터를 검토한 결과를 정리해드리겠습니다.

### 핵심 요약
- 데이터 소스: \`opensearch.medigate.net\`, \`BigQuery\`
- 분석 기간: **최근 30일**
- 주요 신호: 사용자 세션이 평일 **14시–16시**에 집중

### 세부 사항
- 의사 인증 회원 비중이 **68%**로 가장 높음 {{1}}
- 모바일 / 데스크탑 사용 비율은 **42 : 58**
- 응답 만족도(\`👍 비율\`)는 평균 **86%**

추가로 어떤 차원으로 살펴볼까요? (예: 진료과 / 지역 / 캠페인 단위)`;
}

function pickSources(prompt) {
  const p = prompt.toLowerCase();
  if (/roas|광고주|캠페인/.test(p)) return ['s4'];
  if (/당뇨|커뮤니티|핫토픽|gpt-1|위고비/.test(p)) return ['s1', 's2', 's3'];
  return ['s1', 's4'];
}

/* Inject keyframes once */
if (!document.querySelector('#chat-keyframes')) {
  const tag = document.createElement('style');
  tag.id = 'chat-keyframes';
  tag.textContent = `
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes pulse { 0%, 100% { transform: scale(0.6); opacity: .4; } 50% { transform: scale(1); opacity: 1; } }
    @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes popoverIn { from { transform: translateY(-6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `;
  document.head.appendChild(tag);
}

window.ChatAgentUI = ChatAgentUI;

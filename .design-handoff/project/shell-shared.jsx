/* ==============================================
   Shared menu data + chat preview for sidebar variations
   ============================================== */

const NAV = [
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
      { id: 'agent-chat',  icon: 'message',  label: '에이전트 챗', active: true, badge: 'NEW' },
      { id: 'pharma',      icon: 'pill',     label: '제약 인사이트' },
      { id: 'usage',       icon: 'activity', label: '사용성 지표' },
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

const PROMPT_CHIPS = [
  '제약사 마케팅에서 가장 자주 묻는 질문은?',
  '지난 30일간 사용자 세션이 가장 많았던 시간대',
  '캠페인 ROAS 상위 5개 광고주',
  '의사 커뮤니티에서 당뇨 관련 핫토픽',
];

const USER = { name: '김두환', email: 'dhkim@medicnc.co.kr', initials: 'DK', role: 'admin' };

/* ----------------------------------------------
   Shared empty-state chat preview used inside main area
   of every shell variation, so reviewer focuses on
   sidebar/header changes — not on chat differences.
   ---------------------------------------------- */
function ChatPreview({ accent = 'var(--agent-500)', density = 'normal' }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-default)',
      minWidth: 0,
    }}>
      {/* Page header inside main */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: density === 'tight' ? '14px 24px' : '18px 28px',
        borderBottom: '1px solid var(--t-neutral-8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white',
          }}>
            <Icon name="sparkles" size={12} strokeWidth={2.2} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-default)' }}>에이전트 챗</div>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>새 대화 시작 · GPT-4 기반</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-subtle)' }}>
          <button style={iconBtn}><Icon name="history" size={14} /></button>
          <button style={iconBtn}><Icon name="share" size={14} /></button>
          <button style={iconBtn}><Icon name="more" size={14} /></button>
        </div>
      </div>

      {/* Empty state */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '40px 32px',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white',
          boxShadow: '0 8px 28px -8px var(--agent-400)',
        }}>
          <Icon name="sparkles" size={26} strokeWidth={2} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>
            안녕하세요, {USER.name}님
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-subtle)', marginTop: 6 }}>
            오늘은 어떤 분석을 도와드릴까요?
          </div>
        </div>

        {/* Prompt chips */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          width: '100%',
          maxWidth: 560,
        }}>
          {PROMPT_CHIPS.map((p, i) => (
            <div key={i} style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--t-neutral-8)',
              fontSize: 12.5,
              color: 'var(--text-default)',
              background: 'var(--surface-default)',
              cursor: 'pointer',
              transition: 'all .15s',
            }}>{p}</div>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div style={{ padding: '16px 24px 22px' }}>
        <div style={{
          margin: '0 auto', maxWidth: 760,
          border: '1px solid var(--t-neutral-12)',
          borderRadius: 16,
          padding: '10px 12px',
          background: 'var(--surface-default)',
          boxShadow: '0 1px 2px rgba(15,23,42,.04)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <button style={{ ...iconBtn, color: 'var(--text-subtle)' }}><Icon name="paperclip" size={16} /></button>
          <div style={{ flex: 1, fontSize: 13.5, color: 'var(--text-subtle)', padding: '6px 4px' }}>
            메시지를 입력하세요…
          </div>
          <button style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--agent-500)', color: 'white', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon name="arrowUp" size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer',
};

window.NAV = NAV;
window.USER = USER;
window.ChatPreview = ChatPreview;
window.iconBtn = iconBtn;

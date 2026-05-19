/* ==============================================
   Chat UI — component-level variations
   File 1/2: Conversation list, Empty state, Header
   ============================================== */

/* Shared sample data */
const SAMPLE_CONVOS = [
  { id: 'c1', title: '당뇨 커뮤니티 최근 핫토픽', group: '오늘', preview: '최근 30일 당뇨 관련 게시글 1,247건…', time: '14:21', starred: true, shared: false },
  { id: 'c2', title: '제약사 마케팅 ROAS 분석', group: '오늘', preview: '한미제약 캠페인 14건의 ROAS를…', time: '11:08', starred: false, shared: true },
  { id: 'c3', title: 'GPT-4 vs Claude 사용성 비교', group: '어제', preview: '응답 길이 분포가 모델별로…', time: '어제', starred: false, shared: false },
  { id: 'c4', title: '광고주 신규 등록 절차 정리', group: '어제', preview: 'CRM 광고주 마스터 등록 순서는…', time: '어제', starred: false, shared: false },
  { id: 'c5', title: '월간 사용성 리포트 초안', group: '지난 7일', preview: '세션 16,420건 기준 평균 토큰…', time: '5/12', starred: true, shared: false },
  { id: 'c6', title: '의사 커뮤니티 자유게시판 트렌드', group: '지난 7일', preview: '전공의 처우 / 의대 정원 / 비대면…', time: '5/11', starred: false, shared: false },
  { id: 'c7', title: '검색광고 분류 콘텐트 검수', group: '지난 30일', preview: 'LLM 분류 정확도 92%, 오분류 사례…', time: '4/28', starred: false, shared: false },
];

const SAMPLE_USER_Q = '당뇨 관련 의사 커뮤니티에서 최근 30일간 가장 활발하게 논의된 토픽이 뭐야? 출처도 함께 알려줘.';

const SAMPLE_ASSIST_BODY = `## 최근 30일 당뇨 관련 핫토픽

OpenSearch에 색인된 의사 커뮤니티 게시글 **1,247건**을 분석한 결과, 다음 세 가지 토픽이 두드러집니다.

### 1. 신규 GLP-1 계열 약물 {{1}}
- 위고비 / 마운자로 처방 경험 공유가 전체 게시글의 **34%**
- 부작용 관리 및 보험 적용 문의가 가장 활발한 댓글 스레드

### 2. 1형 당뇨 인슐린 펌프 {{2}}
- 옴니팟 5 / Control-IQ 등 신규 디바이스 도입 후기
- 환자별 알고리즘 튜닝 노하우 공유 게시글이 평균 댓글 **18.4개**

> **참고:** 인용된 게시글 모두 의사 인증 회원의 글이며, 작성 시점은 \`2026-04-15\` 이후입니다.`;

const SAMPLE_SOURCES = ['s1', 's2', 's3'];

/* ==============================================
   1. CONVERSATION LIST — 4 variations
   Artboard: 296 × 640
   ============================================== */

function CL_A() {
  /* Default — time grouped with preview text */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--medi-gray-50)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 14px 8px' }}>
        <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--agent-500)', color: 'white', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="plus" size={13} strokeWidth={2.2} />새 대화
        </button>
      </div>
      <div style={{ padding: '4px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'var(--surface-default)', border: '1px solid var(--t-neutral-8)', borderRadius: 9, fontSize: 12, color: 'var(--text-subtle)' }}>
          <Icon name="search" size={12} />
          <span>대화 검색</span>
        </div>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        {groupBy(SAMPLE_CONVOS, 'group').map(([g, items]) => (
          <div key={g} style={{ marginTop: 8 }}>
            <div style={cgCap}>{g}</div>
            {items.map(c => (
              <button key={c.id} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: c.id === 'c1' ? 'var(--surface-default)' : 'transparent', boxShadow: c.id === 'c1' ? '0 0 0 1px var(--t-neutral-12)' : 'none', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 1 }}>
                <span className="truncate" style={{ fontSize: 12.5, fontWeight: c.id === 'c1' ? 600 : 500 }}>{c.title}</span>
                <span className="truncate" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{c.preview}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CL_B() {
  /* Minimal — title-only narrow rows */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'transparent', color: 'var(--text-default)', border: '1px solid var(--t-neutral-8)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          <Icon name="plus" size={12} />새 대화
        </button>
        <button style={iconBtn}><Icon name="search" size={13} /></button>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
        {groupBy(SAMPLE_CONVOS, 'group').map(([g, items]) => (
          <div key={g} style={{ marginTop: 10 }}>
            <div style={cgCap}>{g}</div>
            {items.map(c => (
              <button key={c.id} style={{ width: '100%', textAlign: 'left', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: c.id === 'c1' ? 'var(--t-neutral-6)' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}>
                {c.starred ? <Icon name="star" size={11} style={{ color: 'var(--yellow-600)' }} /> : <span style={{ width: 11, height: 11 }} />}
                <span className="truncate" style={{ fontSize: 12.5, fontWeight: c.id === 'c1' ? 600 : 500, flex: 1 }}>{c.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CL_C() {
  /* Category tabs (All / Starred / Shared) */
  const [tab, setTab] = React.useState('all');
  let items = SAMPLE_CONVOS;
  if (tab === 'starred') items = items.filter(c => c.starred);
  if (tab === 'shared') items = items.filter(c => c.shared);
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px 6px' }}>
        <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--agent-500)', color: 'white', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="plus" size={13} strokeWidth={2.2} />새 대화
        </button>
      </div>
      <div style={{ padding: '8px 12px 6px', display: 'flex', gap: 2, borderBottom: '1px solid var(--t-neutral-8)' }}>
        {[
          { id: 'all', label: '전체', count: SAMPLE_CONVOS.length },
          { id: 'starred', label: '별표', count: SAMPLE_CONVOS.filter(c => c.starred).length },
          { id: 'shared', label: '공유됨', count: SAMPLE_CONVOS.filter(c => c.shared).length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: tab === t.id ? 'var(--t-neutral-8)' : 'transparent',
            color: tab === t.id ? 'var(--text-default)' : 'var(--text-subtle)',
            fontSize: 11.5, fontWeight: tab === t.id ? 600 : 500,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {t.label}<span style={{ fontSize: 10, opacity: 0.7 }}>{t.count}</span>
          </button>
        ))}
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 12px' }}>
        {items.map(c => (
          <button key={c.id} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: c.id === 'c1' ? 'var(--t-neutral-6)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {c.starred && <Icon name="star" size={10} style={{ color: 'var(--yellow-600)' }} />}
              {c.shared && <Icon name="share" size={10} style={{ color: 'var(--blue-500)' }} />}
              <span className="truncate" style={{ fontSize: 12.5, fontWeight: c.id === 'c1' ? 600 : 500, flex: 1 }}>{c.title}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>{c.time}</span>
            </div>
            <span className="truncate" style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{c.preview}</span>
          </button>
        ))}
        {items.length === 0 && <div style={{ padding: 20, fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center' }}>대화 없음</div>}
      </div>
    </div>
  );
}

function CL_D() {
  /* Card-style — bigger cards w/ avatar dot + meta */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-tertiary)', borderRight: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)' }}>최근 대화</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>{SAMPLE_CONVOS.length}건</div>
        </div>
        <button style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--agent-500)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
        </button>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SAMPLE_CONVOS.map(c => (
          <button key={c.id} style={{
            width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
            background: 'var(--surface-default)',
            border: c.id === 'c1' ? '1px solid var(--agent-300)' : '1px solid var(--t-neutral-8)',
            display: 'flex', flexDirection: 'column', gap: 4,
            boxShadow: c.id === 'c1' ? '0 1px 2px rgba(139,92,246,.08)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: c.id === 'c1' ? 'var(--agent-500)' : 'var(--neutral-300)' }} />
              <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{c.title}</span>
              {c.starred && <Icon name="star" size={11} style={{ color: 'var(--yellow-600)' }} />}
            </div>
            <span className="truncate" style={{ fontSize: 11, color: 'var(--text-subtle)', lineHeight: 1.4 }}>{c.preview}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 10.5, color: 'var(--text-subtle)' }}>
              <Icon name="history" size={10} />{c.time}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ==============================================
   2. EMPTY STATE — 3 variations
   Artboard: 760 × 540
   ============================================== */

function ES_A() {
  /* Default — centered greeting + 2x2 prompt grid */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', gap: 18 }}>
      <div style={{ width: 60, height: 60, borderRadius: 20, background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 10px 30px -10px var(--agent-400)' }}>
        <Icon name="sparkles" size={28} strokeWidth={2} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>안녕하세요, 김두환님</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-subtle)', marginTop: 6, lineHeight: 1.6 }}>광고주 · 캠페인 · 의사 커뮤니티 · 사용성 데이터를<br />자연어로 질문하세요.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 580 }}>
        {SUGGESTED_PROMPTS.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)', fontSize: 12.5, lineHeight: 1.45, cursor: 'pointer' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, background: 'var(--agent-100)', color: 'var(--agent-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={p.icon} size={12} strokeWidth={2.1} /></span>
            <span style={{ flex: 1 }}>{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ES_B() {
  /* Big centered input + category chips (Gemini/Claude style) */
  const chips = ['🔎 캠페인 분석', '💊 제약 인사이트', '👥 사용자 행동', '📊 KPI 리포트', '🩺 의사 커뮤니티', '⚡ 빠른 질문'];
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', gap: 22 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.015em', background: 'linear-gradient(135deg, var(--agent-500), var(--blue-500))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>오늘은 무엇을 알아볼까요?</div>
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 6 }}>김두환님, 광고주·캠페인·커뮤니티 데이터를 자유롭게 질문하세요.</div>
      </div>
      <div style={{ width: '100%', maxWidth: 600 }}>
        <div style={{ border: '1px solid var(--t-neutral-12)', borderRadius: 18, padding: '14px 16px', background: 'var(--surface-default)', boxShadow: '0 4px 24px -8px rgba(139,92,246,.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="sparkles" size={16} style={{ color: 'var(--agent-500)' }} />
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text-subtle)' }}>에이전트에게 질문하세요…</span>
          <button style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--agent-500)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrowUp" size={16} strokeWidth={2.2} /></button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 14 }}>
          {chips.map((c, i) => (
            <button key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, border: '1px solid var(--t-neutral-12)', background: 'var(--surface-default)', fontSize: 12, color: 'var(--text-default)', cursor: 'pointer', fontWeight: 500 }}>{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ES_C() {
  /* Category panels: 분석 / 조사 / 리포트 */
  const cats = [
    { icon: 'barChart', color: 'var(--blue-500)', bg: 'var(--blue-50)', title: '데이터 분석', items: ['지난 30일 ROAS 상위 5개 광고주', '시간대별 사용자 세션 분포', '캠페인 CTR 비교'] },
    { icon: 'search',   color: 'var(--agent-500)', bg: 'var(--agent-50)', title: '리서치', items: ['당뇨 커뮤니티 핫토픽 요약', '제약사 마케팅 트렌드 정리', '경쟁 광고 카피 비교'] },
    { icon: 'fileText', color: 'var(--green-500)', bg: 'var(--green-50)', title: '리포트 작성', items: ['월간 사용성 리포트 초안', '주간 KPI 요약 메일', '광고주 미팅 자료 정리'] },
  ];
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', display: 'flex', flexDirection: 'column', padding: '32px 32px 24px', gap: 18 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>무엇을 도와드릴까요?</div>
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>아래 카테고리에서 시작하거나 직접 질문해보세요.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, flex: 1 }}>
        {cats.map((cat, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', borderRadius: 14, border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', background: cat.bg, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--surface-default)', color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={cat.icon} size={13} strokeWidth={2.1} /></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)' }}>{cat.title}</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px' }}>
              {cat.items.map((t, k) => (
                <button key={k} style={{ textAlign: 'left', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="arrowRight" size={11} style={{ color: cat.color, opacity: 0.7 }} />
                  <span style={{ flex: 1 }}>{t}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==============================================
   3. HEADER — 3 variations
   Artboard: 720 × 96
   ============================================== */

function HD_A() {
  /* Minimal title + actions */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', borderBottom: '1px solid var(--t-neutral-8)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-default)' }}>당뇨 커뮤니티 최근 핫토픽</span>
      <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· 4개 메시지</span>
      <div style={{ flex: 1 }} />
      <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
        <Icon name="brain" size={12} style={{ color: 'var(--agent-500)' }} />GPT-4<Icon name="chevronDown" size={11} style={{ color: 'var(--text-subtle)' }} />
      </button>
      <button style={iconBtn}><Icon name="star" size={14} /></button>
      <button style={iconBtn}><Icon name="share" size={14} /></button>
      <button style={iconBtn}><Icon name="more" size={14} /></button>
    </div>
  );
}

function HD_B() {
  /* Hero header with meta row */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', borderBottom: '1px solid var(--t-neutral-8)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 24px', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-default)' }}>당뇨 커뮤니티 최근 핫토픽</span>
        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--agent-100)', color: 'var(--agent-700)', fontWeight: 700, letterSpacing: '0.04em' }}>LIVE</span>
        <div style={{ flex: 1 }} />
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--t-neutral-8)', background: 'var(--surface-default)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          <Icon name="brain" size={12} style={{ color: 'var(--agent-500)' }} />GPT-4<Icon name="chevronDown" size={11} />
        </button>
        <button style={iconBtn}><Icon name="more" size={14} /></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-subtle)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="message" size={10} />4개 메시지</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="hash" size={10} />토큰 2,140</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="history" size={10} />업데이트 14:24</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="link" size={10} />근거 4건</span>
      </div>
    </div>
  );
}

function HD_C() {
  /* Breadcrumb header */
  return (
    <div className="dc-shell" style={{ width: '100%', height: '100%', background: 'var(--surface-default)', borderBottom: '1px solid var(--t-neutral-8)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 8 }}>
      <Icon name="home" size={13} style={{ color: 'var(--text-subtle)' }} />
      <Icon name="chevronRight" size={11} style={{ color: 'var(--text-subtle)' }} />
      <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>AI 에이전트</span>
      <Icon name="chevronRight" size={11} style={{ color: 'var(--text-subtle)' }} />
      <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>에이전트 챗</span>
      <Icon name="chevronRight" size={11} style={{ color: 'var(--text-subtle)' }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)' }}>당뇨 커뮤니티 최근 핫토픽</span>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, background: 'var(--t-green-12)', fontSize: 11, color: 'var(--green-700)', fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--green-500)' }} />응답 완료
      </div>
      <button style={iconBtn}><Icon name="more" size={14} /></button>
    </div>
  );
}

/* ==============================================
   Helpers
   ============================================== */

function groupBy(items, key) {
  const map = new Map();
  items.forEach(it => {
    if (!map.has(it[key])) map.set(it[key], []);
    map.get(it[key]).push(it);
  });
  return Array.from(map.entries());
}

const cgCap = { padding: '4px 8px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' };

Object.assign(window, { CL_A, CL_B, CL_C, CL_D, ES_A, ES_B, ES_C, HD_A, HD_B, HD_C, SAMPLE_USER_Q, SAMPLE_ASSIST_BODY, SAMPLE_SOURCES });

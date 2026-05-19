/* ==============================================
   Chat component variations — Part 1
   (Conversation list, Empty state, Header)
   ============================================== */

/* --------- Shared sample data --------- */
const CONV_ITEMS = [
  { id: 'c1', title: '당뇨 커뮤니티 최근 핫토픽',     group: '오늘',     preview: '최근 30일 당뇨 관련 게시글 1,247건…', active: true, starred: true },
  { id: 'c2', title: '제약사 마케팅 ROAS 분석',       group: '오늘',     preview: '한미제약 캠페인 14건…', },
  { id: 'c3', title: 'GPT-4 vs Claude 사용성',         group: '어제',     preview: '응답 길이 분포가 평균 280 토큰…', shared: true },
  { id: 'c4', title: '광고주 신규 등록 절차 정리',     group: '어제',     preview: 'CRM 광고주 마스터 → 인보이스…', },
  { id: 'c5', title: '월간 사용성 리포트 초안',         group: '지난 7일', preview: '세션 16,420건 기준…', starred: true },
  { id: 'c6', title: '의사 커뮤니티 자유게시판 트렌드', group: '지난 7일', preview: '전공의 처우 / 의대 정원…', },
  { id: 'c7', title: '검색광고 분류 콘텐트 검수',       group: '지난 30일', preview: 'LLM 분류 정확도 92%…', shared: true },
];

const SAMPLE_USER_Q = '당뇨 관련 의사 커뮤니티에서 최근 30일간 가장 활발하게 논의된 토픽이 뭐야? 출처도 함께 알려줘.';

const SAMPLE_ASSIST_BODY = `## 최근 30일 당뇨 관련 핫토픽

OpenSearch에 색인된 의사 커뮤니티 게시글 **1,247건**을 분석한 결과, 다음 세 가지 토픽이 두드러집니다.

### 1. 신규 GLP-1 계열 약물 {{1}}
- 위고비 / 마운자로 처방 경험 공유가 전체의 **34%**
- 부작용 관리 댓글 스레드가 가장 활발

### 2. 1형 당뇨 인슐린 펌프 {{2}}
- 옴니팟 5 도입 후기 다수
- 평균 댓글 수 18.4개

> **참고:** 인용된 게시글은 의사 인증 회원의 글입니다.`;

/* --------- Card frame wrapper for variations --------- */
function VarFrame({ children, bg = 'var(--surface-default)', padding = 0 }) {
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%',
      background: bg,
      overflow: 'hidden',
      padding,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {children}
    </div>
  );
}
window.VarFrame = VarFrame;

/* ============================================================
   1. CONVERSATION LIST · 4 variations
   ============================================================ */

/* A · 기본 - 그룹화 + 미리보기 */
function ConvList_A() {
  return (
    <VarFrame bg="var(--medi-gray-50)">
      <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid var(--t-neutral-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>대화</span>
          <button style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--t-neutral-12)', background: 'white', color: 'var(--text-default)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={13} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'white', border: '1px solid var(--t-neutral-8)', borderRadius: 8, fontSize: 12, color: 'var(--text-subtle)' }}>
          <Icon name="search" size={11} />
          <span>대화 검색</span>
        </div>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {groupConv(CONV_ITEMS).map(([group, items]) => (
          <div key={group} style={{ marginTop: 6 }}>
            <div style={{ padding: '6px 8px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</div>
            {items.map(c => (
              <div key={c.id} style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 1, cursor: 'pointer',
                background: c.active ? 'white' : 'transparent',
                boxShadow: c.active ? '0 0 0 1px var(--t-neutral-12)' : 'none',
              }}>
                <div className="truncate" style={{ fontSize: 12.5, fontWeight: c.active ? 600 : 500, color: 'var(--text-default)' }}>{c.title}</div>
                <div className="truncate" style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 1 }}>{c.preview}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </VarFrame>
  );
}

/* B · 미니멀 - 제목만 */
function ConvList_B() {
  return (
    <VarFrame>
      <div style={{ padding: '12px 14px' }}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--t-neutral-16)',
          background: 'transparent', color: 'var(--text-default)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>
          <Icon name="plus" size={13} />
          새 대화 시작
        </button>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 6px 10px' }}>
        {groupConv(CONV_ITEMS).map(([group, items]) => (
          <div key={group}>
            <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)' }}>{group}</div>
            {items.map(c => (
              <div key={c.id} style={{
                padding: '7px 12px', borderRadius: 7, marginBottom: 1, cursor: 'pointer',
                background: c.active ? 'var(--agent-50)' : 'transparent',
                color: c.active ? 'var(--text-default)' : 'var(--text-default)',
                display: 'flex', alignItems: 'center', gap: 8, position: 'relative',
              }}>
                {c.active && <span style={{ position: 'absolute', left: -6, top: 6, bottom: 6, width: 2, borderRadius: 2, background: 'var(--agent-500)' }} />}
                <span className="truncate" style={{ fontSize: 12.5, fontWeight: c.active ? 600 : 500, flex: 1 }}>{c.title}</span>
                {c.starred && <Icon name="star" size={10} style={{ color: 'var(--yellow-500)' }} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </VarFrame>
  );
}

/* C · 카드형 - 큰 카드, 메타 정보 */
function ConvList_C() {
  return (
    <VarFrame bg="var(--surface-tertiary)">
      <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>대화 기록</span>
        <button style={{
          width: 28, height: 28, borderRadius: 9, border: 'none',
          background: 'var(--agent-500)', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
        </button>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {CONV_ITEMS.slice(0, 6).map(c => (
          <div key={c.id} style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'white',
            border: '1px solid ' + (c.active ? 'var(--agent-300)' : 'var(--t-neutral-8)'),
            boxShadow: c.active ? '0 0 0 3px var(--agent-100)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon name="message" size={11} style={{ color: c.active ? 'var(--agent-500)' : 'var(--text-subtle)' }} />
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{c.group}</span>
              {c.starred && <Icon name="star" size={10} style={{ color: 'var(--yellow-500)', marginLeft: 'auto' }} />}
              {c.shared && <Icon name="share" size={10} style={{ color: 'var(--text-subtle)', marginLeft: c.starred ? 0 : 'auto' }} />}
            </div>
            <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)', marginBottom: 2 }}>{c.title}</div>
            <div className="truncate" style={{ fontSize: 11.5, color: 'var(--text-subtle)', lineHeight: 1.45 }}>{c.preview}</div>
          </div>
        ))}
      </div>
    </VarFrame>
  );
}

/* D · 탭형 - 전체/별표/공유 */
function ConvList_D() {
  const tabs = [
    { id: 'all', label: '전체', count: 7 },
    { id: 'star', label: '별표', count: 2 },
    { id: 'shared', label: '공유', count: 2 },
  ];
  return (
    <VarFrame>
      <div style={{ padding: '12px 12px 0' }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--t-neutral-6)', borderRadius: 10, marginBottom: 10 }}>
          {tabs.map((t, i) => (
            <button key={t.id} style={{
              flex: 1, padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: i === 0 ? 'white' : 'transparent',
              color: 'var(--text-default)',
              fontSize: 11.5, fontWeight: i === 0 ? 600 : 500,
              boxShadow: i === 0 ? 'var(--shadow-xs)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              {t.label}
              <span style={{
                fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                background: i === 0 ? 'var(--agent-100)' : 'var(--t-neutral-8)',
                color: i === 0 ? 'var(--agent-700)' : 'var(--text-subtle)',
                fontWeight: 700,
              }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
        {CONV_ITEMS.slice(0, 6).map(c => (
          <div key={c.id} style={{
            padding: '9px 10px', borderRadius: 8, marginBottom: 2,
            background: c.active ? 'var(--t-neutral-6)' : 'transparent', cursor: 'pointer',
          }}>
            <div className="truncate" style={{ fontSize: 12.5, fontWeight: c.active ? 600 : 500, color: 'var(--text-default)' }}>{c.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 10.5, color: 'var(--text-subtle)' }}>
              <span>{c.group}</span>
              <span>·</span>
              <span>4개 메시지</span>
              {c.starred && <Icon name="star" size={10} style={{ color: 'var(--yellow-500)', marginLeft: 'auto' }} />}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--t-neutral-8)' }}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px 10px', borderRadius: 8, background: 'var(--neutral-900)', color: 'white',
          border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>
          <Icon name="plus" size={12} strokeWidth={2.2} />
          새 대화
        </button>
      </div>
    </VarFrame>
  );
}

function groupConv(items) {
  const map = new Map();
  items.forEach(c => {
    if (!map.has(c.group)) map.set(c.group, []);
    map.get(c.group).push(c);
  });
  return Array.from(map.entries());
}

/* ============================================================
   2. EMPTY STATE · 3 variations
   ============================================================ */

const EMPTY_PROMPTS = [
  { icon: 'pill',     text: '제약사 마케팅에서 가장 자주 묻는 질문' },
  { icon: 'activity', text: '지난 30일 세션 가장 많았던 시간대' },
  { icon: 'barChart', text: '캠페인 ROAS 상위 5개 광고주' },
  { icon: 'message',  text: '의사 커뮤니티 분야별 핫토픽' },
];

/* A · 중앙 정렬 + 프롬프트 2×2 그리드 (현재) */
function Empty_A() {
  return (
    <VarFrame>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '20px 32px' }}>
        <div style={{ width: 60, height: 60, borderRadius: 20, background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 10px 30px -10px var(--agent-400)' }}>
          <Icon name="sparkles" size={28} strokeWidth={2} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>안녕하세요, 김두환님</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-subtle)', marginTop: 6, lineHeight: 1.6 }}>광고주 · 캠페인 · 의사 커뮤니티 데이터를 자연어로 질문하세요.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 540 }}>
          {EMPTY_PROMPTS.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              borderRadius: 12, border: '1px solid var(--t-neutral-8)', background: 'white',
              fontSize: 12.5, color: 'var(--text-default)', cursor: 'pointer',
            }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--agent-100)', color: 'var(--agent-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={p.icon} size={12} />
              </span>
              <span>{p.text}</span>
            </div>
          ))}
        </div>
      </div>
    </VarFrame>
  );
}

/* B · 큰 중앙 입력바 + 카테고리 칩 (Gemini/Claude 스타일) */
function Empty_B() {
  const cats = ['📊 분석', '🔍 조사', '✍️ 작성', '💡 아이디어'];
  return (
    <VarFrame>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '20px 32px' }}>
        <div style={{ textAlign: 'center', maxWidth: 580 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            <span style={{ background: 'linear-gradient(135deg, var(--agent-500), var(--blue-500))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>무엇을 도와드릴까요?</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-subtle)', marginTop: 8, lineHeight: 1.5 }}>오늘의 광고주 · 커뮤니티 · 사용성 데이터를 자유롭게 질문하세요.</div>
        </div>
        {/* Big input bar */}
        <div style={{
          width: '100%', maxWidth: 600,
          padding: '14px 16px', borderRadius: 16,
          background: 'white',
          border: '1.5px solid var(--agent-200)',
          boxShadow: '0 8px 24px -8px var(--agent-200)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="sparkles" size={16} style={{ color: 'var(--agent-500)' }} />
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text-subtle)' }}>질문을 입력하거나 카테고리를 선택하세요</span>
          <button style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--agent-500)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="arrowUp" size={15} strokeWidth={2.2} />
          </button>
        </div>
        {/* Category chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          {cats.map((c, i) => (
            <button key={i} style={{
              padding: '7px 14px', borderRadius: 999, border: '1px solid var(--t-neutral-12)',
              background: 'white', fontSize: 12.5, fontWeight: 500, color: 'var(--text-default)', cursor: 'pointer',
            }}>{c}</button>
          ))}
        </div>
      </div>
    </VarFrame>
  );
}

/* C · 카테고리별 예시 분류 */
function Empty_C() {
  const cats = [
    { icon: 'barChart', label: '데이터 분석', accent: 'var(--blue-500)', items: ['지난 주 ROAS 상위 광고주', '캠페인 CTR 추이'] },
    { icon: 'message',  label: '커뮤니티 인사이트', accent: 'var(--agent-500)', items: ['진료과별 핫토픽', '신약 관련 의사 반응'] },
    { icon: 'fileText', label: '리포트 생성', accent: 'var(--green-500)', items: ['월간 사용성 리포트', '광고주 분기 브리핑'] },
  ];
  return (
    <VarFrame bg="var(--surface-tertiary)">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '20px 32px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>에이전트 챗</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>카테고리를 선택해 예시 질문을 둘러보세요.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%', maxWidth: 620 }}>
          {cats.map((c, i) => (
            <div key={i} style={{
              padding: '14px 14px 12px', borderRadius: 12, background: 'white',
              border: '1px solid var(--t-neutral-8)',
            }}>
              <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 9, background: 'color-mix(in srgb, ' + c.accent + ' 12%, transparent)', color: c.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name={c.icon} size={14} strokeWidth={2.1} />
              </span>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)', marginBottom: 8 }}>{c.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.items.map((it, k) => (
                  <button key={k} style={{
                    textAlign: 'left', padding: '6px 8px', borderRadius: 7,
                    border: 'none', background: 'var(--surface-tertiary)',
                    fontSize: 11.5, color: 'var(--text-default)', cursor: 'pointer',
                  }}>{it}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </VarFrame>
  );
}

/* ============================================================
   3. HEADER · 3 variations
   ============================================================ */

/* A · 미니멀 (제목 + 모델 + 액션) */
function Header_A() {
  return (
    <VarFrame>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', height: '100%', borderBottom: '1px solid var(--t-neutral-8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.005em' }}>당뇨 커뮤니티 최근 핫토픽</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>· 4개 메시지</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={modelPickerBtn}>
            <Icon name="brain" size={12} style={{ color: 'var(--agent-500)' }} />
            GPT-4
            <Icon name="chevronDown" size={11} style={{ color: 'var(--text-subtle)' }} />
          </button>
          <button style={iconBtn}><Icon name="star" size={14} /></button>
          <button style={iconBtn}><Icon name="share" size={14} /></button>
          <button style={iconBtn}><Icon name="more" size={14} /></button>
        </div>
      </div>
    </VarFrame>
  );
}

/* B · 메타 강조 - 모델/토큰/시간 표시 */
function Header_B() {
  return (
    <VarFrame>
      <div style={{ padding: '12px 24px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--t-neutral-8)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.005em' }}>당뇨 커뮤니티 최근 핫토픽</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-subtle)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--green-400)' }} />
              <span>GPT-4 · 활성</span>
            </span>
            <span>· 1,247 토큰 사용</span>
            <span>· 2분 전</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={{ ...iconBtn, gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 500, background: 'var(--t-neutral-6)' }}>
            <Icon name="download" size={12} />
            내보내기
          </button>
          <button style={iconBtn}><Icon name="more" size={14} /></button>
        </div>
      </div>
    </VarFrame>
  );
}

/* C · Breadcrumb + 큰 패턴 */
function Header_C() {
  return (
    <VarFrame>
      <div style={{ padding: '10px 24px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--t-neutral-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={14} strokeWidth={2.1} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-subtle)' }}>
              <span>AI 에이전트</span>
              <Icon name="chevronRight" size={9} />
              <span>대화</span>
            </div>
            <div className="truncate" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-default)' }}>당뇨 커뮤니티 최근 핫토픽</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={modelPickerBtn}>
            <Icon name="brain" size={12} style={{ color: 'var(--agent-500)' }} />
            GPT-4
            <Icon name="chevronDown" size={11} style={{ color: 'var(--text-subtle)' }} />
          </button>
          <button style={{ ...iconBtn, padding: '6px 10px', borderRadius: 8, gap: 5, fontSize: 11.5, fontWeight: 600, background: 'var(--agent-500)', color: 'white' }}>
            <Icon name="plus" size={11} strokeWidth={2.3} />
            새 대화
          </button>
        </div>
      </div>
    </VarFrame>
  );
}

const modelPickerBtn = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  borderRadius: 8, border: '1px solid var(--t-neutral-8)',
  background: 'white', fontSize: 11.5, color: 'var(--text-default)',
  cursor: 'pointer', fontWeight: 500,
};

Object.assign(window, { ConvList_A, ConvList_B, ConvList_C, ConvList_D, Empty_A, Empty_B, Empty_C, Header_A, Header_B, Header_C });

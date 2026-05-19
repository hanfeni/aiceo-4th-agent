/* ==============================================
   Chat component variations — Part 2
   (User msg, Assistant msg, Source citation, Input bar)
   ============================================== */

const NOOP = () => {};

/* ============================================================
   4. USER MESSAGE · 3 variations
   ============================================================ */

const USER_TEXT = '당뇨 관련 의사 커뮤니티에서 최근 30일간 가장 활발하게 논의된 토픽이 뭐야? 출처도 함께 알려줘.';

/* A · 우측 회색 버블 (ChatGPT 스타일, 현재) */
function UserMsg_A() {
  return (
    <VarFrame>
      <div style={{ flex: 1, padding: '28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9, background: 'white', border: '1px solid var(--t-neutral-12)', fontSize: 11.5 }}>
              <span style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--t-neutral-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)' }}><Icon name="fileText" size={11} /></span>
              <span style={{ fontWeight: 500 }}>캠페인_요약_2025Q2.pdf</span>
              <span style={{ color: 'var(--text-subtle)' }}>184 KB</span>
            </div>
            <div style={{
              background: 'var(--medi-gray-100)', padding: '10px 14px', borderRadius: 14,
              fontSize: 14, lineHeight: 1.55, color: 'var(--text-default)',
            }}>{USER_TEXT}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>14:21</div>
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* B · 좌측 아바타 + 채팅앱 스타일 (Slack/Discord) */
function UserMsg_B() {
  return (
    <VarFrame>
      <div style={{ flex: 1, padding: '28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12,
          }}>DK</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-default)' }}>김두환</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>14:21</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-default)' }}>{USER_TEXT}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, background: 'var(--t-neutral-6)', fontSize: 11 }}>
                <Icon name="fileText" size={11} style={{ color: 'var(--text-subtle)' }} />
                <span style={{ fontWeight: 500 }}>캠페인_요약_2025Q2.pdf</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* C · 보더만 (트랜스크립트 / 미니멀) */
function UserMsg_C() {
  return (
    <VarFrame>
      <div style={{ flex: 1, padding: '28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 999, background: 'var(--neutral-900)', color: 'white',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            }}>YOU</span>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· 14:21</span>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-default)', fontWeight: 500 }}>{USER_TEXT}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-subtle)' }}>
            <Icon name="paperclip" size={10} />
            <span>캠페인_요약_2025Q2.pdf · 184 KB</span>
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* ============================================================
   5. ASSISTANT MESSAGE · 3 variations
   ============================================================ */

const ASSIST_TEXT_SHORT = `## 최근 30일 당뇨 관련 핫토픽

OpenSearch에 색인된 의사 커뮤니티 게시글 **1,247건**을 분석한 결과, 다음 세 가지 토픽이 두드러집니다.

### 1. 신규 GLP-1 계열 약물 {{1}}
- 위고비 / 마운자로 처방 경험 공유가 전체의 **34%**
- 부작용 관리 댓글 스레드 가장 활발

### 2. 1형 당뇨 인슐린 펌프 {{2}}
- 옴니팟 5 도입 후기 다수
- 평균 댓글 수 18.4개`;

const ASSIST_SOURCES_2 = ['s1', 's2'];

function AssistActions() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 10, color: 'var(--text-subtle)' }}>
      <button style={msgAction}><Icon name="thumbsUp" size={13} /></button>
      <button style={msgAction}><Icon name="thumbsDown" size={13} /></button>
      <button style={msgAction}><Icon name="copy" size={13} /></button>
      <button style={msgAction}><Icon name="refresh" size={13} /></button>
    </div>
  );
}

const msgAction = {
  width: 26, height: 26, borderRadius: 7, border: 'none',
  background: 'transparent', color: 'var(--text-subtle)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

/* A · 좌측 아바타 + 인라인 (ChatGPT/Claude 스타일, 현재) */
function AssistMsg_A() {
  return (
    <VarFrame>
      <div className="thin-scroll" style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
          }}>
            <Icon name="sparkles" size={14} strokeWidth={2.1} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-default)' }}>에이전트</span>
              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· 14:21</span>
            </div>
            <div>{renderMarkdown(ASSIST_TEXT_SHORT, ASSIST_SOURCES_2, NOOP)}</div>
            <AssistActions />
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* B · 카드 박스로 감싸기 (Notion AI / 결과물 강조) */
function AssistMsg_B() {
  return (
    <VarFrame bg="var(--surface-tertiary)">
      <div className="thin-scroll" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        <div style={{
          background: 'white',
          border: '1px solid var(--t-neutral-8)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: '1px solid var(--t-neutral-8)',
            background: 'var(--surface-tertiary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="sparkles" size={11} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-default)' }}>에이전트 응답</span>
              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· 14:21</span>
            </div>
            <span style={{
              padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              background: 'var(--agent-100)', color: 'var(--agent-700)',
            }}>GPT-4</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {renderMarkdown(ASSIST_TEXT_SHORT, ASSIST_SOURCES_2, NOOP)}
            <AssistActions />
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* C · 좌측 액센트 바 + 그라데이션 (블로그 인용문 스타일) */
function AssistMsg_C() {
  return (
    <VarFrame>
      <div className="thin-scroll" style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
        <div style={{
          position: 'relative',
          paddingLeft: 18,
        }}>
          <span style={{
            position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 2,
            background: 'linear-gradient(180deg, var(--agent-400), var(--agent-600))',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Icon name="sparkles" size={13} style={{ color: 'var(--agent-500)' }} strokeWidth={2.1} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--agent-600)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>에이전트 답변</span>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>· 14:21</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-subtle)' }}>응답 시간 1.8s · 토큰 312</span>
          </div>
          <div>{renderMarkdown(ASSIST_TEXT_SHORT, ASSIST_SOURCES_2, NOOP)}</div>
          <AssistActions />
        </div>
      </div>
    </VarFrame>
  );
}

/* ============================================================
   6. SOURCE CITATION · 3 variations
   ============================================================ */

const CIT_SOURCES = ['s1', 's2', 's3'];

/* A · 하단 카드 패널 (현재) */
function Citation_A() {
  return (
    <VarFrame>
      <div style={{ padding: '24px 28px' }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-default)', margin: '0 0 14px', lineHeight: 1.65 }}>
          위 분석에 사용된 의사 커뮤니티 게시글과 내부 문서는 다음과 같습니다.
        </p>
        <div style={{
          padding: '10px 12px', background: 'var(--surface-tertiary)',
          border: '1px solid var(--t-neutral-8)', borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="link" size={11} style={{ color: 'var(--text-subtle)' }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>근거 · {CIT_SOURCES.length}건</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CIT_SOURCES.map((sid, i) => {
              const s = SOURCE_LIBRARY[sid];
              return (
                <div key={sid} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  background: 'white', border: '1px solid var(--t-neutral-8)',
                }}>
                  <span style={{ minWidth: 20, height: 20, borderRadius: 6, background: 'var(--agent-100)', color: 'var(--agent-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Icon name={SOURCE_ICONS[s.type]} size={11} style={{ color: 'var(--text-subtle)' }} />
                      <span style={{ fontSize: 10.5, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{SOURCE_LABELS[s.type]} · {s.date}</span>
                    </div>
                    <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-default)' }}>{s.title}</div>
                  </div>
                  <Icon name="externalLink" size={12} style={{ color: 'var(--text-subtle)', marginTop: 2 }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* B · 인라인 가로 카드 슬라이더 */
function Citation_B() {
  return (
    <VarFrame>
      <div style={{ padding: '24px 28px' }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-default)', margin: '0 0 12px', lineHeight: 1.65 }}>
          위 분석에 사용된 의사 커뮤니티 게시글과 내부 문서는 다음과 같습니다.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Icon name="link" size={12} style={{ color: 'var(--agent-500)' }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-default)' }}>참고 자료</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>· {CIT_SOURCES.length}건</span>
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {CIT_SOURCES.map((sid, i) => {
            const s = SOURCE_LIBRARY[sid];
            return (
              <div key={sid} style={{
                minWidth: 240, maxWidth: 240,
                padding: '12px 14px', borderRadius: 12,
                background: 'white', border: '1px solid var(--t-neutral-8)',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--agent-100)', color: 'var(--agent-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                  <Icon name={SOURCE_ICONS[s.type]} size={11} style={{ color: 'var(--text-subtle)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{SOURCE_LABELS[s.type]}</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-default)', lineHeight: 1.3 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', lineHeight: 1.45 }} className="truncate">{s.snippet}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 10.5, color: 'var(--text-subtle)' }}>
                  <span>{s.author}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </VarFrame>
  );
}

/* C · 풋노트 스타일 (학술적, 작은 텍스트) */
function Citation_C() {
  return (
    <VarFrame>
      <div style={{ padding: '24px 28px' }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-default)', margin: '0 0 18px', lineHeight: 1.65 }}>
          위 분석에 사용된 의사 커뮤니티 게시글과 내부 문서는 다음과 같습니다.
        </p>
        <div style={{ paddingTop: 12, borderTop: '1px dashed var(--t-neutral-16)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>References</div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CIT_SOURCES.map((sid, i) => {
              const s = SOURCE_LIBRARY[sid];
              return (
                <li key={sid} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, lineHeight: 1.55 }}>
                  <sup style={{
                    color: 'var(--agent-600)', fontWeight: 700, fontSize: 10,
                    minWidth: 14, textAlign: 'right',
                  }}>[{i + 1}]</sup>
                  <span style={{ color: 'var(--text-default)' }}>
                    <strong style={{ fontWeight: 600 }}>{s.title}</strong>
                    <span style={{ color: 'var(--text-subtle)' }}> — {s.author}, {s.date}</span>
                    <a style={{ marginLeft: 6, color: 'var(--agent-600)', textDecoration: 'underline', cursor: 'pointer' }}>원문 열기 ↗</a>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </VarFrame>
  );
}

/* ============================================================
   7. INPUT BAR · 3 variations
   ============================================================ */

/* A · 평평한 borderless (현재) */
function Input_A() {
  return (
    <VarFrame>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 28px' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>
          <div style={{
            border: '1px solid var(--t-neutral-12)', borderRadius: 16, background: 'white',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 10px 8px 12px',
          }}>
            <button style={{ ...iconBtnLocal, color: 'var(--text-subtle)', marginBottom: 4 }}>
              <Icon name="paperclip" size={16} />
            </button>
            <div style={{ flex: 1, fontSize: 14, color: 'var(--text-subtle)', padding: '8px 0' }}>
              메시지를 입력하세요…
            </div>
            <button style={{
              width: 34, height: 34, borderRadius: 11,
              background: 'var(--agent-500)', color: 'white', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Icon name="arrowUp" size={16} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-subtle)' }}>
            <span>에이전트 응답은 검토 후 사용하세요.</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>Enter ↵ 전송</span>
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* B · 떠있는 그림자 강조 + 큰 라운드 + 도구 칩 */
function Input_B() {
  return (
    <VarFrame bg="var(--surface-tertiary)">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 28px' }}>
        <div style={{ width: '100%', maxWidth: 660 }}>
          <div style={{
            border: '1.5px solid var(--agent-200)',
            borderRadius: 24, background: 'white',
            boxShadow: '0 14px 40px -12px var(--agent-200), 0 4px 10px -4px rgba(15,23,42,.05)',
            padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
              <Icon name="sparkles" size={15} style={{ color: 'var(--agent-500)' }} />
              <div style={{ flex: 1, fontSize: 14.5, color: 'var(--text-subtle)', padding: '4px 0' }}>
                무엇을 도와드릴까요?
              </div>
              <button style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))', color: 'white',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px -4px var(--agent-500)',
              }}>
                <Icon name="arrowUp" size={17} strokeWidth={2.3} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--t-neutral-6)' }}>
              {[
                { icon: 'paperclip', label: '첨부' },
                { icon: 'image', label: '이미지' },
                { icon: 'database', label: '데이터 소스' },
              ].map(t => (
                <button key={t.label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 999, border: '1px solid var(--t-neutral-8)',
                  background: 'white', fontSize: 11.5, fontWeight: 500, color: 'var(--text-default)', cursor: 'pointer',
                }}>
                  <Icon name={t.icon} size={11} />
                  {t.label}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-subtle)' }}>GPT-4 · 컨텍스트 8K</span>
            </div>
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

/* C · 좌측 도구 메뉴 + 우측 듀얼 액션 (Perplexity 스타일) */
function Input_C() {
  return (
    <VarFrame>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 28px' }}>
        <div style={{ width: '100%', maxWidth: 660 }}>
          <div style={{
            border: '1px solid var(--t-neutral-12)',
            borderRadius: 14, background: 'white',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '10px 14px 6px', fontSize: 14, color: 'var(--text-subtle)' }}>
              질문을 입력하세요…
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 8px', gap: 4 }}>
              {/* Left tool buttons */}
              <button style={toolBtn} title="첨부"><Icon name="paperclip" size={14} /></button>
              <button style={toolBtn} title="이미지"><Icon name="image" size={14} /></button>
              <div style={{ width: 1, height: 16, background: 'var(--t-neutral-12)', margin: '0 2px' }} />
              <button style={{ ...toolBtn, gap: 5, padding: '5px 9px', width: 'auto', fontSize: 11, fontWeight: 500 }}>
                <Icon name="database" size={12} style={{ color: 'var(--agent-500)' }} />
                전체 데이터 소스
                <Icon name="chevronDown" size={10} style={{ color: 'var(--text-subtle)' }} />
              </button>
              <div style={{ flex: 1 }} />
              {/* Right actions */}
              <button style={{
                padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--text-subtle)', fontSize: 11.5, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Icon name="command" size={11} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>⌘K</span>
              </button>
              <button style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'var(--agent-500)', color: 'white', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <Icon name="arrowUp" size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </VarFrame>
  );
}

const iconBtnLocal = {
  width: 28, height: 28, borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer',
};

const toolBtn = {
  width: 28, height: 28, borderRadius: 7, border: 'none',
  background: 'transparent', color: 'var(--text-subtle)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

Object.assign(window, {
  UserMsg_A, UserMsg_B, UserMsg_C,
  AssistMsg_A, AssistMsg_B, AssistMsg_C,
  Citation_A, Citation_B, Citation_C,
  Input_A, Input_B, Input_C,
});

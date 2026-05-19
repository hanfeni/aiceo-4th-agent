/* ==============================================
   DART (AI 기업정보 분석) full screen layouts
   ============================================== */

/* ============================================
   Direction A: Classic Restyled — flat 11 tabs in scrollable bar
   ============================================ */
function DartFull_A() {
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%', display: 'flex',
      background: 'var(--surface-subtle)',
    }}>
      <DartSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DartPageHeader />
        <FlatTabBar />
        <OverviewBody headerVariant="A" />
      </main>
    </div>
  );
}

/* ============================================
   Direction B: Grouped Tabs — 5 supergroups + sub-nav
   ============================================ */
function DartFull_B() {
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%', display: 'flex',
      background: 'var(--surface-subtle)',
    }}>
      <DartSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DartPageHeader />
        <GroupedTabBar activeId="overview" />
        <OverviewBody headerVariant="B" />
      </main>
    </div>
  );
}

/* ============================================
   Direction C: AI-First Workspace — AI panel docked right
   ============================================ */
function DartFull_C() {
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%', display: 'flex',
      background: 'var(--surface-subtle)',
    }}>
      <DartSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DartPageHeader aiPanelOpen={true} />
        <GroupedTabBar activeId="overview" />
        <OverviewBody headerVariant="B" />
      </main>
      <AIAnalysisPanel width={400} />
    </div>
  );
}

/* ============================================
   Direction D: Disclosure-focused detail view
   (Tab=공시 with sub-nav active, AI panel)
   ============================================ */
function DartFull_D() {
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%', display: 'flex',
      background: 'var(--surface-subtle)',
    }}>
      <DartSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DartPageHeader aiPanelOpen={true} />
        <GroupedTabBar activeId="disc" />
        <GroupSubNav items={[{id:'dart-d', label:'DART 공시'}, {id:'krx-d', label:'KRX 공시'}]} activeId="dart-d" />
        <DiscDetailBody />
      </main>
      <AIAnalysisPanel width={380} />
    </div>
  );
}

/* Disclosure detail body */
function DiscDetailBody() {
  return (
    <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflow: 'auto' }} className="thin-scroll">
      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 12px', background: 'var(--surface-default)',
        border: '1px solid var(--t-neutral-8)', borderRadius: 12,
      }}>
        <Icon name="filter" size={13} style={{ color: 'var(--text-subtle)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)' }}>필터</span>
        {['전체', '정기공시', '주요사항', '발행공시', '지분공시', '감사관련'].map((f, i) => (
          <button key={f} style={{
            padding: '5px 11px', borderRadius: 999, fontSize: 11.5,
            border: '1px solid',
            borderColor: i === 0 ? 'var(--agent-300)' : 'var(--t-neutral-12)',
            background: i === 0 ? 'var(--agent-50)' : 'transparent',
            color: i === 0 ? 'var(--agent-700)' : 'var(--text-subtle)',
            fontWeight: i === 0 ? 600 : 500, cursor: 'pointer',
          }}>{f}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 9px', borderRadius: 8,
          border: '1px solid var(--t-neutral-12)', background: 'var(--surface-default)',
        }}>
          <Icon name="search" size={12} style={{ color: 'var(--text-subtle)' }} />
          <input
            placeholder="공시명 검색"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 11.5, width: 120 }}
          />
        </div>
      </div>

      {/* Large disclosure list */}
      <DisclosureList limit={8} />
    </div>
  );
}

/* ============================================
   Empty State variations (no company selected)
   ============================================ */

function EmptyState_A() {
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%', display: 'flex', background: 'var(--surface-subtle)',
    }}>
      <DartSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DartPageHeader />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 32px', gap: 20,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', boxShadow: '0 8px 28px -8px var(--agent-400)',
          }}>
            <Icon name="building" size={28} strokeWidth={2} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-default)', letterSpacing: '-0.01em' }}>
              어떤 기업을 분석해드릴까요?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 6 }}>
              기업명 또는 종목코드로 검색하면 DART 공시와 KRX 데이터를 AI가 자동으로 분석합니다.
            </div>
          </div>

          {/* Large search */}
          <div style={{
            width: '100%', maxWidth: 560,
            background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
            borderRadius: 14, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: 'var(--shadow-md)',
          }}>
            <Icon name="search" size={16} style={{ color: 'var(--text-subtle)' }} />
            <input
              placeholder="예) 셀트리온, 068270, 한미약품..."
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-default)' }}
            />
            <kbd style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 5,
              background: 'var(--t-neutral-6)', color: 'var(--text-subtle)',
              fontFamily: 'var(--font-mono)', fontWeight: 600,
            }}>⌘K</kbd>
          </div>

          {/* Recent + suggested */}
          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>
                최근 본 기업
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['셀트리온', '한미약품', '유한양행', '대웅제약', '종근당'].map(c => (
                  <button key={c} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 11px', borderRadius: 999,
                    background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
                    fontSize: 12, color: 'var(--text-default)', cursor: 'pointer',
                  }}>
                    <Icon name="history" size={11} style={{ color: 'var(--text-subtle)' }} />
                    <span>{c}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 }}>
                추천 시작 질문
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { i: 'sparkles', t: '의약품 업종 상위 5개사 영업이익률 비교' },
                  { i: 'sparkles', t: '셀트리온의 최근 3년 매출 성장 분석' },
                  { i: 'sparkles', t: 'KOSPI 의약품 ROE 상위 종목 추천' },
                  { i: 'sparkles', t: '최근 CB 발행한 제약 기업 리스트' },
                ].map((p, i) => (
                  <button key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
                    fontSize: 12, color: 'var(--text-default)', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <Icon name={p.i} size={12} style={{ color: 'var(--agent-500)', flexShrink: 0 }} />
                    <span>{p.t}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState_B() {
  // Empty state with autocomplete dropdown visible (showing search in action)
  return (
    <div className="dc-shell" style={{
      width: '100%', height: '100%', display: 'flex', background: 'var(--surface-subtle)',
    }}>
      <DartSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DartPageHeader />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-start',
          padding: '80px 32px 40px', gap: 16,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-default)', letterSpacing: '-0.015em' }}>
              AI 기업정보 분석
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 6 }}>
              DART · KRX 공시를 AI가 분석해 인사이트를 전달합니다
            </div>
          </div>

          {/* Search with dropdown */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 560 }}>
            <div style={{
              background: 'var(--surface-default)', border: '1px solid var(--agent-300)',
              borderRadius: 14, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 0 0 4px var(--agent-50)',
            }}>
              <Icon name="search" size={16} style={{ color: 'var(--agent-500)' }} />
              <input
                defaultValue="셀트"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-default)' }}
              />
              <span style={{
                width: 16, height: 16, borderRadius: 4, background: 'var(--agent-100)', color: 'var(--agent-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
              }}>3</span>
            </div>
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
              borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 5,
            }}>
              <div style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--t-neutral-8)' }}>
                검색 결과 3건
              </div>
              {COMPANY_SEARCH_RESULTS.slice(0, 3).map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  background: i === 0 ? 'var(--agent-50)' : 'transparent',
                  borderBottom: i < 2 ? '1px solid var(--t-neutral-8)' : 'none',
                  cursor: 'pointer',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 12,
                  }}>{r.corpName.slice(0,1)}</div>
                  <div style={{ flex: 1, lineHeight: 1.25 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)' }}>
                        <span style={{ background: 'var(--agent-100)', color: 'var(--agent-700)' }}>셀트</span>{r.corpName.slice(2)}
                      </span>
                      <span style={{
                        fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                        background: r.market === 'KOSPI' ? 'var(--blue-50)' : '#fffbeb',
                        color: r.market === 'KOSPI' ? 'var(--blue-700)' : '#b45309',
                      }}>{r.market}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{r.corpNameEng} · {r.industry}</div>
                  </div>
                  <span style={{
                    fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', fontWeight: 600,
                  }}>{r.stockCode}</span>
                  {i === 0 && (
                    <kbd style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 5,
                      background: 'var(--t-neutral-6)', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)',
                    }}>↵</kbd>
                  )}
                </div>
              ))}
              <div style={{
                padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface-subtle)', fontSize: 10.5, color: 'var(--text-subtle)',
              }}>
                <span>↑↓ 이동 · ↵ 선택 · ⎋ 닫기</span>
                <span>11.8만개 기업 검색 가능</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ============================================
   AI Panel variation B — inline conversation (no side panel)
   Shows the AI analysis embedded within the overview as a card
   ============================================ */
function AIInlinePanel_B() {
  const msg = AI_MESSAGES[1];
  return (
    <div style={{
      background: 'var(--surface-default)',
      border: '1px solid var(--t-neutral-8)',
      borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 9,
          background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="sparkles" size={14} strokeWidth={2.2} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-default)' }}>AI 분석 결과</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>통합 모드 · 3.2초 · DART + Web</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['copy', 'thumbsUp', 'refresh', 'externalLink'].map(ic => (
            <button key={ic} style={{
              width: 26, height: 26, borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', color: 'var(--text-subtle)',
            }}>
              <Icon name={ic} size={12} />
            </button>
          ))}
        </div>
      </div>

      {/* Tabs (modes) */}
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--t-neutral-4)', borderRadius: 9, alignSelf: 'flex-start' }}>
        {['웹검색', 'DART 분석', '통합', '교차검증'].map((m, i) => (
          <button key={m} style={{
            padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            border: 'none',
            background: i === 2 ? 'var(--surface-default)' : 'transparent',
            color: i === 2 ? 'var(--text-default)' : 'var(--text-subtle)',
            cursor: 'pointer',
            boxShadow: i === 2 ? '0 1px 2px rgba(15,23,42,.06)' : 'none',
          }}>{m}</button>
        ))}
      </div>

      {/* Thinking strip */}
      <details>
        <summary style={{
          cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--text-subtle)', padding: '6px 0',
        }}>
          <Icon name="chevronRight" size={11} />
          <Icon name="brain" size={11} strokeWidth={2.2} style={{ color: 'var(--agent-600)' }} />
          <span>분석 과정 4단계 · DART조회 → 동종업계비교 → 웹검색 → 교차검증</span>
        </summary>
      </details>

      {/* Response */}
      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-default)' }}>
        {msg.content.split('\n\n').map((para, pi) => (
          <p key={pi} style={{ margin: pi === 0 ? '0 0 10px' : '10px 0' }}
             dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        ))}
      </div>

      {/* Citations row */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: '10px 12px', background: 'var(--t-neutral-4)',
        borderRadius: 10, fontSize: 11,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text-subtle)', marginRight: 4 }}>출처</span>
        {msg.citations.map((c, ci) => (
          <span key={ci} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 999,
            background: 'var(--surface-default)', border: '1px solid var(--t-neutral-12)',
            cursor: 'pointer',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--agent-600)' }}>[{c.id}]</span>
            <span style={{
              fontSize: 9.5, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
              background: c.source === 'DART' ? 'var(--blue-50)' : 'var(--agent-50)',
              color: c.source === 'DART' ? 'var(--blue-700)' : 'var(--agent-700)',
            }}>{c.source}</span>
            <span style={{ color: 'var(--text-default)' }}>{c.label}</span>
          </span>
        ))}
      </div>

      {/* Follow-up suggestions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px dashed var(--t-neutral-12)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>이어서 질문</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['바이오시밀러 경쟁사는?', '향후 12개월 전망 요약', '재무 리스크 상세 분석'].map(q => (
            <button key={q} style={{
              padding: '6px 11px', borderRadius: 999, fontSize: 11.5,
              background: 'var(--surface-default)', border: '1px solid var(--agent-200)',
              color: 'var(--agent-700)', cursor: 'pointer', fontWeight: 500,
            }}>{q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================
   AI Panel variation C — full modal (legacy style refined)
   ============================================ */
function AIModal_C() {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: 'rgba(15, 23, 42, 0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 32, fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        width: '100%', maxWidth: 880, maxHeight: '100%',
        background: 'var(--surface-default)', borderRadius: 16,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--t-neutral-8)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--agent-400), var(--agent-600))',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="sparkles" size={15} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-default)' }}>AI 분석 — 셀트리온</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>DART/KRX 공시 + 웹 검색 통합 분석</div>
          </div>
          <button style={iconBtn}><Icon name="x" size={16} /></button>
        </div>

        {/* Mode tabs */}
        <div style={{
          padding: '0 20px',
          borderBottom: '1px solid var(--t-neutral-8)',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          {[
            { l: '웹검색', i: 'globe', count: 12 },
            { l: 'DART 분석', i: 'database', count: 8 },
            { l: '통합', i: 'sparkles', count: null, active: true },
            { l: '교차검증', i: 'check', count: '검증완료' },
          ].map((t, i) => (
            <a key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '12px 14px', fontSize: 12.5, cursor: 'pointer',
              color: t.active ? 'var(--text-default)' : 'var(--text-subtle)',
              fontWeight: t.active ? 600 : 500,
              borderBottom: '2px solid',
              borderColor: t.active ? 'var(--agent-500)' : 'transparent',
              marginBottom: -1,
            }}>
              <Icon name={t.i} size={13} style={t.active ? { color: 'var(--agent-500)' } : null} />
              <span>{t.l}</span>
              {t.count && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 700,
                  background: t.active ? 'var(--agent-100)' : 'var(--t-neutral-6)',
                  color: t.active ? 'var(--agent-700)' : 'var(--text-subtle)',
                }}>{t.count}</span>
              )}
            </a>
          ))}
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <AIInlinePanel_B />
        </div>
      </div>
    </div>
  );
}

window.DartFull_A = DartFull_A;
window.DartFull_B = DartFull_B;
window.DartFull_C = DartFull_C;
window.DartFull_D = DartFull_D;
window.EmptyState_A = EmptyState_A;
window.EmptyState_B = EmptyState_B;
window.AIInlinePanel_B = AIInlinePanel_B;
window.AIModal_C = AIModal_C;

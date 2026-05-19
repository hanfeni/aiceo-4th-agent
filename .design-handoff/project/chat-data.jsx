/* ==============================================
   Interactive Chat Agent UI
   Embedded inside a compact admin shell.
   Width target: 1440 (admin 224 + convo list 264 + main)
   ============================================== */

const { useState, useRef, useEffect, useMemo, useCallback } = React;

/* ---------- Mock sources catalog (used to render citations) ---------- */
const SOURCE_LIBRARY = {
  s1: {
    type: 'community-post',
    title: '위고비 처방 첫 3개월 후기 - 부작용 관리법',
    author: 'Dr. 박정훈 (내분비내과)',
    date: '2026-05-02',
    snippet: '처방 초기 2주간 메스꺼움이 가장 빈번했으며, 식사 직후 복용 시점을 30분 늦추니 호전됨...',
    href: '#',
  },
  s2: {
    type: 'community-post',
    title: '옴니팟 5 도입 6개월 — 환자별 알고리즘 튜닝',
    author: 'Dr. 이수민 (소아청소년과)',
    date: '2026-04-28',
    snippet: 'Basal-IQ보다 Control-IQ가 야간 저혈당 감소에 더 효과적이었으나, 식후 고혈당은...',
    href: '#',
  },
  s3: {
    type: 'doc',
    title: 'AI 진단 보조 도구 안과 협진 프로토콜 가이드 v2',
    author: '메디게이트 의학팀',
    date: '2026-03-15',
    snippet: '안저 영상의 NPDR 등급 평가 시 모델 신뢰도 0.78 미만은 인간 검토자에게 라우팅...',
    href: '#',
  },
  s4: {
    type: 'campaign',
    title: '캠페인 CAMP-2025-Q2-DIA-074',
    author: '한미제약 / 당뇨 마케팅팀',
    date: '2026-05-10',
    snippet: '검색 광고 CTR 4.2%, 인라인 광고 CTR 1.1%. 의사 인증 회원 노출 비중 71%.',
    href: '#',
  },
};

const SOURCE_ICONS = {
  'community-post': 'message',
  'doc': 'fileText',
  'campaign': 'megaphone',
};

const SOURCE_LABELS = {
  'community-post': '커뮤니티',
  'doc': '내부 문서',
  'campaign': '캠페인',
};

/* ---------- Initial conversations ---------- */
function makeInitialConversations() {
  return [
    { id: 'c-today-1', title: '당뇨 커뮤니티 최근 핫토픽', group: '오늘', preview: '최근 30일 당뇨 관련…', messages: SAMPLE_MESSAGES },
    { id: 'c-today-2', title: '제약사 마케팅 ROAS 분석', group: '오늘', preview: '한미제약 캠페인 14건…', messages: [] },
    { id: 'c-y-1',     title: 'GPT-4 vs Claude 사용성', group: '어제', preview: '응답 길이 분포가…', messages: [] },
    { id: 'c-y-2',     title: '광고주 신규 등록 절차 정리', group: '어제', preview: 'CRM 광고주 마스터…', messages: [] },
    { id: 'c-w-1',     title: '월간 사용성 리포트 초안', group: '지난 7일', preview: '세션 16,420건 기준…', messages: [] },
    { id: 'c-w-2',     title: '의사 커뮤니티 자유게시판 트렌드', group: '지난 7일', preview: '전공의 처우 / 의대 정원…', messages: [] },
    { id: 'c-m-1',     title: '검색광고 분류 콘텐트 검수', group: '지난 30일', preview: 'LLM 분류 정확도 92%…', messages: [] },
  ];
}

/* Sample assistant message body, with {{N}} placeholders for source chips. */
const SAMPLE_MESSAGES = [
  {
    role: 'user',
    content: '당뇨 관련 의사 커뮤니티에서 최근 30일간 가장 활발하게 논의된 토픽이 뭐야? 출처도 함께 알려줘.',
    attachments: [],
    ts: '14:21',
  },
  {
    role: 'assistant',
    content: `## 최근 30일 당뇨 관련 핫토픽

OpenSearch에 색인된 의사 커뮤니티 게시글 **1,247건**을 분석한 결과, 다음 세 가지 토픽이 두드러집니다.

### 1. 신규 GLP-1 계열 약물 {{1}}
- 위고비 / 마운자로 처방 경험 공유가 전체 게시글의 **34%**를 차지
- 부작용 관리 및 보험 적용 문의가 가장 활발한 댓글 스레드 형성

### 2. 1형 당뇨 인슐린 펌프 {{2}}
- 옴니팟 5 / Control-IQ 등 신규 디바이스 도입 후기 다수
- 환자별 알고리즘 튜닝 노하우 공유 게시글 평균 댓글 수 18.4개

### 3. 당뇨병성 망막병증 조기 검진 {{3}}
- AI 진단 보조 도구 사용 후기와 \`NPDR 등급\` 평가 토론
- 안과 협진 프로토콜 가이드 v2 공유 이후 인용 빈도 급증

> **참고:** 인용된 게시글 모두 의사 인증 회원의 글이며, 작성 시점은 \`2026-04-15\` 이후입니다.

추가로 특정 토픽을 깊게 살펴보시려면 알려주세요. 예) **"위고비 부작용 관리 노하우만 모아줘"**`,
    sources: ['s1', 's2', 's3'],
    ts: '14:21',
    liked: null,
  },
  {
    role: 'user',
    content: '한미제약 당뇨 캠페인 최근 성과도 같이 비교해줘.',
    attachments: [{ name: '캠페인_요약_2025Q2.pdf', size: '184 KB' }],
    ts: '14:24',
  },
  {
    role: 'assistant',
    content: `좋습니다. 첨부 PDF의 캠페인 요약과 시스템 데이터를 매칭해보면 다음과 같습니다.

### 한미제약 당뇨 캠페인 성과 {{1}}
- 캠페인 코드: \`CAMP-2025-Q2-DIA-074\`
- 검색 광고 **CTR 4.2%** / 인라인 광고 **CTR 1.1%**
- 의사 인증 회원 노출 비중 **71%**

위 커뮤니티 핫토픽 중 **GLP-1 계열** 키워드 검색량이 캠페인 노출 기간 동안 **+38%** 증가했습니다. 캠페인 메시지가 자연 검색 수요와 시점이 잘 맞아 떨어진 사례로 보입니다.`,
    sources: ['s4'],
    ts: '14:24',
    liked: 'up',
  },
];

const SUGGESTED_PROMPTS = [
  { icon: 'pill',     text: '제약사 마케팅에서 가장 자주 묻는 질문 TOP 10' },
  { icon: 'activity', text: '지난 30일간 세션이 가장 많았던 시간대 분포' },
  { icon: 'barChart', text: '캠페인 ROAS 상위 5개 광고주 비교' },
  { icon: 'message',  text: '의사 커뮤니티에서 핫한 토픽을 분야별로 정리' },
];

/* ---------- Minimal markdown renderer ----------
   Supports: h2/h3, **bold**, *italic*, `code`, lists, blockquotes, paragraphs,
   and {{N}} source chip placeholders that render an inline citation pill.
*/
function renderMarkdown(text, sources, onSourceClick) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  const renderInline = (str, key) => {
    // Replace {{N}} with citation chips, then handle inline **bold** *em* `code`
    const parts = [];
    let last = 0;
    const re = /\{\{(\d+)\}\}/g;
    let m;
    let idx = 0;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) parts.push(inlineText(str.slice(last, m.index), `${key}-t${idx++}`));
      const n = parseInt(m[1], 10);
      const sid = sources && sources[n - 1];
      parts.push(
        <button
          key={`${key}-c${idx++}`}
          onClick={() => onSourceClick && onSourceClick(sid)}
          style={citePill}
        >{n}</button>
      );
      last = re.lastIndex;
    }
    if (last < str.length) parts.push(inlineText(str.slice(last), `${key}-t${idx++}`));
    return parts;
  };

  while (i < lines.length) {
    const ln = lines[i];
    if (/^###\s+/.test(ln)) {
      blocks.push(<h3 key={i} style={mdH3}>{renderInline(ln.replace(/^###\s+/, ''), `h3-${i}`)}</h3>);
      i++;
    } else if (/^##\s+/.test(ln)) {
      blocks.push(<h2 key={i} style={mdH2}>{renderInline(ln.replace(/^##\s+/, ''), `h2-${i}`)}</h2>);
      i++;
    } else if (/^>\s+/.test(ln)) {
      // collect blockquote lines
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(<blockquote key={`bq-${i}`} style={mdBq}>{renderInline(buf.join('\n'), `bq-${i}`)}</blockquote>);
    } else if (/^[-*]\s+/.test(ln)) {
      // collect list items
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={mdUl}>
          {items.map((it, k) => <li key={k} style={mdLi}>{renderInline(it, `li-${i}-${k}`)}</li>)}
        </ul>
      );
    } else if (ln.trim() === '') {
      i++;
    } else {
      // paragraph
      const buf = [ln];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !/^([#>*-]|\s*-)/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push(<p key={`p-${i}`} style={mdP}>{renderInline(buf.join(' '), `p-${i}`)}</p>);
    }
  }
  return blocks;
}

function inlineText(str, key) {
  // **bold**, *italic*, `code`
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0; let idx = 0; let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) out.push(<span key={`${key}-${idx++}`}>{str.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${key}-${idx++}`} style={{ fontWeight: 700, color: 'var(--text-default)' }}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) out.push(<em key={`${key}-${idx++}`}>{tok.slice(1, -1)}</em>);
    else out.push(<code key={`${key}-${idx++}`} style={mdInlineCode}>{tok.slice(1, -1)}</code>);
    last = re.lastIndex;
  }
  if (last < str.length) out.push(<span key={`${key}-${idx++}`}>{str.slice(last)}</span>);
  return out;
}

/* MD styles */
const mdP  = { margin: '0 0 10px', fontSize: 14, lineHeight: 1.65, color: 'var(--text-default)' };
const mdH2 = { fontSize: 16, fontWeight: 700, margin: '14px 0 8px', letterSpacing: '-0.01em', color: 'var(--text-default)' };
const mdH3 = { fontSize: 14, fontWeight: 700, margin: '12px 0 6px', letterSpacing: '-0.005em', color: 'var(--text-default)' };
const mdUl = { margin: '0 0 12px', paddingLeft: 18 };
const mdLi = { margin: '4px 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-default)' };
const mdBq = {
  margin: '12px 0', padding: '10px 14px',
  borderLeft: '3px solid var(--agent-300)',
  background: 'var(--agent-50)',
  borderRadius: '0 8px 8px 0',
  fontSize: 13, color: 'var(--text-default)', lineHeight: 1.55,
};
const mdInlineCode = {
  fontFamily: 'var(--font-mono)', fontSize: 12.5,
  background: 'var(--t-neutral-8)', padding: '1px 6px', borderRadius: 4,
  color: 'var(--text-default)',
};
const citePill = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 18, height: 18, padding: '0 5px',
  margin: '0 2px', fontSize: 10.5, fontWeight: 700,
  background: 'var(--agent-100)', color: 'var(--agent-700)',
  border: '1px solid var(--agent-200)', borderRadius: 6, cursor: 'pointer',
  verticalAlign: '2px',
};

window.renderMarkdown = renderMarkdown;
window.SOURCE_LIBRARY = SOURCE_LIBRARY;
window.SOURCE_ICONS = SOURCE_ICONS;
window.SOURCE_LABELS = SOURCE_LABELS;
window.SUGGESTED_PROMPTS = SUGGESTED_PROMPTS;
window.makeInitialConversations = makeInitialConversations;

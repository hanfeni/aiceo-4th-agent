/* ==============================================
   Mock data for AI 기업정보 분석 (DART) redesign
   ============================================== */

// 검색 자동완성 후보
const COMPANY_SEARCH_RESULTS = [
  { corpName: '셀트리온', corpNameEng: 'Celltrion', stockCode: '068270', market: 'KOSPI', industry: '의약품' },
  { corpName: '셀트리온헬스케어', corpNameEng: 'Celltrion Healthcare', stockCode: '091990', market: 'KOSDAQ', industry: '의약품' },
  { corpName: '셀트리온제약', corpNameEng: 'Celltrion Pharm', stockCode: '068760', market: 'KOSDAQ', industry: '의약품' },
  { corpName: '한미약품', corpNameEng: 'Hanmi Pharm', stockCode: '128940', market: 'KOSPI', industry: '의약품' },
  { corpName: '유한양행', corpNameEng: 'Yuhan Corp', stockCode: '000100', market: 'KOSPI', industry: '의약품' },
];

// 선택된 기업 (예시 = 셀트리온)
const SELECTED_COMPANY = {
  corpName: '셀트리온',
  corpNameEng: 'Celltrion, Inc.',
  corpCode: '00421045',
  stockCode: '068270',
  market: 'KOSPI',
  ceoName: '서정진, 기우성',
  estDate: '2002.02.27',
  industry: '의약품 제조업',
  industryCode: 'C212',
  address: '인천광역시 연수구 아카데미로 23',
  phoneNo: '032-850-5000',
  homeUrl: 'celltrion.com',
  bizrNo: '120-86-23624',
  accMonth: '12',
  marketCap: '38.4조',
  per: '36.2',
  pbr: '1.84',
  roe: '5.1%',
  employees: '2,612',
};

// KPI 지표 (모의)
const INDICATORS = [
  { id: 'revenue',  group: '수익성', label: '매출액',      value: '2.1조',   delta: '+12.4%', positive: true,  unit: '원', trend: [40,55,52,68,72,90,98] },
  { id: 'op',       group: '수익성', label: '영업이익',    value: '4,920억', delta: '+18.7%', positive: true,  unit: '원', trend: [30,42,38,50,55,68,78] },
  { id: 'np',       group: '수익성', label: '당기순이익',  value: '3,810억', delta: '+22.1%', positive: true,  unit: '원', trend: [22,28,30,38,42,55,68] },
  { id: 'opmargin', group: '수익성', label: '영업이익률',  value: '23.4%',   delta: '+1.2pp', positive: true,  unit: '%',  trend: [50,52,56,55,60,65,70] },
  { id: 'roe',      group: '안정성', label: 'ROE',         value: '5.1%',    delta: '-0.4pp', positive: false, unit: '%',  trend: [70,75,72,68,65,62,58] },
  { id: 'debtratio',group: '안정성', label: '부채비율',    value: '24.8%',   delta: '-3.1pp', positive: true,  unit: '%',  trend: [70,68,62,58,52,48,42] },
  { id: 'currrat',  group: '안정성', label: '유동비율',    value: '218%',    delta: '+12pp',  positive: true,  unit: '%',  trend: [50,55,58,60,65,68,72] },
  { id: 'eps',      group: '주당가치', label: 'EPS',         value: '2,750원', delta: '+22.0%', positive: true, unit: '원', trend: [30,35,38,45,52,60,68] },
];

// 최근 공시
const DISCLOSURES = [
  { date: '2026.05.12', type: '주요', badge: 'red',    title: '단일판매ㆍ공급계약체결',           filer: '셀트리온' },
  { date: '2026.05.08', type: '발행', badge: 'purple', title: '전환사채권발행결정',                filer: '셀트리온' },
  { date: '2026.04.30', type: '정기', badge: 'blue',   title: '분기보고서 (2026.03)',              filer: '셀트리온' },
  { date: '2026.04.28', type: '지분', badge: 'pink',   title: '최대주주등소유주식변동신고서',      filer: '서정진 외 12인' },
  { date: '2026.04.18', type: '주요', badge: 'amber',  title: '주요사항보고서(자기주식취득결정)',  filer: '셀트리온' },
  { date: '2026.04.10', type: '감사', badge: 'gray',   title: '감사보고서 제출',                   filer: '삼정회계법인' },
  { date: '2026.03.27', type: '정기', badge: 'blue',   title: '사업보고서 (2025.12)',              filer: '셀트리온' },
  { date: '2026.03.21', type: '주요', badge: 'orange', title: '타법인주식및출자증권취득결정',      filer: '셀트리온' },
];

// 주요 주주
const SHAREHOLDERS = [
  { name: '서정진',         relate: '본인',         shares: '27,532,118', ratio: 18.42 },
  { name: '셀트리온홀딩스', relate: '특수관계인',   shares: '32,118,442', ratio: 21.48 },
  { name: '국민연금공단',   relate: '주요주주',     shares:  '9,724,335', ratio:  6.50 },
  { name: 'BlackRock',      relate: '주요주주',     shares:  '7,810,221', ratio:  5.22 },
  { name: '기타',           relate: '소액주주 등',  shares: '72,433,884', ratio: 48.38 },
];

// AI 분석 사이드 패널 메시지 예시
const AI_MESSAGES = [
  {
    role: 'user',
    content: '셀트리온의 최근 3년 수익성 추이와 동종업계 대비 경쟁력을 알려줘.',
  },
  {
    role: 'assistant',
    thinking: [
      { kind: 'search', label: 'DART 분석', detail: '재무제표 3개년 조회 (2023-2025)' },
      { kind: 'search', label: '동종업계 비교', detail: '의약품 업종 5개사 ROE/영업이익률 추출' },
      { kind: 'search', label: '웹 검색', detail: '바이오시밀러 시장 전망 · 2024-2026' },
      { kind: 'agent',  label: '교차 검증',    detail: 'DART 공시 + 시장 데이터 일치성 점검' },
    ],
    content: `**수익성 추이** — 매출은 3년 CAGR **+14.2%**, 영업이익률은 **18.1% → 23.4%**로 +5.3pp 개선되었습니다. 2024년 휴미라 바이오시밀러(유플라이마) 미국 매출이 본격화된 영향이 큽니다.

**동종업계 대비** — 의약품 업종 평균 영업이익률(8.7%) 대비 **2.7배** 수준. 한미약품(15.2%), 유한양행(6.4%) 보다 우위입니다.

**리스크 요인** — ROE는 5.1%로 업종 평균(7.8%) 하회. 자본총계 증가에 비해 이익 환원 속도가 느린 편입니다.`,
    citations: [
      { id: 1, source: 'DART', label: '셀트리온 2025 사업보고서' },
      { id: 2, source: 'DART', label: '의약품 업종 5개사 재무제표' },
      { id: 3, source: 'Web',  label: 'BiosimilarReview 2025.Q4' },
    ],
  },
];

window.COMPANY_SEARCH_RESULTS = COMPANY_SEARCH_RESULTS;
window.SELECTED_COMPANY = SELECTED_COMPANY;
window.INDICATORS = INDICATORS;
window.DISCLOSURES = DISCLOSURES;
window.SHAREHOLDERS = SHAREHOLDERS;
window.AI_MESSAGES = AI_MESSAGES;

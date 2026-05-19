# Lab Agent 분석

_Started 2026-05-18 16:38 UTC_

---

## User

Agent 리포지토리의 Lab_agent를 확인하고 AI 기업정보 분석 메뉴 확인

## Assistant

_[tool: list_files]_

Lab_agent 리포지토리를 확인하려면 GitHub 접근이 필요합니다. 어떻게 도와드릴까요?

1. **GitHub 리포지토리 URL을 공유**해 주시면 — 리포지토리의 Lab_agent 폴더를 탐색하고 AI 기업정보 분석 메뉴 관련 파일을 확인할 수 있습니다.

2. 또는 **GitHub 연결**을 진행하시면 — 권한 부여 후 Agent 리포지토리에 직접 접근하여 Lab_agent 구조와 AI 기업정보 분석 메뉴 구현을 확인할 수 있습니다.

3. 만약 코드/스크린샷을 **직접 첨부**해 주시면 — 첨부된 자료를 기반으로 바로 분석을 시작할 수 있습니다.

어떤 방식으로 진행할까요?

## User

해당 폴더에서 확인

## Assistant

_[tool: local_ls]_

_[tool: local_ls]_

_[tool: local_grep]_

_[tool: local_read]_

AI 기업정보 분석 메뉴 구조를 파악하기 위해 핵심 파일들을 확인하겠습니다.

_[tool: local_ls]_

_[tool: local_ls]_

_[tool: local_read]_

_[tool: local_ls]_

_[tool: local_read]_

_[tool: local_ls]_

Lab_agent 리포지토리의 **AI 기업정보 분석** 메뉴 구조를 확인했습니다. 다음과 같이 정리해드립니다:

## 📋 AI 기업정보 분석 (`/dart`) 메뉴 개요

### 🔑 기본 정보
- **메뉴 ID**: `dart`
- **라우트**: `/dart`
- **아이콘**: `Building2` (lucide-react)
- **설명**: "DART/KRX 공시 기반 기업 분석"
- **접근 권한**: `admin`, `medicnc`, `ai-ceo`, `ai-kkanbu`, `professor`, `ai-medic` 그룹 모두 접근 가능 (전 그룹 공통 메뉴)

### 📁 주요 파일 구조

```
src/
├── app/(main)/dart/page.tsx               # 페이지 엔트리 (DartDashboard 호출)
├── app/api/dart/                          # 17개 API 라우트
│   ├── ai-analysis/route.ts               # AI 종합 분석 (Claude/웹검색/통합/교차검증)
│   ├── analysis/route.ts                  # 기본 기업 분석
│   ├── company/route.ts                   # 기업 개요
│   ├── financial/route.ts                 # 재무
│   ├── disclosure*/                       # 공시 관련 4종
│   ├── indicators/route.ts                # KPI 지표
│   ├── audit, dividends, securities,      # 분야별 데이터
│   │   subsidiaries, trend, status,
│   │   search, available-periods
├── components/dart/
│   ├── DartDashboard.tsx                  # 메인 대시보드 (1,763줄)
│   ├── CompanySearch.tsx                  # 기업 검색
│   ├── CompanyOverview.tsx                # 기업 개요 카드
│   ├── IndicatorDashboard.tsx             # KPI 카드 그리드
│   ├── CommonSelector.tsx                 # 공통 필터(연도/보고서)
│   ├── FinancialTabs.tsx                  # 재무 탭
│   ├── ChartTab.tsx                       # 차트 탭
│   ├── StockQuoteTab.tsx                  # 한국투자증권 실시간 시세
│   ├── tabs/
│   │   ├── MnaTab, SecuritiesTab,
│   │   ├── AuditTab, KrxDisclosureTab
│   └── modals/
│       ├── AIAnalysisModal.tsx            # ✨ AI 분석 모달 (핵심)
│       ├── TrendModal, CompareModal,
│       └── DetailModal, AIResultModal
└── lib/services/dart/
    ├── dart-api.service.ts                # DART API 통합
    └── analysis.service.ts                # AI 분석 서비스
```

### 🗂️ 대시보드 탭 구성 (11개)

| # | 탭 ID | 라벨 | 비상장 지원 |
|---|---|---|:---:|
| 1 | `disclosures` | 공시 | ✅ |
| 2 | `krxDisclosures` | KRX공시 | ❌ |
| 3 | `financials` | 재무 | ✅ |
| 4 | `shareholders` | 주주 | ✅ |
| 5 | `executives` | 임원 | ✅ |
| 6 | `employees` | 직원 | ✅ |
| 7 | `dividends` | 배당 | ✅ |
| 8 | `charts` | 차트 | ❌ |
| 9 | `mna` | M&A | ✅ |
| 10 | `securities` | 증권발행 | ✅ |
| 11 | `audit` | 감사의견 | ✅ |

> 비상장 회사(`corpCls === 'E'`)는 KRX공시·차트 탭이 자동으로 숨겨집니다.

### ⚙️ 핵심 기능
1. **기업 검색**: 기업명/종목코드 자동완성 (`CompanySearch`)
2. **기업 개요**: 대표자/설립일/주소/업종/사업자번호 등 (`CompanyOverview`)
3. **실시간 시세**: 한국투자증권(KIS) API 연동 (`StockQuoteTab`)
4. **재무 지표 대시보드**: KPI 카드 그리드, 클릭 시 트렌드 모달
5. **AI 분석 모달** (보라색 ✨ 버튼):
   - 4개 탭: **웹검색 / DART분석 / 통합 / 교차검증**
   - 스트리밍 응답 + Claude 기반
   - `analysis.service.ts`에서 회사정보·재무요약·주주·인력 통합 프롬프트 생성
6. **공시 분류 자동화**: 정기/비정기/중요(유증·CB·합병 등) 자동 배지
7. **트렌드/비교 모달**: 지표 시계열 + 동종업계 비교

### 🔄 데이터 로딩 흐름
기업 선택 → 병렬 fetch 3개:
- `/api/dart/company?full=true` (전체 기업정보)
- `/api/dart/financial?multiYear=true&years=5` (5개년 재무)
- `/api/dart/available-periods?years=5` (가용 보고기간 자동 탐색)

더 깊이 확인하고 싶은 부분(예: AI 분석 모달의 4탭 동작, 특정 API 엔드포인트, 또는 디자인 개선 작업)이 있으면 말씀해 주세요.

## User

해당 메뉴를 지금 에이전트에서 구현한다고 할 때 현재 UI에 따라서 화면을 다시 디자인 제안.

## Assistant

_[tool: read_file]_

_[tool: list_files]_

현재 에이전트 UI를 먼저 확인하고 그에 맞춰 재디자인하겠습니다.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: update_todos]_

현재 에이전트의 디자인 언어(Pretendard, 따뜻한 크림 배경, 보라 accent, 카드 기반)에 맞춰서 **AI 기업정보 분석** 메뉴를 다시 디자인하겠습니다. 핵심 개선 방향:

1. 11개 평면 탭 → **5개 그룹화된 탭** (개요/공시/재무/거버넌스/이벤트)
2. AI 분석을 **모달이 아닌 사이드 패널**로 통합 (에이전트 답게)
3. 기업 검색을 더 작은 컴팩트 상단 바로
4. KPI 카드를 더 시각적이고 비교 가능하게

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: done]_

_[tool: fork_verifier_agent]_

**AI 기업정보 분석 메뉴를 에이전트 UI에 맞춰 재디자인했습니다.**

## 📐 디자인 캔버스 구성 (8개 섹션)

**01 · 전체 화면 — 4가지 방향**
- **A** 평면 11탭 (기존 호환)
- **B** 그룹 5탭 + 부제 (추천) — 개요 / 공시 / 재무·차트 / 거버넌스 / 이벤트
- **C** AI-First · 사이드 패널 도킹 (에이전트 정체성 강화)
- **D** 공시 상세 + 서브탭 시나리오

**02~08 · 컴포넌트 단위 베리에이션**
- 시작 화면 (추천 질문 + 자동완성)
- 기업 개요 카드 (4열 정보 / 한줄 컴팩트)
- AI 분석 패널 3종 (사이드 / 인라인 / 모달)
- 탭 시스템 (평면 11 / 그룹 5 / +서브탭)
- KPI 카드 (스파크라인 + 전년 대비 증감)
- AI 인사이트 스트립 (자동 요약)
- 공시 리스트 · 주주 도넛

## 🎯 주요 개선 포인트

| | 기존 | 제안 |
|---|---|---|
| **탭** | 11개 가로 스크롤 | **5개 그룹** + 부제 + 서브탭 |
| **AI 분석** | 보라색 버튼 → 풀스크린 모달 | **도킹 가능한 사이드 패널** (에이전트 답게) |
| **검색** | 단순 입력바 | **추천 질문 + 최근 본 기업** + 자동완성 |
| **KPI** | 텍스트 값만 | **스파크라인 + 증감 +/- pp** |
| **인사이트** | 사용자가 직접 분석 요청 | **상단 자동 요약 스트립** (3.2초 자동 생성) |
| **시각 언어** | shadcn 기본 | Pretendard / 보라 accent / 따뜻한 크림 배경 통일 |

좌측 사이드바에 `AI 기업정보 분석` 메뉴를 **AI 에이전트 그룹** 안에 추가해 활성 상태(보라 인디케이터)로 표시했습니다. 더 발전시키고 싶은 방향(예: B/C 중 하나 골라 상세화, 다른 탭 화면 추가 디자인)이 있으면 알려주세요.

## User

Verifier agent check completed

## Assistant

_[tool: grep]_

_[tool: run_script]_

_[tool: grep]_

_[tool: done]_

토큰 미정의 이슈를 수정했습니다 — `var(--t-neutral-10)` (정의되지 않은 스케일)을 모두 `var(--t-neutral-12)`로 치환 (3개 파일 · 총 15곳). 검색바·추천 카드·인용 칩·자동완성 드롭다운 등 보더가 누락되어 "떠 보이던" 표면들이 이제 정상적으로 1px 보더를 가집니다.


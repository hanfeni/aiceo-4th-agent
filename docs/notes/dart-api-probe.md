# OPEN-4 실측 — DART OpenAPI 응답 스키마 (R8)

> Slice D1, 2026-05-19. DART_API_KEY = medigate-manager `.env` 에서 이관
> (40자 hex, `.env.local` gitignored 확인). 실측 대상 = OpenDART
> `https://opendart.fss.or.kr/api`. 삼성전자 corp_code=`00126380` 기준.
> 픽스처: `tests/fixtures/dart/{company,financial-statements,disclosure-list}.json`.

## 1. 핵심 발견 (R8 — 스펙 위반 아님, 원본 아키텍처 확인)

**원본 도메인 타입은 camelCase, 실제 DART 응답은 snake_case.**

| 도메인 타입 (types/dart.ts) | 실제 raw 응답 키 |
|------------------------------|------------------|
| `DartFinancialItem.thstrmAmount` | `thstrm_amount` |
| `DartFinancialItem.accountNm` | `account_nm` |
| `DartFinancialItem.rceptNo` | `rcept_no` |
| `DartCompanyInfo.ceoName` | `ceo_nm` |
| `DartCompanyInfo.stockCode` | `stock_code` |
| `DartDisclosure.reportNm` | `report_nm` |

이는 **충돌이 아니다**. 원본 `dart-api.ts` 가 raw 응답을
`DartApiResponse<Record<string,string>>`(snake_case, 느슨)으로 받고
도메인 타입(camelCase)으로 **변환**한다. 즉 타입이 2종:

- **raw API 응답** = snake_case, `Record<string,string>` — D2 `api/client.ts` 경계
- **도메인 타입** = camelCase — D1 `src/types/dart/` (변환 후 SSOT)

→ D1 은 원본 camelCase 도메인 타입 기준 분리가 맞다. snake→camel 매핑은
D2 책임. **PRD 개정 불필요** (원본의 의도된 raw/도메인 분리를 실측이 확인).

## 2. 실측 raw 필드명 (D2 매핑 정답지)

### company.json (status 000 정상, corp_name=삼성전자(주))
```
acc_mt adres bizr_no ceo_nm corp_cls corp_code corp_name corp_name_eng
est_dt fax_no hm_url induty_code ir_url jurir_no phn_no stock_code stock_name
```
(+ 응답 봉투: `status`, `message`)

### fnlttSinglAcntAll.json (status 000, list 176건, 2023/11011/CFS)
```
account_detail account_id account_nm bfefrmtrm_amount bfefrmtrm_nm
bsns_year corp_code currency frmtrm_amount frmtrm_nm ord rcept_no
reprt_code sj_div sj_nm thstrm_amount thstrm_nm
```
주의: 원본 `DartFinancialItem` 에 있는 `thstrmAddAmount`/`frmtrmAddAmount`
(누적금액)는 **사업보고서(11011) 응답엔 없음** — 분기보고서(11013/11014)
응답에만 등장. 타입에선 optional(`?`) 유지가 맞음(원본도 optional).

### list.json (status 000, total_count 15)
```
corp_cls corp_code corp_name flr_nm rcept_dt rcept_no report_nm rm stock_code
```
(+ 봉투: `status message page_no page_count total_count total_page`)

## 3. 응답 봉투 공통 규약 (전 엔드포인트)

- `status`: `"000"`=정상. 그 외 에러코드(`"013"`=데이터없음, `"020"`=
  키 사용한도 초과, `"100"`=필수파라미터 누락 등 — D2 에러 매핑 대상).
- `message`: 상태 설명 한글.
- list 계열은 `list: [...]` + 페이지네이션 메타.

## 4. D1 결론

- 원본 `types/dart.ts`(1374줄) camelCase 도메인 타입을 4파일 기능축
  분리(entities/securities/indicators/trend). 실측이 도메인 타입
  적합성 확인 — **원본 타입 정의 변경 0**.
- raw snake_case 키 목록은 위 §2 — D2 `api/client.ts` 매핑 구현 시
  이 노트가 정답지(추가 실측 불요, 같은 픽스처 재사용).
- optional 필드(`thstrmAddAmount` 등)는 보고서 종류별 응답 차이 →
  optional 유지가 실측상 정확.

## 5. D6 추가 실측 예정 (OPEN-3 — 이 노트 append 대상)

subagent 사고채널 메타(`langgraph_node`/subagent_type 런타임 라벨)는
D6 에서 실측해 이 파일에 append.

---

## D11 R8 실측 — R5 책임 이전 (고정흐름 재설계, 2026-05-19)

> probe: scripts/dart-route-r5-probe.mts / 로그: /tmp/dart-route-r5-probe.jsonl
> 실 OpenAI + 실 DART API (D8 과금 승인 범위). 삼성전자/financial_health.

OPEN-3(subagent 사고채널 메타)는 고정흐름 재설계로 **무효화**(subagent
경로 폐기 — D9). R5 책임이 "전용 라우트 chunkText 가 model.stream()
AIMessageChunk 에서 reasoning 보간 0"으로 이전. 실측 결과:

- collectDartContext 실동작: 삼성전자 corp_code=00126380 식별,
  DART OpenAPI 2021~2025 재무 수집(매출 279.6조 등) → 압축 텍스트.
  OPEN-3 의 "subagent 위임 안 됨" 문제가 고정 라우트로 완전 해소.
- **R5 실측 PASS**: 실제 OpenAI 스트림 chunks=3532, blockTypes=
  ["reasoning","text"], **reasoning 블록 1085개** 흘림(gpt-5 Responses
  API). 그러나 chunkText 결과 body(4111자)엔 분석 본문만 — reasoning
  텍스트 0건. chunkText 가 1085 reasoning 블록 전수 차단. R5/FR-26
  무손상(architect "라우트 인코더 reasoning 분리" 설계 입증).
- model.ts 주석 검증: contentShapes=["array"] — gpt-5 Responses API
  는 content 항상 블록배열(string 아님). 초기 빈 배열 청크 정상
  (text/reasoning 은 이후 청크). chunkText 의 array 분기가 실경로.
- 결론: 고정흐름(전용 라우트) = medigate 동형 동작 + R5 무손상 확정.

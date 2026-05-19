/**
 * DART 도메인 최상위 배럴 (re-export 허용 예외 — 단일 진입점).
 *
 * 소비처(D6 dartTool)는 `@/lib/dart` 한 곳에서 고수준 조립 API 를
 * 가져온다. 하위 디렉토리(api/indicators/trend/ratelimit)는 각자
 * 배럴을 갖지만, 최상위는 **dart-api.service.ts(고수준 조립)** 만
 * re-export 한다 — service 가 이미 api/* 함수를 재수출하므로(원본
 * dart-api.service 의 export 블록 보존) searchCompany/
 * getMultiYearFinancialSummary/extractWorkforceSummary/getCompanyInfo/
 * getEmployees/getMajorShareholders/getDividends 등이 단일 경로로
 * 노출된다.
 *
 * 중복 export 회피: api/index.ts 를 여기서 `export *` 하면 service 의
 * 재수출과 이름 충돌(searchCompanies 등)하므로 service 만 노출.
 * disclosure/context-formatter 는 D6 가 직접 경로(`@/lib/dart/
 * disclosure`, `@/lib/dart/context-formatter`)로 접근(전용 타입·
 * 압축 레이어 — 명시적 import 가 의존을 더 분명히 함).
 */
export * from "./dart-api.service";

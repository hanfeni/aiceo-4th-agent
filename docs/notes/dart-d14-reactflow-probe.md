# D14b 의존성 실측 — @xyflow/react 도입 (2026-05-19)

> 사용자 HITL: DART 교육용 노드-엣지 시각화 = React Flow 도입 확정
> (CLAUDE.md "불필요 패키지 금지" 예외 — 사용자 명시 결정).
> architect D14 설계 PASS. 설치 직전 `npm view` 재확인(작업 원칙).

## 설치
- `@xyflow/react@12.10.2` (npm view 최신 = 12.10.2, 캐럿핀 `^12.10.2`).
  package.json dependencies 정식 추가.

## R1 (@langchain/core 단일 트리) — 영향 0 확인
`pnpm why @langchain/core` → 전 의존이 **1.1.46 단일**. xyflow 트리
(classcat / zustand / @xyflow/system)에 LangChain 0. AIMessageChunk
instanceof 정체성 무영향 — R1 불변.

## zustand 이중 버전 공존 — 정상 (architect 인지 사항, 차단 아님)
`pnpm why zustand`:
- 앱 직접 의존: **zustand 5.0.13** (기존 store/index.ts)
- @xyflow/react 내부 의존: **zustand 4.5.7** (xyflow 가 peer 아닌
  자체 dependency 로 가짐 → pnpm 격리 설치)

→ 두 store 인스턴스 메모리 완전 분리(앱 5 / xyflow 내부 4). 기능
충돌 0. R1(@langchain/core instanceof)과 무관한 별개 라이브러리라
영향 0. **zustand 강제 dedupe 금지**(xyflow@4 API 비호환 — 4→5
breaking change). 공존이 정상 상태.

## 결론
@xyflow/react 도입은 R1 무영향, zustand 이중 버전은 격리 공존(정상).
D14b 노드-엣지 캔버스 구현 진행 가능.

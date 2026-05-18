# UI 제안 (스펙 외 — 구현 보류, 기록만)

> CLAUDE.md 규약: "스펙에 없는 UI 요소 추가 판단 시 구현 말고
> docs/notes/ui-suggestions.md 기록만". 정식 반영은 /plan·/bootstrap-feature
> 파이프라인으로 별도 진행.

---

## US-1. ModelPicker 모델 선택 기능 (2026-05-19 제안)

### 요청
헤더의 ModelPicker(`openai · gpt-5.4-mini` 표시)에서 **최신 모델까지
사용자가 직접 선택**하도록.

### 현재 상태
- `src/app/(main)/chat/HeaderControls.tsx:79-109` — ModelPicker 는
  **시각 전용 mock** (`disabled`, `title="준비 중"`, `cursor:not-allowed`).
- 서버 환경변수(`LLM_PROVIDER`/`LLM_MODEL`) 값을 props 로 받아 **표시만** 함.

### 스펙 충돌 (requirements.md)
| 조항 | 현재 스펙 | 요청 시 변경 |
|---|---|---|
| FR-07 (line 418) | 모델/프로바이더 **표시** (Should) | **선택**으로 격상 |
| line 64 | 모델 ID = `.env` `LLM_MODEL` 주입, **하드코딩 금지** | 모델 목록을 코드/UI 에 정의 |
| line 100 | active = `LLM_PROVIDER` env 스위칭 | 클라이언트 선택값 반영 |
| line 463-464 | model.ts 가 env 로만 모델 인스턴스 결정 | 런타임 선택 모델 반영 |

→ ModelPicker mock 은 미구현이 아니라 **설계상 의도**(모델=서버 단일 고정).

### 구현 시 영향 범위 (추정)
1. `HeaderControls.tsx` — mock 버튼 → 실동작 드롭다운 + 선택 상태
2. `src/store/` — 선택 모델 상태 추가
3. `route.ts` — 클라이언트 선택 모델을 요청 바디로 수신
4. `model.ts` — env 단일 결정 → 요청별 모델 오버라이드 허용 (R8: 두
   프로바이더 streaming/thinking 차이 실측 필요)
5. 모델 목록 데이터 — "최신 모델까지" 채우려면 지식 컷오프(2026-01) 한계로
   **실측/사용자 확인 필요** (R8: 학습 지식 단정 금지)
6. 보안 — 클라이언트가 임의 모델 문자열 주입 가능 → 화이트리스트 검증 필수

### 권장 절차
스펙 변경이므로 requirements.md 갱신 → `/bootstrap-feature`
(PRD·use case·architecture·QA) → `/implement-slice`.

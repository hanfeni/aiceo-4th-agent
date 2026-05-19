/**
 * 첨부 입력 한도 SSOT (Plan Critic A1/E1/E2 — checkpointer 누적·폭주 방어).
 *
 * 클라이언트(이미지 base64 변환 시 사전 차단)와 서버(route zod refine
 * 최종 검증)가 **같은 상수**를 참조해 정책이 갈리지 않게 한다. 검증
 * SSOT 는 서버 route zod(model-selection C5 패턴 일관) — 이 상수는 그
 * 임계값 정의일 뿐이다.
 */

/** 추출 텍스트가 합쳐지는 query 의 최대 길이(문자). 폭주 차단(E1). */
export const MAX_QUERY_LEN = 200_000;

/** 한 턴에 보낼 수 있는 이미지 최대 개수. checkpointer 누적 완화(A1). */
export const MAX_IMAGES_PER_TURN = 3;

/**
 * 이미지 1장 base64 data URL 의 최대 문자 길이.
 * base64 는 원본의 약 4/3 배 → ~1.4M 문자 ≈ 원본 ~1MB(A1/E2).
 */
export const MAX_IMAGE_DATA_URL_LEN = 1_400_000;

/**
 * 허용 이미지 data URL prefix(E2 — 임의 바이너리/스크립트 data URL 주입
 * 차단). OpenAI 멀티모달이 받는 일반 이미지 포맷으로 한정.
 */
export const IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpe?g|webp|gif);base64,/;

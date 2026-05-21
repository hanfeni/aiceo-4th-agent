/**
 * 검색 실습 — 토큰 단위 청킹 (tiktoken cl100k_base).
 *
 * 사용자 결정 2026-05-19: 청크는 글자 근사가 아니라 **토큰 단위**.
 * text-embedding-3-small 이 쓰는 cl100k_base 토크나이저로 분할 →
 * 청크 경계가 임베딩 토큰과 정확히 일치(한국어는 글자≈토큰이라
 * 글자÷2 근사가 크게 빗나감 — 실측 49글자=45토큰).
 *
 * 기본 = 청킹 OFF (사용자 결정): chunkSize 미지정/0 이면 분할 안
 * 하고 문서 전체를 청크 1개로(기존 문서=1벡터 동작 보존). ON 일
 * 때만 size 토큰 윈도우 + overlap 토큰 겹침으로 슬라이딩 분할.
 *
 * 구현: js-tiktoken (순수 JS, WASM 없음). tiktoken WASM 은
 * Turbopack(Next16) 서버 번들에서 'Missing tiktoken_bg.wasm'
 * 으로 모듈 평가 실패 → 색인 라우트 500. js-tiktoken 은 동일
 * cl100k_base BPE 를 JS 로 — 토큰화 결과 비트 단위 동일, 번들
 * 문제 원천 차단. decode 가 문자열 직접 반환(TextDecoder 불요).
 */

import { getEncoding, type Tiktoken } from "js-tiktoken";

export interface ChunkOptions {
  /** 청크 크기(토큰). 0/미지정 = 청킹 안 함(문서 전체 1청크). */
  chunkSize?: number;
  /** 청크 간 겹침(토큰). chunkSize>0 일 때만 의미. 기본 0. */
  overlap?: number;
}

export interface Chunk {
  /** 0-base 청크 순번 (doc 내) */
  index: number;
  /** 청크 텍스트 (임베딩·색인 대상) */
  text: string;
  /** 이 청크 토큰 수 (디버그·표시) */
  tokens: number;
}

let _enc: Tiktoken | null = null;
/** cl100k 인코더 1회 생성·재사용 (js-tiktoken 은 free 불요) */
function enc(): Tiktoken {
  if (!_enc) _enc = getEncoding("cl100k_base");
  return _enc;
}

/** 토큰 배열 → 문자열 (js-tiktoken decode 는 string 직접 반환) */
function decode(e: Tiktoken, tokens: number[]): string {
  return e.decode(tokens);
}

/**
 * 텍스트의 토큰 수만 센다 (UI 미리보기·검증용, 분할 없음).
 */
export function countTokens(text: string): number {
  return enc().encode(text).length;
}

/**
 * 텍스트를 토큰 경계로 분해한 조각 배열을 반환한다.
 * 하이라이트 시각화용.
 *
 * 한국어는 한 글자가 2~3개 토큰으로 쪼개지고 각 토큰은 불완전한
 * UTF-8 바이트 조각이다. 토큰 1개씩 decode 하면 ?로 깨지므로
 * textMap 으로 raw bytes 를 읽어 완전한 UTF-8 문자가 완성되는
 * 시점에 경계를 끊어 조각을 만든다.
 */
export function tokenizeText(text: string): string[] {
  const e = enc();
  const ids = e.encode(text);
  const td = new TextDecoder("utf-8", { fatal: false });
  const result: string[] = [];
  let buf: number[] = [];

  for (const id of ids) {
    const raw = (e as unknown as { textMap: Map<number, Uint8Array> }).textMap.get(id);
    if (!raw) continue;
    buf.push(...raw);
    // 버퍼가 완전한 UTF-8 시퀀스인지 확인 — 불완전하면 다음 토큰까지 누적.
    // 방법: decode 후 replacement character(U+FFFD) 없으면 완성.
    const decoded = td.decode(new Uint8Array(buf));
    if (!decoded.includes("�")) {
      result.push(decoded);
      buf = [];
    }
  }
  // 잔여 바이트(손상된 경우) — lossy 디코딩으로 그대로 포함.
  if (buf.length > 0) {
    result.push(new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf)));
  }
  return result.filter((s) => s.length > 0);
}

/**
 * 토큰 단위 청킹.
 *
 * - chunkSize 미지정/0 → 청킹 OFF: 전체를 청크 1개로 반환
 *   (기존 문서=1벡터 동작 보존, 회귀 안전).
 * - chunkSize>0 → size 토큰 윈도우를 (size-overlap) 스텝으로
 *   슬라이딩하며 분할. 마지막 잔여 토큰도 청크 1개로 포함.
 *
 * 분할 규칙(사용자 결정 2026-05-19 — 제안 초안):
 *  - step = max(1, size-overlap). overlap>=size 면 step<=0 →
 *    무한루프이므로 최소 1 강제(방어).
 *  - [start, start+size) 윈도우를 step 스텝으로 슬라이딩.
 *  - 마지막 잔여(부분 윈도우)도 1청크로 포함 후 break(중복 방지).
 */
export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const size = opts.chunkSize ?? 0;
  const overlap = Math.max(0, opts.overlap ?? 0);
  const e = enc();

  // 청킹 OFF — 전체 1청크 (기존 동작 보존). encode 로 토큰 수만.
  if (!size || size <= 0) {
    return [{ index: 0, text, tokens: e.encode(text).length }];
  }

  const tokens = e.encode(text); // number[] (js-tiktoken)
  const out: Chunk[] = [];

  // 슬라이딩 윈도우: step 스텝으로 [start,start+size) 윈도우 이동.
  const step = Math.max(1, size - overlap); // overlap>=size 방어
  for (let start = 0, idx = 0; start < tokens.length; start += step, idx++) {
    const slice = tokens.slice(start, start + size);
    out.push({ index: idx, text: decode(e, slice), tokens: slice.length });
    if (start + size >= tokens.length) break; // 잔여 포함 후 종료
  }

  // 빈 결과 방어 (빈 문자열 등) → 최소 1청크
  return out.length > 0
    ? out
    : [{ index: 0, text, tokens: tokens.length }];
}

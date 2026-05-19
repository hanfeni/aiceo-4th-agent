"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * JsonResultView — 메타라벨링 결과 JSON 을 동적으로 보기 좋게 렌더.
 *
 * 사용자 결정: "JSON 이 다양하므로 동적으로 가져와야 한다" — 필드명
 * 하드코딩 금지. 파싱된 객체의 값 타입을 보고 재귀 렌더한다:
 *  - string  → 텍스트
 *  - number/boolean → 뱃지
 *  - string[] → 칩(chip) 목록
 *  - object/array → 중첩 카드(재귀)
 *
 * label(단일 메타) / discover(스키마 후보) 둘 다 같은 뷰어로 처리 —
 * 스키마가 달라도(LLM 이 특수 분류 반환해도) 안 깨진다.
 *
 * 파싱: 스트리밍 raw 텍스트에서 JSON 만 추출(코드펜스/설명 섞임 방어).
 * 실패 시 null 반환 → 호출부가 "raw 만 표시" 로 graceful.
 */

const chip: CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  margin: "2px 4px 2px 0",
  fontSize: 11.5,
  borderRadius: 999,
  // 메타 라벨링 페이지 고유색 = 푸른색(medigate Control Atoms blue
  // 토큰 정합 — 4메뉴·검색·라벨링 그룹 동일 색계).
  background: "var(--t-blue-8)",
  color: "var(--blue-700)",
  fontWeight: 600,
};
const keyStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  marginBottom: 4,
};
const valStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--text-default)",
  lineHeight: 1.55,
};
const row: CSSProperties = { marginBottom: 14 };
const badge: CSSProperties = {
  display: "inline-block",
  padding: "2px 9px",
  fontSize: 11.5,
  fontWeight: 700,
  borderRadius: 6,
  background: "var(--t-neutral-8)",
  color: "var(--text-default)",
};

/**
 * 스트리밍 raw 텍스트에서 첫 균형 잡힌 JSON 객체를 추출해 파싱.
 * - ```json ... ``` 코드펜스 제거
 * - 본문 앞뒤 설명 텍스트가 있어도 첫 '{' ~ 짝 맞는 '}' 만 슬라이스
 * 실패하면 null.
 */
export function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  let s = raw.trim();
  // 코드펜스 제거
  s = s.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null; // 닫히지 않음(스트리밍 중) → 아직 표시 안 함
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function renderValue(v: unknown): ReactNode {
  if (v === null || v === undefined)
    return <span style={{ color: "var(--text-subtle)" }}>—</span>;
  if (typeof v === "boolean")
    return <span style={badge}>{v ? "true" : "false"}</span>;
  if (typeof v === "number") return <span style={badge}>{v}</span>;
  if (typeof v === "string")
    return <span style={valStyle}>{v}</span>;
  if (Array.isArray(v)) {
    // 원소가 전부 원시값이면 칩 목록, 아니면 재귀 카드
    if (v.every(isPrimitive)) {
      return (
        <div>
          {v.map((item, i) => (
            <span key={i} style={chip}>
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div>
        {v.map((item, i) => (
          <div
            key={i}
            style={{
              borderLeft: "2px solid var(--t-neutral-8)",
              paddingLeft: 12,
              marginBottom: 8,
            }}
          >
            {renderValue(item)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof v === "object") {
    return (
      <div style={{ paddingLeft: 8 }}>
        {Object.entries(v as Record<string, unknown>).map(([k, val]) => (
          <div key={k} style={row}>
            <div style={keyStyle}>{k}</div>
            {renderValue(val)}
          </div>
        ))}
      </div>
    );
  }
  return <span style={valStyle}>{String(v)}</span>;
}

interface JsonResultViewProps {
  /** 스트리밍 raw 텍스트 (파싱은 내부에서) */
  raw: string;
}

/**
 * raw → JSON 파싱 성공 시 동적 카드 렌더. 실패(미완·비JSON) 시
 * 아무것도 안 그림(호출부가 raw 를 별도 표시 중이므로 중복 회피).
 */
export function JsonResultView({ raw }: JsonResultViewProps): ReactNode {
  const parsed = extractJson(raw);
  if (parsed === null || typeof parsed !== "object") return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        background: "var(--surface-default)",
        border: "1px solid var(--t-blue-12)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "var(--blue-700)",
          marginBottom: 12,
        }}
      >
        ✦ 라벨링 결과 (파싱됨)
      </div>
      {renderValue(parsed)}
    </div>
  );
}

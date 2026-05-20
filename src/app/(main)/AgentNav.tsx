"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  SlidersHorizontal,
  Database,
  HardDriveDownload,
  Search,
  Tags,
  Pill,
  Network,
  Bot,
} from "lucide-react";
import { HARNESS_PROFILES, WORKSPACE_IDS } from "@/lib/agent/harness/profiles";
import type { CSSProperties, ReactNode } from "react";

/**
 * AgentNav — 사이드바 nav 항목 (client).
 *
 * 분리 사유: 현재 경로 강조(active)는 usePathname 이 필요한데 layout.tsx
 * 는 server component 다(디자인 핸드오프 "분리 금지"). 그래서 nav 항목만
 * 작은 client 조각으로 분리(Next.js 권장 패턴).
 *
 * 2그룹 구조(사용자 결정 2026-05-19):
 *  - "AI 에이전트": 챗·하네스·DART (기존 보라 accent, --agent-500)
 *  - "검색·라벨링 실습": 메타 라벨링 실습·검색 실습 (고유색 푸른색,
 *    --blue-500 — 4메뉴 medigate Control Atoms 와 동일 색계 정합)
 *
 * 그룹 헤더를 layout.tsx 가 아니라 여기서 렌더한다(layout 은 DART
 * 작업 미커밋 M — 충돌 회피. AgentNav 는 신규 파일이라 0 충돌).
 * "사용성 지표" mock 항목은 삭제(사용자 결정).
 */

const AGENT_ACCENT = "var(--agent-500)"; // AI 에이전트 그룹(보라)
const BLUE_ACCENT = "var(--blue-500)"; // 검색·라벨링 그룹(푸른색)

interface NavItem {
  icon: ReactNode;
  label: string;
  /** 실 라우트면 href. 없으면 disabled mock(항상 비강조). */
  href?: string;
  badge?: string;
}

interface NavGroup {
  title: string;
  /** 그룹 고유 accent (active 배경·badge 색). */
  accent: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "AI 에이전트",
    accent: AGENT_ACCENT,
    items: [
      {
        icon: <MessageSquare size={14} aria-hidden />,
        label: "챗 에이전트",
        href: "/chat",
      },
      {
        icon: <SlidersHorizontal size={14} aria-hidden />,
        label: "하네스 구성",
        href: "/harness",
      },
      {
        icon: <Pill size={14} aria-hidden />,
        label: "DART 기업분석",
        href: "/dart",
      },
      // 챗 에이전트 복제 워크스페이스 3개(메뉴별 하네스 필터). 라벨은
      // 프로필 SSOT(profiles.ts)에서 단일 소스로 가져온다 — 라벨 드리프트 0.
      ...WORKSPACE_IDS.map((id) => ({
        icon: <Bot size={14} aria-hidden />,
        label: HARNESS_PROFILES[id].label,
        href: `/workspace/${id}`,
      })),
    ],
  },
  {
    title: "검색·라벨링 실습",
    accent: BLUE_ACCENT,
    items: [
      {
        icon: <Database size={14} aria-hidden />,
        label: "도메인 색인",
        href: "/index-lab",
      },
      {
        icon: <HardDriveDownload size={14} aria-hidden />,
        label: "데이터 적재",
        href: "/data-load",
      },
      {
        icon: <Tags size={14} aria-hidden />,
        label: "메타 라벨링 실습",
        href: "/meta-lab",
      },
      {
        icon: <Search size={14} aria-hidden />,
        label: "검색 실습",
        href: "/search-lab",
      },
      {
        icon: <Network size={14} aria-hidden />,
        label: "온톨로지 실습",
        href: "/graph-lab",
      },
    ],
  },
];

function NavRow({
  it,
  accent,
  active,
}: {
  it: NavItem;
  accent: string;
  active: boolean;
}): ReactNode {
  const accentSoft = `color-mix(in srgb, ${accent} 12%, transparent)`;
  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 8,
    color: active ? "white" : "var(--text-default)",
    background: active ? accent : "transparent",
    fontSize: 12.5,
    fontWeight: active ? 600 : 500,
    textDecoration: "none",
  };
  const badgeEl = it.badge ? (
    <span
      style={{
        fontSize: 9,
        padding: "2px 5px",
        borderRadius: 4,
        background: active ? "rgba(255,255,255,.25)" : accentSoft,
        color: active ? "white" : accent,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {it.badge}
    </span>
  ) : null;

  // href 있으면 실 라우트(Link). 없으면 disabled mock.
  return it.href ? (
    <Link href={it.href} style={rowStyle}>
      {it.icon}
      <span style={{ flex: 1 }}>{it.label}</span>
      {badgeEl}
    </Link>
  ) : (
    <button
      type="button"
      disabled
      title="준비 중"
      style={{
        ...rowStyle,
        width: "100%",
        border: "none",
        color: "var(--text-subtle)",
        cursor: "not-allowed",
        textAlign: "left",
      }}
    >
      {it.icon}
      <span style={{ flex: 1 }}>{it.label}</span>
      {badgeEl}
    </button>
  );
}

export function AgentNav(): ReactNode {
  const pathname = usePathname();

  return (
    <>
      {NAV_GROUPS.map((group) => (
        // 그룹 = 독립 카드 박스(레퍼런스 medigate 사이드바 — 흰 배경
        // + 미세 보더 + radius + 그룹 간 여백). 헤더(accent 점 + 라벨)
        // 가 박스 상단에 위치. layout 의 "AI 에이전트" 헤더와 첫 그룹
        // 헤더가 시각적으로 겹치나 layout 은 DART 미커밋(M) — 충돌
        // 회피 위해 AgentNav 가 박스+헤더를 완결 렌더(layout 미변경).
        <div
          key={group.title}
          // marginTop 제거 — 그룹 간격은 layout nav 의 flex gap(8)이
          // 홈↔그룹과 동일하게 일괄 처리(margin+gap 합산 방지). 사용자
          // 요청: 그룹 간격을 홈-그룹 간격처럼 좁게.
          style={{
            background: "var(--surface-default)",
            border: "1px solid var(--t-neutral-8)",
            borderRadius: 10,
            padding: "10px 8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "2px 8px 8px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-subtle)",
              letterSpacing: "0.01em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: group.accent,
                flexShrink: 0,
              }}
              aria-hidden
            />
            {group.title}
          </div>
          {group.items.map((it) => {
            // active = 현재 경로가 이 항목 href 와 정확 일치(동적).
            // mock(href 없음)은 항상 false. startsWith 아님 — /chat 과
            // /chat/x 오강조 방지(현재 라우트 단일 depth).
            const active = !!it.href && pathname === it.href;
            return (
              <NavRow
                key={it.label}
                it={it}
                accent={group.accent}
                active={active}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

export default AgentNav;

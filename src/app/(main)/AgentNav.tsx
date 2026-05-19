"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  SlidersHorizontal,
  Search,
  Tags,
  Pill,
  Activity,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * AgentNav — 사이드바 "AI 에이전트" 그룹 항목 (client).
 *
 * 분리 사유: 현재 경로 강조(active)는 usePathname 이 필요한데 layout.tsx
 * 는 server component 다(디자인 핸드오프 "분리 금지" — layout 전체
 * client 화 금지). 그래서 nav 항목만 작은 client 조각으로 분리한다
 * (Next.js 권장 패턴). 그룹 헤더 등 정적 부분은 layout(server)에 잔류.
 *
 * 버그 수정 (이전): AGENT_ITEMS 의 active 가 "에이전트 챗"에 하드코딩
 * 돼 있어 어느 페이지든 항상 그것만 보라 강조됐다(/harness 이동해도
 * 하이라이트 미추적). → active 하드코딩 제거, pathname === href 동적 판정.
 */

const AGENT_ACCENT = "var(--agent-500)";
const AGENT_ACCENT_SOFT =
  "color-mix(in srgb, var(--agent-500) 12%, transparent)";

interface NavItem {
  icon: ReactNode;
  label: string;
  /** 실 라우트면 href. 없으면 disabled mock(항상 비강조). */
  href?: string;
  badge?: string;
}

const AGENT_ITEMS: NavItem[] = [
  {
    icon: <MessageSquare size={14} aria-hidden />,
    label: "에이전트 챗",
    href: "/chat",
    badge: "NEW",
  },
  {
    icon: <SlidersHorizontal size={14} aria-hidden />,
    label: "하네스 구성",
    href: "/harness",
  },
  {
    icon: <Search size={14} aria-hidden />,
    label: "검색 실습",
    href: "/search-lab",
  },
  {
    icon: <Tags size={14} aria-hidden />,
    label: "메타 라벨링 실습",
    href: "/meta-lab",
  },
  {
    icon: <Pill size={14} aria-hidden />,
    label: "DART 기업분석",
    href: "/dart",
  },
  { icon: <Activity size={14} aria-hidden />, label: "사용성 지표" },
];

export function AgentNav(): ReactNode {
  const pathname = usePathname();

  return (
    <>
      {AGENT_ITEMS.map((it) => {
        // active = 현재 경로가 이 항목의 href 와 일치(동적). href 없는
        // mock 은 항상 false. 정확 일치(startsWith 아님 — /chat 과
        // /chat/x 가 둘 다 잡히는 오강조 방지, 현재 라우트는 단일 depth).
        const active = !!it.href && pathname === it.href;

        const rowStyle: CSSProperties = {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 8,
          color: active ? "white" : "var(--text-default)",
          background: active ? AGENT_ACCENT : "transparent",
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
              background: active ? "rgba(255,255,255,.25)" : AGENT_ACCENT_SOFT,
              color: active ? "white" : AGENT_ACCENT,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {it.badge}
          </span>
        ) : null;

        // href 있으면 실 라우트(Link). 없으면 disabled mock.
        return it.href ? (
          <Link key={it.label} href={it.href} style={rowStyle}>
            {it.icon}
            <span style={{ flex: 1 }}>{it.label}</span>
            {badgeEl}
          </Link>
        ) : (
          <button
            key={it.label}
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
      })}
    </>
  );
}

export default AgentNav;

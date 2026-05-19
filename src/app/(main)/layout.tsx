import type { ReactNode, CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal, Home } from "lucide-react";
import { AgentNav } from "./AgentNav";

/**
 * (main) 그룹 셸 — 디자인 핸드오프 AdminCompactSidebar 재현.
 *
 * 스펙 §1.8: Sidebar(로고 + "채팅" 링크) + Header(고정 이메일)를
 * 인라인 구성(분리 금지 — 별도 컴포넌트 파일 없음). 라이트 모드.
 *
 * 기능(실 동작): "채팅" 단일 nav 링크만 실 라우트(/chat). 워크스페이스
 * 피커·그룹 nav 항목·사용자 카드 메뉴는 시각 전용 mock(disabled, 미구현).
 * 고정 이메일은 사용자 카드에 표시.
 */

// 고정 표시 이메일(Header — 스펙 §1.8 "고정 이메일 표시").
// PUBLIC 저장소 노출 방지를 위해 실명/사내 이메일 대신 예시값 사용.
const FIXED_USER_EMAIL = "user@example.com";
const USER_INITIALS = "US";

const iconBtn: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "var(--text-subtle)",
  cursor: "not-allowed",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// 그룹 accent(보라/blue)는 AgentNav.tsx 가 그룹별로 관리한다
// (layout 의 단일 박스/헤더 wrapper 제거 — 이중 박스 해소).

// 그룹 항목 + active(현재 경로) 강조는 AgentNav.tsx
// (client — usePathname). layout 은 server 유지를 위해 nav 조각만 분리.

function Sidebar(): ReactNode {
  return (
    <aside
      style={{
        width: 280,
        background: "var(--medi-gray-50)",
        borderRight: "1px solid var(--t-neutral-8)",
        display: "flex",
        flexDirection: "column",
        padding: "12px 10px",
        flexShrink: 0,
        height: "100%",
      }}
    >
      {/* Workspace pill — 로고. 피커는 시각 mock. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 8px 12px",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            background: "linear-gradient(135deg, var(--blue-400), var(--blue-700))",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          4
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            lineHeight: 1.2,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 13.5,
              color: "var(--text-default)",
            }}
          >
            AICEO-4th AGENT
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
            에이전트 워크스페이스
          </div>
        </div>
        <button type="button" disabled title="준비 중" style={iconBtn}>
          <ChevronDown size={12} aria-hidden />
        </button>
      </div>

      {/* Nav — 디자인 소스 ShellB(B · Card Group) 정합.
          홈(single 실 링크) + "AI 에이전트" 카드 그룹 1개. */}
      <nav
        className="thin-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* 홈 — single nav. ShellB single 행 스타일(:80). */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--t-neutral-8)",
            background: "var(--surface-default)",
            color: "var(--text-default)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Home size={15} aria-hidden />
          <span>홈</span>
        </Link>

        {/* 그룹별 독립 카드 박스는 AgentNav 가 완결 렌더한다(레퍼런스
            medigate 사이드바 — 검색광고/AI에이전트/도구처럼 그룹마다
            형제 박스). layout 은 박스/헤더 wrapper 없이 AgentNav 만
            nav 직속으로 둔다(이중 박스/이중 헤더 제거). active 강조는
            usePathname 필요라 client 분리(AgentNav) — layout server 유지. */}
        <AgentNav />
      </nav>

      {/* User card — 고정 이메일 표시(Header 등가, 스펙 §1.8). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "var(--surface-default)",
          border: "1px solid var(--t-neutral-8)",
          marginTop: 8,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--agent-400), var(--agent-600))",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {USER_INITIALS}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            lineHeight: 1.2,
          }}
        >
          <div
            className="truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text-default)",
            }}
          >
            CEO
          </div>
          <div
            className="truncate"
            style={{ fontSize: 10.5, color: "var(--text-subtle)" }}
          >
            {FIXED_USER_EMAIL}
          </div>
        </div>
        <button type="button" disabled title="준비 중" style={iconBtn}>
          <MoreHorizontal size={13} aria-hidden />
        </button>
      </div>
    </aside>
  );
}

export default function MainLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
        display: "flex",
        background: "var(--surface-default)",
        overflow: "hidden",
      }}
    >
      <Sidebar />
      {children}
    </div>
  );
}

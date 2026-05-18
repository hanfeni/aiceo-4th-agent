import type { ReactNode, CSSProperties } from "react";
import Link from "next/link";
import {
  ChevronDown,
  MoreHorizontal,
  MessageSquare,
  Megaphone,
  Users,
  BarChart3,
} from "lucide-react";

/**
 * (main) 그룹 셸 — 디자인 AdminCompactSidebar (chat.jsx:276-352).
 *
 * requirements.md §1.8: Sidebar(로고 + "채팅" 링크) + Header(고정 이메일)를
 * 인라인 구성(분리 금지 — 별도 컴포넌트 파일 없음). 라이트 모드.
 *
 * 기능(실 동작): "채팅" 단일 nav 링크만 실 라우트(/chat). 워크스페이스
 * 피커·그룹 nav 항목·사용자 카드 메뉴는 시각 전용 mock(disabled, 미구현).
 * 고정 이메일은 사용자 카드에 표시(USER 카드 패턴 chat.jsx:342-349).
 *
 * 픽셀값 인용(chat.jsx):
 *  - aside: width 280, background var(--medi-gray-50), padding 12px 10px (:279)
 *  - 워크스페이스 로고: 28x28 radius 9 blue gradient (:282)
 *  - nav single: padding 10px 12px radius 10 border t-neutral-8 (:294)
 *  - 사용자 카드 avatar: 30x30 원형 agent gradient (:343)
 */

// 고정 표시 이메일(Header — requirements.md §1.8 "고정 이메일 표시").
const FIXED_USER_EMAIL = "dhkim@medicnc.co.kr";
const USER_INITIALS = "DH";

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

// 그룹 nav — 시각 전용 mock(미구현). "채팅"만 실 라우트.
const MOCK_NAV: { icon: ReactNode; label: string }[] = [
  { icon: <Megaphone size={14} aria-hidden />, label: "검색광고" },
  { icon: <Users size={14} aria-hidden />, label: "의사 커뮤니티" },
  { icon: <BarChart3 size={14} aria-hidden />, label: "사용성 분석" },
];

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
          M
        </span>
        <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13.5,
              color: "var(--text-default)",
            }}
          >
            DeepAgents Chat
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
            에이전트 워크스페이스
          </div>
        </div>
        <button type="button" disabled title="준비 중" style={iconBtn}>
          <ChevronDown size={12} aria-hidden />
        </button>
      </div>

      {/* Nav — "채팅" 실 링크 + 그룹 mock */}
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
        <Link
          href="/chat"
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
          <MessageSquare size={15} aria-hidden />
          <span>채팅</span>
        </Link>

        <div
          style={{
            background: "var(--surface-default)",
            border: "1px solid var(--t-neutral-8)",
            borderRadius: 12,
            padding: 8,
          }}
        >
          <div
            style={{
              padding: "4px 6px 6px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            워크스페이스
          </div>
          {MOCK_NAV.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled
              title="준비 중"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                width: "100%",
                border: "none",
                background: "transparent",
                color: "var(--text-subtle)",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "not-allowed",
                textAlign: "left",
              }}
            >
              {it.icon}
              <span style={{ flex: 1 }}>{it.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* User card — 고정 이메일 표시(Header 등가, requirements.md §1.8). */}
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
        <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
          <div
            className="truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text-default)",
            }}
          >
            관리자
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

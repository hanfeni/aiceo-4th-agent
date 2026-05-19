import type { ReactNode } from "react";
import { DartAnalyzeView } from "@/components/dart/DartAnalyzeView";

/**
 * /dart — DART 기업 펀더멘털 분석 전용 페이지 (고정흐름 — D12).
 *
 * meta-lab/page.tsx 동형: View 가 client(SSE 스트림·폼 상태)라
 * page 는 얇은 server 래퍼. layout.tsx(server) 안 건드림 —
 * AgentNav 배열에 항목만 추가(메뉴). /api/dart/analyze(D11) 호출.
 */
export default function DartPage(): ReactNode {
  return <DartAnalyzeView />;
}

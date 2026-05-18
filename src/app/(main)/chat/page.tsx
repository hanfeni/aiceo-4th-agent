import type { ReactNode } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";

/**
 * /chat 페이지 (Server Component) — 디자인 ChatAgentUI 의 main 영역.
 *
 * FR-07: provider/model 표시값은 **서버 환경변수**에서만 유래한다.
 * 여기서 process.env 를 읽어 식별자만 props 로 주입한다(API 키 절대 미전달
 * — NEXT_PUBLIC_ 미사용, AC-8/NFR-4). 값 미설정 시 빈 문자열(HeaderControls
 * 가 "모델 미설정" 으로 명시 표시 — UC-5-E1, 무음 임의값 금지).
 */
export default function ChatPage(): ReactNode {
  const provider = (process.env.LLM_PROVIDER ?? "").trim();
  const model = (process.env.LLM_MODEL ?? "").trim();
  return <ChatPanel provider={provider} model={model} />;
}

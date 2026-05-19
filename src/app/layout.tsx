import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AICEO-4th AGENT",
  description: "LangGraph DeepAgents(JS) 하네스 + 스트리밍 챗 에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

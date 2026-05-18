import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // deepagents / @langchain 은 Node 네이티브 의존(child_process, sqlite 등)을
  // 가질 수 있어 server external 로 둔다. route 는 nodejs runtime 강제(R7).
  serverExternalPackages: [
    "deepagents",
    "@langchain/langgraph-checkpoint-sqlite",
  ],
};

export default nextConfig;

import { redirect } from "next/navigation";

// / → /chat 리다이렉트. /chat 페이지는 Slice 8 에서 (main) 그룹에 구현.
export default function Home() {
  redirect("/chat");
}

import { tool } from "langchain";
import { z } from "zod";

/**
 * 안전한 예시 도구 1개 (H4 커스텀 도구 슬롯).
 *
 * 외부 의존·과금 없음 — 현재 시각(KST)을 반환한다. 웹검색/코드실행 같은
 * 외부 의존 도구는 "슬롯만 마련, 등록은 후속"이며 등록 절차는 tools/index.ts
 * 주석 참조. "도구 1개 = 파일 1개" 원칙 (NFR-3).
 *
 * zod 는 deepagents 와 동일 메이저(^4) — 스키마 타입 호환 (R1/TC-10.6).
 */

/**
 * 사고 패널 한글 표시명 (medigate-new toolDisplayName 대응 — 우리는
 * 백엔드가 안 주므로 도구 파일이 직접 선언, FR-08 요소1개=파일1개).
 * thinkingLabels.toolDisplayName 이 도구명→이 라벨 매핑을 수집한다.
 */
export const currentTimeToolDisplayName = "현재 시각";

export const currentTimeTool = tool(
  async ({ timezone }: { timezone?: string }): Promise<string> => {
    const tz = timezone?.trim() || "Asia/Seoul";
    const now = new Intl.DateTimeFormat("ko-KR", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    }).format(new Date());
    return `${now} (${tz})`;
  },
  {
    name: "current_time",
    description:
      "현재 날짜와 시각을 반환한다. timezone 미지정 시 Asia/Seoul(KST).",
    schema: z.object({
      timezone: z
        .string()
        .optional()
        .describe("IANA 타임존 (예: 'Asia/Seoul', 'UTC'). 미지정 시 KST."),
    }),
  },
);

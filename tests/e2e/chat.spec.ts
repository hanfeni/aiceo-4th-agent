import { test, expect, type Page } from "@playwright/test";

/**
 * Slice 9 E2E — UC-1/UC-3 해피패스 + thinking 누출 e2e probe.
 *
 * 실 LLM(gpt-5.4-mini, OpenAI — 과금·비결정). requirements.md
 * [E2E 테스트 작성 규칙] 엄수:
 *  - "정확히 N 줄"/"특정 단어 포함" 어설션 금지.
 *  - /api/chat: 200 + text/event-stream.
 *  - 어시스턴트 버블 ≤15s visible, innerText ≤60s non-empty.
 *  - 새 대화 → 메시지 0개 + conversationId 변경(메시지 비움이 사용자
 *    가시 프록시 — conversationId 는 DOM 비노출이므로 store 로 확인).
 *  - retries:1(playwright.config) 가 rate-limit/cold-start flake 흡수.
 *
 * 매핑: TC-1.1(UC-1), TC-1.2(UC-1-A 버튼 트리거), TC-1.11(UC-1-EC3 cold),
 *       TC-3.1(UC-3 새 대화), TC-18.1(UC-18 추론 입력 — thinking 누출 e2e).
 *
 * 셀렉터 주의(실측): `text=에이전트` substring 매칭은 사이드바
 * "에이전트 워크스페이스"·입력 푸트노트 "에이전트 응답은..." 까지 잡아
 * 거짓 양성이다. AssistantBubble 라벨 span 만 정확히 "에이전트" 텍스트를
 * 가지므로 `getByText("에이전트", { exact:true })` 로 한정한다(src 수정 0).
 */

const TEXTAREA = '[aria-label="메시지 입력"]';
const SEND_BTN = '[aria-label="전송"]';
const NEW_CHAT_BTN = '[aria-label="새 대화"]';

// 어시스턴트 버블: MessageList.AssistantBubble 의 라벨 span("에이전트").
// exact:true 로 사이드바/푸트노트의 더 긴 "에이전트…" 문자열을 배제한다.
function assistantLabels(page: Page) {
  return page.getByText("에이전트", { exact: true });
}

/** 최신 어시스턴트 메시지의 렌더 텍스트가 비어있지 않을 때까지 대기(≤60s). */
async function waitAssistantNonEmpty(page: Page): Promise<string> {
  const handle = await page.waitForFunction(
    () => {
      // AssistantBubble DOM(MessageList.tsx):
      //   span("에이전트") .parentElement = 라벨행 div
      //   .parentElement = flex:1 본문 래퍼(라벨행 + ChatMarkdown + 액션)
      // 라벨 span 은 textContent 가 정확히 "에이전트" 인 것만(트림 비교)
      // — 사이드바/푸트노트의 더 긴 문자열을 배제한다.
      const labels = Array.from(
        document.querySelectorAll("span"),
      ).filter((s) => s.textContent?.trim() === "에이전트");
      if (labels.length === 0) return false;
      const lastLabel = labels[labels.length - 1];
      const wrapper = lastLabel.parentElement?.parentElement;
      const text = wrapper?.textContent?.replace("에이전트", "").trim() ?? "";
      return text.length > 0 ? text : false;
    },
    { timeout: 60_000, polling: 500 },
  );
  return (await handle.jsonValue()) as string;
}

test.describe("UC-1/UC-3 — 채팅 해피패스 (실 LLM)", () => {
  test("TC-1.1 — /chat 진입 → 입력 → Enter 전송 → SSE 200 + 버블 가시 + 응답 non-empty", async ({
    page,
  }) => {
    // /api/chat 응답 계약 검증(200 + text/event-stream). 비결정 — 본문 미검증.
    const apiResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
      { timeout: 30_000 },
    );

    await page.goto("/chat"); // / → /chat 리다이렉트도 통과
    await expect(page.locator(TEXTAREA)).toBeVisible();

    await page.locator(TEXTAREA).fill("안녕하세요");
    await page.locator(TEXTAREA).press("Enter");

    const res = await apiResponsePromise;
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toContain("text/event-stream");

    // user 버블 + 어시스턴트 버블 생성 — "에이전트" 라벨 ≤15s visible.
    await expect(assistantLabels(page).last()).toBeVisible({ timeout: 15_000 });

    // 어시스턴트 본문 ≤60s non-empty(커서만 보이는 구간 허용).
    const answer = await waitAssistantNonEmpty(page);
    expect(answer.length).toBeGreaterThan(0);

    // 전송 종료 후 입력 잠금 해제(재입력 가능 — disabled 해제).
    await expect(page.locator(TEXTAREA)).toBeEnabled({ timeout: 60_000 });

    // 메시지 카운트가 사용자에게 보임("· N개 메시지", N≥2: user+assistant).
    await expect(
      page.locator("text=/· [2-9][0-9]* *개 메시지/"),
    ).toBeVisible();
  });

  test("TC-1.2 — Send 버튼 클릭 트리거 (UC-1-A)", async ({ page }) => {
    const apiResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
      { timeout: 30_000 },
    );

    await page.goto("/chat");
    await page.locator(TEXTAREA).fill("간단히 자기소개 해줘");
    await page.locator(SEND_BTN).click();

    const res = await apiResponsePromise;
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toContain("text/event-stream");

    await expect(assistantLabels(page).last()).toBeVisible({ timeout: 15_000 });
    const answer = await waitAssistantNonEmpty(page);
    expect(answer.length).toBeGreaterThan(0);
  });

  test("TC-3.1 — 새 대화 버튼 → 메시지 0개 (conversationId 변경 사용자 프록시)", async ({
    page,
  }) => {
    await page.goto("/chat");

    // 1턴 전송 후 응답 수신(메시지가 쌓인 상태를 만든다).
    await page.locator(TEXTAREA).fill("좋아하는 색을 하나 추천해줘");
    await page.locator(TEXTAREA).press("Enter");
    await expect(assistantLabels(page).last()).toBeVisible({ timeout: 15_000 });
    await waitAssistantNonEmpty(page);
    await expect(page.locator(TEXTAREA)).toBeEnabled({ timeout: 60_000 });

    // 메시지가 존재함을 확인(N≥2) + 어시스턴트 버블 1개 이상.
    await expect(
      page.locator("text=/· [2-9][0-9]* *개 메시지/"),
    ).toBeVisible();
    expect(await assistantLabels(page).count()).toBeGreaterThanOrEqual(1);

    // 새 대화 클릭 → resetChat(): messages 0 + 새 conversationId.
    await page.locator(NEW_CHAT_BTN).click();

    // 사용자 가시 프록시: 메시지 0개 → EmptyState 노출 + "· 0개 메시지".
    await expect(page.locator("text=/· 0 *개 메시지/")).toBeVisible({
      timeout: 5_000,
    });
    // EmptyState heading(messages.length===0 일 때만 렌더).
    await expect(
      page.getByText("무엇을 도와드릴까요?", { exact: false }).first(),
    ).toBeVisible();
    // 어시스턴트 버블 라벨이 0개로 사라짐 — 메시지 클리어(=새 thread_id)의
    // 사용자 가시 증거. exact 매칭이라 사이드바/푸트노트는 카운트에서 제외.
    await expect(assistantLabels(page)).toHaveCount(0);
  });

  test("TC-18.1 — 추론 유발 입력: 응답 non-empty + thinking 누출 휴리스틱(UC-18)", async ({
    page,
  }) => {
    const apiResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
      { timeout: 30_000 },
    );

    await page.goto("/chat");
    // requirements.md 함정 4 재현 입력(추론 필요 — reasoning 토큰 유발).
    await page
      .locator(TEXTAREA)
      .fill("17 곱하기 24 더하기 89 만 숫자로 답해");
    await page.locator(TEXTAREA).press("Enter");

    const res = await apiResponsePromise;
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] ?? "").toContain("text/event-stream");

    // hard assertion: 버블 ≤15s visible + 본문 ≤60s non-empty.
    await expect(assistantLabels(page).last()).toBeVisible({ timeout: 15_000 });
    const answer = await waitAssistantNonEmpty(page);
    expect(answer.length).toBeGreaterThan(0);

    // soft 비결정 휴리스틱(thinking 누출). hard 어설션 아님 — 트립 시
    // manual-review 경고만(TC-18.2 수동 게이트로 정밀 검증, chunkFilter
    // 단위 TC-18.7~18.13 이 본 검증). 화면 본문이 명백한 사고 전개
    // 마커로 "시작"하면 누출 의심.
    const head = answer.replace(/\s+/g, " ").trim().slice(0, 40).toLowerCase();
    const leakMarkers = [
      "let me think",
      "let's think",
      "let me ",
      "first, ",
      "먼저 ",
      "단계 ",
      "단계적으로",
      "단계 1",
      "step 1",
      "i need to",
      "reasoning:",
      "thinking:",
    ];
    const tripped = leakMarkers.some((m) => head.startsWith(m));
    if (tripped) {
      // eslint-disable-next-line no-console
      console.warn(
        `[MANUAL-REVIEW] thinking-leak 휴리스틱 트립: 화면 본문 선두 "${head}" — ` +
          `TC-18.2 수동 게이트(/tmp/debug.jsonl)로 정밀 확인 필요. ` +
          `hard 어설션(non-empty+visible)은 통과.`,
      );
    }
  });
});

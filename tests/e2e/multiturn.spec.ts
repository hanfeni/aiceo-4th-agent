import { test, expect, type Page } from "@playwright/test";

/**
 * Slice 9 E2E — TC-22 "연속 2회 이상" stateful 멀티턴 (실 LLM).
 *
 * requirements.md [검증 철학]: "한 번 성공은 보장이 아니다." 모든 stateful
 * 경로(멀티턴 + 체크포인터)는 "연속 2회 이상", "여러 유형의 입력"으로 검증.
 * → 같은 대화에서 2턴 흐름을 최소 2회 독립 실행, 서로 다른 입력 유형
 *   (일반 인사 / 추론 유발)을 섞는다.
 *
 * 비결정 규칙 엄수: 2턴 응답이 1턴 내용을 "리터럴로 echo" 하는지 어설션
 * 하지 않는다(비결정). hard 어설션은 "≤60s non-empty + conversationId 불변
 * (메시지 누적이 사용자 가시 프록시)". 맥락 echo 부재는 soft console.warn.
 *
 * 매핑: TC-2.1(UC-2 직전 발화 참조), TC-2.3(UC-2-A 추론 2턴),
 *       TC-22.1(UC-22 연속 2회 — 입력 유형 혼합).
 */

const TEXTAREA = '[aria-label="메시지 입력"]';

async function waitAssistantCountAtLeast(
  page: Page,
  minAssistant: number,
): Promise<void> {
  // "에이전트" 라벨 개수 = 어시스턴트 버블 개수. minAssistant 도달까지 대기.
  await page.waitForFunction(
    (n) => {
      const labels = Array.from(document.querySelectorAll("span")).filter(
        (s) => s.textContent?.trim() === "에이전트",
      );
      return labels.length >= n;
    },
    minAssistant,
    { timeout: 15_000 },
  );
}

/** index 번째(0-base) 어시스턴트 버블의 본문이 non-empty 일 때까지 ≤60s. */
async function waitAssistantNonEmptyAt(
  page: Page,
  index: number,
): Promise<string> {
  const handle = await page.waitForFunction(
    (idx) => {
      const labels = Array.from(document.querySelectorAll("span")).filter(
        (s) => s.textContent?.trim() === "에이전트",
      );
      if (labels.length <= idx) return false;
      const label = labels[idx];
      // span("에이전트").parentElement = 라벨행, .parentElement = 본문 래퍼.
      const wrapper = label.parentElement?.parentElement;
      const text = wrapper?.textContent?.replace("에이전트", "").trim() ?? "";
      return text.length > 0 ? text : false;
    },
    index,
    { timeout: 60_000, polling: 500 },
  );
  return (await handle.jsonValue()) as string;
}

/** 한 턴 전송 후 해당 어시스턴트 버블 non-empty 까지 대기. */
async function sendTurn(
  page: Page,
  text: string,
  assistantIndex: number,
): Promise<string> {
  await expect(page.locator(TEXTAREA)).toBeEnabled({ timeout: 60_000 });
  await page.locator(TEXTAREA).fill(text);
  await page.locator(TEXTAREA).press("Enter");
  await waitAssistantCountAtLeast(page, assistantIndex + 1);
  const answer = await waitAssistantNonEmptyAt(page, assistantIndex);
  await expect(page.locator(TEXTAREA)).toBeEnabled({ timeout: 60_000 });
  return answer;
}

test.describe("TC-22 — 연속 2회 이상 stateful 멀티턴 (실 LLM)", () => {
  test("RUN 1 — 일반 입력 2턴: 이름 기억 스모크 (TC-2.1/UC-2)", async ({
    page,
  }) => {
    await page.goto("/chat");

    // 같은 대화(같은 conversationId — 새 대화 미클릭) 안에서 2턴.
    const t1 = await sendTurn(page, "내 이름은 테스트야. 기억해줘.", 0);
    expect(t1.length).toBeGreaterThan(0);

    const t2 = await sendTurn(page, "내 이름이 뭐라고 했지?", 1);
    // hard: 2턴 응답 non-empty (멀티턴 checkpointer smoke).
    expect(t2.length).toBeGreaterThan(0);

    // soft 비결정: "테스트"를 리터럴 echo 하는지는 어설션하지 않는다.
    if (!t2.includes("테스트")) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SOFT] RUN1 2턴 응답에 "테스트" 미포함 — 비결정 허용(맥락 기억은 ` +
          `non-empty 로만 hard 검증). 본문 선두: "${t2.slice(0, 60)}"`,
      );
    }

    // conversationId 불변의 사용자 가시 프록시: 메시지가 누적(4개=2턴).
    // 새 대화를 누르지 않았으므로 누적되어야 한다(reset 시 0으로 떨어짐).
    await expect(
      page.locator("text=/· [4-9][0-9]* *개 메시지/"),
    ).toBeVisible();
  });

  test("RUN 2 — 다른 입력 유형(추론) 2턴: 후속 참조 스모크 (TC-2.3/UC-2-A)", async ({
    page,
  }) => {
    await page.goto("/chat");

    // 1턴: 추론 유발 입력. 2턴: 그 결과를 참조하는 후속 — 입력 유형이
    // RUN1(일반 인사)과 다름("여러 유형의 입력" 검증 철학 충족).
    const t1 = await sendTurn(
      page,
      "17 곱하기 24 더하기 89 를 계산해서 숫자만 알려줘.",
      0,
    );
    expect(t1.length).toBeGreaterThan(0);

    const t2 = await sendTurn(
      page,
      "방금 그 숫자에 다시 10을 더하면 얼마야?",
      1,
    );
    // hard: 2턴 응답 non-empty + 같은 conversationId(누적).
    expect(t2.length).toBeGreaterThan(0);

    // soft 비결정: 후속 참조가 직전 결과를 반영하는지는 어설션 불가.
    // eslint-disable-next-line no-console
    console.warn(
      `[SOFT] RUN2 추론 후속 2턴 통과(non-empty). 맥락 참조 정밀 검증은 ` +
        `비결정이라 hard 어설션 제외 — t2 선두: "${t2.slice(0, 60)}"`,
    );

    await expect(
      page.locator("text=/· [4-9][0-9]* *개 메시지/"),
    ).toBeVisible();
  });

  test("RUN 3 — 인사→추론 혼합 3턴 1대화 (TC-22.1 입력 유형 혼합 강화)", async ({
    page,
  }) => {
    // TC-22.2(manual-gate): "짧은 인사만 반복" 거부 — 추론 입력 ≥1 포함.
    // 본 RUN 은 인사 → 추론 → 후속 3턴을 한 대화에서 연속(누적 검증).
    await page.goto("/chat");

    const t1 = await sendTurn(page, "안녕! 오늘 기분 어때?", 0);
    expect(t1.length).toBeGreaterThan(0);

    const t2 = await sendTurn(
      page,
      "9 더하기 9 곱하기 9 를 계산해서 숫자만 답해줘.",
      1,
    );
    expect(t2.length).toBeGreaterThan(0);

    const t3 = await sendTurn(page, "방금 답을 한국어 문장으로 풀어서 말해줘.", 2);
    expect(t3.length).toBeGreaterThan(0);

    // 3턴 = 메시지 6개 누적, conversationId 불변(새 대화 미클릭).
    await expect(
      page.locator("text=/· [6-9][0-9]* *개 메시지/"),
    ).toBeVisible();
  });
});

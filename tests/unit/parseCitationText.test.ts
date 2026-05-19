import { describe, it, expect } from "vitest";
import { parseCitationText } from "@/lib/agent/utils/chunkFilter";

// parseCitationText 단위 테스트 — extractWebSearchCitations 의 거울 함수.
// extractWebSearchCitations 가 만든 "참고 출처 N건:\n• 제목 (url)" 텍스트를
// 다시 {title,url}[] 로 복원한다(References 패널 데이터원). LLM 무관 순수.
// agent.ts/chunkFilter 기존 코드 무변경 — 신규 export 만 추가(충돌 0).

describe("parseCitationText — 출처 텍스트 → WebSource[]", () => {
  it("'참고 출처 N건:\\n• 제목 (url)' → {title,url}[]", () => {
    const text =
      "참고 출처 2건:\n" +
      "• National Affairs: Korea.net (https://www.korea.net/Government/Current-Affairs)\n" +
      "• Example News (https://example.com/news)";
    expect(parseCitationText(text)).toEqual([
      {
        title: "National Affairs: Korea.net",
        url: "https://www.korea.net/Government/Current-Affairs",
      },
      { title: "Example News", url: "https://example.com/news" },
    ]);
  });

  it("제목 없는 줄 '• url' → title=url(폴백), url=url", () => {
    const text = "참고 출처 1건:\n• https://no-title.example";
    expect(parseCitationText(text)).toEqual([
      { title: "https://no-title.example", url: "https://no-title.example" },
    ]);
  });

  it("제목에 괄호가 들어가도 마지막 (url) 만 url 로 분리", () => {
    const text =
      "참고 출처 1건:\n• 보고서 (2026) 분석 (https://ex.com/a?b=1&c=2)";
    expect(parseCitationText(text)).toEqual([
      { title: "보고서 (2026) 분석", url: "https://ex.com/a?b=1&c=2" },
    ]);
  });

  it("extractWebSearchCitations 실측 출력(단일 출처) 왕복 복원", () => {
    // ws-cite-probe 실측: "참고 출처 1건:\n• 대한민국 청와대 (https://www.president.go.kr/index.do?utm_source=openai)"
    const text =
      "참고 출처 1건:\n• 대한민국 청와대 (https://www.president.go.kr/index.do?utm_source=openai)";
    expect(parseCitationText(text)).toEqual([
      {
        title: "대한민국 청와대",
        url: "https://www.president.go.kr/index.do?utm_source=openai",
      },
    ]);
  });

  it("헤더 줄이 없어도 • 항목만으로 파싱(견고성)", () => {
    expect(parseCitationText("• Foo (https://foo.example)")).toEqual([
      { title: "Foo", url: "https://foo.example" },
    ]);
  });

  it("출처 텍스트가 아니면 null (사고패널 일반 result 와 구분)", () => {
    expect(parseCitationText("completed")).toBeNull();
    expect(parseCitationText("검색 완료")).toBeNull();
    expect(parseCitationText("")).toBeNull();
    expect(parseCitationText("• 불릿이지만 url 없음")).toBeNull();
  });

  it("undefined/비문자열 안전(크래시 없이 null)", () => {
    expect(parseCitationText(undefined as unknown as string)).toBeNull();
    expect(parseCitationText(null as unknown as string)).toBeNull();
  });

  it("http/https 만 url 로 인정(javascript: 등 스킴 방어)", () => {
    const text = "참고 출처 1건:\n• 악성 (javascript:alert(1))";
    expect(parseCitationText(text)).toBeNull();
  });
});

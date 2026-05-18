import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { ChatMarkdown } from "@/components/common/ChatMarkdown";

// ChatMarkdown 단위 테스트 (LLM 비의존, jsdom + @testing-library/react).
// 매핑: TC-4.1~4.10, TC-26.3 / UC-4(+A/B/E1/E2/EC1/EC2/EC3)
//        FR-05 / AC-6 / NFR-5 / AD-5(d)
// 핵심 보안 불변식: rehypePlugins = [rehypeRaw, rehypeSanitize] (raw 먼저,
// sanitize 가 raw 뒤). sanitize 가 raw 파싱 결과를 받아 <script>/on* 를 제거.
// 스트리밍 부분 마크다운 재렌더에서도 sanitize 우회 경로 없음.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom 에는 navigator.clipboard 가 없으므로 매 테스트 모킹.
let writeTextSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeTextSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextSpy },
    configurable: true,
    writable: true,
  });
});

describe("ChatMarkdown — GFM 렌더 (TC-4.1)", () => {
  it("TC-4.1: heading / bold / 목록 등 기본 마크다운을 DOM 으로 렌더", () => {
    const md = [
      "# 제목",
      "",
      "본문 **굵게** 텍스트",
      "",
      "- 항목 A",
      "- 항목 B",
    ].join("\n");
    const { container } = render(<ChatMarkdown content={md} />);

    expect(screen.getByRole("heading", { level: 1, name: "제목" })).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("굵게");
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("항목 A");
  });

  it("TC-4.1: 펜스 코드 블록에 언어 라벨 + 복사 버튼이 존재", () => {
    const md = ["```ts", "const a = 1;", "```"].join("\n");
    const { container } = render(<ChatMarkdown content={md} />);

    // 언어 라벨
    expect(screen.getByText("ts")).toBeTruthy();
    // 복사 버튼
    expect(screen.getByRole("button", { name: /복사|copy/i })).toBeTruthy();
    // 코드 자체 렌더
    expect(container.querySelector("code")?.textContent).toContain("const a = 1;");
  });

  it("TC-4.1: GFM 표가 table DOM 으로 렌더된다 (remark-gfm)", () => {
    const md = [
      "| 헤더1 | 헤더2 |",
      "| --- | --- |",
      "| 값A | 값B |",
    ].join("\n");
    const { container } = render(<ChatMarkdown content={md} />);

    const table = container.querySelector("table");
    expect(table).toBeTruthy();
    expect(within(table as HTMLElement).getByText("헤더1")).toBeTruthy();
    expect(within(table as HTMLElement).getByText("값B")).toBeTruthy();
  });
});

describe("ChatMarkdown — 코드 복사 (TC-4.2 / TC-4.4 / TC-4.7)", () => {
  it("TC-4.2: 복사 클릭 시 clipboard.writeText 가 코드 전체 문자열로 호출", () => {
    const code = 'function greet() {\n  return "안녕하세요";\n}';
    const md = ["```js", code, "```"].join("\n");
    render(<ChatMarkdown content={md} />);

    fireEvent.click(screen.getByRole("button", { name: /복사|copy/i }));

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    // 줄바꿈 포함 전체 코드 (절단 없음). react-markdown 은 끝에 개행을
    // 붙일 수 있으므로 trim 후 비교한다.
    expect((writeTextSpy.mock.calls[0][0] as string).trim()).toBe(code);
  });

  it("TC-4.4: 언어 미지정 코드펜스도 복사 버튼 동작", () => {
    const code = "plain code line";
    const md = ["```", code, "```"].join("\n");
    render(<ChatMarkdown content={md} />);

    fireEvent.click(screen.getByRole("button", { name: /복사|copy/i }));

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    expect((writeTextSpy.mock.calls[0][0] as string)).toContain(code);
  });

  it("TC-4.7 (UC-4-EC1): 매우 큰 코드 블록도 절단 없이 전체 복사", () => {
    const lines = Array.from({ length: 800 }, (_, i) => `line ${i} :: payload-${i}`);
    const bigCode = lines.join("\n");
    const md = ["```python", bigCode, "```"].join("\n");
    render(<ChatMarkdown content={md} />);

    fireEvent.click(screen.getByRole("button", { name: /복사|copy/i }));

    const copied = writeTextSpy.mock.calls[0][0] as string;
    expect(copied).toContain("line 0 :: payload-0");
    expect(copied).toContain("line 799 :: payload-799");
    // 길이 보존 (절단 회귀 가드)
    expect(copied.trim().split("\n").length).toBe(800);
  });
});

describe("ChatMarkdown — XSS sanitize (TC-4.5 / TC-4.10 / TC-26.3, NFR-5/AD-5d)", () => {
  it("TC-4.5: `<script>` 주입 시 렌더 DOM 에 script 요소 0개", () => {
    const md = '안전한 텍스트\n\n<script>alert(1)</script>\n\n계속';
    const { container } = render(<ChatMarkdown content={md} />);

    expect(container.querySelectorAll("script").length).toBe(0);
    // 일반 텍스트는 살아있음
    expect(container.textContent).toContain("안전한 텍스트");
  });

  it("TC-4.5: `<img src=x onerror=...>` 의 onerror 핸들러가 제거된다", () => {
    const md = '<img src="x" onerror="alert(1)" alt="broken">';
    const { container } = render(<ChatMarkdown content={md} />);

    const img = container.querySelector("img");
    // img 자체는 sanitize 화이트리스트상 허용될 수 있으나 on* 는 반드시 제거
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull();
      expect(img.hasAttribute("onerror")).toBe(false);
    }
    // 어떤 요소에도 on* 이벤트 핸들러 속성이 없어야 함
    const all = container.querySelectorAll("*");
    for (const el of Array.from(all)) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith("on")).toBe(false);
      }
    }
  });

  it("TC-4.10/TC-26.3: sanitize 가 raw 뒤에 실행됨을 동작으로 증명 — 동일 입력에서 <b> 는 살고 <script> 는 제거", () => {
    // rehype-raw 가 원시 HTML 을 파싱하므로 <b> 가 진짜 bold 요소로 렌더되고,
    // 그 뒤 rehype-sanitize 가 같은 입력의 <script> 를 제거한다.
    // raw 가 sanitize 보다 먼저가 아니면 <b> 가 텍스트로 남아 이 단언이 깨진다.
    const md = '<b>강조됨</b><script>alert("xss")</script>';
    const { container } = render(<ChatMarkdown content={md} />);

    const bold = container.querySelector("b");
    expect(bold).toBeTruthy(); // raw 가 먼저 실행되어 실제 <b> 노드 생성
    expect(bold?.textContent).toBe("강조됨");
    expect(container.querySelectorAll("script").length).toBe(0); // sanitize 가 뒤에서 제거
  });

  it("TC-26.3: ChatMarkdown 이 안전한 rehype 순서를 노출한다 (rehypeRaw index < rehypeSanitize index)", () => {
    // 컴포넌트가 검증용으로 노출하는 플러그인 순서 메타.
    const order = ChatMarkdown.rehypePluginOrder;
    expect(Array.isArray(order)).toBe(true);
    const rawIdx = order.indexOf("rehype-raw");
    const sanitizeIdx = order.indexOf("rehype-sanitize");
    expect(rawIdx).toBeGreaterThanOrEqual(0);
    expect(sanitizeIdx).toBeGreaterThanOrEqual(0);
    expect(rawIdx).toBeLessThan(sanitizeIdx); // raw 가 sanitize 보다 먼저
  });
});

describe("ChatMarkdown — 스트리밍/엣지 (TC-4.3 / TC-4.6 / TC-4.8 / TC-4.9)", () => {
  it("TC-4.3 (UC-4-A): 미완성 코드펜스 부분 마크다운도 throw 없이 렌더되고, 재렌더 시 sanitize 우회 불가", () => {
    // 스트리밍 중간: 닫히지 않은 펜스 + 그 안에 script 가 섞여 들어온 경우.
    const partial = '```js\nconst x = 1;\n<script>alert(1)</script>';
    const { container, rerender } = render(<ChatMarkdown content={partial} />);
    // 크래시 없이 렌더
    expect(container).toBeTruthy();
    // 부분 재렌더에서도 script 실행 노드 없음
    expect(container.querySelectorAll("script").length).toBe(0);

    // 토큰이 더 도착해 펜스가 닫힘 → 재렌더, 여전히 sanitize 통과
    const completed = partial + "\n```\n\n완료";
    rerender(<ChatMarkdown content={completed} />);
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(container.textContent).toContain("완료");
  });

  it("TC-4.6 (UC-4-E2): 닫히지 않은 펜스 / 깨진 표 입력에 throw 하지 않는다", () => {
    const broken = "| 깨진 | 표\n| -- \n``` 안닫힌 펜스\nsome code";
    expect(() => render(<ChatMarkdown content={broken} />)).not.toThrow();
  });

  it("TC-4.8 (UC-4-EC2): 마크다운 특수문자만 있어도 크래시 없이 렌더", () => {
    expect(() => render(<ChatMarkdown content={"*** ` ` ``` ~~~ ___ ###"} />)).not.toThrow();
  });

  it("TC-4.9 (UC-4-EC3): 빈/공백 content 는 무해하게 렌더 (script 0, throw 0)", () => {
    const { container: c1 } = render(<ChatMarkdown content="" />);
    expect(c1.querySelectorAll("script").length).toBe(0);
    cleanup();
    const { container: c2 } = render(<ChatMarkdown content="   \n  " />);
    expect(c2.querySelectorAll("script").length).toBe(0);
  });
});

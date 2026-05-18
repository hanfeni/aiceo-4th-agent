import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// route.ts 통합 테스트 — @/lib/agent/agent.createStream 모킹(LLM 0, 과금 0).
// POST handler 를 new Request 로 직접 호출(integration).
//
// 매핑:
//   TC-1.4  기존 conversationId 그대로 thread 이벤트 echo
//   TC-1.5  conversationId 미포함 → randomUUID 발급 + thread→token→done 순서
//   TC-1.6  createStream mid-stream throw → SSE {type:'error'} + 스트림 종료
//   TC-16.1 {query:123}/{}/누락 → 400 + application/json {error} (SSE 아님)
//   TC-16.2 conversationId 잘못된 타입 → 400 + {error}
//   TC-16.4 비-JSON body → 400 + {error}
//   TC-23.3 {query:""} → route 경계 400 거부
//   TC-23.4 {query:"  \n\t  "}(공백만) → trim 후 빈값 400 거부
//   TC-26.4 SSE 인젝션: token text 에 "\n\ndata: evil"/"event: x" 포함 →
//           wire 에 standalone `data: evil` 프레임 주입 안 됨(JSON 이스케이프)
//   TC-14.1 consumer cancel → createStream 제너레이터 .return()/정리 실행,
//           추가 pull 없음(좀비 스트림 0, AD-5a)
//   TC-26.9 route.ts 최상단 runtime="nodejs" + dynamic="force-dynamic"
//   TC-26.10 route.ts 본문 E2E_MOCK/MOCK_MODE 분기 0(Mock 경로 금지)

// --- agent.createStream 모킹 (실 그래프/LLM 없음) ---
const { createStreamSpy } = vi.hoisted(() => ({
  createStreamSpy: vi.fn(),
}));

vi.mock("@/lib/agent/agent", () => ({
  createStream: (...args: unknown[]) => createStreamSpy(...args),
}));

import { POST } from "@/app/api/chat/route";

/** 토큰 2개를 yield 하고 정상 종료하는 async generator. */
async function* twoTokenGen(): AsyncGenerator<{ type: string; text: string }> {
  yield { type: "token", text: "안" };
  yield { type: "token", text: "녕" };
}

/** ReadableStream<Uint8Array> 를 끝까지 읽어 문자열로 디코드. */
async function drainBody(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/** SSE wire 문자열에서 각 `data: <json>` 라인을 파싱해 이벤트 배열로. */
function parseSseEvents(wire: string): Array<Record<string, unknown>> {
  return wire
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice("data: ".length)) as Record<string, unknown>);
}

function postReq(body: unknown, opts?: { raw?: string; contentType?: string }): Request {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "content-type": opts?.contentType ?? "application/json" },
    body: opts?.raw !== undefined ? opts.raw : JSON.stringify(body),
  });
}

describe("POST /api/chat — SSE + Zod(AD-4) + cancel(AD-5a)", () => {
  beforeEach(() => {
    createStreamSpy.mockReset();
  });

  // --- TC-1.4: 기존 conversationId echo, randomUUID 미발급 ---
  it("TC-1.4: 기존 conversationId 포함 → 첫 이벤트 {type:'thread',conversationId} 동일 + thread_id 전달", async () => {
    createStreamSpy.mockResolvedValue(twoTokenGen());
    const res = await POST(postReq({ query: "안녕", conversationId: "conv-42" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSseEvents(await drainBody(res));
    expect(events[0]).toEqual({ type: "thread", conversationId: "conv-42" });

    // createStream 에 동일 conversationId 가 전달됨(thread_id 일관).
    expect(createStreamSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: "안녕", conversationId: "conv-42" }),
    );
  });

  // --- TC-1.5: conversationId 미포함 → randomUUID + thread→token→done 순서 ---
  it("TC-1.5: conversationId 미포함 → UUID v4 발급, 이벤트 순서 thread→token(반복)→done", async () => {
    createStreamSpy.mockResolvedValue(twoTokenGen());
    const res = await POST(postReq({ query: "안녕" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSseEvents(await drainBody(res));
    expect(events[0]?.type).toBe("thread");
    const cid = events[0]?.conversationId as string;
    // crypto.randomUUID() v4 형식.
    expect(cid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("thread");
    expect(types[types.length - 1]).toBe("done");
    expect(types.filter((t) => t === "token").length).toBe(2);
    // 발급된 conversationId 가 createStream 에도 그대로 전달.
    expect(createStreamSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: "안녕", conversationId: cid }),
    );
  });

  // --- TC-16.1: 잘못된 본문 타입 → 400 + application/json {error}, SSE 아님 ---
  it("TC-16.1: {query:123} → 400 + application/json {error} (SSE 미시작, createStream 미호출)", async () => {
    const res = await POST(postReq({ query: 123 }));

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-type")).not.toContain("text/event-stream");

    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  it("TC-16.1: {} (query 누락) → 400 + {error}", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  // --- TC-16.2: conversationId 잘못된 타입 → 400 ---
  it("TC-16.2: {query:'안녕', conversationId:123} → 400 + {error}", async () => {
    const res = await POST(postReq({ query: "안녕", conversationId: 123 }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  // --- TC-16.4: 비-JSON body → 400 + {error} ---
  it("TC-16.4: text/plain + 비-JSON body → 400 + {error} (스트림 미시작)", async () => {
    const res = await POST(
      postReq(null, { raw: "not a json {{", contentType: "text/plain" }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  it("TC-16.4: 빈 body → 400 + {error}", async () => {
    const res = await POST(postReq(null, { raw: "" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  // --- TC-23.3: 빈 query → route 경계 거부 ---
  it("TC-23.3: {query:''} → route 경계 400 거부(모델 위임 아님, LLM 0)", async () => {
    const res = await POST(postReq({ query: "" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  // --- TC-23.4: 공백만 query → trim 후 빈값 400 거부 ---
  it("TC-23.4: {query:'   \\n\\t  '}(공백만) → trim 후 빈값 400 거부", async () => {
    const res = await POST(postReq({ query: "   \n\t  " }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { error?: unknown };
    expect(typeof json.error).toBe("string");
    expect(createStreamSpy).not.toHaveBeenCalled();
  });

  // --- TC-1.6: createStream mid-stream throw → SSE error 이벤트 + 종료 ---
  // 보안(Gate 3 LOW): provider SDK 에러 원문에 키 일부·내부 경로 등 민감
  // 정보가 담길 수 있으므로 클라이언트엔 고정 일반화 문구만, 상세(원문+
  // stack)는 서버 로그(console.error)에만 남긴다.
  const GENERIC_ERROR_MESSAGE =
    "응답 생성 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

  it("TC-1.6: createStream 제너레이터 mid-stream throw → SSE {type:'error'} 고정 일반화 문구 + 스트림 종료(좀비 0)", async () => {
    async function* throwingGen(): AsyncGenerator<{ type: string; text: string }> {
      yield { type: "token", text: "안" };
      throw new Error("rate limit exceeded");
    }
    createStreamSpy.mockResolvedValue(throwingGen());

    const res = await POST(postReq({ query: "안녕", conversationId: "c1" }));
    expect(res.status).toBe(200);

    // unhandled rejection 없이 정상 종료(drain 이 끝나야 함).
    const events = parseSseEvents(await drainBody(res));
    const errEv = events.find((e) => e.type === "error");
    expect(errEv).toBeTruthy();
    // 클라이언트엔 provider 원문이 아니라 고정 일반화 문구만.
    expect(errEv?.message).toBe(GENERIC_ERROR_MESSAGE);
    // thread 가 먼저, error 가 마지막.
    expect(events[0]?.type).toBe("thread");
    expect(events[events.length - 1]?.type).toBe("error");
  });

  // --- TC-1.6 보안 회귀 가드: provider 원문이 SSE 와이어에 절대 안 실림 ---
  it("TC-1.6(보안): provider 에러 원문 문자열이 SSE wire 에 미포함 + console.error 로 서버측에만 상세 기록(Gate 3 LOW)", async () => {
    // 키 일부·내부 경로를 흉내낸 민감 토큰을 에러 메시지에 심는다.
    const SECRET = "sk-live-AKIA_INTERNAL_PATH_/var/secrets/openai.key";
    async function* throwingGen(): AsyncGenerator<{ type: string; text: string }> {
      yield { type: "token", text: "안" };
      throw new Error(`OpenAI 5xx upstream: ${SECRET}`);
    }
    createStreamSpy.mockResolvedValue(throwingGen());

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const res = await POST(postReq({ query: "안녕", conversationId: "c1" }));
      const wire = await drainBody(res);

      // (1) SSE wire(클라이언트로 나가는 바이트) 어디에도 원문/시크릿 미포함.
      expect(wire).not.toContain(SECRET);
      expect(wire).not.toContain("OpenAI 5xx upstream");
      // (2) error 이벤트 message 는 고정 일반화 문구뿐.
      const events = parseSseEvents(wire);
      const errEv = events.find((e) => e.type === "error");
      expect(errEv?.message).toBe(GENERIC_ERROR_MESSAGE);
      // (3) 상세는 서버 로그(console.error)에만 — 원본 Error 가 전달됨.
      expect(errorSpy).toHaveBeenCalledWith(
        "[/api/chat] stream error:",
        expect.any(Error),
      );
      const loggedErr = errorSpy.mock.calls
        .flat()
        .find((a): a is Error => a instanceof Error);
      expect(loggedErr?.message).toContain(SECRET);
    } finally {
      errorSpy.mockRestore();
    }
  });

  // --- TC-26.4: SSE 인젝션 차단(개행/data:/event: 경계 이스케이프) ---
  it("TC-26.4: token text 에 '\\n\\ndata: evil'/'event: x' 포함 → wire 에 주입 프레임 없음(JSON 이스케이프)", async () => {
    async function* evilGen(): AsyncGenerator<{ type: string; text: string }> {
      yield { type: "token", text: "ok\n\ndata: evil\nevent: x\ndata: more" };
    }
    createStreamSpy.mockResolvedValue(evilGen());

    const res = await POST(postReq({ query: "안녕", conversationId: "c1" }));
    const wire = await drainBody(res);

    // 각 SSE data 라인은 정확히 1개 JSON. raw 개행이 프레임을 깨지 않음:
    // payload 의 개행은 JSON \\n(백슬래시+n)으로 이스케이프되어 한 줄 안에 머문다.
    const dataLines = wire.split("\n").filter((l) => l.startsWith("data: "));
    // thread + token + done = 정확히 3개의 data 라인.
    // 주입이 성공하면 'data: evil' 프레임이 추가돼 4개 이상이 된다.
    expect(dataLines.length).toBe(3);
    // 주입된 standalone 프레임이 없어야 함(개행 뒤 raw data:/event: 0).
    expect(wire).not.toContain("\ndata: evil");
    expect(wire).not.toContain("\nevent: x");
    // payload 의 개행이 실제 개행이 아니라 이스케이프(\\n) 시퀀스로 존재.
    expect(wire).toContain("ok\\n\\ndata: evil\\nevent: x\\ndata: more");
    // 토큰 텍스트는 JSON 안에 안전하게 보존(파싱 가능).
    const events = parseSseEvents(wire);
    const tokenEv = events.find((e) => e.type === "token");
    expect(tokenEv?.text).toBe("ok\n\ndata: evil\nevent: x\ndata: more");
  });

  // --- TC-14.1: consumer cancel → 제너레이터 정리(.return) 실행, 추가 pull 0 ---
  it("TC-14.1: consumer cancel → createStream 제너레이터 .return()/정리 실행, 추가 pull 없음(AD-5a)", async () => {
    let pulls = 0;
    let cleanedUp = false;
    // 무한 yield 제너레이터: cancel 이 실제로 중단하지 않으면 무한 pull.
    async function* infiniteGen(): AsyncGenerator<{ type: string; text: string }> {
      try {
        for (;;) {
          pulls += 1;
          yield { type: "token", text: "x" };
        }
      } finally {
        cleanedUp = true;
      }
    }
    createStreamSpy.mockResolvedValue(infiniteGen());

    const res = await POST(postReq({ query: "안녕", conversationId: "c1" }));
    const reader = res.body!.getReader();
    // thread + 토큰 몇 개만 읽고 cancel.
    await reader.read();
    await reader.read();
    await reader.read();
    const pullsAtCancel = pulls;
    await reader.cancel();

    // 마이크로태스크 정리 대기.
    await new Promise((r) => setTimeout(r, 20));

    // cancel 후 제너레이터 정리(finally) 실행 + 추가 pull 사실상 멈춤.
    expect(cleanedUp).toBe(true);
    expect(pulls).toBeLessThanOrEqual(pullsAtCancel + 1);
  });

  // --- TC-26.9 / TC-26.10: 소스 헤더 + Mock 분기 0 (소스 정적 검사) ---
  it("TC-26.9/26.10: route.ts 최상단 runtime='nodejs'+dynamic='force-dynamic', E2E_MOCK/MOCK_MODE 분기 0", () => {
    // vitest cwd = 프로젝트 루트. import.meta.url 은 Vite 하에서 비-file
    // 스킴이라 사용 불가 → cwd 기준 절대경로로 소스 정적 검사.
    const routePath = resolve(process.cwd(), "src/app/api/chat/route.ts");
    const src = readFileSync(routePath, "utf8");

    // 첫 비공백 코드 라인 2개에 runtime/dynamic 선언.
    const codeLines = src
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));
    const headerSlice = codeLines.slice(0, 4).join("\n");
    expect(headerSlice).toMatch(/export\s+const\s+runtime\s*=\s*["']nodejs["']/);
    expect(headerSlice).toMatch(
      /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/,
    );

    // Mock 경로 금지(CLAUDE.md / NFR-11 / R2). 코드 "본문" 기준 —
    // 주석/문서 텍스트는 제거하고 실제 분기가 없음을 검사(plan: "route.ts 본문 grep").
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/E2E_MOCK/);
    expect(codeOnly).not.toMatch(/MOCK_MODE/);
  });
});

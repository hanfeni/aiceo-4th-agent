/**
 * web_search 참조 URL 통합 — 순수 함수(LLM/React 무관, NFR-11).
 *
 * 사용자 요구: "검색한 URL(병렬) 모두 출력 + 인용한 것만 별도
 * 라벨링". OpenAI built-in web_search 는 N번 검색 결과를 모델이
 * 내부 써머라이즈해 답변에 녹인다(RAW 스니펫/본문 미전송 —
 * ws-raw-dump-probe 실측 확정). 우리가 받는 건:
 *  - args.actions[]: 모델이 시도한 동작. open_page/find_in_page
 *    에만 URL 이 있다(search 는 검색어라 URL 아님).
 *  - result(citations): "참고 출처 N건:\n• 제목 (url)\n…" —
 *    답변에 **실제 인용**한 출처(보통 소수, 1건도 흔함).
 *
 * 이 함수는 시도한 URL 전부를 등장순으로 모으고, citation URL 과
 * 대조해 `cited` 플래그를 붙인다(URL 중복 제거, citation 에만
 * 있는 URL 도 포함). ThinkingPanel OUT 이 'cited=인용 / 그 외=
 * 참조' 로 구분 렌더한다. chunkFilter/ThinkingPanel(타 작업
 * 점유)을 건드리지 않는 신규 격리 모듈 — 충돌 0.
 */

export interface WebSearchRef {
  url: string;
  /** citation 에서 온 제목. 시도 URL 만이고 미인용이면 빈 문자열. */
  title: string;
  /** 답변에 실제 인용됐는가(url_citation 에 존재). */
  cited: boolean;
}

/** args(JSON `{actions:[...]}`)에서 open_page/find_in_page URL 수집. */
function urlsFromArgs(args: string | undefined): string[] {
  if (!args) return [];
  let actions: unknown;
  try {
    actions = (JSON.parse(args) as { actions?: unknown }).actions;
  } catch {
    return [];
  }
  if (!Array.isArray(actions)) return [];
  const out: string[] = [];
  for (const a of actions) {
    if (typeof a !== "object" || a === null) continue;
    const type = (a as { type?: unknown }).type;
    if (type !== "open_page" && type !== "find_in_page") continue;
    const url = (a as { url?: unknown }).url;
    if (typeof url === "string" && url.length > 0) out.push(url);
  }
  return out;
}

/**
 * citation 텍스트("참고 출처 N건:\n• 제목 (url)\n…")에서
 * {url,title} 추출. parseCitationText(chunkFilter)와 동형이나
 * 충돌 회피 위해 독립 구현(타 작업 점유 영역 미접촉).
 */
function citationsFromResult(
  result: string | undefined,
): { url: string; title: string }[] {
  if (!result || !result.startsWith("참고 출처")) return [];
  const out: { url: string; title: string }[] = [];
  // 각 항목: `• 제목 (http(s)://...)` 또는 `• http(s)://...`.
  const urlTail = /^•\s*(.*?)\s*\((https?:\/\/[^\s)]+)\)\s*$/;
  const urlOnly = /^•\s*(https?:\/\/\S+)\s*$/;
  for (const raw of result.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("•")) continue;
    const m = line.match(urlTail);
    if (m) {
      out.push({ title: m[1].trim(), url: m[2] });
      continue;
    }
    const m2 = line.match(urlOnly);
    if (m2) out.push({ title: "", url: m2[1] });
  }
  return out;
}

/**
 * 시도 URL + 인용 출처를 통합한 참조 목록을 만든다.
 * 순서: 시도 URL(args 등장순) → citation 전용 URL. URL 중복은
 * 1건(먼저 등장한 자리 유지), citation 에 있으면 cited=true +
 * title 채움.
 */
export function collectWebSearchRefs(
  args: string | undefined,
  result: string | undefined,
): WebSearchRef[] {
  const tried = urlsFromArgs(args);
  const cites = citationsFromResult(result);
  const citeByUrl = new Map(cites.map((c) => [c.url, c.title]));

  const refs: WebSearchRef[] = [];
  const seen = new Set<string>();

  // 1) 시도 URL 먼저(등장순). citation 에 있으면 cited+title.
  for (const url of tried) {
    if (seen.has(url)) continue;
    seen.add(url);
    const isCited = citeByUrl.has(url);
    refs.push({
      url,
      title: isCited ? (citeByUrl.get(url) ?? "") : "",
      cited: isCited,
    });
  }
  // 2) citation 에만 있는 URL(모델이 open_page 안 했지만 인용).
  for (const c of cites) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    refs.push({ url: c.url, title: c.title, cited: true });
  }
  return refs;
}

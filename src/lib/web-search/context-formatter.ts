import type {
  WebSearchRawResult,
  WebSearchStep,
  WebSearchCitation,
} from "./types";

/**
 * 웹검색 정제 순수함수 (Slice 1 — LLM/네트워크 0, 픽스처 단위테스트).
 *
 * OpenAI Responses API web_search 를 ClientTool 이 직호출하면 OpenAI 가
 * 내부에서 N번 검색(search/open_page/find_in_page)한다. 그 N개 스텝·
 * 최종 본문·출처를 메인 LLM 이 쓰기 좋은 "결과 1개 문자열"로 정제한다.
 * dart/context-formatter.ts 의 formatDartContext 동형 패턴.
 *
 * 정책 (Plan Critic 해소):
 *  - 항목6 투명성: 검색어/URL/pattern 은 정제 string 에 전량 — 절대 안 자름
 *  - 항목7 truncate: 메타데이터 truncate 금지, "최종 답변 본문"만 상한
 *  - 항목5 graceful: ok:false reason 별 안내 문자열 분리(empty≠미지원)
 */

/** 최종 답변 본문 상한 — 메타데이터는 무제한, 본문만 컨텍스트 폭발 방지. */
const ANSWER_MAX_CHARS = 8_000;

/** 순서 보존 중복 제거 (검색어/URL 노이즈만 제거, 정보 손실 0). */
function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}

/** 실패 reason → 안내 문자열 (dart NFR-18 graceful — detail 미노출). */
function failureMessage(
  reason: Exclude<WebSearchRawResult, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "no_api_key":
      return "웹 검색을 사용할 수 없습니다(API 키 미설정). 검색 없이 답변을 진행합니다.";
    case "model_unsupported":
      return "현재 모델이 웹 검색 도구를 미지원합니다. 검색 없이 답변을 진행합니다.";
    case "network":
      return "웹 검색 중 일시적 오류가 발생했습니다. 검색 결과 없이 진행합니다.";
    case "api_error":
      return "웹 검색 호출에 실패했습니다. 검색 결과 없이 진행합니다.";
    case "empty":
      return "검색 결과를 찾지 못했습니다.";
  }
}

/**
 * 스텝 간 중복 제거 (순서 보존, 정보 손실 0). OpenAI 가 같은 페이지를
 * 반복 열람/검색하면 노이즈이므로 동일 동작을 1회만 남긴다. 동일성 키:
 * search=검색어 집합, open_page=url, find_in_page=pattern@url, other=type.
 */
function dedupeSteps(steps: WebSearchStep[]): WebSearchStep[] {
  const seen = new Set<string>();
  const out: WebSearchStep[] = [];
  for (const s of steps) {
    const key =
      s.kind === "search"
        ? `s:${dedupePreserveOrder(s.queries).join("|")}`
        : s.kind === "open_page"
          ? `o:${s.url}`
          : s.kind === "find_in_page"
            ? `f:${s.pattern}@${s.url}`
            : `x:${s.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * 검색 스텝 1개 → 사람이 읽는 한 줄.
 * graceful: 미지 kind 는 type 만 노출(R8 — 하드코딩 0, 투명성).
 */
function describeStep(step: WebSearchStep): string {
  switch (step.kind) {
    case "search":
      return `검색: ${dedupePreserveOrder(step.queries).join(" / ")}`;
    case "open_page":
      return `페이지 열람: ${step.url}`;
    case "find_in_page":
      return `페이지 내 검색: "${step.pattern}" @ ${step.url}`;
    case "other":
      return `(기타 동작: ${step.type})`;
  }
}

/**
 * 정제 결과의 출처 섹션 텍스트. citations 중복 제거(url 기준),
 * 메타데이터라 truncate 금지(항목7). 없으면 빈 문자열.
 */
function formatCitations(citations: WebSearchCitation[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of citations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    lines.push(`  • ${c.title} — ${c.url}`);
  }
  if (lines.length === 0) return "";
  return `\n■ 참고 출처 (${lines.length}건)\n${lines.join("\n")}`;
}

/**
 * 메인 LLM 에 반환되는 최종 정제 문자열을 조립한다.
 *
 * 이 함수가 web_search 의 "최종 결과 1개" 형태를 결정한다 — 메인 LLM
 * 이 이 텍스트만 보고 추론하므로, 섹션 구성/순서/표현이 검색 결과
 * 활용도를 좌우하는 핵심 설계 결정이다. 위 헬퍼들(describeStep /
 * formatCitations / failureMessage / truncate 규칙)은 준비돼 있다.
 *
 * 요구 명세(테스트 = 정답지: webSearchContextFormatter.test.ts):
 *  - ok:false → failureMessage(raw.reason) 그대로 반환
 *  - ok:true  → 아래 3요소를 한 문자열로:
 *      (1) 수행한 검색 N스텝: steps.map(describeStep) 을 번호 매겨 나열
 *          (검색어/URL/pattern 전량 — truncate 절대 금지, 항목6)
 *      (2) 최종 답변 본문: raw.answer. 단 ANSWER_MAX_CHARS 초과 시에만
 *          잘라내고 "…(이하 생략)" 류 마커 부착 (본문만 상한, 항목7)
 *      (3) 출처: formatCitations(raw.citations) (메타데이터 — 무제한)
 *  - steps 0 이고 answer 비어도 크래시 0, 빈 문자열 반환 금지
 *    (테스트 "전부 빈 성공 응답" — empty 안내 등으로 graceful)
 *
 * @param raw client.ts 가 정규화한 결과
 * @returns 메인 LLM 에 전달할 정제 문자열 1개
 */
export function formatWebSearchContext(raw: WebSearchRawResult): string {
  if (!raw.ok) {
    return failureMessage(raw.reason);
  }

  // 빈 성공 응답(검색·본문 0) → empty 안내 재사용 (빈 문자열 반환 금지)
  if (raw.steps.length === 0 && raw.answer.trim() === "") {
    return failureMessage("empty");
  }

  const sections: string[] = ["[웹 검색 요약]"];

  // (1) 수행한 검색 N스텝 — 중복 동작 제거 후 번호 매겨 나열.
  //     검색어/URL/pattern 전량 보존(잘림 0 — 항목6), 노이즈만 제거.
  const steps = dedupeSteps(raw.steps);
  const stepLines = steps.map((s, i) => `  ${i + 1}) ${describeStep(s)}`);
  sections.push(
    `■ 수행한 검색 (${steps.length}회)\n${
      stepLines.length > 0 ? stepLines.join("\n") : "  (검색 없이 답변)"
    }`,
  );

  // (2) 최종 답변 본문 — 본문만 보수적 상한 truncate (항목7)
  const answer = raw.answer.trim();
  if (answer !== "") {
    const body =
      answer.length > ANSWER_MAX_CHARS
        ? `${answer.slice(0, ANSWER_MAX_CHARS)}\n…(이하 생략)`
        : answer;
    sections.push(`■ 검색 결과 본문\n${body}`);
  }

  // (3) 출처 — 메타데이터, truncate 금지 (빈 문자열이면 미포함)
  const cites = formatCitations(raw.citations);
  if (cites !== "") sections.push(cites.replace(/^\n/, ""));

  return sections.join("\n\n");
}

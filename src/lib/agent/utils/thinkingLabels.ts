import { currentTimeToolDisplayName } from "@/lib/agent/harness/tools/exampleTool";
import { webSearchToolDisplayName } from "@/lib/agent/harness/tools/webSearchTool";
import { webSearcherSubagentDisplayName } from "@/lib/agent/harness/subagents/webSearcher";

/**
 * 사고 패널 한글 안내문구 생성 — 순수 함수(LLM/React 무관, NFR-11).
 *
 * 배경: medigate-new 는 백엔드가 `toolDisplayName` 과 step 제목을
 * 내려준다. 우리 deepagents/LangGraph 는 영문 reasoning 토큰만 주고
 * 한글 제목을 안 준다. 그래서 클라이언트가 step 의 order/kind/도구명
 * 으로 한글 안내문구를 **직접 생성**한다(medigate-new useAgentService
 * 규칙 그대로 모방):
 *   reasoning: order 0 → '질문 분석 중' / 완료 '질문 분석'
 *              order≥1 → '결과 분석 중' / 완료 '결과 분석'
 *   tool:      '{한글라벨} 도구 실행 중' / 완료 '{한글라벨} 도구 완료'
 *
 * 도구 한글 라벨은 각 도구 파일의 `*DisplayName` export 에서 수집한다
 * (FR-08 — 요소1개=파일1개). 새 도구는 그 파일에 displayName 을 추가
 * 하고 아래 TOOL_DISPLAY_NAMES 에 1줄 등록(레지스트리 패턴). 미매핑
 * 도구는 원본 도구명으로 폴백 — 등록 안 해도 깨지지 않는다.
 *
 * 영문 reasoning 텍스트(`Clarifying user intent` 등)는 **제목이 아니라
 * 본문**이다(medigate-new 와 동일). 더 이상 **bold** 를 제목으로
 * 파싱하지 않는다 — reduceReasoning 이 order 로 제목을 생성한다.
 */

/**
 * 도구명 → 한글 표시명. 새 도구는 여기 1줄 등록(미등록=원본명 폴백).
 * 파일시스템 도구(deepagents 빌트인 FILESYSTEM_TOOL_NAMES 실측:
 * ls/read_file/write_file/edit_file/glob/grep/execute + write_todos)
 * 도 한글화 — SKILL 이 이 도구들로 SKILL.md 를 읽어 실행하므로
 * 사고 패널에 자주 노출된다.
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  current_time: currentTimeToolDisplayName,
  web_search: webSearchToolDisplayName,
  ls: "파일 목록",
  read_file: "파일 읽기",
  write_file: "파일 쓰기",
  edit_file: "파일 편집",
  glob: "파일 검색",
  grep: "내용 검색",
  execute: "명령 실행",
  write_todos: "할 일 정리",
};

/** 도구명을 한글 표시명으로. 미매핑은 원본명, 빈값은 '도구' 폴백. */
export function toolDisplayName(name: string): string {
  if (!name) return "도구";
  return TOOL_DISPLAY_NAMES[name] ?? name;
}

/**
 * subagent_type → 한글 표시명(Slice J). deepagents 는 subagent 를
 * `task` 도구의 args.subagent_type 으로 흘린다(실측 index.js:2304).
 * 새 subagent 는 그 파일에 *DisplayName 추가 + 여기 1줄 등록
 * (FR-08, 도구 패턴과 동일). 미매핑은 subagent_type 원본 폴백.
 */
const SUBAGENT_DISPLAY_NAMES: Record<string, string> = {
  "web-searcher": webSearcherSubagentDisplayName,
};

/** task args(JSON 문자열)에서 subagent_type 한글 라벨 추출. 실패 시 null. */
function subagentLabelFromArgs(args: string | undefined): string | null {
  if (!args) return null;
  try {
    const parsed: unknown = JSON.parse(args);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "subagent_type" in parsed
    ) {
      const t = (parsed as { subagent_type?: unknown }).subagent_type;
      if (typeof t === "string" && t.length > 0) {
        return SUBAGENT_DISPLAY_NAMES[t] ?? t;
      }
    }
  } catch {
    // 스트리밍 중 불완전 JSON — 이름 없이 폴백(호출부에서 처리).
  }
  return null;
}

/**
 * skill 디렉토리명 → 한글 표시명(Slice P). deepagents 는 SKILL 을
 * 별도 이벤트로 안 주고 read_file 로 /<skill>/SKILL.md 를 읽어
 * 실행한다(probe 실측 — ls/read_file 만 보이고 tool:'Skill' 없음).
 * 새 skill 은 여기 1줄 등록(FR-08, 미매핑은 디렉토리명 폴백).
 */
const SKILL_DISPLAY_NAMES: Record<string, string> = {
  "deep-web-research": "심층 웹조사",
};

/**
 * read_file args(JSON) 의 file_path 가 SKILL 진입 패턴인지 추론한다.
 *
 * **휴리스틱(R8 주의)**: deepagents 가 SKILL 명시 이벤트를 안 줘서
 * (probe 실측 — 파일시스템 경유) read_file({file_path}) 의 경로가
 * `…/<skill-dir>/SKILL.md` (마지막 세그먼트가 정확히 'SKILL.md')
 * 일 때만 SKILL 진입으로 본다. 오분류 방지를 위해 끝 매칭을
 * 엄격히(대문자 SKILL.md, .bak·MY_SKILL.md 등 제외). 매칭 시
 * 상위 디렉토리명을 skill 키로 → 한글 라벨(미매핑은 디렉토리명).
 *
 * @returns skill 한글 라벨, SKILL 패턴 아니거나 파싱 실패면 null.
 */
function skillLabelFromReadFileArgs(
  args: string | undefined,
): string | null {
  if (!args) return null;
  try {
    const parsed: unknown = JSON.parse(args);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("file_path" in parsed)
    ) {
      return null;
    }
    const fp = (parsed as { file_path?: unknown }).file_path;
    if (typeof fp !== "string" || fp.length === 0) return null;
    const segs = fp.split("/").filter((s) => s.length > 0);
    const last = segs[segs.length - 1];
    // 마지막 세그먼트가 **정확히** 'SKILL.md' 여야 함(엄격).
    if (last !== "SKILL.md") return null;
    const dir = segs[segs.length - 2];
    if (!dir) return null;
    return SKILL_DISPLAY_NAMES[dir] ?? dir;
  } catch {
    // 스트리밍 중 불완전 JSON — SKILL 추론 보류(일반 파일 읽기로).
    return null;
  }
}

/**
 * reasoning step 제목. order 0 은 '질문 분석', 이후는 '결과 분석'.
 * 진행 중이면 '… 중' 접미사(완료 시 제거 — medigate-new 규칙).
 */
export function reasoningTitle(order: number, done: boolean): string {
  const base = order === 0 ? "질문 분석" : "결과 분석";
  return done ? base : `${base} 중`;
}

/**
 * tool step 제목.
 *  - name="task"(deepagents subagent 위임): args.subagent_type 으로
 *    '{한글라벨} 에이전트 실행 중' → 완료 '… 에이전트 완료'
 *    (medigate-new agentName 동형). args 불완전·미전달이면 이름 없이
 *    '에이전트 실행 중/완료'.
 *  - 그 외 일반 도구: '{한글라벨} 도구 실행 중' → 완료 '… 도구 완료'.
 *
 * args 는 옵셔널 — task 표현에만 쓰인다(일반 도구는 무시).
 */
export function toolTitle(
  name: string,
  done: boolean,
  args?: string,
): string {
  if (name === "task") {
    const label = subagentLabelFromArgs(args);
    const head = label !== null ? `${label} 에이전트` : "에이전트";
    return done ? `${head} 완료` : `${head} 실행 중`;
  }
  // Slice P — read_file 로 SKILL.md 를 읽으면 SKILL 진입으로 추론
  // (deepagents SKILL 명시 이벤트 부재 — 휴리스틱). medigate-new
  // '지침 적용 중/완료' 동형. 일반 read_file 은 아래 도구 표현.
  if (name === "read_file") {
    const skill = skillLabelFromReadFileArgs(args);
    if (skill !== null) {
      return done
        ? `${skill} 지침 적용 완료`
        : `${skill} 지침 적용 중`;
    }
  }
  const label = toolDisplayName(name);
  return done ? `${label} 도구 완료` : `${label} 도구 실행 중`;
}

/**
 * 제목이 진행 중 상태('… 중')인가 — UI 가 스태틱 '...' 부착 여부 판정.
 * (사용자 요구: '분석중'이면 그 뒤에 점점점을 스태틱하게 붙인다.)
 */
export function isInProgress(title: string): boolean {
  // 생성 규칙상 진행 중 제목은 항상 '… 중'(공백+중)으로 끝난다.
  // '집중' 같은 무관 단어 오탐 방지를 위해 공백+중만 인정.
  return title.endsWith(" 중");
}

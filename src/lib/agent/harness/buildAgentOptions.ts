import { registerHarnessProfile } from "deepagents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { HarnessConfig } from "@/types";

/**
 * AD-1 / AD-6-3 — HarnessConfig → createDeepAgent 단일 인자 어댑터.
 *
 * 이 파일은 하네스 상태에 대한 `if` 분기가 존재하는 **유일한 곳**이다.
 * `agent.ts` 는 `createDeepAgent(buildAgentOptions(...))` 분기 0줄 단일
 * 호출만 가지므로, 토글(planning/filesystem/subagents/tools/checkpointer)을
 * 켜고 꺼도 agent.ts/route.ts diff 가 0 줄이다(AC-4/NFR-6/R2).
 *
 * 토글 → deepagents 주입 두 경로 (probe note §3/§4, AD-6):
 *  ① createDeepAgent 옵션 직접:  model / systemPrompt / tools /
 *     subagents / checkpointer
 *  ② 전역 레지스트리:  registerHarnessProfile(modelSpec, HarnessProfileOptions)
 *     - planning.enabled=false   → excludedMiddleware += "TodoListMiddleware"
 *     - filesystem.enabled=false → excludedTools += 6개 파일 도구
 *       (FilesystemMiddleware 는 REQUIRED — excludedMiddleware 로 제거 시
 *        construction-time throw 이므로 절대 넣지 않는다, AD-6-2)
 *     - subagents [] (HARNESS_SUBAGENTS off) → subagents:[] +
 *       generalPurposeSubagent.enabled:false
 *
 * 프로파일 바인딩(실측 — node_modules/deepagents/dist/index.js 7929~8090):
 *  createDeepAgent 는 model 이 인스턴스면 `getModelProvider(model)` 로
 *  provider hint 를(클래스명 ChatAnthropic/ChatOpenAI → anthropic/openai),
 *  `getModelIdentifier(model)` 로 model id 를 뽑아 resolveHarnessProfile 이
 *  `provider:model` → `model` → `provider` 순으로 getHarnessProfile 한다.
 *  bare provider 키는 항상 매칭되는 최종 fallback 이므로, provider 키 +
 *  (식별 가능하면) provider:model 키 둘 다 등록해 강건하게 바인딩한다.
 */

const FILE_TOOLS = [
  "ls",
  "read_file",
  "write_file",
  "edit_file",
  "glob",
  "grep",
] as const;

const TODO_MIDDLEWARE = "TodoListMiddleware";

/** createDeepAgent 가 model 인스턴스에서 추출하는 것과 동일한 provider hint. */
function modelProviderHint(model: BaseChatModel): string | undefined {
  const m = model as unknown as { getName?: () => string };
  const name = typeof m.getName === "function" ? m.getName() : undefined;
  return name ? { ChatAnthropic: "anthropic", ChatOpenAI: "openai" }[name] : undefined;
}

/**
 * createDeepAgent 가 model 인스턴스에서 추출하는 것과 동일한 model id hint.
 *
 * 추출 순서를 deepagents getModelIdentifier 실측과 정합시킨다
 * (node_modules/deepagents/dist/index.js ~8009):
 *   model._defaultConfig?.model ?? model.model_name ?? model.modelName
 * 추가로, 실 ChatOpenAI 인스턴스는 `.model` 만 노출(model_name/modelName 없음)
 * 하고 실 ChatAnthropic 은 `modelName` + `.model` 을 노출(model_name 없음)하므로
 * `.model` 을 최종 fallback 으로 둬 두 provider 모두 식별되게 한다(architect AI-2).
 */
function modelIdentifierHint(model: BaseChatModel): string | undefined {
  const m = model as unknown as {
    _defaultConfig?: { model?: string };
    model_name?: string;
    modelName?: string;
    model?: string;
  };
  return (
    m._defaultConfig?.model ??
    m.model_name ??
    m.modelName ??
    m.model ??
    undefined
  );
}

/** HarnessProfileOptions 부분집합 — 본 프로젝트가 사용하는 키만. */
interface HarnessProfileOpts {
  excludedMiddleware?: string[];
  excludedTools?: string[];
  generalPurposeSubagent?: { enabled?: boolean };
}

/**
 * 프로세스 전역 "이미 등록한 profile key" 집합(architect AI-1).
 *
 * deepagents 의 registerHarnessProfileImpl 은 동일 key 재등록 시
 * mergeProfiles 로 **누적 merge** 한다(실측 index.js 7843~7845). 그리고
 * mergeProfiles 는 excludedTools/excludedMiddleware 를 dedup 없이 concat
 * 한다(7613~7614). 단일 profile 자체는 createHarnessProfile 의 `new Set`
 * 으로 dedup 되지만, 재호출 시 토글이 바뀌면(예: planning off→on) 이전
 * excludedMiddleware 가 stale 하게 잔존해 절대 해제되지 않는다.
 *
 * Slice 9 harness-toggle E2E 는 같은 프로세스에서 graph 를 rebuild 하므로
 * buildAgentOptions 가 같은 key 로 반복 registerHarnessProfile 을 호출하면
 * 이 누적/stale 결함이 노출된다. → key 별 first-call 가드로 멱등화한다.
 * agent.ts 의 `globalThis.__agent` 와 같은 패턴 계열이되 별도 키를 쓴다
 * (AD-1 유지: 토글 분기는 여전히 toProfileOptions 내부에만 격리).
 */
const REGISTERED_KEYS_GLOBAL = "__deepagentsProfilesRegistered" as const;

function registeredKeys(): Set<string> {
  const g = globalThis as unknown as Record<string, Set<string> | undefined>;
  let set = g[REGISTERED_KEYS_GLOBAL];
  if (!set) {
    set = new Set<string>();
    g[REGISTERED_KEYS_GLOBAL] = set;
  }
  return set;
}

/**
 * profile 을 key 에 멱등 등록한다(first-call 가드, option b).
 *
 * 주의: deepagents 는 `anthropic:claude-opus-4-7` 등 빌트인 profile 을
 * 사전 등록한다(실측 index.js 7654/7685/7710). 따라서 `getHarnessProfile(key)
 * !== undefined` 로 skip 하면(option a) 실제 Claude 모델에서 우리 토글
 * profile 이 한 번도 등록되지 않아 FR-08/AC-4 토글이 깨진다. 첫 등록은
 * 빌트인 위에 의도적으로 merge 돼야 하므로, "이 프로세스에서 이 key 를
 * 이미 우리가 등록했는가"만 가드한다(누적/stale 만 차단, 첫 merge 는 허용).
 */
function registerHarnessProfileOnce(key: string, profile: HarnessProfileOpts): void {
  const seen = registeredKeys();
  if (seen.has(key)) return;
  registerHarnessProfile(key, profile);
  seen.add(key);
}

/**
 * HarnessConfig 토글을 HarnessProfileOptions 로 변환한다(순수 매핑).
 * 모든 if(하네스상태) 분기가 이 함수 내부에만 격리된다(AD-1).
 */
function toProfileOptions(config: HarnessConfig): HarnessProfileOpts {
  const excludedMiddleware: string[] = [];
  const excludedTools: string[] = [];

  // planning off → TodoListMiddleware 제거 (REQUIRED 아님 — 안전).
  if (!config.planning.enabled) {
    excludedMiddleware.push(TODO_MIDDLEWARE);
  }

  // filesystem off → soft toggle: 파일 도구만 가시성 제거.
  // FilesystemMiddleware 는 REQUIRED 라 excludedMiddleware 에 넣지 않는다.
  if (!config.filesystem.enabled) {
    excludedTools.push(...FILE_TOOLS);
  }

  const opts: HarnessProfileOpts = {};
  if (excludedMiddleware.length > 0) opts.excludedMiddleware = excludedMiddleware;
  if (excludedTools.length > 0) opts.excludedTools = excludedTools;
  // subagents 비어있으면 자동 추가 GP subagent 도 끈다(단일 에이전트 동작).
  if (config.subagents.length === 0) {
    opts.generalPurposeSubagent = { enabled: false };
  }
  return opts;
}

/** createDeepAgent 의 완전 단일 인자 객체 형태(본 프로젝트가 채우는 키). */
export interface AgentOptions {
  model: BaseChatModel;
  systemPrompt: string;
  tools: unknown[];
  subagents: HarnessConfig["subagents"];
  checkpointer: unknown;
  /**
   * SKILL — sources 가 있을 때만 존재(없으면 키 자체를 누락해 deepagents
   * 기본 StateBackend 경로를 보존). skill on/off 분기는 registry 에서
   * 끝났고 여기는 "있으면 전달"만 한다(AD-1 분기 격리 유지).
   */
  skills?: string[];
  backend?: unknown;
}

/**
 * HarnessConfig + model + systemPrompt → createDeepAgent 완전 인자 객체.
 * 부수효과로 registerHarnessProfile 을 호출해 토글 프로파일을 주입한다.
 */
export function buildAgentOptions(
  config: HarnessConfig,
  model: BaseChatModel,
  systemPrompt: string,
): AgentOptions {
  const profile = toProfileOptions(config);

  // 프로파일을 model spec 으로 바인딩(실측 해석 순서에 맞춰 강건하게 등록).
  const provider = modelProviderHint(model);
  const identifier = modelIdentifierHint(model);
  if (provider) {
    registerHarnessProfileOnce(provider, profile);
    if (identifier && !identifier.includes(":")) {
      registerHarnessProfileOnce(`${provider}:${identifier}`, profile);
    }
  } else if (identifier) {
    registerHarnessProfileOnce(identifier, profile);
  }

  const options: AgentOptions = {
    model,
    systemPrompt,
    tools: config.tools,
    subagents: config.subagents,
    checkpointer: config.checkpointer,
  };

  // SKILL — sources 가 있을 때만 skills/backend 주입. 없으면 키 자체를
  // 빼서 deepagents 의 기본 backend(StateBackend) 경로를 그대로 둔다
  // (skill off 시 createDeepAgent 인자 형태가 PoC 도입 전과 동일 — 회귀 0).
  if (config.skills.enabled && config.skills.sources.length > 0) {
    options.skills = config.skills.sources;
    options.backend = config.skills.backend;
  }

  return options;
}

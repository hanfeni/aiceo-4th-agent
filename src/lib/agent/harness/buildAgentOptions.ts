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

/** createDeepAgent 가 model 인스턴스에서 추출하는 것과 동일한 model id hint. */
function modelIdentifierHint(model: BaseChatModel): string | undefined {
  const m = model as unknown as { model_name?: string; modelName?: string };
  return m.model_name ?? m.modelName ?? undefined;
}

/** HarnessProfileOptions 부분집합 — 본 프로젝트가 사용하는 키만. */
interface HarnessProfileOpts {
  excludedMiddleware?: string[];
  excludedTools?: string[];
  generalPurposeSubagent?: { enabled?: boolean };
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
    registerHarnessProfile(provider, profile);
    if (identifier && !identifier.includes(":")) {
      registerHarnessProfile(`${provider}:${identifier}`, profile);
    }
  } else if (identifier) {
    registerHarnessProfile(identifier, profile);
  }

  return {
    model,
    systemPrompt,
    tools: config.tools,
    subagents: config.subagents,
    checkpointer: config.checkpointer,
  };
}

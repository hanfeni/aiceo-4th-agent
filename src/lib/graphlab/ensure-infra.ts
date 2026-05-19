/**
 * 온톨로지 실습 — Neo4j 인프라 보장 ("그래프 구축" 버튼이 호출).
 *
 * search-lab ensure-infra.ts 와 동형(검증된 패턴 복제). 버튼이
 * #1 Neo4j 확인 → #2 없으면 run-neo4j.sh spawn → #3 적재 의
 * #1·#2 담당. run-neo4j.sh 가 Docker 보장·컨테이너 기동을 이미
 * 보유 → 재구현 0, 호출만. stdout/stderr 를 라인 단위 yield 해
 * SSE 로 학생에게 진행을 보여준다.
 *
 * R7: child_process → 이걸 쓰는 API route runtime=nodejs.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { isNeo4jUp } from "./client";

const IS_WIN = process.platform === "win32";
const SCRIPT = IS_WIN
  ? join(process.cwd(), "run-neo4j.ps1")
  : join(process.cwd(), "run-neo4j.sh");

// spawn 중복 가드 (search-lab 와 동일 사상 — 버튼 재클릭·SSE 끊김
// 재시도로 run-neo4j.sh 가 여러 개 뜨는 것 방지). globalThis 플래그.
const SPAWN_FLAG = "__graphlab_infra_spawning__";
function isSpawning(): boolean {
  return (globalThis as Record<string, unknown>)[SPAWN_FLAG] === true;
}
function setSpawning(v: boolean): void {
  (globalThis as Record<string, unknown>)[SPAWN_FLAG] = v;
}

export type InfraEvent =
  | { type: "infra"; phase: "check" | "spawn" | "ready" | "wait"; text: string }
  | { type: "infra_log"; text: string }
  | { type: "infra_error"; text: string };

async function* waitUpHeartbeat(
  maxMs: number,
  label: string,
): AsyncGenerator<InfraEvent, boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isNeo4jUp()) return true;
    const sec = Math.round((Date.now() - start) / 1000);
    yield { type: "infra", phase: "wait", text: `${label} (${sec}s 경과)` };
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

/**
 * Neo4j 확인 → 없으면 run-neo4j.sh 실행. 이미 떠 있으면 즉시 ready.
 * 스크립트 진행을 라인 단위 yield. 끝까지 못 띄우면 infra_error
 * 후 false(상위가 적재 중단). search-lab ensureOpenSearch 동형.
 */
export async function* ensureNeo4j(): AsyncGenerator<InfraEvent, boolean> {
  yield { type: "infra", phase: "check", text: "Neo4j 상태 확인 중…" };
  if (await isNeo4jUp()) {
    yield { type: "infra", phase: "ready", text: "✓ Neo4j 이미 실행 중" };
    return true;
  }

  if (isSpawning()) {
    yield {
      type: "infra",
      phase: "wait",
      text: "다른 요청이 Neo4j 기동 중 — 완료를 기다립니다…",
    };
    const ok = yield* waitUpHeartbeat(300_000, "기동 대기 중");
    if (ok) {
      yield { type: "infra", phase: "ready", text: "✓ Neo4j 준비 완료" };
      return true;
    }
    yield {
      type: "infra_error",
      text: "기동 대기 시간 초과 — Docker Desktop 상태를 확인하고 다시 시도하세요.",
    };
    return false;
  }
  setSpawning(true);

  yield {
    type: "infra",
    phase: "spawn",
    text: IS_WIN
      ? "Neo4j 미기동 → run-neo4j.ps1 실행 (Docker 확인·기동, 수 분 소요 가능)"
      : "Neo4j 미기동 → run-neo4j.sh 실행 (Docker 확인·기동, 수 분 소요 가능)",
  };

  const child = IS_WIN
    ? spawn("powershell", ["-ExecutionPolicy", "Bypass", "-File", SCRIPT], {
        cwd: process.cwd(),
      })
    : spawn("bash", [SCRIPT], { cwd: process.cwd() });

  const queue: InfraEvent[] = [];
  let resolveWait: (() => void) | null = null;
  const pump = (chunk: Buffer, isErr: boolean): void => {
    for (const line of chunk.toString().split("\n")) {
      const t = line.replace(/\s+$/, "");
      if (t)
        queue.push({ type: isErr ? "infra_error" : "infra_log", text: t });
    }
    resolveWait?.();
  };
  child.stdout.on("data", (c: Buffer) => pump(c, false));
  child.stderr.on("data", (c: Buffer) => pump(c, true));

  let exited = false;
  let exitCode: number | null = null;
  child.on("close", (code) => {
    exited = true;
    exitCode = code;
    resolveWait?.();
  });
  child.on("error", (e) => {
    exited = true;
    exitCode = -1;
    queue.push({ type: "infra_error", text: `스크립트 실행 실패: ${e.message}` });
    resolveWait?.();
  });

  while (!exited || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((r) => {
        resolveWait = r;
        setTimeout(r, 1500);
      });
      resolveWait = null;
      continue;
    }
    yield queue.shift() as InfraEvent;
  }

  setSpawning(false);

  if (exitCode !== 0) {
    yield {
      type: "infra_error",
      text:
        `스크립트 종료(코드 ${exitCode}). Docker 데몬이 안 떠 있습니다. ` +
        `→ Finder→응용프로그램→Docker.app 을 직접 실행하고 메뉴바 ` +
        `고래 아이콘이 'running' 이 되면 '그래프 구축'을 다시 누르세요.`,
    };
    return false;
  }

  yield { type: "infra", phase: "check", text: "Neo4j 기동 확인 중…" };
  const up = yield* waitUpHeartbeat(60_000, "Neo4j 기동 대기 중");
  if (up) {
    yield { type: "infra", phase: "ready", text: "✓ Neo4j 준비 완료" };
    return true;
  }
  yield {
    type: "infra_error",
    text: "스크립트는 끝났으나 Neo4j 가 응답하지 않습니다. 잠시 후 재시도.",
  };
  return false;
}

/**
 * 검색 실습 — OpenSearch 인프라 보장 (색인 버튼이 호출).
 *
 * 2026-05-19 결정(사용자): 색인 버튼이 #1 원격확인 → #2 Docker·
 * OpenSearch 확인 → #3 없으면 설치·실행 → #4 색인 의 #2·#3 담당.
 *
 * #3 은 run-opensearch.sh 를 child_process spawn 으로 실행한다.
 * 그 스크립트가 이미 Docker 보장(OS분기 brew/winget)·컨테이너
 * 기동·Nori 설치 로직을 보유 → 재구현 0, 호출만. stdout/stderr
 * 를 라인 단위로 yield 해 SSE 로 학생에게 진행을 보여준다.
 *
 * ⚠ 한계(정직): Docker Desktop 첫 실행 권한 승인은 GUI 라
 * 스크립트도 자동화 못 한다. 그 단계서 스크립트가 멈추고 안내를
 * 출력하면 그 라인이 SSE 로 그대로 전달돼 학생이 보고 1회 클릭.
 *
 * R7: 이 모듈은 node 전용(child_process). API route runtime=nodejs.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const OS_URL = process.env.OPENSEARCH_URL ?? "http://localhost:9200";
// Next 앱 루트 = process.cwd() (run-dev 가 cd 후 next dev). 스크립트는
// 루트에 있음(run-opensearch.sh). Windows 는 .ps1 분기.
const IS_WIN = process.platform === "win32";
const SCRIPT = IS_WIN
  ? join(process.cwd(), "run-opensearch.ps1")
  : join(process.cwd(), "run-opensearch.sh");

// spawn 중복 가드: 버튼 재클릭·SSE 끊김 재시도로 run-opensearch.sh
// 가 여러 개 뜨는 것 방지(실측 PID 누적). dev 서버 프로세스 단위
// globalThis 플래그 — 모듈 재평가에도 유지.
const SPAWN_FLAG = "__searchlab_infra_spawning__";
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

/** OpenSearch 헬스 1회 확인 (떠 있으면 true) */
export async function isOpenSearchUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OS_URL}/_cluster/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * OS 가 뜰 때까지 폴링하며 경과 하트비트를 yield (멈춘 듯 보임 해소).
 * 4초마다 헬스체크 + "대기… Ns" InfraEvent. 최대 maxMs 후 false 반환.
 */
async function* waitUpHeartbeat(
  maxMs: number,
  label: string,
): AsyncGenerator<InfraEvent, boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isOpenSearchUp()) return true;
    const sec = Math.round((Date.now() - start) / 1000);
    yield { type: "infra", phase: "wait", text: `${label} (${sec}s 경과)` };
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
}

/**
 * #2 + #3: OpenSearch 확인 → 없으면 run-opensearch.sh 실행.
 * 이미 떠 있으면 즉시 ready. 스크립트 진행을 라인 단위 yield.
 * 끝까지 못 띄우면 infra_error 후 false(상위가 색인 중단).
 */
export async function* ensureOpenSearch(): AsyncGenerator<
  InfraEvent,
  boolean
> {
  yield { type: "infra", phase: "check", text: "OpenSearch 상태 확인 중…" };
  if (await isOpenSearchUp()) {
    yield { type: "infra", phase: "ready", text: "✓ OpenSearch 이미 실행 중" };
    return true;
  }

  // spawn 중복 가드 — 다른 색인 요청이 이미 인프라 기동 중이면
  // 새 run-opensearch.sh 를 띄우지 않고 그게 뜨길 폴링만 한다
  // (PID 누적 방지). 최대 5분 대기 후 미기동이면 안내.
  if (isSpawning()) {
    yield {
      type: "infra",
      phase: "wait",
      text: "다른 요청이 OpenSearch 기동 중 — 완료를 기다립니다…",
    };
    const ok = yield* waitUpHeartbeat(300_000, "기동 대기 중");
    if (ok) {
      yield { type: "infra", phase: "ready", text: "✓ OpenSearch 준비 완료" };
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
      ? "OpenSearch 미기동 → run-opensearch.ps1 실행 (Docker 확인·기동, 수 분 소요 가능)"
      : "OpenSearch 미기동 → run-opensearch.sh 실행 (Docker 확인·기동, 수 분 소요 가능)",
  };

  const child = IS_WIN
    ? spawn(
        "powershell",
        ["-ExecutionPolicy", "Bypass", "-File", SCRIPT],
        { cwd: process.cwd() },
      )
    : spawn("bash", [SCRIPT], { cwd: process.cwd() });

  // stdout/stderr 라인을 모아 yield (제너레이터라 콜백→큐 브릿지)
  const queue: InfraEvent[] = [];
  let resolveWait: (() => void) | null = null;
  const pump = (chunk: Buffer, isErr: boolean): void => {
    for (const line of chunk.toString().split("\n")) {
      const t = line.replace(/\s+$/, "");
      if (t)
        queue.push({
          type: isErr ? "infra_error" : "infra_log",
          text: t,
        });
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
  // spawn 자체 실패(bash 없음 등) — 가드 해제 + 탈출(데드락 방지)
  child.on("error", (e) => {
    exited = true;
    exitCode = -1;
    queue.push({
      type: "infra_error",
      text: `스크립트 실행 실패: ${e.message}`,
    });
    resolveWait?.();
  });

  // 큐를 비우며 종료까지 흘림
  while (!exited || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((r) => {
        resolveWait = r;
        setTimeout(r, 1500); // 데드락 방지 틱
      });
      resolveWait = null;
      continue;
    }
    yield queue.shift() as InfraEvent;
  }

  setSpawning(false); // 스크립트 종료 — 가드 해제

  if (exitCode !== 0) {
    yield {
      type: "infra_error",
      text:
        `스크립트 종료(코드 ${exitCode}). Docker 데몬이 안 떠 있습니다. ` +
        `→ Finder→응용프로그램→Docker.app 을 직접 실행하고 메뉴바 ` +
        `고래 아이콘이 'running' 이 되면 색인 버튼을 다시 누르세요 ` +
        `(이 머신은 자동 기동이 막혀 1회 수동 실행 필요).`,
    };
    return false;
  }

  // 스크립트가 0 으로 끝나도 컨테이너 헬스 재확인 (하트비트, 최대 60s)
  yield { type: "infra", phase: "check", text: "OpenSearch 기동 확인 중…" };
  const up = yield* waitUpHeartbeat(60_000, "OpenSearch 기동 대기 중");
  if (up) {
    yield { type: "infra", phase: "ready", text: "✓ OpenSearch 준비 완료" };
    return true;
  }
  yield {
    type: "infra_error",
    text: "스크립트는 끝났으나 OpenSearch 가 응답하지 않습니다. 잠시 후 재시도.",
  };
  return false;
}

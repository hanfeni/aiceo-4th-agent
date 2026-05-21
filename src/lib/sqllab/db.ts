/**
 * Text-to-SQL 실습 — SQLite 파일 핸들 (도메인 1개 = 파일 1개).
 *
 * 적재 데이터는 .data/sqllab/<domain>.db 에 둔다(.data/ 는 이미
 * .gitignore — OpenSearch .opensearch-data/ 와 동일 패턴).
 *
 * R6(globalThis 싱글톤): dev HMR 시 핸들 재생성 방지. checkpointer
 * 와 동일 사유 — 모듈 변수면 HMR 마다 파일 락 누수.
 * R7(nodejs): better-sqlite3 네이티브 → 호출 route 는 runtime
 * "nodejs". 타입/런타임 import 분리는 conversations/list.ts 컨벤션.
 */

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type SqlDomain } from "./domains";
import { getSqlDomainSpec } from "./dynamicDomains";

const SQLLAB_DIR = join(process.cwd(), ".data", "sqllab");

interface SqlLabGlobal {
  handles?: Map<SqlDomain, DB>;
}
const g = globalThis as unknown as { __sqllab?: SqlLabGlobal };
g.__sqllab ??= {};
g.__sqllab.handles ??= new Map<SqlDomain, DB>();

/**
 * 도메인 DB 파일 핸들. 없으면 디렉터리 생성 후 연다(파일 자체는
 * better-sqlite3 가 없으면 생성). 읽기 작업은 readonly 핸들을
 * 따로 쓰지 않고 동일 핸들 + SELECT 가드(text2sql.ts)로 막는다.
 */
export function getDb(domain: SqlDomain): DB {
  const handles = g.__sqllab!.handles!;
  const cached = handles.get(domain);
  if (cached && cached.open) return cached;

  mkdirSync(SQLLAB_DIR, { recursive: true });
  const file = join(SQLLAB_DIR, getSqlDomainSpec(domain).dbFile);
  const db = new Database(file);
  // WAL: 적재(쓰기) 중 다른 도메인 조회(읽기) 동시성 — 강의장
  // 한 노트북 내 적재↔질의 병행 안전.
  db.pragma("journal_mode = WAL");
  handles.set(domain, db);
  return db;
}

/** 적재 여부 + 행수 (UI "적재된 테이블" 목록용). 미적재면 null. */
export function tableInfo(
  domain: SqlDomain,
): { table: string; rowCount: number } | null {
  const db = getDb(domain);
  const { table } = getSqlDomainSpec(domain);
  const exists = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    )
    .get(table) as { name: string } | undefined;
  if (!exists) return null;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM "${table}"`)
    .get() as { n: number };
  return { table, rowCount: row.n };
}

/**
 * 적재 테이블 앞 N행 미리보기 (Text-to-SQL "데이터 보기"용).
 * previewCsv(GitHub raw 원본)와 달리 **실제 적재된 SQLite 테이블**을
 * SELECT — text2sql 실행 단계와 동일한 조회 경로(getDb().prepare().all()).
 * 미적재면 null. PreviewModal 형태({columns, rows, totalNote})로 반환.
 */
export function previewTable(
  domain: SqlDomain,
  rows = 20,
): { columns: string[]; rows: string[][]; totalNote: string } | null {
  const info = tableInfo(domain);
  if (!info) return null;
  const db = getDb(domain);
  const { table, rowCount } = info;
  const n = Math.min(Math.max(rows, 1), 100);
  const cols = db
    .prepare(`PRAGMA table_info("${table}")`)
    .all() as { name: string }[];
  const columns = cols.map((c) => c.name);
  const data = db
    .prepare(`SELECT * FROM "${table}" LIMIT ${n}`)
    .all() as Record<string, unknown>[];
  // 전 컬럼 TEXT 적재라 문자열화 안전(표시 전용 — null 은 빈칸).
  const out = data.map((r) => columns.map((c) => String(r[c] ?? "")));
  return {
    columns,
    rows: out,
    totalNote: `전체 ${rowCount.toLocaleString()}행 중 앞 ${out.length}행`,
  };
}

/** 적재 테이블 삭제(실습 초기화). prefix 테이블만 — 안전. */
export function dropTable(domain: SqlDomain): void {
  const db = getDb(domain);
  const { table } = getSqlDomainSpec(domain);
  db.prepare(`DROP TABLE IF EXISTS "${table}"`).run();
}

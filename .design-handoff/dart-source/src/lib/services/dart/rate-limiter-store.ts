/**
 * DART API Rate Limiter 영구 저장소
 *
 * SQLite (sql.js) 기반으로 다음 정보를 저장:
 * - API 호출 로그 (최근 1시간)
 * - 차단 상태 (blockedAt, unblockAt)
 *
 * 서버 재시작 후에도 차단 상태가 유지됩니다.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

// 데이터베이스 경로
const DB_PATH = path.join(process.cwd(), 'data', 'dart_rate_limit.db');

// sql.js WASM 파일 경로
const getWasmPath = () => {
  return path.join(
    process.cwd(),
    'node_modules',
    'sql.js',
    'dist',
    'sql-wasm.wasm'
  );
};

/**
 * 차단 상태 레코드
 */
export interface BlockStateRecord {
  id: number;
  isBlocked: boolean;
  blockedAt: number | null;
  reason: string | null;
  createdAt: string;
}

/**
 * API 호출 로그 레코드
 */
export interface ApiCallLogRecord {
  id: number;
  timestamp: number;
  endpoint: string;
  createdAt: string;
}

/**
 * RateLimiterStore 싱글톤 클래스
 */
class RateLimiterStoreClass {
  private static instance: RateLimiterStoreClass | null = null;
  private db: SqlJsDatabase | null = null;
  private initPromise: Promise<SqlJsDatabase> | null = null;

  private constructor() {}

  static getInstance(): RateLimiterStoreClass {
    if (!RateLimiterStoreClass.instance) {
      RateLimiterStoreClass.instance = new RateLimiterStoreClass();
    }
    return RateLimiterStoreClass.instance;
  }

  /**
   * 데이터베이스 초기화
   */
  private async initDatabase(): Promise<SqlJsDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // data 디렉토리 생성
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // sql.js 초기화
      const wasmPath = getWasmPath();
      const wasmBuffer = fs.readFileSync(wasmPath);
      const SQL = await initSqlJs({
        wasmBinary: wasmBuffer.buffer.slice(
          wasmBuffer.byteOffset,
          wasmBuffer.byteOffset + wasmBuffer.byteLength
        ),
      });

      // 기존 DB 파일 로드 또는 새로 생성
      if (fs.existsSync(DB_PATH)) {
        const dbBuffer = fs.readFileSync(DB_PATH);
        this.db = new SQL.Database(dbBuffer);
      } else {
        this.db = new SQL.Database();
      }

      // 테이블 생성
      this.db.run(`
        CREATE TABLE IF NOT EXISTS block_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          blocked_at INTEGER,
          reason TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS api_call_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          endpoint TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 인덱스 생성
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_api_call_log_timestamp
        ON api_call_log(timestamp)
      `);

      this.saveToFile();
      console.log('[RateLimiterStore] Database initialized:', DB_PATH);

      return this.db;
    })();

    return this.initPromise;
  }

  /**
   * 데이터베이스 파일 저장
   */
  private saveToFile(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (error) {
      console.error('[RateLimiterStore] Failed to save database:', error);
    }
  }

  /**
   * API 호출 기록 저장
   */
  async recordApiCall(endpoint: string = ''): Promise<void> {
    const db = await this.initDatabase();
    const timestamp = Date.now();

    db.run(
      'INSERT INTO api_call_log (timestamp, endpoint) VALUES (?, ?)',
      [timestamp, endpoint]
    );

    // 1시간 이상 된 로그 삭제
    const oneHourAgo = timestamp - 60 * 60 * 1000;
    db.run('DELETE FROM api_call_log WHERE timestamp < ?', [oneHourAgo]);

    this.saveToFile();
  }

  /**
   * 최근 1분 내 호출 수 조회
   */
  async getRecentCallCount(minutes: number = 1): Promise<number> {
    const db = await this.initDatabase();
    const since = Date.now() - minutes * 60 * 1000;

    const result = db.exec(
      'SELECT COUNT(*) as count FROM api_call_log WHERE timestamp >= ?',
      [since]
    );

    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    return 0;
  }

  /**
   * 최근 호출 타임스탬프 목록 조회
   */
  async getRecentCallTimestamps(minutes: number = 1): Promise<number[]> {
    const db = await this.initDatabase();
    const since = Date.now() - minutes * 60 * 1000;

    const result = db.exec(
      'SELECT timestamp FROM api_call_log WHERE timestamp >= ? ORDER BY timestamp DESC',
      [since]
    );

    if (result.length > 0) {
      return result[0].values.map((row) => row[0] as number);
    }
    return [];
  }

  /**
   * 차단 상태 저장
   */
  async saveBlockState(
    isBlocked: boolean,
    blockedAt: number | null,
    reason: string | null
  ): Promise<void> {
    const db = await this.initDatabase();

    // 기존 레코드 모두 삭제 (항상 최신 1개만 유지)
    db.run('DELETE FROM block_state');

    db.run(
      'INSERT INTO block_state (is_blocked, blocked_at, reason) VALUES (?, ?, ?)',
      [isBlocked ? 1 : 0, blockedAt, reason]
    );

    this.saveToFile();
    console.log('[RateLimiterStore] Block state saved:', { isBlocked, blockedAt, reason });
  }

  /**
   * 차단 상태 조회
   */
  async getBlockState(): Promise<{
    isBlocked: boolean;
    blockedAt: number | null;
    reason: string | null;
  }> {
    const db = await this.initDatabase();

    const result = db.exec(
      'SELECT is_blocked, blocked_at, reason FROM block_state ORDER BY id DESC LIMIT 1'
    );

    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0];
      return {
        isBlocked: row[0] === 1,
        blockedAt: row[1] as number | null,
        reason: row[2] as string | null,
      };
    }

    return {
      isBlocked: false,
      blockedAt: null,
      reason: null,
    };
  }

  /**
   * 차단 상태 초기화
   */
  async clearBlockState(): Promise<void> {
    const db = await this.initDatabase();
    db.run('DELETE FROM block_state');
    this.saveToFile();
    console.log('[RateLimiterStore] Block state cleared');
  }

  /**
   * 오래된 로그 정리 (1시간 이상)
   */
  async cleanupOldLogs(): Promise<number> {
    const db = await this.initDatabase();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const before = db.exec('SELECT COUNT(*) FROM api_call_log');
    const beforeCount = before[0]?.values[0]?.[0] as number || 0;

    db.run('DELETE FROM api_call_log WHERE timestamp < ?', [oneHourAgo]);

    const after = db.exec('SELECT COUNT(*) FROM api_call_log');
    const afterCount = after[0]?.values[0]?.[0] as number || 0;

    const deleted = beforeCount - afterCount;
    if (deleted > 0) {
      this.saveToFile();
      console.log(`[RateLimiterStore] Cleaned up ${deleted} old logs`);
    }

    return deleted;
  }

  /**
   * 통계 조회
   */
  async getStats(): Promise<{
    totalLogs: number;
    lastMinuteCalls: number;
    lastHourCalls: number;
    blockState: { isBlocked: boolean; blockedAt: number | null; reason: string | null };
  }> {
    const db = await this.initDatabase();
    const now = Date.now();

    const totalResult = db.exec('SELECT COUNT(*) FROM api_call_log');
    const totalLogs = totalResult[0]?.values[0]?.[0] as number || 0;

    const lastMinute = now - 60 * 1000;
    const minuteResult = db.exec(
      'SELECT COUNT(*) FROM api_call_log WHERE timestamp >= ?',
      [lastMinute]
    );
    const lastMinuteCalls = minuteResult[0]?.values[0]?.[0] as number || 0;

    const lastHour = now - 60 * 60 * 1000;
    const hourResult = db.exec(
      'SELECT COUNT(*) FROM api_call_log WHERE timestamp >= ?',
      [lastHour]
    );
    const lastHourCalls = hourResult[0]?.values[0]?.[0] as number || 0;

    const blockState = await this.getBlockState();

    return {
      totalLogs,
      lastMinuteCalls,
      lastHourCalls,
      blockState,
    };
  }
}

// 싱글톤 인스턴스 export
export const RateLimiterStore = RateLimiterStoreClass.getInstance();

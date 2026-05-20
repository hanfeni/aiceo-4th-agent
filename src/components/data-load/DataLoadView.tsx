"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { isXlsxFile, xlsxToCsv } from "@/lib/files/xlsxToCsv";
import { PreviewModal, type Preview } from "./PreviewModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { Terminal } from "@/components/common/LabWorkbench";

/**
 * 업로드 파일을 적재용 csv File 로 정규화한다.
 *  - .csv: 그대로(서버 parseCsv 가 처리).
 *  - .xlsx/.xls: 클라이언트에서 첫 시트를 CSV 로 변환해 동일 업로드
 *    경로로 보낸다(서버 무변경 — sql-lab/upload 가 .csv 만 받으므로).
 */
async function toLoadCsvFile(file: File): Promise<File> {
  if (/\.csv$/i.test(file.name)) return file;
  if (isXlsxFile(file)) {
    const csv = await xlsxToCsv(file);
    if (!csv.trim()) {
      throw new Error(
        `${file.name} 의 첫 시트에 데이터가 없습니다.`,
      );
    }
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([csv], `${base}.csv`, { type: "text/csv" });
  }
  throw new Error(
    `지원하지 않는 파일 형식입니다: ${file.name} (.csv / .xlsx 만 가능)`,
  );
}

/**
 * DataLoadView — CSV → SQLite 데이터 적재 (Text-to-SQL 실습 준비).
 *
 * IndexLabView(검색 색인)의 SQL 버전 — 동일 UX 패턴:
 *  - 도메인 택1 → GitHub raw CSV fetch → SQLite 테이블 적재
 *  - 적재 진행 SSE 실시간 로그
 *  - 적재된 테이블 현황·초기화(도메인별, 확인 모달)
 * 검색 색인과 다른 점: 파라미터가 "적재 행수 상한" 하나뿐
 * (토크나이저·임베딩은 SQL 적재에 무의미). 색인은 OpenSearch,
 * 여기는 SQLite — 적재 후 검색 실습의 Text-to-SQL 이 질의한다.
 * 디자인: cf-* 클래스(검색·라벨링 그룹 = blue). 버튼 우측 정렬.
 */

const DOMAINS = [
  {
    id: "sangkwon",
    label: "상권 / 소상공인",
    audience: "유통·소상공인",
    sample: "강남구에서 카페가 가장 많은 행정동 상위 5곳은?",
  },
  {
    id: "medical",
    label: "의료 / 제약",
    audience: "의료·제약",
    sample: "전문의약품을 가장 많이 보유한 업체 상위 10곳은?",
  },
  {
    id: "finance",
    label: "금융 / 연금 / 고용",
    audience: "금융·투자",
    sample: "가입자 수가 가장 많은 사업장 업종 상위 10개는?",
  },
  {
    id: "legal",
    label: "법률 / 법령",
    audience: "법률·규제",
    sample: "소관부처별 법령 개수를 많은 순으로 보여줘",
  },
  {
    id: "policy",
    label: "정책 / 거버넌스",
    audience: "공공·정책",
    sample: "기관별 예산 총액을 큰 순으로 보여줘",
  },
] as const;

const ROW_LIMITS = [1000, 5000, 10000, 20000] as const;

interface TableInfo {
  domain: string;
  label: string;
  table: string;
  loaded: boolean;
  rowCount: number;
}


const chipRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };

// 진행 로그에서 "  N/M 적재 중…" 의 N·M 을 뽑아 진행 수치를 추론한다.
// done 라인(✓)이 있으면 done=true. 시안 B 의 INSERT 노드 sub("N/M") 데이터원.
function parseLoadProgress(log: string[]): {
  loaded: number | null;
  total: number | null;
  done: boolean;
} {
  let loaded: number | null = null;
  let total: number | null = null;
  let done = false;
  for (const line of log) {
    const m = line.match(/([\d,]+)\s*\/\s*([\d,]+)\s*적재 중/);
    if (m) {
      loaded = Number(m[1].replace(/,/g, ""));
      total = Number(m[2].replace(/,/g, ""));
    }
    if (line.startsWith("✓")) done = true;
  }
  return { loaded, total, done };
}

type PipeStatus = "idle" | "run" | "done";

// 진행 로그 → CSV→SQLite 4단계 파이프라인 노드 상태 매핑(시안 DataPipeline).
//  - 로그 없음 → 4노드 idle
//  - fetch/수신/파싱 로그 → 앞 3단계(fetch·파싱·스키마) done
//  - "적재 중" 진행 로그 → INSERT run
//  - "✓ 완료" → 전부 done
function deriveStages(
  log: string[],
  running: boolean,
): { label: string; sub: string; status: PipeStatus }[] {
  const prog = parseLoadProgress(log);
  const joined = log.join("\n");
  const fetched =
    /fetch|수신|파싱|업로드 문서 파싱|파일 파싱/.test(joined) || running;
  const inserting = /적재 중/.test(joined);
  const done = prog.done;

  // 앞 3단계: fetch 로그가 있으면 done(완료 시 전부 done).
  const early: PipeStatus = done ? "done" : fetched ? "done" : "idle";
  // INSERT 단계: 완료면 done, 적재 중이면 run, fetch 됐으면 run(곧 시작), 아니면 idle.
  const insertStatus: PipeStatus = done
    ? "done"
    : inserting || (running && fetched)
      ? "run"
      : "idle";
  const insertSub = done
    ? prog.loaded != null
      ? `${prog.loaded.toLocaleString()} rows`
      : "완료"
    : prog.loaded != null && prog.total != null
      ? `${prog.loaded.toLocaleString()}/${prog.total.toLocaleString()}`
      : "INSERT INTO";

  return [
    { label: "GitHub", sub: "raw fetch", status: early },
    { label: "CSV 파싱", sub: "컬럼 추론", status: early },
    { label: "스키마 생성", sub: "CREATE TABLE", status: early },
    { label: "INSERT", sub: insertSub, status: insertStatus },
  ];
}

export function DataLoadView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [limit, setLimit] = useState<number>(10000);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // 데이터 보기 모달(적재 전 CSV 앞 N행 미리보기 — index-lab 패턴)
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // 로컬 CSV 업로드(동적 custom 도메인) 상태.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const r = await fetch("/api/sql-lab/tables");
      const d = await r.json();
      setTables(Array.isArray(d.tables) ? d.tables : []);
    } catch {
      setTables([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetch("/api/sql-lab/tables").catch(() => null);
      if (!alive || !r) return;
      const d = await r.json().catch(() => ({}));
      if (alive) setTables(Array.isArray(d.tables) ? d.tables : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function runLoad(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setErr(null);
    setLog([`▶ ${domain} 적재 시작… (상한 ${limit.toLocaleString()}행)`]);
    try {
      const res = await fetch("/api/sql-lab/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, limit }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `적재 실패 (HTTP ${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "start")
            setLog((l) => [...l, `· CSV fetch: ${ev.url}`]);
          else if (ev.type === "fetched")
            setLog((l) => [...l, `· ${ev.total.toLocaleString()}행 수신 — 테이블 생성`]);
          else if (ev.type === "progress")
            setLog((l) => [
              ...l.slice(0, -1).filter((x) => !x.startsWith("  ")),
              `  ${ev.loaded.toLocaleString()}/${ev.total.toLocaleString()} 적재 중…`,
            ]);
          else if (ev.type === "done")
            setLog((l) => [
              ...l,
              `✓ 완료: ${ev.loaded.toLocaleString()}행 → 테이블 ${ev.table}`,
            ]);
          else if (ev.type === "error") setErr(ev.message);
        }
      }
      await loadTables();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  async function runUpload(): Promise<void> {
    if (uploading || !uploadFile) return;
    setUploading(true);
    setErr(null);
    setLog([`▶ 로컬 파일 업로드 적재 시작… (${uploadFile.name})`]);
    try {
      // 엑셀(.xlsx/.xls)은 클라이언트에서 첫 시트를 CSV 로 변환 후 전송.
      let csvFile: File;
      try {
        if (isXlsxFile(uploadFile)) {
          setLog((l) => [...l, `· ${uploadFile.name} 첫 시트 → CSV 변환 중…`]);
        }
        csvFile = await toLoadCsvFile(uploadFile);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "파일 변환 실패");
        return;
      }
      const fd = new FormData();
      fd.append("file", csvFile);
      if (uploadLabel.trim()) fd.append("label", uploadLabel.trim());
      fd.append("limit", String(limit));
      const res = await fetch("/api/sql-lab/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `업로드 실패 (HTTP ${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "start")
            setLog((l) => [...l, `· ${ev.message ?? "업로드 파일 파싱"}`]);
          else if (ev.type === "fetched")
            setLog((l) => [
              ...l,
              `· ${ev.total.toLocaleString()}행 파싱 — 테이블 생성`,
            ]);
          else if (ev.type === "progress")
            setLog((l) => [
              ...l.slice(0, -1).filter((x) => !x.startsWith("  ")),
              `  ${ev.loaded.toLocaleString()}/${ev.total.toLocaleString()} 적재 중…`,
            ]);
          else if (ev.type === "done")
            setLog((l) => [
              ...l,
              `✓ 완료: ${ev.loaded.toLocaleString()}행 → 테이블 ${ev.table} (챗 드롭다운에 "내 데이터" 등장)`,
            ]);
          else if (ev.type === "error") setErr(ev.message);
        }
      }
      await loadTables();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setUploading(false);
    }
  }

  async function dropDomain(d: string): Promise<void> {
    setConfirmDel(null);
    try {
      const r = await fetch("/api/sql-lab/tables", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? `초기화 실패 (HTTP ${r.status})`);
        return;
      }
      await loadTables();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  async function openPreview(): Promise<void> {
    setShowPreview(true);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const r = await fetch(
        `/api/sql-lab/preview?domain=${domain}&rows=20`,
      );
      const d = await r.json();
      if (r.ok && Array.isArray(d.columns)) {
        setPreview({
          columns: d.columns,
          rows: d.rows ?? [],
          totalNote: d.totalNote ?? "",
        });
      } else {
        setErr(d.error ?? `미리보기 실패 (HTTP ${r.status})`);
        setShowPreview(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
      setShowPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  const cur = DOMAINS.find((d) => d.id === domain);
  // 현재 도메인의 적재 상태(테이블명·행수) — tables 상태에서 조회.
  const curTable = tables.find((t) => t.domain === domain);
  const busy = loading || uploading;
  const prog = parseLoadProgress(log);
  // 워크벤치 상태 칩: 실행 중이면 run, 로그에 ✓ 완료가 있으면 done, 아니면 idle.
  const benchStatus: PipeStatus = busy ? "run" : prog.done ? "done" : "idle";
  const stages = deriveStages(log, busy);

  return (
    <div
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div
        style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 64px" }}
      >
        {/* 헤더(시안 LabPage) — accent 칩 + 타이틀 + 서브타이틀 */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--blue-600)",
              textTransform: "uppercase",
              background: "var(--lab-blue-bg-2)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            ② 검색 · 라벨링 실습
          </span>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-default)",
              margin: "8px 0 0",
              letterSpacing: "-0.015em",
            }}
          >
            데이터 적재
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-subtle)",
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            GitHub public CSV → SQLite 파이프라인을 추적하면서 도메인 테이블
            인벤토리를 한눈에 관리합니다. 적재한 뒤 검색 실습에서 Text-to-SQL
            로 자연어 질의해 보세요.
          </p>
        </div>

        <div className="il-bench">
          {/* ─── 좌측: 설정 패널 (sticky) ─── */}
          <div className="il-bench-aside">
            <div className="il-card il-config">
              <div className="il-config-title">적재 설정</div>

              {/* 도메인 세로 리스트(시안 B) — 우측에 원본 행수 약칭 */}
              <div className="il-flabel">도메인</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginBottom: 14,
                }}
              >
                {DOMAINS.map((d) => {
                  const ti = tables.find((t) => t.domain === d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="il-domain-btn"
                      aria-pressed={domain === d.id}
                      onClick={() => setDomain(d.id)}
                      disabled={busy}
                      title={d.audience}
                    >
                      <span>{d.label}</span>
                      <span
                        className="il-mono"
                        style={{ fontSize: 10.5, color: "var(--text-subtle)" }}
                      >
                        {ti?.loaded
                          ? `${(ti.rowCount / 1000).toFixed(1)}k`
                          : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 적재 행수 상한 — 기존 ROW_LIMITS 칩(limit 상태 그대로) */}
              <div className="il-flabel">
                적재 행수 상한
                <div className="il-flabel-hint">
                  큰 도메인(상권 1만 · 의료/금융 2만)은 메모리·시간 절약을
                  위해 상한을 둡니다.
                </div>
              </div>
              <div style={{ ...chipRow, marginBottom: 16 }}>
                {ROW_LIMITS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="cf-pill"
                    aria-pressed={limit === c}
                    onClick={() => setLimit(c)}
                    disabled={busy}
                  >
                    <span className="il-mono">{c.toLocaleString()}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="cf-btn cf-btn--primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={runLoad}
                disabled={busy}
              >
                {loading ? "적재 중…" : "적재 시작"}
              </button>
              <button
                type="button"
                className="cf-btn"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 6,
                }}
                onClick={openPreview}
                disabled={busy}
              >
                데이터 미리보기 (앞 20행)
              </button>

              {/* 현재 도메인 테이블명·질의 예시(시안 B 하단 dashed) */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px dashed var(--t-neutral-12)",
                  fontSize: 11,
                  color: "var(--text-subtle)",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--text-default)",
                    marginBottom: 4,
                  }}
                >
                  {cur?.label ?? domain}
                </div>
                <div className="il-mono" style={{ fontSize: 10.5 }}>
                  {curTable?.loaded ? curTable.table : `${domain}_*`}
                </div>
                {cur && (
                  <div
                    style={{
                      marginTop: 6,
                      fontStyle: "italic",
                      lineHeight: 1.5,
                    }}
                  >
                    “{cur.sample}”
                  </div>
                )}
              </div>

              {/* ③ 내 표 데이터 업로드 — 좌측 패널 하단 압축 영역(기능 보존).
                  로컬 CSV·엑셀(.xlsx) → "내 데이터" 도메인 적재. */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: "1px dashed var(--t-neutral-12)",
                }}
              >
                <div className="il-flabel">
                  내 표 데이터 업로드 (선택)
                  <div className="il-flabel-hint">
                    CSV · 엑셀(.xlsx) → 6번째 “내 데이터” 도메인으로 적재.
                    엑셀은 첫 시트가 CSV 로 자동 변환. 위 적재 상한 함께 적용.
                  </div>
                </div>
                {/* 네이티브 file input 숨김 — 명확한 버튼이 트리거(검색
                    업로드와 동일 UX). 선택 파일명은 칩 아래 표시. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setUploadFile(f);
                    if (f && !uploadLabel)
                      setUploadLabel(f.name.replace(/\.[^.]+$/, ""));
                  }}
                  style={{ display: "none" }}
                />
                <div className="il-upload-zone">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="cf-btn"
                    style={{ justifyContent: "center" }}
                  >
                    📁 CSV·엑셀 파일 선택
                  </button>
                  {uploadFile && (
                    <span
                      className="il-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--text-default)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {uploadFile.name}
                    </span>
                  )}
                  <input
                    type="text"
                    className="cf-field"
                    value={uploadLabel}
                    disabled={uploading}
                    placeholder="표시 라벨 (미입력 시 파일명)"
                    maxLength={60}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={runUpload}
                    disabled={uploading || !uploadFile}
                    className="cf-btn cf-btn--primary"
                    style={{ justifyContent: "center" }}
                  >
                    {uploading ? "업로드 적재 중…" : "이 파일 업로드 적재"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 우측: 워크벤치 ─── */}
          <div style={{ minWidth: 0 }}>
            {err && (
              <div className="il-error" style={{ marginBottom: 16 }}>
                ⚠️ {err}
              </div>
            )}

            {/* 01 · PIPELINE — CSV→SQLite 4단계 노드 + 진행 터미널 */}
            <div className="il-card" style={{ marginBottom: 16 }}>
              <CardHeader
                num="01"
                title="GitHub CSV → SQLite"
                right={
                  <span className={`il-status il-status--${benchStatus}`}>
                    {benchStatus === "run"
                      ? "적재 중"
                      : benchStatus === "done"
                        ? "완료"
                        : "대기"}
                  </span>
                }
              />

              {/* 파이프라인 노드 행(시안 DataPipeline) */}
              <div className="il-pipe-row" style={{ marginBottom: 14 }}>
                {stages.map((s, i) => (
                  <div key={s.label} style={{ display: "contents" }}>
                    <PipeNode num={i + 1} stage={s} />
                    {i < stages.length - 1 && (
                      <div className="il-pipe-chev">›</div>
                    )}
                  </div>
                ))}
              </div>

              {log.length > 0 ? (
                <Terminal
                  title={`sqlite-load · ${curTable?.loaded ? curTable.table : domain}`}
                  lines={log}
                />
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-subtle)",
                    padding: "20px 0",
                    textAlign: "center",
                  }}
                >
                  좌측에서 도메인·상한을 고르고 <strong>적재 시작</strong> 을
                  누르면 진행 로그가 여기에 실시간으로 흐릅니다.
                </div>
              )}
            </div>

            {/* 02 · INVENTORY — 적재된 테이블 목록 */}
            <div className="il-card">
              <CardHeader
                num="02"
                title="적재된 테이블"
                right={
                  <span
                    className="il-mono"
                    style={{ fontSize: 11, color: "var(--text-subtle)" }}
                  >
                    {tables.filter((t) => t.loaded).length}/{tables.length}{" "}
                    loaded
                  </span>
                }
              />

              {tables.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                  아직 적재된 테이블이 없습니다. 좌측에서 적재하세요.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {tables.map((t) => (
                    <div
                      key={t.domain}
                      className="il-tbl-row"
                      data-loaded={t.loaded}
                    >
                      <span className="il-tbl-icon">🗄</span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "var(--text-default)",
                          }}
                        >
                          {t.label}
                        </div>
                        <div
                          className="il-mono"
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-subtle)",
                            marginTop: 1,
                          }}
                        >
                          {t.loaded ? t.table : "미적재 — CSV 적재 필요"}
                        </div>
                      </div>
                      {t.loaded ? (
                        <span className="il-ix-count">
                          {t.rowCount.toLocaleString()} 행
                        </span>
                      ) : (
                        <span className="il-status il-status--idle">
                          미적재
                        </span>
                      )}
                      {t.loaded ? (
                        <button
                          type="button"
                          className="cf-btn"
                          style={{
                            height: 28,
                            padding: "0 12px",
                            fontSize: 12,
                          }}
                          onClick={() => setConfirmDel(t.domain)}
                        >
                          초기화
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          style={{
                            height: 28,
                            padding: "0 12px",
                            fontSize: 12,
                          }}
                          onClick={() => {
                            setDomain(t.domain);
                            void runLoad();
                          }}
                          disabled={busy}
                        >
                          적재
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 테이블 초기화 확인 모달 (오클릭 방지 — 공통 ConfirmModal) */}
      {confirmDel && (
        <ConfirmModal
          title="테이블 초기화 확인"
          confirmLabel="초기화"
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => void dropDomain(confirmDel)}
        >
          <strong style={{ color: "var(--text-default)" }}>
            {DOMAINS.find((d) => d.id === confirmDel)?.label ?? confirmDel}
          </strong>{" "}
          테이블을 삭제합니다. Text-to-SQL 로 질의하려면 다시 적재해야 합니다.
          계속할까요?
        </ConfirmModal>
      )}

      {/* 데이터 미리보기 — 적재 전 CSV 앞 20행 표(시안 PreviewModal). */}
      {showPreview && (
        <PreviewModal
          title={cur?.label ?? domain}
          preview={preview}
          loading={previewLoading}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CardHeader — 워크벤치 카드 헤더(번호 라벨 + 제목 + 우측 상태/배지).
// ─────────────────────────────────────────────────────────────
function CardHeader({
  num,
  title,
  right,
}: {
  num: string;
  title: string;
  right?: ReactNode;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="il-bench-label">{num}</span>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--text-default)",
          }}
        >
          {title}
        </span>
      </div>
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PipeNode — 파이프라인 단일 노드(번호 + 라벨 + done ✓ + sub).
// ─────────────────────────────────────────────────────────────
function PipeNode({
  num,
  stage,
}: {
  num: number;
  stage: { label: string; sub: string; status: PipeStatus };
}): ReactNode {
  return (
    <div className="il-pipe-node" data-status={stage.status}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
        }}
      >
        <span className="il-pipe-num">{num}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {stage.label}
        </span>
        {stage.status === "done" && (
          <span style={{ color: "var(--lab-success-text)" }}>✓</span>
        )}
      </div>
      <div
        className="il-mono"
        style={{
          fontSize: 10.5,
          color: "var(--text-subtle)",
          marginLeft: 28,
        }}
      >
        {stage.sub}
      </div>
    </div>
  );
}

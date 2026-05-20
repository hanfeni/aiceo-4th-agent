"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CorpusModal, type CorpusDocItem } from "./CorpusModal";
import { pickFormat, extractTextFromFile } from "@/lib/files/extractText";

/**
 * 업로드 파일을 색인용 jsonl File 로 정규화한다.
 *  - .jsonl: 그대로(한 줄 = 한 JSON 문서, 서버 parseJsonl 이 처리).
 *  - pdf/docx/hwpx/txt 등: 클라이언트에서 텍스트 추출 → 문서 1건짜리
 *    jsonl({doc_id,title:"",body}) 로 감싸 동일 업로드 경로로 보낸다
 *    (서버 무변경 — search-lab/upload 가 .jsonl 만 받으므로).
 *
 * title 은 **빈 문자열**로 둔다 — 파일명은 의미 없을 수 있어(scan_001.pdf)
 * title BM25 가중(^3~^6)을 낭비한다. 서버 upload 가 title 빈 doc 을
 * gpt-5.4-nano 로 본문에서 추출해 채우고, 실패 시 파일명(doc_id)으로
 * 폴백한다. 파일명은 doc_id 로 보존(폴백·식별용).
 */
async function toIndexJsonlFile(file: File): Promise<File> {
  if (/\.jsonl$/i.test(file.name)) return file;
  const fmt = pickFormat(file.name);
  if (fmt === null) {
    throw new Error(
      `지원하지 않는 파일 형식입니다: ${file.name} ` +
        `(.jsonl / 텍스트 / .pdf / .docx / .hwpx 만 가능)`,
    );
  }
  const text = await extractTextFromFile(file);
  if (!text.trim()) {
    throw new Error(
      `${file.name} 에서 추출된 텍스트가 없습니다 ` +
        `(빈 문서이거나 이미지 기반 PDF 일 수 있습니다).`,
    );
  }
  const base = file.name.replace(/\.[^.]+$/, "");
  const doc = { doc_id: base, title: "", body: text };
  return new File([JSON.stringify(doc) + "\n"], `${base}.jsonl`, {
    type: "application/x-ndjson",
  });
}

/**
 * IndexLabView — 도메인 색인 실습 (검색 실습과 별도 메뉴).
 *
 * 기능(2026-05-19 사용자 추가):
 *  - 색인 파라미터 노출: Nori decompound_mode / 임베딩 모델 / 문서 수.
 *    문서 수는 원본 총 N개를 먼저 알려주고(corpus-count) 그 안에서 선택.
 *  - 색인된 인덱스 확인·삭제(실습용 searchlab-* 만, 삭제 전 확인 모달).
 * 흐름: 버튼 → ①GitHub raw 원격확인 → ②Docker·OS 확인 → ③없으면
 *   자동 실행 → ④토크나이징·임베딩·색인. 진행 SSE 실시간.
 * 디자인: cf-* 클래스(검색·라벨링 그룹 = blue). 버튼 우측 정렬.
 */

const DOMAINS = [
  { id: "sangkwon", label: "상권 / 소상공인", audience: "유통·소상공인" },
  { id: "medical", label: "의료 / 제약", audience: "의료·제약" },
  { id: "finance", label: "금융 / 연금 / 고용", audience: "금융·투자" },
  { id: "legal", label: "법률 / 법령", audience: "법률·규제" },
  { id: "policy", label: "정책 / 거버넌스", audience: "공공·정책" },
] as const;

const DECOMPOUND = [
  { id: "mixed", label: "mixed (복합어+원형 둘 다)" },
  { id: "discrete", label: "discrete (구성어만)" },
  { id: "none", label: "none (분해 안 함)" },
] as const;

const EMBED = [
  { id: "text-embedding-3-small", label: "3-small (1536d · 저렴)" },
  { id: "text-embedding-3-large", label: "3-large (3072d · 고품질)" },
] as const;

const DOC_COUNTS = [100, 300, 500, 1000] as const;

// 청크 옵션(토큰, cl100k). 0 = 청킹 안 함(디폴트 — 사용자 결정
// 2026-05-19: 청크 자체를 안 하는 게 기본). >0 면 토큰 단위 분할.
const CHUNK_SIZES = [
  { v: 0, label: "안 함 (문서=1벡터)" },
  { v: 200, label: "200토큰" },
  { v: 500, label: "500토큰" },
  { v: 1000, label: "1000토큰" },
  { v: 2000, label: "2000토큰" },
  { v: 5000, label: "5000토큰" },
] as const;
const CHUNK_OVERLAPS = [100, 200, 500, 1000] as const;

interface IndexInfo {
  index: string;
  domain?: string;
  label?: string;
  docCount: number;
}

/** custom 슬롯 고정 인덱스명(domains.ts CUSTOM_SEARCH_INDEX 와 동일). */
const CUSTOM_INDEX = "searchlab-custom";

const card: CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  marginBottom: 16,
};
const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-default)",
  marginBottom: 10,
};
const chipRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const btnRow: CSSProperties = {
  marginTop: 16,
  display: "flex",
  justifyContent: "flex-end", // 버튼 우측 정렬(사용자 요청)
};
const fieldLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-subtle)",
  marginBottom: 6,
};

export function IndexLabView(): ReactNode {
  const [domain, setDomain] = useState<string>("sangkwon");
  const [decompound, setDecompound] = useState<string>("mixed");
  const [embedModel, setEmbedModel] = useState<string>(
    "text-embedding-3-small",
  );
  const [limit, setLimit] = useState<number>(300);
  // 청크 옵션 — 디폴트 OFF(0). 사용자 결정 2026-05-19.
  const [chunkSize, setChunkSize] = useState<number>(0);
  const [chunkOverlap, setChunkOverlap] = useState<number>(100);
  const [total, setTotal] = useState<number | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexLog, setIndexLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [indices, setIndices] = useState<IndexInfo[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // 원본 문서 보기 모달(앞 50건 좌우 네비)
  const [showCorpus, setShowCorpus] = useState(false);
  const [corpusDocs, setCorpusDocs] = useState<CorpusDocItem[]>([]);
  const [corpusLoading, setCorpusLoading] = useState(false);
  // 로컬 jsonl 업로드(동적 custom 도메인) 상태.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // 색인된 custom 인덱스의 동적 라벨(indices API 의 custom 행). null =
  // 미색인(custom 도메인 칩·선택 숨김). 고정 5개 + (있으면) custom.
  const customRow = indices.find((ix) => ix.index === CUSTOM_INDEX);
  const customLabel = customRow?.label ?? null;
  const allDomains: { id: string; label: string; audience: string }[] =
    customLabel
      ? [
          ...DOMAINS,
          {
            id: "custom",
            label: customLabel,
            audience: "사용자 업로드",
          },
        ]
      : [...DOMAINS];

  // 도메인 선택 시 원본 총 개수 조회. setState 는 async 경계(await)
  // 뒤에서만 — effect 본문 동기 setState 금지(cascading render) 준수.
  // domain 바뀌면 이전 total 은 새 응답이 덮으므로 별도 초기화 불요.
  useEffect(() => {
    let alive = true;
    void (async () => {
      // custom 은 GitHub 원본이 없다(업로드 색인) — corpus-count 건너뜀.
      // setState 는 async 경계 뒤에서만(effect 동기 setState 금지 준수).
      if (domain === "custom") {
        await Promise.resolve();
        if (alive) setTotal(null);
        return;
      }
      try {
        const r = await fetch(
          `/api/search-lab/corpus-count?domain=${domain}`,
        );
        const d = await r.json();
        if (alive && typeof d.total === "number") setTotal(d.total);
      } catch {
        /* 무시 — total null 유지(조회 중 표시) */
      }
    })();
    return () => {
      alive = false;
    };
  }, [domain]);

  const loadIndices = useCallback(async () => {
    try {
      const r = await fetch("/api/search-lab/indices");
      const d = await r.json();
      setIndices(Array.isArray(d.indices) ? d.indices : []);
    } catch {
      setIndices([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetch("/api/search-lab/indices").catch(() => null);
      if (!alive || !r) return;
      const d = await r.json().catch(() => ({}));
      if (alive) setIndices(Array.isArray(d.indices) ? d.indices : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function openCorpus(): Promise<void> {
    setShowCorpus(true);
    setCorpusLoading(true);
    setCorpusDocs([]);
    try {
      const r = await fetch(
        `/api/search-lab/corpus?domain=${domain}&limit=50`,
      );
      const d = await r.json();
      if (r.ok && Array.isArray(d.items)) setCorpusDocs(d.items);
      else setErr(d.error ?? `원본 조회 실패 (HTTP ${r.status})`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setCorpusLoading(false);
    }
  }

  async function runIndex(): Promise<void> {
    if (indexing) return;
    setIndexing(true);
    setErr(null);
    setIndexLog([`▶ ${domain} 색인 시작… (limit ${limit})`]);
    try {
      const res = await fetch("/api/search-lab/index", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          limit,
          decompoundMode: decompound,
          embedModel,
          // 0 = 청킹 OFF(서버 chunkText 가 전체 1청크 = 기존 동작).
          chunkSize,
          ...(chunkSize > 0 ? { chunkOverlap } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `색인 실패 (HTTP ${res.status})`);
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
            setIndexLog((l) => [...l, `· GitHub fetch: ${ev.url}`]);
          else if (ev.type === "fetched")
            setIndexLog((l) => [...l, `· ${ev.total}건 수신`]);
          else if (ev.type === "infra")
            setIndexLog((l) => [...l, `· ${ev.text}`]);
          else if (ev.type === "infra_log")
            setIndexLog((l) => [...l, `    ${ev.text}`]);
          else if (ev.type === "infra_error")
            setIndexLog((l) => [...l, `  ⚠ ${ev.text}`]);
          else if (ev.type === "progress")
            setIndexLog((l) => [
              ...l.slice(0, -1).filter((x) => !x.startsWith("  ")),
              `  ${ev.indexed}/${ev.total} 색인 중…`,
            ]);
          else if (ev.type === "done")
            setIndexLog((l) => [
              ...l,
              `✓ 완료: ${ev.indexed}건 → 인덱스 ${ev.index}`,
            ]);
          else if (ev.type === "error") setErr(ev.message);
        }
      }
      await loadIndices(); // 색인 후 목록 갱신
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setIndexing(false);
    }
  }

  async function runUpload(): Promise<void> {
    if (uploading || !uploadFile) return;
    setUploading(true);
    setErr(null);
    setIndexLog([`▶ 로컬 문서 업로드 색인 시작… (${uploadFile.name})`]);
    try {
      // jsonl 외 포맷(pdf/docx/hwpx/txt)은 클라이언트에서 텍스트 추출 →
      // jsonl 1건으로 정규화. 추출 실패(암호화·이미지 PDF)는 여기서 throw.
      let jsonlFile: File;
      try {
        if (!/\.jsonl$/i.test(uploadFile.name)) {
          setIndexLog((l) => [...l, `· ${uploadFile.name} 텍스트 추출 중…`]);
        }
        jsonlFile = await toIndexJsonlFile(uploadFile);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "파일 추출 실패");
        return;
      }
      const fd = new FormData();
      fd.append("file", jsonlFile);
      if (uploadLabel.trim()) fd.append("label", uploadLabel.trim());
      // 위 ② 색인 파라미터를 그대로 적용(고정 도메인 색인과 동일 UX).
      fd.append("limit", String(limit));
      fd.append("decompoundMode", decompound);
      fd.append("embedModel", embedModel);
      fd.append("chunkSize", String(chunkSize));
      if (chunkSize > 0) fd.append("chunkOverlap", String(chunkOverlap));
      const res = await fetch("/api/search-lab/upload", {
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
            setIndexLog((l) => [...l, `· 업로드 문서 파싱·색인 준비`]);
          else if (ev.type === "fetched")
            setIndexLog((l) => [...l, `· ${ev.total}건 파싱`]);
          else if (ev.type === "infra")
            setIndexLog((l) => [...l, `· ${ev.text}`]);
          else if (ev.type === "infra_log")
            setIndexLog((l) => [...l, `    ${ev.text}`]);
          else if (ev.type === "infra_error")
            setIndexLog((l) => [...l, `  ⚠ ${ev.text}`]);
          else if (ev.type === "progress")
            setIndexLog((l) => [
              ...l.slice(0, -1).filter((x) => !x.startsWith("  ")),
              `  ${ev.indexed}/${ev.total} 색인 중…`,
            ]);
          else if (ev.type === "done")
            setIndexLog((l) => [
              ...l,
              `✓ 완료: ${ev.indexed}건 → 인덱스 ${ev.index} (검색·챗 드롭다운에 "내 데이터" 등장)`,
            ]);
          else if (ev.type === "error") setErr(ev.message);
        }
      }
      await loadIndices();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setUploading(false);
    }
  }

  async function deleteIndex(name: string): Promise<void> {
    setConfirmDel(null);
    try {
      const r = await fetch("/api/search-lab/indices", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: name }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? `삭제 실패 (HTTP ${r.status})`);
        return;
      }
      await loadIndices();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  return (
    <div
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text-default)",
            marginBottom: 4,
          }}
        >
          도메인 색인 — 검색 데이터 준비
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-subtle)",
            marginBottom: 20,
          }}
        >
          GitHub public 문서를 받아 OpenSearch 에 색인합니다(검색 전 1회).
          토크나이저·임베딩·문서 수를 골라 색인 방식을 비교해 보세요.
        </p>

        <div style={card}>
          <div style={sectionTitle}>① 색인할 도메인 선택</div>
          <div style={chipRow}>
            {allDomains.map((d) => (
              <button
                key={d.id}
                type="button"
                className="cf-pill"
                aria-pressed={domain === d.id}
                onClick={() => setDomain(d.id)}
                title={d.audience}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: "var(--text-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {domain === "custom" ? (
              <span>
                업로드 도메인 — 아래 ③ 에서 문서를 올려 색인합니다
                (GitHub 원본 없음).
              </span>
            ) : (
              <>
                <span>
                  원본 문서 총{" "}
                  <strong style={{ color: "var(--cf-soft-text)" }}>
                    {total === null
                      ? "조회 중…"
                      : `${total.toLocaleString()}개`}
                  </strong>
                  {total !== null &&
                    total < limit &&
                    " (선택 수보다 적어 전체 색인)"}
                </span>
                <button
                  type="button"
                  className="cf-btn"
                  style={{ height: 26, padding: "0 12px", fontSize: 11.5 }}
                  onClick={openCorpus}
                  disabled={total === null}
                >
                  문서 원본 보기
                </button>
              </>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={sectionTitle}>② 색인 파라미터</div>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 240px" }}>
              <div style={fieldLabel}>Nori 복합어 분해 (토크나이저)</div>
              <select
                className="cf-field cf-select"
                style={{ width: "100%" }}
                value={decompound}
                onChange={(e) => setDecompound(e.target.value)}
                disabled={indexing}
              >
                {DECOMPOUND.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <div style={fieldLabel}>임베딩 모델</div>
              <select
                className="cf-field cf-select"
                style={{ width: "100%" }}
                value={embedModel}
                onChange={(e) => setEmbedModel(e.target.value)}
                disabled={indexing}
              >
                {EMBED.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={fieldLabel}>색인할 문서 수 (상한)</div>
            <div style={chipRow}>
              {DOC_COUNTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="cf-pill"
                  aria-pressed={limit === c}
                  onClick={() => setLimit(c)}
                  disabled={indexing}
                >
                  {c.toLocaleString()}건
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={fieldLabel}>
              청크 크기 (토큰 · cl100k) — 기본은 청킹 안 함
            </div>
            <div style={chipRow}>
              {CHUNK_SIZES.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  className="cf-pill"
                  aria-pressed={chunkSize === c.v}
                  onClick={() => setChunkSize(c.v)}
                  disabled={indexing}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {chunkSize > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={fieldLabel}>청크 겹침 (overlap · 토큰)</div>
              <div style={chipRow}>
                {CHUNK_OVERLAPS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className="cf-pill"
                    aria-pressed={chunkOverlap === o}
                    onClick={() => setChunkOverlap(o)}
                    disabled={indexing}
                  >
                    {o}토큰
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 실행 버튼 — 설정 카드 밖 독립 줄(설정 ≠ 액션 시각 분리,
            사용자 요청). 우측 정렬 유지. custom 은 GitHub 색인 대상이
            아니라 업로드 색인(아래 ③) — 버튼 비활성. */}
        <div style={{ ...btnRow, marginBottom: 16 }}>
          <button
            type="button"
            onClick={runIndex}
            disabled={indexing || domain === "custom"}
            title={
              domain === "custom"
                ? "내 데이터(custom)는 아래 ③ 문서 업로드로 색인합니다"
                : undefined
            }
            className="cf-btn cf-btn--primary"
          >
            {indexing ? "색인 중…" : "이 도메인 색인 시작"}
          </button>
        </div>

        {/* 로컬 jsonl 업로드 — 동적 "내 데이터(custom)" 도메인 추가.
            고정 5개와 별개로 사용자가 직접 고른 jsonl 을 색인한다.
            색인 후 검색 실습·챗(인덱스검색 드롭다운)에 "내 데이터" 등장.
            위 ② 색인 파라미터(토크나이저·임베딩·청크·문서 수)가 함께
            적용된다. */}
        <div style={card}>
          <div style={sectionTitle}>③ 내 문서 업로드 (선택)</div>
          <div style={fieldLabel}>
            로컬 문서(<strong>PDF · Word(.docx) · 한글(.hwpx) · 텍스트</strong>{" "}
            또는 jsonl)를 올리면 6번째 “내 데이터” 도메인으로 OpenSearch 에
            색인되어, 검색 실습과 챗(인덱스검색 드롭다운)에서 바로 검색할 수
            있습니다. PDF·Word·한글은 본문 텍스트가 자동 추출되어 한 문서로
            색인되며, 문서 제목은 gpt-5.4-nano 가 본문에서 자동 추출합니다.
            위 ② 색인 파라미터가 함께 적용됩니다.
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {/* 네이티브 file input 은 숨기고(브라우저 기본 "파일 선택"
                글자가 작아 버튼처럼 안 보임 — 사용자 혼란), 명확한 버튼이
                트리거. 선택된 파일명은 옆에 표시. */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.pdf,.docx,.hwpx,.txt,.md,.csv,.json"
              disabled={uploading || indexing}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setUploadFile(f);
                if (f && !uploadLabel)
                  setUploadLabel(f.name.replace(/\.[^.]+$/, ""));
              }}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || indexing}
                className="cf-btn"
                style={{ flexShrink: 0 }}
              >
                📁 문서 파일 선택
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: uploadFile
                    ? "var(--text-default)"
                    : "var(--text-subtle)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {uploadFile ? uploadFile.name : "선택된 파일 없음"}
              </span>
            </div>
            <input
              type="text"
              value={uploadLabel}
              disabled={uploading || indexing}
              placeholder="표시 라벨 (예: 우리 회사 문서, 미입력 시 파일명)"
              maxLength={60}
              onChange={(e) => setUploadLabel(e.target.value)}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: "var(--r-md, 8px)",
                border: "1px solid var(--t-neutral-8)",
                background: "var(--surface-default)",
                color: "var(--text-default)",
                maxWidth: 360,
              }}
            />
          </div>
          <div style={btnRow}>
            <button
              type="button"
              onClick={runUpload}
              disabled={uploading || indexing || !uploadFile}
              className="cf-btn cf-btn--primary"
            >
              {uploading ? "업로드 색인 중…" : "이 문서 업로드 색인"}
            </button>
          </div>
        </div>

        {err && (
          <div
            style={{
              ...card,
              borderColor: "var(--t-danger-8, #e5484d)",
              color: "var(--t-danger-11, #e5484d)",
              fontSize: 12.5,
            }}
          >
            ⚠️ {err}
          </div>
        )}

        {indexLog.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>진행 상황</div>
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                fontSize: 11,
                lineHeight: 1.55,
                color: "var(--text-subtle)",
                background: "var(--cf-soft-bg)",
                borderRadius: "var(--r-md, 8px)",
                whiteSpace: "pre-wrap",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {indexLog.join("\n")}
            </pre>
          </div>
        )}

        <div style={card}>
          <div style={sectionTitle}>색인된 인덱스 (실습용)</div>
          {indices.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "var(--text-subtle)" }}
            >
              아직 색인된 실습 인덱스가 없습니다. 위에서 색인하세요.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {indices.map((ix) => (
                <div
                  key={ix.index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    border: "1px solid var(--t-neutral-8)",
                    borderRadius: "var(--r-md, 8px)",
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: "var(--text-default)" }}>
                    <strong>{ix.index}</strong>
                    <span
                      style={{
                        marginLeft: 8,
                        color: "var(--text-subtle)",
                      }}
                    >
                      {ix.docCount.toLocaleString()}건
                    </span>
                  </span>
                  <button
                    type="button"
                    className="cf-btn"
                    style={{ height: 28, padding: "0 12px", fontSize: 12 }}
                    onClick={() => setConfirmDel(ix.index)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 삭제 확인 모달 (오클릭 방지) */}
      {confirmDel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setConfirmDel(null)}
        >
          <div
            style={{
              ...card,
              maxWidth: 380,
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={sectionTitle}>인덱스 삭제 확인</div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-subtle)",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              <strong style={{ color: "var(--text-default)" }}>
                {confirmDel}
              </strong>{" "}
              인덱스를 삭제합니다. 검색하려면 다시 색인해야 합니다.
              계속할까요?
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="cf-btn"
                onClick={() => setConfirmDel(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                onClick={() => void deleteIndex(confirmDel)}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {showCorpus && (
        <CorpusModal
          domainLabel={
            allDomains.find((d) => d.id === domain)?.label ?? domain
          }
          docs={corpusDocs}
          loading={corpusLoading}
          onClose={() => setShowCorpus(false)}
        />
      )}
    </div>
  );
}

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
import {
  pickFormat,
  extractTextFromFile,
  extractPdfPages,
} from "@/lib/files/extractText";

/**
 * 업로드 파일을 색인용 jsonl File 로 정규화한다.
 *  - .jsonl: 그대로(한 줄 = 한 JSON 문서, 서버 parseJsonl 이 처리).
 *  - pdf: 페이지마다 jsonl 1줄(페이지=문서 1건). doc_id=파일명#p{N},
 *    page=N 메타 보존. 검색 정밀도↑·"몇 페이지" 추적(사용자 결정).
 *  - docx/hwpx/txt: 페이지 개념이 없어 문서 1건(기존 동작).
 *    각 줄은 {doc_id,title:"",body} — 서버가 title 빈 줄마다 nano 로
 *    제목 추출(PDF 는 페이지 수만큼 호출, 사용자 결정).
 *
 * title 은 **빈 문자열**로 둔다 — 파일명은 의미 없을 수 있어(scan_001.pdf)
 * title BM25 가중(^3~^6)을 낭비한다. 서버 upload 가 title 빈 doc 을
 * gpt-5.4-nano 로 본문에서 추출해 채우고, 실패 시 doc_id 로 폴백한다.
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
  const base = file.name.replace(/\.[^.]+$/, "");

  // PDF — 페이지 단위로 쪼개 페이지마다 문서 1건. 빈 페이지는 건너뜀
  // (이미지·표지). 전 페이지가 비면(스캔 PDF) throw.
  if (fmt === "pdf") {
    const pages = await extractPdfPages(file);
    const lines = pages
      .map((body, i) => ({ body: body.trim(), page: i + 1 }))
      .filter((p) => p.body.length > 0)
      .map((p) =>
        JSON.stringify({
          doc_id: `${base}#p${p.page}`,
          title: "",
          body: p.body,
          page: p.page,
        }),
      );
    if (lines.length === 0) {
      throw new Error(
        `${file.name} 에서 추출된 텍스트가 없습니다 ` +
          `(이미지 기반 스캔 PDF 일 수 있습니다).`,
      );
    }
    return new File([lines.join("\n") + "\n"], `${base}.jsonl`, {
      type: "application/x-ndjson",
    });
  }

  // docx/hwpx/텍스트 — 페이지 개념 없음 → 문서 1건.
  const text = await extractTextFromFile(file);
  if (!text.trim()) {
    throw new Error(
      `${file.name} 에서 추출된 텍스트가 없습니다 (빈 문서일 수 있습니다).`,
    );
  }
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

// embed 모델 → 인덱스명 약칭(서버 인덱스명 규칙과 동일: 3-small/3-large).
const EMBED_SHORT: Record<string, string> = {
  "text-embedding-3-small": "3small",
  "text-embedding-3-large": "3large",
};

// 진행 로그에서 "  N/M 색인 중…" 의 N·M 을 뽑아 진행률(%)·수치를 추론.
// done 라인이 있으면 100%. 시안 B 의 진행 메트릭·진행바 데이터원.
function parseProgress(log: string[]): {
  indexed: number | null;
  total: number | null;
  pct: number;
  done: boolean;
} {
  let indexed: number | null = null;
  let total: number | null = null;
  let done = false;
  for (const line of log) {
    const m = line.match(/(\d+)\s*\/\s*(\d+)\s*색인 중/);
    if (m) {
      indexed = Number(m[1]);
      total = Number(m[2]);
    }
    if (line.startsWith("✓")) done = true;
  }
  const pct =
    done && total ? 100 : indexed && total ? (indexed / total) * 100 : 0;
  return { indexed, total, pct: Math.min(100, pct), done };
}

// 삭제 확인 모달 카드(시안 ModalShell 톤).
const modalCard: CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--t-neutral-8)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  maxWidth: 380,
};
const chipRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };

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

  const cur = allDomains.find((d) => d.id === domain);
  const prog = parseProgress(indexLog);
  const embedDim = embedModel === "text-embedding-3-small" ? "1536" : "3072";
  // 시안 인덱스명 미리보기 — 서버 규칙(searchlab-<domain>-<decompound>-<embedShort>).
  const namePreview =
    domain === "custom"
      ? CUSTOM_INDEX
      : `searchlab-${domain}-${decompound}-${EMBED_SHORT[embedModel] ?? "3small"}`;
  const benchStatus = indexing || uploading ? "run" : prog.done ? "done" : "idle";

  return (
    <div
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 64px" }}>
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
            ① 검색 · 라벨링 실습
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
            도메인 색인
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
            좌측 패널에서 설정 → 워크벤치에서 실행·관찰. 실행마다 새 인덱스가
            인벤토리에 누적됩니다. GitHub public 문서를 받아 OpenSearch 에
            색인합니다.
          </p>
        </div>

        <div className="il-bench">
          {/* ─── 좌측: 설정 패널 (sticky) ─── */}
          <div className="il-bench-aside">
            <div className="il-card il-config">
              <div className="il-config-title">색인 파라미터</div>

              <div className="il-flabel">도메인</div>
              <select
                className="cf-field cf-select"
                style={{ width: "100%", marginBottom: 12 }}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={indexing || uploading}
              >
                {allDomains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                    {d.id !== "custom" && total !== null && domain === d.id
                      ? ` (${total.toLocaleString()}건)`
                      : ""}
                  </option>
                ))}
              </select>

              <div className="il-flabel">Nori 분해</div>
              <div style={{ ...chipRow, marginBottom: 12 }}>
                {DECOMPOUND.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="cf-pill"
                    aria-pressed={decompound === o.id}
                    onClick={() => setDecompound(o.id)}
                    disabled={indexing || uploading}
                    title={o.label}
                  >
                    <span className="il-mono" style={{ fontSize: 10.5 }}>
                      {o.id}
                    </span>
                  </button>
                ))}
              </div>

              <div className="il-flabel">임베딩</div>
              <div style={{ ...chipRow, marginBottom: 12 }}>
                {EMBED.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="cf-pill"
                    aria-pressed={embedModel === o.id}
                    onClick={() => setEmbedModel(o.id)}
                    disabled={indexing || uploading}
                    title={o.label}
                  >
                    <span className="il-mono" style={{ fontSize: 10.5 }}>
                      {o.id.replace("text-embedding-", "")}
                    </span>
                  </button>
                ))}
              </div>

              <div className="il-flabel">색인 문서 수 (상한)</div>
              <div style={{ ...chipRow, marginBottom: 12 }}>
                {DOC_COUNTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="cf-pill"
                    aria-pressed={limit === c}
                    onClick={() => setLimit(c)}
                    disabled={indexing || uploading}
                  >
                    <span className="il-mono">{c.toLocaleString()}</span>
                  </button>
                ))}
              </div>

              <div className="il-flabel">청크 크기 (토큰)</div>
              <div style={{ ...chipRow, marginBottom: chunkSize > 0 ? 12 : 16 }}>
                {CHUNK_SIZES.map((c) => (
                  <button
                    key={c.v}
                    type="button"
                    className="cf-pill"
                    aria-pressed={chunkSize === c.v}
                    onClick={() => setChunkSize(c.v)}
                    disabled={indexing || uploading}
                    title={c.label}
                  >
                    <span className="il-mono" style={{ fontWeight: 600 }}>
                      {c.v === 0 ? "안 함" : `${c.v}t`}
                    </span>
                  </button>
                ))}
              </div>

              {chunkSize > 0 && (
                <>
                  <div className="il-flabel">청크 겹침 (overlap · 토큰)</div>
                  <div style={{ ...chipRow, marginBottom: 16 }}>
                    {CHUNK_OVERLAPS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className="cf-pill"
                        aria-pressed={chunkOverlap === o}
                        onClick={() => setChunkOverlap(o)}
                        disabled={indexing || uploading}
                      >
                        <span className="il-mono">{o}t</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* 실행 + 원본 보기 — custom 은 GitHub 색인 비대상(업로드로). */}
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={runIndex}
                disabled={indexing || uploading || domain === "custom"}
                title={
                  domain === "custom"
                    ? "내 데이터(custom)는 아래 문서 업로드로 색인합니다"
                    : undefined
                }
              >
                {indexing ? "색인 중…" : "색인 시작"}
              </button>
              {domain !== "custom" && (
                <button
                  type="button"
                  className="cf-btn"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginTop: 6,
                  }}
                  onClick={openCorpus}
                  disabled={total === null || indexing || uploading}
                >
                  문서 원본 보기
                  {total !== null ? ` (${total.toLocaleString()})` : ""}
                </button>
              )}

              {/* 인덱스명 미리보기(시안) */}
              <div className="il-name-preview">
                인덱스명 미리보기
                <br />
                <code>{namePreview}</code>
                {domain !== "custom" &&
                  total !== null &&
                  total < limit && (
                    <div style={{ marginTop: 4 }}>
                      원본이 {total.toLocaleString()}건 — 선택 수보다 적어 전체
                      색인됩니다.
                    </div>
                  )}
              </div>

              {/* ③ 내 문서 업로드 — 좌측 패널 하단 접힘 영역(기능 보존).
                  PDF·Word·한글·텍스트·jsonl → "내 데이터" 도메인 색인. */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: "1px dashed var(--t-neutral-12)",
                }}
              >
                <div className="il-flabel">
                  내 문서 업로드 (선택)
                  <div className="il-flabel-hint">
                    PDF · Word · 한글 · 텍스트 · jsonl → “내 데이터” 도메인.
                    위 파라미터 함께 적용. 제목은 LLM 자동 추출.
                  </div>
                </div>
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
                <div className="il-upload-zone">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || indexing}
                    className="cf-btn"
                    style={{ justifyContent: "center" }}
                  >
                    📁 문서 파일 선택
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
                    disabled={uploading || indexing}
                    placeholder="표시 라벨 (미입력 시 파일명)"
                    maxLength={60}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={runUpload}
                    disabled={uploading || indexing || !uploadFile}
                    className="cf-btn cf-btn--primary"
                    style={{ justifyContent: "center" }}
                  >
                    {uploading ? "업로드 색인 중…" : "이 문서 업로드 색인"}
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

            {/* 01 · 현재 실행 — 진행 메트릭 + 진행바 + 터미널 로그 */}
            <div className="il-card" style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  gap: 12,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span className="il-bench-label">01</span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--text-default)",
                    }}
                  >
                    현재 실행
                  </span>
                </div>
                <span className={`il-status il-status--${benchStatus}`}>
                  {benchStatus === "run"
                    ? "색인 중"
                    : benchStatus === "done"
                      ? "완료"
                      : "대기"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <Metric label="목표" value={limit.toLocaleString()} unit="docs" />
                <Metric
                  label="진행"
                  value={prog.indexed != null ? prog.indexed.toLocaleString() : "—"}
                  unit={prog.total != null ? `/${prog.total}` : undefined}
                  highlight
                />
                <Metric label="임베딩 차원" value={embedDim} unit="d" />
                <Metric
                  label="청크"
                  value={chunkSize === 0 ? "OFF" : `${chunkSize}t`}
                />
              </div>

              <div className="il-progress" style={{ marginBottom: 14 }}>
                <div
                  className="il-progress-fill"
                  style={{ width: `${prog.pct}%` }}
                />
              </div>

              {indexLog.length > 0 ? (
                <Terminal title="opensearch-index · stream" lines={indexLog} />
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-subtle)",
                    padding: "20px 0",
                    textAlign: "center",
                  }}
                >
                  좌측에서 파라미터를 고르고 <strong>색인 시작</strong> 을
                  누르면 진행 로그가 여기에 실시간으로 흐릅니다.
                </div>
              )}
            </div>

            {/* 02 · 인덱스 인벤토리 */}
            <div className="il-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  gap: 12,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span className="il-bench-label">02</span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--text-default)",
                    }}
                  >
                    인덱스 인벤토리
                  </span>
                </div>
                <span
                  className="il-mono"
                  style={{ fontSize: 11, color: "var(--text-subtle)" }}
                >
                  {indices.length} indices
                </span>
              </div>

              {indices.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                  아직 색인된 실습 인덱스가 없습니다. 좌측에서 색인하세요.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {indices.map((ix) => (
                    <div key={ix.index} className="il-ix-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="il-ix-name">{ix.index}</div>
                        {ix.label && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--text-subtle)",
                              marginTop: 2,
                            }}
                          >
                            {ix.label}
                          </div>
                        )}
                      </div>
                      <span className="il-ix-count">
                        {ix.docCount.toLocaleString()} docs
                      </span>
                      <button
                        type="button"
                        className="cf-btn"
                        style={{
                          height: 28,
                          padding: "0 12px",
                          fontSize: 12,
                        }}
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
        </div>
      </div>

      {/* 삭제 확인 모달 (오클릭 방지) */}
      {confirmDel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setConfirmDel(null)}
        >
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 800,
                color: "var(--text-default)",
                marginBottom: 8,
              }}
            >
              인덱스 삭제 확인
            </div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-subtle)",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              <strong
                className="il-mono"
                style={{ color: "var(--text-default)" }}
              >
                {confirmDel}
              </strong>{" "}
              인덱스를 삭제합니다. 검색하려면 다시 색인해야 합니다. 계속할까요?
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
          domainLabel={cur?.label ?? domain}
          docs={corpusDocs}
          loading={corpusLoading}
          onClose={() => setShowCorpus(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Metric — 진행 메트릭 타일(시안 BenchMetric)
// ─────────────────────────────────────────────────────────────
function Metric({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}): ReactNode {
  return (
    <div className={highlight ? "il-metric il-metric--hl" : "il-metric"}>
      <div className="il-metric-label">{label}</div>
      <div className="il-metric-value">
        {value}
        {unit && <span className="il-metric-unit">{unit}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Terminal — 진행 로그 다크 터미널(시안 Terminal). 줄 prefix 로 색.
// ─────────────────────────────────────────────────────────────
function Terminal({
  lines,
  title,
}: {
  lines: string[];
  title?: string;
}): ReactNode {
  return (
    <div>
      {title && (
        <div className="il-term-bar">
          <span className="il-term-dot" style={{ background: "#ff5f57" }} />
          <span className="il-term-dot" style={{ background: "#febc2e" }} />
          <span className="il-term-dot" style={{ background: "#28c840" }} />
          <span
            className="il-mono"
            style={{
              marginLeft: 8,
              fontSize: 10.5,
              color: "var(--lab-term-dim)",
            }}
          >
            {title}
          </span>
        </div>
      )}
      <pre className="il-term">
        {lines.map((l, i) => (
          <TermLine key={i} line={l} />
        ))}
        {lines.length > 0 && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 13,
              background: "var(--lab-term-accent)",
              verticalAlign: "middle",
              animation: "ilPulse 1s infinite",
            }}
          />
        )}
      </pre>
    </div>
  );
}

function TermLine({ line }: { line: string }): ReactNode {
  let color = "var(--lab-term-fg)";
  if (line.startsWith("✓")) color = "var(--lab-term-success)";
  else if (line.includes("⚠")) color = "var(--lab-term-warn)";
  else if (line.startsWith("▶") || line.startsWith("·"))
    color = "var(--lab-term-accent)";
  else if (line.startsWith(" ")) color = "var(--lab-term-dim)";
  return <div style={{ color, whiteSpace: "pre" }}>{line}</div>;
}

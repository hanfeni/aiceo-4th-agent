"use client";

import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { IndexDocsModal } from "@/components/search-lab/IndexDocsModal";
import { PreviewModal, type Preview } from "@/components/data-load/PreviewModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import {
  mergeStores,
  type StoreItem,
  type RawIndexInfo,
  type RawTableInfo,
} from "@/lib/store-explorer/merge";

/**
 * StoreExplorerView — 저장소 탐색기 (OpenSearch 색인 + SQLite 테이블).
 *
 * 3단계 드릴다운:
 *  1) 목록  : 두 저장소 항목을 종류별 섹션으로(merge.ts 통합 뷰모델)
 *  2) 문서/행: 항목 클릭 → 상세 모달
 *       - OpenSearch → IndexDocsModal(domain 넘기면 스스로 색인 문서 fetch)
 *       - SQLite     → /api/sql-lab/rows 로 행 fetch → PreviewModal 표
 *  3) 상세  : 모달 내부에서 문서 1건 ◀N/M▶ / 행 표 열람
 *
 * 백엔드 신규 0: 기존 API·모달 재사용. 한쪽 저장소 fetch 실패해도
 * 다른 쪽은 렌더(mergeStores graceful). 삭제는 기존 DELETE 엔드포인트.
 * 디자인: 검색·라벨링 그룹 blue 토큰(il-* / cf-* 클래스) — DataLoadView 정합.
 */

interface FetchState {
  /** OpenSearch 인덱스 목록 fetch 결과(실패 시 undefined → 섹션 안내). */
  indices?: RawIndexInfo[];
  /** SQLite 테이블 목록 fetch 결과. */
  tables?: RawTableInfo[];
  /** 저장소별 비치명적 경고(미기동 등) — 섹션 헤더 옆 표시. */
  indicesNote?: string;
  tablesNote?: string;
}

/** 상세로 열린 항목 + (SQLite 의 경우) 미리 받아온 행 데이터. */
interface DetailState {
  item: StoreItem;
  preview?: Preview | null;
  previewLoading?: boolean;
}

export function StoreExplorerView(): ReactNode {
  const [state, setState] = useState<FetchState>({});
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [confirmDel, setConfirmDel] = useState<StoreItem | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * 두 목록 API 를 독립 fetch — 한쪽 실패가 다른 쪽을 막지 않음(R1).
   * setLoading(true) 를 본문 맨 앞에 두지 않는다 — effect 에서 동기
   * setState 금지 룰(react-hooks/set-state-in-effect). 초기 로딩은
   * useState(true) 기본값으로, 재호출(삭제 후)은 await 경계 뒤 갱신.
   */
  const reload = useCallback(async () => {
    const next: FetchState = {};
    // OpenSearch 인덱스
    try {
      const r = await fetch("/api/search-lab/indices");
      const j = (await r.json()) as { indices?: RawIndexInfo[]; error?: string };
      next.indices = j.indices ?? [];
      if (!r.ok && j.error) next.indicesNote = j.error;
    } catch {
      next.indicesNote = "OpenSearch 미기동 — ./run-opensearch.sh 먼저 실행";
    }
    // SQLite 테이블
    try {
      const r = await fetch("/api/sql-lab/tables");
      const j = (await r.json()) as { tables?: RawTableInfo[]; error?: string };
      next.tables = j.tables ?? [];
      if (!r.ok && j.error) next.tablesNote = j.error;
    } catch {
      next.tablesNote = "테이블 목록 조회 실패";
    }
    setState(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await reload();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  const items = mergeStores(state.indices, state.tables);
  const osItems = items.filter((i) => i.kind === "opensearch");
  const sqlItems = items.filter((i) => i.kind === "sqlite");

  /** 항목 클릭 → 상세. SQLite 는 행을 먼저 받아 PreviewModal 에 채운다. */
  const openDetail = useCallback(async (item: StoreItem) => {
    if (!item.drillable || !item.domain) return;
    if (item.kind === "opensearch") {
      // IndexDocsModal 이 domain 으로 스스로 색인 문서를 fetch.
      setDetail({ item });
      return;
    }
    // SQLite — /api/sql-lab/rows 로 앞 N행 받아 PreviewModal 표로.
    setDetail({ item, preview: null, previewLoading: true });
    try {
      const r = await fetch(
        `/api/sql-lab/rows?domain=${encodeURIComponent(item.domain)}&rows=50`,
      );
      const j = (await r.json()) as {
        loaded?: boolean;
        columns?: string[];
        rows?: string[][];
        totalNote?: string;
      };
      const preview: Preview | null =
        j.loaded && j.columns
          ? { columns: j.columns, rows: j.rows ?? [], totalNote: j.totalNote ?? "" }
          : null;
      setDetail({ item, preview, previewLoading: false });
    } catch {
      setDetail({ item, preview: null, previewLoading: false });
    }
  }, []);

  /** 삭제 — 저장소별 DELETE 엔드포인트. 성공 시 목록 갱신. */
  const doDelete = useCallback(
    async (item: StoreItem) => {
      setBusy(true);
      try {
        if (item.kind === "opensearch") {
          await fetch("/api/search-lab/indices", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ index: item.storeId }),
          });
        } else {
          await fetch("/api/sql-lab/tables", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ domain: item.domain }),
          });
        }
      } finally {
        setBusy(false);
        setConfirmDel(null);
        await reload();
      }
    },
    [reload],
  );

  return (
    <div
      className="thin-scroll"
      style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 24px 64px" }}>
        {/* 헤더 — DataLoadView 와 동일 톤(blue accent 칩 + 타이틀). */}
        <div style={{ marginBottom: 24 }}>
          <span style={accentChip}>② 검색 · 라벨링 실습</span>
          <h1 style={pageTitle}>저장소 탐색기</h1>
          <p style={pageSub}>
            앱이 보유한 모든 내부 저장소를 한곳에서 들여다봅니다. 색인(OpenSearch)과
            적재 테이블(SQLite)의 목록 → 항목을 누르면 문서/행 → 다시 누르면 실제
            데이터까지 단계별로 확인할 수 있습니다.
          </p>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
            저장소 목록을 불러오는 중…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <StoreSection
              title="OpenSearch 색인"
              hint="searchlab-* · 문서 검색·RAG 색인"
              count={osItems.length}
              note={state.indicesNote}
              icon="🔍"
              kindWord="문서"
              items={osItems}
              onOpen={openDetail}
              onDelete={setConfirmDel}
            />
            <StoreSection
              title="SQLite 테이블"
              hint="sqllab_* · Text-to-SQL 적재 데이터"
              count={sqlItems.length}
              note={state.tablesNote}
              icon="🗄"
              kindWord="행"
              items={sqlItems}
              onOpen={openDetail}
              onDelete={setConfirmDel}
            />
          </div>
        )}
      </div>

      {/* 상세 — OpenSearch 는 IndexDocsModal(자체 fetch), SQLite 는
          미리 받은 preview 를 PreviewModal 에 전달. */}
      {detail?.item.kind === "opensearch" && detail.item.domain && (
        <IndexDocsModal
          key={detail.item.domain}
          domain={detail.item.domain}
          domainLabel={detail.item.label}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.item.kind === "sqlite" && (
        <PreviewModal
          title={`${detail.item.label} — 적재 데이터`}
          preview={detail.preview ?? null}
          loading={!!detail.previewLoading}
          sourceNote={`적재된 SQLite 테이블 조회 (${detail.item.storeId})`}
          unit="테이블"
          onClose={() => setDetail(null)}
        />
      )}

      {/* 삭제 확인 — 파괴적 작업(ConfirmModal 재사용). */}
      {confirmDel && (
        <ConfirmModal
          title={confirmDel.kind === "opensearch" ? "인덱스 삭제" : "테이블 초기화"}
          confirmLabel={busy ? "처리 중…" : confirmDel.kind === "opensearch" ? "삭제" : "초기화"}
          onConfirm={() => void doDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        >
          <strong>{confirmDel.label}</strong>(
          <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
            {confirmDel.storeId}
          </span>
          ) 의 {confirmDel.kind === "opensearch" ? "색인" : "적재 테이블"}을 삭제합니다.
          이 작업은 되돌릴 수 없으며, 다시 사용하려면 색인/적재를 다시 해야 합니다.
        </ConfirmModal>
      )}
    </div>
  );
}

/** 저장소 종류별 섹션(목록). 빈 상태·미기동 안내 포함. */
function StoreSection({
  title,
  hint,
  count,
  note,
  icon,
  kindWord,
  items,
  onOpen,
  onDelete,
}: {
  title: string;
  hint: string;
  count: number;
  note?: string;
  icon: string;
  /** 카운트 단위(문서/행) — "300 문서" 식 표기. */
  kindWord: string;
  items: StoreItem[];
  onOpen: (item: StoreItem) => void;
  onDelete: (item: StoreItem) => void;
}): ReactNode {
  return (
    <div className="il-card">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-default)" }}>
            {icon} {title}
          </div>
          <div className="il-mono" style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 2 }}>
            {hint}
          </div>
        </div>
        <span className="il-mono" style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          {count}개
        </span>
      </div>

      {note ? (
        <div className="il-error" style={{ fontSize: 12 }}>
          {note}
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          아직 비어 있습니다 — 도메인 색인/데이터 적재 메뉴에서 먼저 만드세요.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={`${it.kind}:${it.storeId}`} className="il-tbl-row" data-loaded={true}>
              <span className="il-tbl-icon">{icon}</span>
              <button
                type="button"
                onClick={() => onOpen(it)}
                disabled={!it.drillable}
                title={it.drillable ? "데이터 보기" : "도메인 매핑이 없어 열람할 수 없습니다"}
                style={{
                  ...rowMainBtn,
                  cursor: it.drillable ? "pointer" : "not-allowed",
                  opacity: it.drillable ? 1 : 0.55,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-default)" }}>
                  {it.label}
                </div>
                <div
                  className="il-mono"
                  style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 1 }}
                >
                  {it.storeId}
                </div>
              </button>
              <span className="il-ix-count">
                {it.count.toLocaleString()} {kindWord}
              </span>
              <button
                type="button"
                className="cf-btn"
                style={{ height: 28, padding: "0 12px", fontSize: 12 }}
                onClick={() => onDelete(it)}
              >
                {it.kind === "opensearch" ? "삭제" : "초기화"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 헤더 토큰(DataLoadView 1:1) ──────────────────────────
const accentChip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "var(--blue-600)",
  textTransform: "uppercase",
  background: "var(--lab-blue-bg-2)",
  padding: "3px 8px",
  borderRadius: 4,
};
const pageTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: "var(--text-default)",
  margin: "8px 0 0",
  letterSpacing: "-0.015em",
};
const pageSub: CSSProperties = {
  fontSize: 13,
  color: "var(--text-subtle)",
  margin: "6px 0 0",
  lineHeight: 1.55,
  maxWidth: 680,
};
/** 행 좌측 메인(라벨+id) 클릭 영역 — 투명 버튼(목록 클릭=상세 진입). */
const rowMainBtn: CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: 0,
};

"use client";

import { useCallback } from "react";
import { useChatStoreApi } from "@/store";
import type { ChatMessage } from "@/types";

/**
 * useChat — 사용자 입력 검증 + 첨부 준비 → store.startStream 위임.
 *
 * SSE fetch+소비 루프는 store 싱글톤(startStream)으로 이사했다(메뉴
 * 이동 지속의 핵심 — 컴포넌트 언마운트와 무관하게 store 클로저에서
 * 끝까지 돈다). 이 훅에 남는 책임은 **컴포넌트 맥락이 필요한 부분**
 * 뿐이다:
 *   - AD-4(client): 빈/공백 입력 + 첨부 없으면 무동작(불필요 fetch 0).
 *   - 첨부 추출/이미지 변환: @/lib/files 동적 import(prod 번들 제외 —
 *     D1). store 는 파일/LLM 비의존 원칙이라 이 준비는 여기 남는다.
 * 준비가 끝나면 store.startStream(이미 준비된 입력) 으로 넘긴다.
 *
 * 중복 가드·메시지 추가·SSE 루프·finalize 는 전부 startStream 안에서
 * 원자적으로 처리된다(이전엔 이 훅에 흩어져 있었음 — 단일 진실로 이동).
 */

export interface UseChatApi {
  /**
   * 사용자 입력을 전송한다. trim 후 빈 값이면(첨부도 없으면) 무동작.
   * files: 첨부. 이미지는 base64 data URL 로 images, 텍스트/PDF/DOCX
   * 는 추출 텍스트를 query 에 합쳐 보낸다(백엔드 무변경).
   */
  send: (input: string, files?: File[]) => Promise<void>;
}

export function useChat(): UseChatApi {
  // 현재 컨텍스트의 store(워크스페이스 격리 또는 전역 /chat). Provider
  // 없는 /chat 은 전역 싱글톤을 받아 종전과 동일(회귀 0).
  const storeApi = useChatStoreApi();
  const send = useCallback(
    async (input: string, files?: File[]): Promise<void> => {
      const trimmed = input.trim();
      const hasFiles = !!files && files.length > 0;
      // AD-4(client) — 빈 입력 + 첨부 없으면 무동작. 첨부만 있으면 허용.
      if (trimmed.length === 0 && !hasFiles) return;

      const store = storeApi.getState();
      // 중복 전송 가드는 startStream 이 단일 진실로 수행하지만, 첨부
      // 추출(비용 큰 동적 import)을 진행 중에 헛돌리지 않도록 여기서도
      // 조기 차단한다(빠른 경로 — 동작 동일, 불필요 작업 0).
      if (store.isStreaming) return;

      // 첨부 처리(startStream 호출 전 — E3: 추출 실패 시 빈 버블 0).
      // extractText/prepareAttachments 는 동적 import(prod 번들 제외 D1).
      let query = trimmed;
      let images: string[] | undefined;
      const attachMeta: NonNullable<ChatMessage["attachments"]> = [];
      if (hasFiles) {
        try {
          const { classifyAttachment, fileToDataUrl } = await import(
            "@/lib/files/prepareAttachments"
          );
          const imgUrls: string[] = [];
          const extracted: string[] = [];
          for (const f of files!) {
            const kind = classifyAttachment(f);
            if (kind === "image") {
              const dataUrl = await fileToDataUrl(f);
              imgUrls.push(dataUrl);
              // 변환한 base64 를 썸네일용으로 재사용(추가 비용 0 — I1).
              attachMeta.push({ name: f.name, kind: "image", dataUrl });
            } else if (kind === "text") {
              const { extractTextFromFile } = await import(
                "@/lib/files/extractText"
              );
              const text = await extractTextFromFile(f);
              extracted.push(`--- ${f.name} ---\n${text}`);
              attachMeta.push({ name: f.name, kind: "text" });
            } else {
              throw new Error(`지원하지 않는 첨부: ${f.name}`);
            }
          }
          if (extracted.length > 0) {
            query = [query, ...extracted]
              .filter((s) => s.length > 0)
              .join("\n\n");
          }
          if (imgUrls.length > 0) images = imgUrls;
        } catch (e) {
          // E3 — 추출/변환 실패는 표면화하고 전송 중단(좀비 0).
          store.setError(
            e instanceof Error ? e.message : "첨부 처리에 실패했습니다.",
          );
          return;
        }
      }

      // 준비 완료 → SSE 소비는 store 싱글톤에 위임(컴포넌트 무관 지속).
      // displayContent=원문(버블), query=추출 합본(서버). 둘 다 보존.
      await store.startStream({
        query,
        displayContent: trimmed,
        ...(images ? { images } : {}),
        ...(attachMeta.length > 0 ? { attachments: attachMeta } : {}),
      });
    },
    [storeApi],
  );

  return { send };
}

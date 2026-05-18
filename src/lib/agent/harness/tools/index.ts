import type { StructuredToolInterface } from "@langchain/core/tools";
import { currentTimeTool } from "./exampleTool";

/**
 * H4 커스텀 도구 등록 지점 (requirements.md 디렉토리 원칙의 re-export
 * 허용 예외 — 등록 지점에만 허용).
 *
 * 새 도구 추가 절차 (요소 추가·제거 용이 — FR-08):
 *   1. harness/tools/<myTool>.ts 작성 (langchain `tool()` 형태, zod ^4)
 *   2. 아래 HARNESS_TOOLS 배열에 import 후 1줄 추가
 *   3. 그 외 파일 변경 0 (agent.ts/route.ts 무수정 — R2/NFR-6)
 *
 * 외부 의존 도구(웹검색·코드실행 등)는 "슬롯만 마련, 등록은 후속":
 * 모듈 파일은 만들되 운영 정책 확정 전엔 이 배열에 등록하지 않는다.
 *
 * 배열을 [] 로 비워도 빌드·기동·기본 채팅이 정상이어야 한다 (AC-4).
 */
export const HARNESS_TOOLS: StructuredToolInterface[] = [currentTimeTool];

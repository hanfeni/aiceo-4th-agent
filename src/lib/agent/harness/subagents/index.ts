import type { SubagentSpec } from "@/types";
import { webSearcherSubagent } from "./webSearcher";

/**
 * H2-b Subagent 등록 지점 (스펙 디렉토리 원칙의 re-export 허용 예외).
 *
 * 새 subagent 추가 절차 (요소 추가·제거 용이 — FR-08):
 *   1. harness/subagents/<mySubagent>.ts 에 SubagentSpec 정의
 *      ({ name, description, systemPrompt })
 *   2. 아래 HARNESS_SUBAGENTS 배열에 import 후 1줄 추가
 *   3. 그 외 파일 변경 0 (agent.ts/route.ts 무수정 — R2/NFR-6)
 *
 * 초기 범위: 빈 배열 (HARNESS_SUBAGENTS=false 기본). 배열을 [] 로 둬도
 * 빌드·기동·기본 채팅이 정상이어야 한다 (AC-4). 단일 에이전트로 동작.
 *
 * 실측 주의 (AD-6-2): SubAgentMiddleware 는 deepagents REQUIRED 라
 * task 스캐폴딩 자체는 항상 존재한다. 이 배열을 비우고 GP subagent 를
 * 끄는(off) 변환은 Slice 5 buildAgentOptions.ts 가 흡수한다.
 */
export const HARNESS_SUBAGENTS: SubagentSpec[] = [webSearcherSubagent];

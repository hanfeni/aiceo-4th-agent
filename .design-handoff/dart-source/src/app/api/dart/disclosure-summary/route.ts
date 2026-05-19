/**
 * DART 공시 AI 요약 API (스트리밍)
 * GET /api/dart/disclosure-summary?rceptNo={rceptNo}
 *
 * Gemini 2.5 Flash Lite 모델로 공시 내용을 스트리밍 요약
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/core/auth';
import { extractDisclosureFullText } from '@/lib/services/dart/disclosure-parser.service';
import { generateTextStream } from '@/lib/external/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 인증 확인
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 파라미터 확인
  const rceptNo = req.nextUrl.searchParams.get('rceptNo');
  if (!rceptNo) {
    return new Response(JSON.stringify({ error: 'rceptNo parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 공시 전체 텍스트 추출
    const extraction = await extractDisclosureFullText(rceptNo);

    if (!extraction.success || !extraction.text) {
      return new Response(
        JSON.stringify({ error: extraction.error || '공시 텍스트 추출 실패' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 텍스트가 너무 짧으면 요약 불필요
    if (extraction.charCount < 500) {
      return new Response(
        JSON.stringify({ error: '공시 내용이 너무 짧아 요약할 수 없습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 요약 프롬프트 생성
    const systemPrompt = `당신은 기업 공시 문서 분석 전문가입니다.
사용자가 제공하는 DART 공시 문서를 분석하여 핵심 내용을 요약해주세요.

## 요약 지침:
1. **핵심 정보 우선**: 재무 수치, 주요 변동사항, 경영 현황 등 중요한 정보를 먼저 요약
2. **구조화된 출력**: 마크다운 형식으로 섹션별로 정리
3. **숫자 정확성**: 매출액, 자산, 부채, 이익 등 재무 수치는 정확히 기재
4. **간결성**: 불필요한 수식어 없이 핵심만 전달
5. **한국어 사용**: 모든 내용은 한국어로 작성

## 출력 형식:
### 📋 문서 개요
(문서 유형, 대상 기간, 회사명 등)

### 💰 주요 재무 정보
(매출, 영업이익, 자산, 부채 등 핵심 수치)

### 📌 핵심 요약
(3-5개 bullet point로 핵심 내용)

### 📝 상세 내용
(섹션별 주요 내용 정리)`;

    const userPrompt = `다음 DART 공시 문서를 요약해주세요.

문서명: ${extraction.documentName || '공시 문서'}
접수번호: ${rceptNo}
원문 길이: ${extraction.charCount.toLocaleString()}자

---
${extraction.text}
---

위 공시 내용을 분석하여 요약해주세요.`;

    // SSE 스트림 생성
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          const generator = generateTextStream(userPrompt, systemPrompt, {
            model: 'gemini-2.5-flash-lite',
            temperature: 0.3,
          });

          for await (const chunk of generator) {
            if (typeof chunk === 'string') {
              // 텍스트 청크 전송
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
            } else if (chunk.type === 'usage') {
              // 토큰 사용량 메타데이터 전송
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ usage: chunk })}\n\n`)
              );
            }
          }

          // 완료 신호
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          console.error('[disclosure-summary] Stream error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Stream error' })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[disclosure-summary] API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to generate summary',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * DART 공시 섹션 AI 요약 API (스트리밍)
 * GET /api/dart/disclosure-section-summary?rceptNo={rceptNo}&tocId={tocId}
 *
 * 특정 섹션(목차 항목)만 Gemini 2.5 Flash Lite로 스트리밍 요약
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/core/auth';
import { getSectionContent } from '@/lib/services/dart/disclosure-parser.service';
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
  const tocId = req.nextUrl.searchParams.get('tocId');

  if (!rceptNo) {
    return new Response(JSON.stringify({ error: 'rceptNo parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!tocId) {
    return new Response(JSON.stringify({ error: 'tocId parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 섹션 내용 조회
    const sectionContent = await getSectionContent(rceptNo, tocId);

    if (sectionContent.error) {
      return new Response(
        JSON.stringify({ error: sectionContent.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 섹션 텍스트 조합
    const sectionTitle = sectionContent.title || '섹션';
    const paragraphs = sectionContent.paragraphs?.join('\n\n') || '';
    const tables = sectionContent.tables?.map((table, idx) => {
      const rows = table.rows.map(row =>
        row.map(cell => cell.content).join(' | ')
      ).join('\n');
      return `[표 ${idx + 1}]\n${rows}`;
    }).join('\n\n') || '';

    const sectionText = `${paragraphs}\n\n${tables}`.trim();

    if (!sectionText || sectionText.length < 50) {
      return new Response(
        JSON.stringify({ error: '요약할 내용이 충분하지 않습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 요약 프롬프트 생성
    const systemPrompt = `당신은 기업 공시 문서 분석 전문가입니다.
사용자가 제공하는 DART 공시 문서의 특정 섹션을 분석하여 핵심 내용을 요약해주세요.

## 요약 지침:
1. **핵심 정보 추출**: 해당 섹션의 주요 내용을 간결하게 정리
2. **숫자 정확성**: 재무 수치, 날짜, 비율 등은 정확히 기재
3. **구조화된 출력**: 마크다운 형식으로 bullet point 위주로 정리
4. **간결성**: 불필요한 수식어 없이 핵심만 전달
5. **한국어 사용**: 모든 내용은 한국어로 작성

## 출력 형식:
- 주요 내용을 3-7개 bullet point로 정리
- 중요한 수치나 날짜가 있으면 반드시 포함
- 표 데이터가 있으면 핵심 항목만 요약`;

    const userPrompt = `다음은 DART 공시 문서의 "${sectionTitle}" 섹션입니다.
이 섹션의 핵심 내용을 요약해주세요.

---
${sectionText}
---

위 내용을 분석하여 핵심만 요약해주세요.`;

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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
            } else if (chunk.type === 'usage') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ usage: chunk })}\n\n`)
              );
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          console.error('[disclosure-section-summary] Stream error:', error);
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
    console.error('[disclosure-section-summary] API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to generate section summary',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

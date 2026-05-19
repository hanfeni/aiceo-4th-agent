/**
 * DART AI 분석 API
 * POST /api/dart/analysis
 * GET /api/dart/analysis/stream (SSE)
 * Agent 4 전용
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/core/auth';
import {
  getCompanyOverview,
  getMultiYearFinancialSummary,
  getEmployees,
  getMajorShareholders,
  extractWorkforceSummary,
} from '@/lib/services/dart/dart-api.service';
import { analyzeCompany, analyzeCompanyStream } from '@/lib/services/dart/analysis.service';
import type { ReportCode } from '@/types/dart';

export async function POST(req: NextRequest) {
  // 인증 확인
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { corpCode, streaming } = body;

    if (!corpCode) {
      return NextResponse.json(
        { error: 'corpCode is required' },
        { status: 400 }
      );
    }

    // 기업 정보 조회
    const companyInfo = await getCompanyOverview(corpCode);
    if (!companyInfo) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // 재무 데이터 조회
    const financialSummaries = await getMultiYearFinancialSummary(corpCode, 5);

    // 인력 데이터 조회
    const currentYear = new Date().getFullYear();
    const lastYear = String(currentYear - 1);
    const employees = await getEmployees(corpCode, lastYear, '11011' as ReportCode);
    const workforceSummary = employees.length > 0
      ? extractWorkforceSummary(employees, parseInt(lastYear, 10))
      : undefined;

    // 주주 데이터 조회
    const shareholders = await getMajorShareholders(corpCode, lastYear, '11011' as ReportCode);

    // 스트리밍 모드
    if (streaming) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const generator = analyzeCompanyStream({
              companyInfo,
              financialSummaries,
              workforceSummary,
              shareholders,
            });

            for await (const chunk of generator) {
              const data = `data: ${JSON.stringify({ content: chunk })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            const errorData = `data: ${JSON.stringify({ error: String(error) })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 일반 모드
    const analysis = await analyzeCompany({
      companyInfo,
      financialSummaries,
      workforceSummary,
      shareholders,
    });

    return NextResponse.json({
      success: true,
      data: analysis,
      companyName: companyInfo.corpName,
    });
  } catch (error) {
    console.error('Analysis error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
      },
      { status: 500 }
    );
  }
}

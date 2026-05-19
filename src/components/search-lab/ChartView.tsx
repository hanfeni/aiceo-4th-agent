"use client";

import { type ReactNode, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ChartSpec } from "@/lib/sqllab/text2sqlChart";

/**
 * ChartView — 검증된 ChartSpec + 결과 rows 를 Recharts 로 렌더.
 *
 * 백엔드 assertChartSpec 이 chartType 화이트리스트 + x/y 컬럼
 * 대조를 끝낸 스펙만 들어온다(여기선 재검증 안 함 — 단일 책임).
 * 전 컬럼 TEXT 저장이라 y 값은 Number() 캐스팅 + NaN 행 필터
 * (차트가 안 그려지는 가장 흔한 원인 — 문자열 숫자).
 *
 * recharts 는 클라이언트 전용(window 의존) → "use client" +
 * ResponsiveContainer. SearchLabView 에서 일반 import 해도 이
 * 파일이 client 라 SSR 평가 안 됨(부모도 "use client").
 */

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export interface ChartViewProps {
  spec: ChartSpec;
  columns: string[];
  rows: unknown[][];
}

export function ChartView({
  spec,
  columns,
  rows,
}: ChartViewProps): ReactNode {
  // rows(배열) → Recharts 용 객체배열. y 컬럼은 숫자 캐스팅,
  // 캐스팅 실패(NaN)면 그 행 제외(부분 결측 허용).
  const data = useMemo(() => {
    const xi = columns.indexOf(spec.x);
    const yis = spec.y.map((c) => columns.indexOf(c));
    return rows
      .map((r) => {
        const o: Record<string, unknown> = { [spec.x]: r[xi] };
        let ok = false;
        spec.y.forEach((yc, k) => {
          const n = Number(r[yis[k]]);
          o[yc] = Number.isFinite(n) ? n : null;
          if (Number.isFinite(n)) ok = true;
        });
        return ok ? o : null;
      })
      .filter((v): v is Record<string, unknown> => v !== null);
  }, [spec, columns, rows]);

  if (data.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        차트로 그릴 수치 데이터가 없습니다(값 컬럼이 숫자가 아님).
        위 결과 표로 확인하세요.
      </div>
    );
  }

  const common = {
    data,
    margin: { top: 8, right: 16, bottom: 8, left: 0 },
  };
  const axisStyle = { fontSize: 11, fill: "var(--text-subtle)" };

  let chart: ReactNode;
  if (spec.chartType === "bar") {
    chart = (
      <BarChart {...common}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-neutral-8)" />
        <XAxis dataKey={spec.x} tick={axisStyle} />
        <YAxis tick={axisStyle} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {spec.y.map((yc, i) => (
          <Bar key={yc} dataKey={yc} fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    );
  } else if (spec.chartType === "line") {
    chart = (
      <LineChart {...common}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-neutral-8)" />
        <XAxis dataKey={spec.x} tick={axisStyle} />
        <YAxis tick={axisStyle} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {spec.y.map((yc, i) => (
          <Line
            key={yc}
            type="monotone"
            dataKey={yc}
            stroke={COLORS[i % COLORS.length]}
            dot={false}
          />
        ))}
      </LineChart>
    );
  } else if (spec.chartType === "area") {
    chart = (
      <AreaChart {...common}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-neutral-8)" />
        <XAxis dataKey={spec.x} tick={axisStyle} />
        <YAxis tick={axisStyle} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {spec.y.map((yc, i) => (
          <Area
            key={yc}
            type="monotone"
            dataKey={yc}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.25}
          />
        ))}
      </AreaChart>
    );
  } else if (spec.chartType === "pie") {
    // pie 는 y 첫 컬럼만 값으로(스펙상 1개 권장)
    const yc = spec.y[0];
    chart = (
      <PieChart>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={data}
          dataKey={yc}
          nameKey={spec.x}
          cx="50%"
          cy="50%"
          outerRadius={110}
          label={{ fontSize: 11 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  } else {
    // scatter: x=첫 수치 가정 불가 → x 범주, y[0] 값. 단순 분포.
    const yc = spec.y[0];
    chart = (
      <ScatterChart {...common}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-neutral-8)" />
        <XAxis dataKey={spec.x} tick={axisStyle} name={spec.x} />
        <YAxis dataKey={yc} tick={axisStyle} name={yc} />
        <ZAxis range={[60, 60]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Scatter name={yc} data={data} fill={COLORS[0]} />
      </ScatterChart>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: "var(--text-default)",
          marginBottom: 4,
        }}
      >
        {spec.title}
      </div>
      {spec.rationale && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-subtle)",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          🤖 {spec.rationale}
        </div>
      )}
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

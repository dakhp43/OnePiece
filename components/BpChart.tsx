"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BpPoint {
  date: string; // ISO
  systolic: number | null;
  diastolic: number | null;
}

// Theme-aware colors live in globals.css (--chart-*). Each theme's pair is validated with the
// dataviz validator against that theme's card surface (CVD ΔE ≥ 12.6, contrast ≥ 3:1).
const SYSTOLIC = "var(--chart-systolic)";
const DIASTOLIC = "var(--chart-diastolic)";
const GRID = "var(--chart-grid)";
const INK_MUTED = "var(--chart-axis)";

const short = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function BpChart({ points }: { points: BpPoint[] }) {
  const data = points.filter((p) => p.systolic != null || p.diastolic != null);
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-3">No blood pressure readings yet.</p>;
  }
  const values = data.flatMap((p) => [p.systolic ?? 0, p.diastolic ?? 0]).filter(Boolean);
  // Whole steps of 20 mmHg so the axis reads 60, 80, ... 160 (recharts would otherwise split 70–160 into 70, 95, 120...).
  const yMin = Math.min(60, Math.floor((Math.min(...values) - 10) / 20) * 20);
  const yMax = Math.max(160, Math.ceil((Math.max(...values) + 10) / 20) * 20);
  const ticks = Array.from({ length: (yMax - yMin) / 20 + 1 }, (_, i) => yMin + i * 20);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 12, fill: INK_MUTED }} stroke={GRID} tickLine={false} />
          <YAxis domain={[yMin, yMax]} ticks={ticks} interval={0} tick={{ fontSize: 12, fill: INK_MUTED }} stroke={GRID} unit="" axisLine={false} tickLine={false} />
          <Tooltip
            labelFormatter={(v) => new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            formatter={(value, name) => [`${value} mmHg`, name]}
            cursor={{ stroke: INK_MUTED, strokeDasharray: "3 3" }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--glass-strong)",
              backdropFilter: "blur(14px) saturate(1.6)",
              color: "var(--ink)",
              boxShadow: "0 12px 32px -12px rgb(var(--shadow-rgb) / 0.3)",
            }}
            labelStyle={{ color: "var(--ink-2)", fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: "var(--ink)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: INK_MUTED }} iconType="plainline" />
          <ReferenceLine y={130} stroke={INK_MUTED} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "Goal 130", position: "insideTopRight", fontSize: 11, fill: INK_MUTED }} />
          <ReferenceLine y={80} stroke={INK_MUTED} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "Goal 80", position: "insideTopRight", fontSize: 11, fill: INK_MUTED }} />
          <Line type="monotone" dataKey="systolic" name="Systolic" stroke={SYSTOLIC} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--surface)" }} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls animationDuration={1100} />
          <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke={DIASTOLIC} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--surface)" }} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls animationDuration={1100} animationBegin={150} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

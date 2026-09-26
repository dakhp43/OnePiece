"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BpPoint {
  date: string; // ISO
  systolic: number | null;
  diastolic: number | null;
}

// Validated pair (dataviz validator: CVD ΔE 13.7, contrast ≥ 3:1)
const SYSTOLIC = "#c2410c";
const DIASTOLIC = "#0d9488";
const GRID = "#e2e8f0";
const INK_MUTED = "#64748b";

const short = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function BpChart({ points }: { points: BpPoint[] }) {
  const data = points.filter((p) => p.systolic != null || p.diastolic != null);
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No blood pressure readings yet.</p>;
  }
  const values = data.flatMap((p) => [p.systolic ?? 0, p.diastolic ?? 0]).filter(Boolean);
  const yMin = Math.min(70, Math.floor((Math.min(...values) - 10) / 10) * 10);
  const yMax = Math.max(160, Math.ceil((Math.max(...values) + 10) / 10) * 10);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 12, fill: INK_MUTED }} stroke={GRID} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 12, fill: INK_MUTED }} stroke={GRID} unit="" />
          <Tooltip
            labelFormatter={(v) => new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            formatter={(value, name) => [`${value} mmHg`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: INK_MUTED }} iconType="plainline" />
          <ReferenceLine y={130} stroke={INK_MUTED} strokeDasharray="4 4" label={{ value: "Goal 130", position: "insideTopRight", fontSize: 11, fill: INK_MUTED }} />
          <ReferenceLine y={80} stroke={INK_MUTED} strokeDasharray="4 4" label={{ value: "Goal 80", position: "insideTopRight", fontSize: 11, fill: INK_MUTED }} />
          <Line type="monotone" dataKey="systolic" name="Systolic" stroke={SYSTOLIC} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} connectNulls />
          <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke={DIASTOLIC} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

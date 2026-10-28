"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* Single-series charts: one validated hue (#2a78d6 on the white card surface), thin marks with
   rounded data-ends, recessive grid, direct value labels, and a hover tooltip on every mark. */
const SERIES = "var(--color-chart-1)";
const AXIS = { fontSize: 11, fill: "#64748b" };

type TipProps = { active?: boolean; payload?: readonly { value?: unknown }[]; label?: unknown; unit: string };

function Tip({ active, payload, label, unit }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <div className="text-base font-semibold tabular-nums text-slate-900">{String(payload[0].value ?? "")}</div>
      <div className="flex items-center gap-1.5 text-slate-500">
        <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES }} aria-hidden />
        {String(label)} · {unit}
      </div>
    </div>
  );
}

export function HBarChart({ data, unit, height }: { data: { label: string; value: number }[]; unit: string; height?: number }) {
  const h = height ?? Math.max(120, data.length * 30 + 20);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="#eef2f6" />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={130} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={(p) => <Tip active={p.active} payload={p.payload} label={p.label} unit={unit} />} />
          <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data, unit }: { data: { label: string; value: number }[]; unit: string }) {
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#eef2f6" />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={(p) => <Tip active={p.active} payload={p.payload} label={p.label} unit={unit} />} />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

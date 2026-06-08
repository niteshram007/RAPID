"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WaterfallStep = {
  label: string;
  value: number;
  start: number;
  end: number;
  type: "total" | "increase" | "decrease";
};

type WaterfallChartProps = {
  steps: WaterfallStep[];
};

export function WaterfallChart({ steps }: WaterfallChartProps) {
  const data = steps.map((step) => ({
    ...step,
    offset: step.type === "total" ? 0 : Math.min(step.start, step.end),
    bar: step.type === "total" ? step.end : Math.abs(step.value),
    fill:
      step.type === "total"
        ? "#0f172a"
        : step.type === "increase"
          ? "#059669"
          : "#dc2626",
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, _name, item) => [
              `${Number(value ?? 0).toLocaleString("en-US")}`,
              item.payload.type === "total" ? "Total" : "Delta",
            ]}
          />
          <Bar dataKey="offset" stackId="waterfall" fill="transparent" />
          <Bar dataKey="bar" stackId="waterfall" radius={[10, 10, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outPath = path.join(root, "src/components/mis-trends-kiosk.tsx");

const content = fs.readFileSync(path.join(root, "src/components/birdeye-analytics-kiosk.tsx"), "utf8");
const chartBlock = content
  .slice(content.indexOf("function ChartTooltip"), content.indexOf("function DashboardTopChartCard"))
  .replaceAll("AnalyticsTable", "TrendsTable");

const chartViewPatched = chartBlock
  .replace(
    /function ChartView\(\{ table \}: \{ table: TrendsTable \}\) \{[\s\S]*?^}/m,
    `function ChartView({ table }: { table: TrendsTable }) {
  const labelKey = table.chartLabelKey || table.headers[0] || "Row Labels";
  const metricKey = pickChartMetricKey(table);
  const chartRows = table.rows.filter((row) => toText(row[labelKey]).toLowerCase() !== "grand total");

  if (chartRows.length === 0) {
    return (
      <motionless className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm font-semibold text-slate-500">
        No chart data available.
      </motionless>
    );
  }

  if (table.chartType === "donut") {
    const donutRows = chartRows.slice(0, 8).map((row) => ({
      name: toText(row[labelKey]),
      value: toNumber(row[metricKey]),
    }));
    return (
      <div className="h-[320px] rounded-xl border border-slate-200 bg-white px-3 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie data={donutRows} dataKey="value" nameKey="name" innerRadius={70} outerRadius={115}>
              {donutRows.map((entry, index) => (
                <Cell key={\`\${entry.name}-\${index}\`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const seriesRows = chartRows.map((row) => ({ ...row, [metricKey]: toNumber(row[metricKey]) }));

  if (table.chartType === "line") {
    return (
      <motionless className="h-[320px] rounded-xl border border-slate-200 bg-white px-3 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={seriesRows} margin={{ left: 10, right: 18, top: 12, bottom: 8 }}>
            <CartesianGrid stroke="#dbe3f0" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} tick={{ fontSize: 11 }} width={72} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Line type="monotone" dataKey={metricKey} stroke="#0f766e" strokeWidth={2.6} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </motionless>
    );
  }

  return (
    <motionless className="h-[320px] rounded-xl border border-slate-200 bg-white px-3 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={seriesRows} margin={{ left: 10, right: 18, top: 12, bottom: 8 }}>
          <CartesianGrid stroke="#dbe3f0" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} interval={0} angle={-14} dy={8} />
          <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} tick={{ fontSize: 11 }} width={72} />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          <Bar dataKey={metricKey} fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </motionless>
  );
}`,
  )
  .replaceAll("<motionless", "<div")
  .replaceAll("</motionless>", "</div>");

const helpers = fs.readFileSync(path.join(root, "scripts/mis-trends-kiosk-helpers.ts.txt"), "utf8").catch?.() ?? "";

// helpers inline below - read from a string in this file
const head = `// generated partially - see scripts/build-mis-trends-kiosk.mjs
`;

console.log("Use manual write instead");

"use client";

import * as React from "react";
import {
  BarChart3,
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";
import type { ChatMessage } from "@/lib/neuralswitch/types";
import { cn } from "@/lib/neuralswitch/utils";
import { Markdown } from "./Markdown";
import { SourcePanel } from "./SourcePanel";
import { TypingIndicator } from "./TypingIndicator";

type StructuredTable = { columns: string[]; rows: unknown[][] };
type StructuredChart = { type?: string; x?: string; y?: string };
type StructuredArtifact = {
  id: string;
  type: string;
  filename: string;
  download_url: string;
  preview_url?: string;
  preview_available?: boolean;
  created_at?: string;
};

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

export function MessageBubble({ message, isStreaming, onRegenerate, canRegenerate }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = React.useState(false);
  const [deletedArtifacts, setDeletedArtifacts] = React.useState<Set<string>>(new Set());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const showTyping = !isUser && isStreaming && !message.content;
  const structuredTable =
    !isUser &&
    message.metadata &&
    typeof message.metadata === "object" &&
    "table" in message.metadata &&
    message.metadata.table &&
    typeof message.metadata.table === "object" &&
    Array.isArray((message.metadata.table as { columns?: unknown }).columns) &&
    Array.isArray((message.metadata.table as { rows?: unknown }).rows)
      ? (message.metadata.table as StructuredTable)
      : null;
  const structuredChart =
    !isUser &&
    message.metadata &&
    typeof message.metadata === "object" &&
    "chart" in message.metadata &&
    message.metadata.chart &&
    typeof message.metadata.chart === "object"
      ? (message.metadata.chart as StructuredChart)
      : null;
  const artifacts =
    !isUser &&
    message.metadata &&
    typeof message.metadata === "object" &&
    Array.isArray((message.metadata as { artifacts?: unknown }).artifacts)
      ? ((message.metadata as { artifacts: unknown[] }).artifacts.filter(isStructuredArtifact) as StructuredArtifact[])
      : [];
  const visibleArtifacts = artifacts.filter((artifact) => !deletedArtifacts.has(artifact.id));

  return (
    <div className={cn("group flex w-full gap-3 px-4 py-5 animate-fade-in", isUser && "justify-end")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={cn("flex max-w-[760px] flex-col", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted/60 text-foreground",
          )}
        >
          {showTyping ? (
            <TypingIndicator />
          ) : isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcePanel sources={message.sources} />
        )}

        {!isUser && structuredTable && structuredTable.columns.length > 0 && structuredTable.rows.length > 0 && (
          <div className="mt-3 w-full overflow-hidden rounded-xl border border-border bg-background">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    {structuredTable.columns.map((column) => (
                      <th key={column} className="px-3 py-2 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {structuredTable.rows.slice(0, 10).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-border">
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top text-foreground">
                          {String(cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isUser && structuredChart && structuredTable && (
          <AnalyticsChart table={structuredTable} chart={structuredChart} />
        )}

        {!isUser && visibleArtifacts.length > 0 && (
          <ArtifactCards
            artifacts={visibleArtifacts}
            onDeleted={(artifactId) => {
              setDeletedArtifacts((current) => new Set([...current, artifactId]));
            }}
          />
        )}

        {!isUser && !showTyping && (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={copy}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {canRegenerate && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Regenerate"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function isStructuredArtifact(value: unknown): value is StructuredArtifact {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StructuredArtifact>;
  return Boolean(item.id && item.type && item.filename && item.download_url);
}

function neuralSwitchUrl(path: string | undefined) {
  if (!path) return "#";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `/api/neural-switch${path.startsWith("/") ? path : `/${path}`}`;
}

function artifactIcon(type: string) {
  const normalized = type.toLowerCase();
  if (normalized === "excel" || normalized === "csv") return FileSpreadsheet;
  if (normalized === "chart") return BarChart3;
  if (normalized === "dashboard") return LayoutDashboard;
  return FileText;
}

function ArtifactCards({
  artifacts,
  onDeleted,
}: {
  artifacts: StructuredArtifact[];
  onDeleted: (artifactId: string) => void;
}) {
  async function deleteArtifact(artifactId: string) {
    try {
      const response = await fetch(neuralSwitchUrl(`/artifacts/${artifactId}`), { method: "DELETE" });
      if (response.ok) {
        onDeleted(artifactId);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-3 grid w-full gap-2">
      {artifacts.map((artifact) => {
        const Icon = artifactIcon(artifact.type);
        return (
          <div
            key={artifact.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background px-3 py-3 shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{artifact.filename}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {artifact.type} artifact
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {artifact.preview_available !== false && artifact.preview_url && (
                <a
                  href={neuralSwitchUrl(artifact.preview_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview
                </a>
              )}
              <a
                href={neuralSwitchUrl(artifact.download_url)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
              <button
                type="button"
                onClick={() => deleteArtifact(artifact.id)}
                className="inline-flex items-center rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                title="Delete artifact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeColumnName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(columns: string[], requested: string | undefined, predicate: (sample: unknown) => boolean, rows: unknown[][]) {
  const requestedKey = normalizeColumnName(requested);
  if (requestedKey) {
    const exactIndex = columns.findIndex((column) => normalizeColumnName(column) === requestedKey);
    if (exactIndex >= 0) return exactIndex;
  }
  return columns.findIndex((_, index) => rows.some((row) => predicate(row[index])));
}

function toFiniteNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMetric(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}$${absolute.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function AnalyticsChart({ table, chart }: { table: StructuredTable; chart: StructuredChart }) {
  const rows = table.rows.slice(0, 8);
  const xIndex = columnIndex(table.columns, chart.x, (sample) => typeof sample === "string", rows);
  const yIndex = columnIndex(table.columns, chart.y, (sample) => toFiniteNumber(sample) !== 0, rows);
  if (xIndex < 0 || yIndex < 0 || rows.length === 0) {
    return null;
  }

  const points = rows
    .map((row) => ({
      label: String(row[xIndex] ?? "Unassigned"),
      value: toFiniteNumber(row[yIndex]),
    }))
    .filter((point) => point.label.trim() && Number.isFinite(point.value));
  if (points.length === 0) {
    return null;
  }

  const maxValue = Math.max(...points.map((point) => Math.abs(point.value)), 1);
  const normalizedChartType = String(chart.type || "bar").toLowerCase();
  const chartTitle =
    normalizedChartType === "pie"
      ? `Share by ${table.columns[xIndex]}`
      : `${normalizedChartType === "line" ? "Trend" : "Breakdown"} by ${table.columns[xIndex]}`;

  return (
    <div className="mt-3 w-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{chartTitle}</p>
          <p className="text-[11px] text-muted-foreground">{table.columns[yIndex]}</p>
        </div>
        <span className="rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {normalizedChartType}
        </span>
      </div>
      {normalizedChartType === "pie" ? (
        <PieMiniChart points={points} />
      ) : normalizedChartType === "line" ? (
        <LineMiniChart points={points} maxValue={maxValue} />
      ) : (
        <div className="space-y-2 p-3">
          {points.map((point, index) => {
            const width = Math.max(4, (Math.abs(point.value) / maxValue) * 100);
            return (
              <div key={`${point.label}-${index}`} className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(7rem,1.3fr)_4.5rem] items-center gap-2 text-xs">
                <div className="truncate font-medium text-foreground" title={point.label}>
                  {point.label}
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#003323,#4169e1_62%,#e43d46)]"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="text-right font-semibold tabular-nums text-foreground">
                  {formatMetric(point.value)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function pieSlicePath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = {
    x: centerX + radius * Math.cos(startAngle),
    y: centerY + radius * Math.sin(startAngle),
  };
  const end = {
    x: centerX + radius * Math.cos(endAngle),
    y: centerY + radius * Math.sin(endAngle),
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function PieMiniChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const colors = ["#024a70", "#4169e1", "#e43d46", "#0f766e", "#f59e0b", "#64748b", "#7c3aed", "#14b8a6"];
  const positivePoints = points.filter((point) => point.value > 0);
  const total = positivePoints.reduce((sum, point) => sum + point.value, 0);
  if (total <= 0) {
    return null;
  }
  const slices = positivePoints.reduce<{
    cursor: number;
    slices: Array<{
      color: string;
      end: number;
      label: string;
      percentage: number;
      start: number;
      value: number;
    }>;
  }>(
    (accumulator, point, index) => {
      const angle = (point.value / total) * Math.PI * 2;
      const start = accumulator.cursor;
      const end = start + angle;
      return {
        cursor: end,
        slices: [
          ...accumulator.slices,
          {
            ...point,
            start,
            end,
            color: colors[index % colors.length],
            percentage: (point.value / total) * 100,
          },
        ],
      };
    },
    { cursor: -Math.PI / 2, slices: [] },
  ).slices;

  return (
    <div className="grid gap-4 p-3 sm:grid-cols-[180px_1fr]">
      <svg viewBox="0 0 180 180" className="mx-auto h-44 w-44">
        <circle cx="90" cy="90" r="74" fill="#f8fafc" />
        {slices.map((slice, index) => (
          <path
            key={`${slice.label}-${index}`}
            d={pieSlicePath(90, 90, 72, slice.start, slice.end)}
            fill={slice.color}
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}
        <circle cx="90" cy="90" r="34" fill="#ffffff" opacity="0.94" />
        <text x="90" y="86" textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
          Total
        </text>
        <text x="90" y="102" textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {formatMetric(total)}
        </text>
      </svg>
      <div className="space-y-2 self-center">
        {slices.map((slice, index) => (
          <div key={`${slice.label}-legend-${index}`} className="grid grid-cols-[0.75rem_minmax(0,1fr)_3.5rem_4.5rem] items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="truncate font-medium text-foreground" title={slice.label}>
              {slice.label}
            </span>
            <span className="text-right font-semibold tabular-nums text-muted-foreground">
              {slice.percentage.toFixed(1)}%
            </span>
            <span className="text-right font-semibold tabular-nums text-foreground">
              {formatMetric(slice.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineMiniChart({ points, maxValue }: { points: Array<{ label: string; value: number }>; maxValue: number }) {
  const width = 520;
  const height = 150;
  const padding = 22;
  const divisor = Math.max(points.length - 1, 1);
  const path = points
    .map((point, index) => {
      const x = padding + (index / divisor) * (width - padding * 2);
      const y = height - padding - (Math.max(0, point.value) / maxValue) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <defs>
          <linearGradient id="neuralswitch-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#003323" />
            <stop offset="60%" stopColor="#4169e1" />
            <stop offset="100%" stopColor="#e43d46" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#neuralswitch-line-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => {
          const x = padding + (index / divisor) * (width - padding * 2);
          const y = height - padding - (Math.max(0, point.value) / maxValue) * (height - padding * 2);
          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r="4.5" fill="#fffdee" stroke="#003323" strokeWidth="2" />
              <text x={x} y={height - 5} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {point.label.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

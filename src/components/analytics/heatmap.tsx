"use client";

import { memo } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HeatmapCell = {
  x: string;
  y: string;
  value: number;
  actual: number;
  intensity: number;
};

type HeatmapProps = {
  xLabels: string[];
  yLabels: string[];
  cells: HeatmapCell[];
  onRowClick?: (row: string) => void;
};

function getHeatTone(value: number) {
  if (value > 0) {
    return "bg-emerald-500/80";
  }
  if (value < 0) {
    return "bg-rose-500/80";
  }
  return "bg-slate-200";
}

function HeatmapComponent({ xLabels, yLabels, cells, onRowClick }: HeatmapProps) {
  const cellMap = new Map(cells.map((cell) => [`${cell.y}::${cell.x}`, cell]));

  return (
    <TooltipProvider>
      <div className="space-y-3 overflow-x-auto">
        <div
          className="grid min-w-[40rem] gap-2"
          style={{ gridTemplateColumns: `minmax(12rem, 1.4fr) repeat(${xLabels.length}, minmax(3rem, 1fr))` }}
        >
          <div />
          {xLabels.map((label) => (
            <div
              key={label}
              className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
            >
              {label}
            </div>
          ))}
          {yLabels.map((rowLabel) => (
            <div
              key={rowLabel}
              className="contents"
            >
              <button
                key={`${rowLabel}-label`}
                type="button"
                onClick={() => onRowClick?.(rowLabel)}
                className="rounded-2xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                {rowLabel}
              </button>
              {xLabels.map((columnLabel) => {
                const cell = cellMap.get(`${rowLabel}::${columnLabel}`);
                const opacity = cell ? Math.max(0.12, cell.intensity) : 0.12;
                return (
                  <Tooltip key={`${rowLabel}-${columnLabel}`}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-2xl border border-white/70 text-[10px] font-semibold text-white",
                          cell ? getHeatTone(cell.value) : "bg-slate-100 text-slate-400",
                        )}
                        style={{ opacity }}
                      >
                        {cell ? Math.round(cell.value / 1000) : "-"}
                      </div>
                    </TooltipTrigger>
                    {cell ? (
                      <TooltipContent>
                        <p className="font-semibold">{rowLabel}</p>
                        <p>{columnLabel}</p>
                        <p>Variance: {cell.value.toLocaleString("en-US")}</p>
                        <p>Actual: {cell.actual.toLocaleString("en-US")}</p>
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

export const Heatmap = memo(HeatmapComponent);

"use client";

import { memo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Sparkline } from "@/components/analytics/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MetricTileProps = {
  label: string;
  value: string;
  detail: string;
  delta?: string;
  tooltip?: string;
  sparklineValues?: number[];
  tone?: "positive" | "negative" | "neutral";
};

function MetricTileComponent({
  label,
  value,
  detail,
  delta,
  tooltip,
  sparklineValues,
  tone = "neutral",
}: MetricTileProps) {
  return (
    <TooltipProvider>
      <Card className="overflow-hidden">
        <CardContent className="space-y-4 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {label}
                </p>
                {tooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[10px] font-semibold text-slate-500"
                        aria-label={`Explain ${label}`}
                      >
                        i
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{tooltip}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {value}
              </p>
            </div>
            {delta ? (
              <Badge
                variant={
                  tone === "positive"
                    ? "emerald"
                    : tone === "negative"
                      ? "rose"
                      : "neutral"
                }
                className="gap-1 text-[10px]"
              >
                {tone === "positive" ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : tone === "negative" ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : null}
                {delta}
              </Badge>
            ) : null}
          </div>
          {sparklineValues?.length ? (
            <div className="flex items-center justify-between gap-4 rounded-[20px] bg-slate-50/80 px-3 py-2">
              <Sparkline
                values={sparklineValues}
                tone={tone === "negative" ? "negative" : "positive"}
              />
              <p className="text-[11px] leading-5 text-slate-500">
                Last {sparklineValues.length} periods
              </p>
            </div>
          ) : null}
          <p className="text-sm leading-6 text-slate-600">{detail}</p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export const MetricTile = memo(MetricTileComponent, (previous, next) => {
  if (
    previous.label !== next.label ||
    previous.value !== next.value ||
    previous.detail !== next.detail ||
    previous.delta !== next.delta ||
    previous.tooltip !== next.tooltip ||
    previous.tone !== next.tone
  ) {
    return false;
  }
  if (!previous.sparklineValues && !next.sparklineValues) {
    return true;
  }
  if (!previous.sparklineValues || !next.sparklineValues) {
    return false;
  }
  if (previous.sparklineValues.length !== next.sparklineValues.length) {
    return false;
  }
  return previous.sparklineValues.every(
    (value, index) => value === next.sparklineValues?.[index],
  );
});

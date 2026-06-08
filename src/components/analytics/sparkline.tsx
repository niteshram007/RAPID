"use client";

import { memo, useMemo } from "react";

type SparklineProps = {
  values: number[];
  tone?: "positive" | "negative";
};

const VIEWBOX_WIDTH = 112;
const VIEWBOX_HEIGHT = 40;
const PADDING = 3;

function buildSparklinePath(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (VIEWBOX_WIDTH - PADDING * 2) / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = PADDING + index * step;
      const y =
        VIEWBOX_HEIGHT -
        PADDING -
        ((value - min) / range) * (VIEWBOX_HEIGHT - PADDING * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function SparklineComponent({ values, tone = "positive" }: SparklineProps) {
  const path = useMemo(() => buildSparklinePath(values), [values]);

  return (
    <div className="h-10 w-28" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <path
          d={path}
          fill="none"
          stroke={tone === "positive" ? "#059669" : "#dc2626"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export const Sparkline = memo(SparklineComponent, (previous, next) => {
  if (previous.tone !== next.tone || previous.values.length !== next.values.length) {
    return false;
  }
  return previous.values.every((value, index) => value === next.values[index]);
});

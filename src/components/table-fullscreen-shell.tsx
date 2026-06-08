"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type TableFullscreenShellProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
};

export function TableFullscreenShell({
  children,
  className,
  title,
  description,
}: TableFullscreenShellProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const body = (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsFullscreen((current) => !current)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_16px_32px_rgba(15,23,42,0.14)] transition hover:border-slate-300 hover:text-slate-950"
          aria-label={isFullscreen ? "Restore table" : "Maximize table"}
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isFullscreen ? "Restore" : "Maximize"}
        </button>
      </div>
      <div className={cn("table-freeze-shell", className)} data-fullscreen={isFullscreen ? "true" : "false"}>
        {children}
      </div>
    </div>
  );

  if (!isFullscreen || typeof document === "undefined") {
    return body;
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-950/55 p-3 backdrop-blur-sm lg:p-5">
      <div className="flex h-full flex-col overflow-hidden rounded-[30px] border border-white/70 bg-slate-950/95 shadow-[0_32px_90px_rgba(15,23,42,0.38)]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Table view
            </p>
            <p className="mt-1 text-base font-semibold text-white">
              {title ?? "Expanded table"}
            </p>
            {description ? <p className="mt-1 text-sm text-slate-300">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/25 hover:bg-white/15"
          >
            <Minimize2 className="h-3 w-3" />
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <div
            className="table-freeze-shell h-full rounded-[24px] border border-white/10 bg-white"
            data-fullscreen="true"
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/neuralswitch/utils";

export function DocumentStatus({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; icon: React.ElementType; className: string; spin?: boolean }
  > = {
    ready: { label: "Ready", icon: CheckCircle2, className: "text-green-600" },
    processing: { label: "Processing", icon: Loader2, className: "text-blue-600", spin: true },
    uploaded: { label: "Queued", icon: Clock, className: "text-muted-foreground" },
    failed: { label: "Failed", icon: XCircle, className: "text-red-600" },
  };
  const info = map[status] || map.uploaded;
  const Icon = info.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", info.className)}>
      <Icon className={cn("h-3.5 w-3.5", info.spin && "animate-spin")} />
      {info.label}
    </span>
  );
}

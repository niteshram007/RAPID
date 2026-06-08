import { cn } from "@/lib/utils";

export function WorkspaceLoadingState({
  className,
  cards = 3,
  rows = 10,
  compact = false,
}: {
  className?: string;
  cards?: number;
  rows?: number;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-6", className)} aria-busy="true" aria-live="polite">
      <section className="surface-card px-4 py-5 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-10 w-full max-w-xl rounded-2xl bg-slate-200" />
          <div className="h-4 w-full max-w-3xl rounded-full bg-slate-100" />
        </div>
      </section>

      <div
        className={cn(
          "grid gap-4",
          compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {Array.from({ length: cards }, (_, index) => (
          <div
            key={`workspace-loading-card-${index}`}
            className="h-[132px] animate-pulse rounded-[28px] border border-slate-200 bg-white/85"
          />
        ))}
      </div>

      <section className="surface-card overflow-hidden px-4 py-4 sm:px-5">
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={`workspace-loading-row-${index}`}
              className="h-11 animate-pulse rounded-2xl bg-slate-100/90"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

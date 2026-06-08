"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type OverviewYearSelectorProps = {
  currentYear: string | null;
  options: string[];
};

export function OverviewYearSelector({
  currentYear,
  options,
}: OverviewYearSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedYear = currentYear || options[0] || "";

  return (
    <label className="group relative inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white hover:bg-white/55">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.24)]">
        <CalendarRange className="h-4 w-4" />
      </span>
      <span className="flex flex-col text-left">
        <span className="text-[10px] tracking-[0.18em] text-slate-500">Year</span>
        <span className="text-sm font-semibold normal-case tracking-normal text-slate-950">
          {selectedYear || "Select"}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 text-slate-500 transition duration-200 group-hover:translate-y-0.5" />
      <select
        aria-label="Select financial year"
        value={selectedYear}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          const value = event.target.value.trim();
          if (value) {
            next.set("financialYear", value);
          } else {
            next.delete("financialYear");
          }
          const query = next.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

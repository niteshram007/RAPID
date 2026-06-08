"use client";

import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

type MultiSelectFilterProps = {
  label: string;
  value: string[];
  options: string[];
  placeholder?: string;
  onChange: (value: string[]) => void;
};

export function MultiSelectFilter({
  label,
  value,
  options,
  placeholder = "All",
  onChange,
}: MultiSelectFilterProps) {
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return options;
    }
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, search]);

  function toggleOption(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((current) => current !== option));
      return;
    }
    onChange([...value, option]);
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            className="h-12 w-full justify-between rounded-[22px] px-4 text-left text-sm"
          >
            <span className="truncate">
              {value.length > 0 ? value.join(", ") : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem]">
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
            />
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {filteredOptions.map((option) => {
                const active = value.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(option)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition",
                      active
                        ? "bg-sky-50 text-sky-900"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                    )}
                  >
                    <span className="truncate">{option}</span>
                    {active ? <Check className="h-4 w-4 text-sky-600" /> : null}
                  </button>
                );
              })}
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No matching values.</p>
              ) : null}
            </div>
            {value.length > 0 ? (
              <Button variant="ghost" className="h-9 w-full" onClick={() => onChange([])}>
                Clear {label}
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

"use client";

type DrillDownFilterChipsProps = {
  filters: Record<string, unknown>;
};

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ");
  }
  return String(value ?? "").trim();
}

function formatLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function DrillDownFilterChips({ filters }: DrillDownFilterChipsProps) {
  const entries = Object.entries(filters).filter(([, value]) => {
    const text = formatValue(value);
    return Boolean(text);
  });
  if (!entries.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
        >
          {formatLabel(key)}: {formatValue(value)}
        </span>
      ))}
    </div>
  );
}


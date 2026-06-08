import { requirePermission } from "@/lib/auth";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toSearchParams(query: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .forEach((entry) => search.append(key, entry));
      continue;
    }
    const normalized = String(value ?? "").trim();
    if (normalized) {
      search.set(key, normalized);
    }
  }
  return search;
}

export default async function GeoHeadSlicerRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission("view_dashboard");
  const query = await searchParams;
  const search = toSearchParams(query).toString();

  redirect(search ? `/geo-head/analytics-kiosk?${search}` : "/geo-head/analytics-kiosk");
}


import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExecutivePredictionRedirectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission("view_dashboard");

  const query = await searchParams;
  const destination = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      const first = String(value[0] ?? "").trim();
      if (first) {
        destination.set(key, first);
      }
      continue;
    }
    const normalized = String(value ?? "").trim();
    if (normalized) {
      destination.set(key, normalized);
    }
  }

  const suffix = destination.toString();
  redirect(suffix ? `/executive/trends?${suffix}` : "/executive/trends");
}

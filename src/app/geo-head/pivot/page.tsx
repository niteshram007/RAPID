import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";

export default async function GeoHeadPivotPage() {
  await requirePermission("view_dashboard");
  redirect("/geo-head");
}

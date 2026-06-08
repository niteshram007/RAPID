import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";

export default async function ExecutivePivotPage() {
  await requirePermission("view_dashboard");
  redirect("/executive");
}

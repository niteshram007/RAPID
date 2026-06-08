import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";

export default async function BdmPivotPage() {
  await requirePermission("view_dashboard");
  redirect("/bdm");
}

import { redirect } from "next/navigation";

import { getDefaultRouteForRole, requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac-store";

export default async function BdmForecastPage() {
  const session = await requirePermission("view_dashboard");
  if (!hasPermission(session.role, "submit_forecast")) {
    redirect(getDefaultRouteForRole(session.role));
  }
  redirect("/bdm/forecast/ms");
}

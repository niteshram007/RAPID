import { redirect } from "next/navigation";

import { getDefaultRouteForRole, getSessionProfile } from "@/lib/auth";

export default async function DashboardPivotPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login");
  }

  redirect(getDefaultRouteForRole(session.role));
}


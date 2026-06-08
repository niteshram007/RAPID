import { NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import { getRapidRevenueNotifications } from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

export async function GET() {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.role, "view_dashboard") || !canAccessRevenueWorkspace(session.role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const notifications = await getRapidRevenueNotifications(session);
  return NextResponse.json(notifications);
}


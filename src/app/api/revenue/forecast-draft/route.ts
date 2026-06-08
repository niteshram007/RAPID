import { NextRequest, NextResponse } from "next/server";

import { canAccessWorkspaceArea, getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac-store";
import { saveForecastDraftSheet } from "@/lib/rapid-revenue-server";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (
    (!hasPermission(session.role, "submit_forecast") &&
      session.role?.id !== "practice-head") ||
    (!canAccessWorkspaceArea(session.role, "bdm") &&
      !canAccessWorkspaceArea(session.role, "practice-head"))
  ) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as {
    forecastMonth?: string;
    rows?: Array<{
      recordId: number;
      forecastValue: number | null;
      billedHours?: number | null;
      billableActualHrs?: number | null;
      rowValues?: {
        billRate?: number | null;
        startDate?: string | null;
        endDate?: string | null;
        projectName?: string | null;
        clientName?: string | null;
      };
    }>;
  };

  if (!payload.forecastMonth || !Array.isArray(payload.rows)) {
    return NextResponse.json({ detail: "Invalid forecast payload." }, { status: 400 });
  }

  try {
    const response = await saveForecastDraftSheet(session, payload.forecastMonth, payload.rows);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Unable to autosave forecast draft." },
      { status: 400 },
    );
  }
}

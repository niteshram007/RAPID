import { NextRequest, NextResponse } from "next/server";

import { canAccessWorkspaceArea, getSessionProfile } from "@/lib/auth";
import { createForecastRow, deleteForecastRow } from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (
    (!hasPermission(session.role, "submit_forecast") && session.role?.id !== "practice-head") ||
    (!canAccessWorkspaceArea(session.role, "bdm") &&
      !canAccessWorkspaceArea(session.role, "practice-head"))
  ) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    mode?: "renewal" | "new_project";
    recordId?: number;
    financialYear?: string | null;
    values?: Record<string, string | number | null | undefined>;
  };

  if (!payload.mode) {
    return NextResponse.json({ detail: "Mode is required." }, { status: 400 });
  }

  try {
    const response = await createForecastRow(session, {
      mode: payload.mode,
      recordId: payload.recordId,
      financialYear: payload.financialYear ?? null,
      values: payload.values ?? {},
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Unable to create forecast row." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (
    (!hasPermission(session.role, "submit_forecast") && session.role?.id !== "practice-head") ||
    (!canAccessWorkspaceArea(session.role, "bdm") &&
      !canAccessWorkspaceArea(session.role, "practice-head"))
  ) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { recordId?: number };
  const recordId = Number(payload.recordId ?? 0);
  if (!Number.isFinite(recordId) || recordId <= 0) {
    return NextResponse.json({ detail: "recordId is required." }, { status: 400 });
  }

  try {
    const response = await deleteForecastRow(session, recordId);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Unable to delete forecast row." },
      { status: 400 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import { getForecastSheet } from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.role, "view_dashboard") || !canAccessRevenueWorkspace(session.role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const forecastMonth = request.nextUrl.searchParams.get("forecastMonth");
  const selectedBdms = request.nextUrl.searchParams
    .getAll("bdms")
    .map((value) => value.trim())
    .filter(Boolean);
  const selectedPracticeHeads = request.nextUrl.searchParams
    .getAll("practiceHeads")
    .map((value) => value.trim())
    .filter(Boolean);
  const msps = request.nextUrl.searchParams
    .getAll("msps")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const financialYear = request.nextUrl.searchParams.get("financialYear");
  const previewDrafts = request.nextUrl.searchParams.get("previewDrafts") === "1";
  const includeAllMonths = request.nextUrl.searchParams.get("includeAllMonths") === "1";
  const sheet = await getForecastSheet(
    session,
    forecastMonth,
    msps,
    selectedBdms,
    selectedPracticeHeads,
    financialYear,
    previewDrafts,
    includeAllMonths,
  );
  return NextResponse.json(sheet);
}


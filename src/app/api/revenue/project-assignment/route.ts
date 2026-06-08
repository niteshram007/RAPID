import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { applyProjectReassignment } from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "manage_users")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    assignmentType?: "bdm" | "geo_head";
    effectiveMonth?: string;
    recordId?: number;
    currentBdm?: string;
    nextBdm?: string;
    currentGeoHead?: string;
    nextGeoHead?: string;
    practiceHead?: string;
    entity?: string;
    financialYear?: string | null;
  };
  const assignmentType = payload.assignmentType === "geo_head" ? "geo_head" : "bdm";
  const effectiveMonth = String(payload.effectiveMonth ?? "").trim();
  if (!effectiveMonth) {
    return NextResponse.json({ detail: "effectiveMonth is required." }, { status: 400 });
  }

  try {
    const response = await applyProjectReassignment(session, {
      assignmentType,
      effectiveMonth,
      recordId: payload.recordId ? Number(payload.recordId) : undefined,
      currentBdm: payload.currentBdm,
      nextBdm: payload.nextBdm,
      currentGeoHead: payload.currentGeoHead,
      nextGeoHead: payload.nextGeoHead,
      practiceHead: payload.practiceHead,
      entity: payload.entity,
      financialYear: payload.financialYear,
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Unable to apply project reassignment." },
      { status: 400 },
    );
  }
}

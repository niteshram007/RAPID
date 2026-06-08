import { NextRequest, NextResponse } from "next/server";

import { canAccessWorkspaceArea, getSessionProfile } from "@/lib/auth";
import {
  createProjectAssignmentRequest,
  decideProjectAssignmentRequest,
  getProjectAssignmentWorkbench,
} from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

export async function GET() {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const canManageProjects =
    hasPermission(session.role, "manage_users") || canAccessWorkspaceArea(session.role, "geo-head");
  if (!canManageProjects) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = await getProjectAssignmentWorkbench(session);
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "manage_users")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    recordId?: number;
    bdm?: string;
  };
  const recordId = Number(payload.recordId ?? 0);
  const bdm = String(payload.bdm ?? "").trim();
  if (!Number.isFinite(recordId) || recordId <= 0 || !bdm) {
    return NextResponse.json({ detail: "recordId and bdm are required." }, { status: 400 });
  }

  try {
    const response = await createProjectAssignmentRequest(session, recordId, bdm);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Unable to create project assignment request." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessWorkspaceArea(session.role, "geo-head")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    requestId?: string;
    decision?: "approved" | "rejected";
    note?: string;
  };
  const requestId = String(payload.requestId ?? "").trim();
  const decision = payload.decision === "approved" ? "approved" : payload.decision === "rejected" ? "rejected" : null;
  if (!requestId || !decision) {
    return NextResponse.json({ detail: "requestId and decision are required." }, { status: 400 });
  }

  try {
    const response = await decideProjectAssignmentRequest(session, requestId, decision, payload.note);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Unable to process project assignment request." },
      { status: 400 },
    );
  }
}

import {
  createSession,
  getDefaultRouteForRole,
  getSessionProfile,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  findRoleById,
  findUserById,
  getAssignedRoleIds,
  readStore,
} from "@/lib/rbac-store";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const session = await getSessionProfile();

  if (!session) {
    return redirectFromRequest("/login");
  }

  const formData = await request.formData();
  const roleId = String(formData.get("roleId") ?? "").trim();

  const store = await readStore();
  const user = findUserById(store, session.userId);
  if (!user) {
    return redirectFromRequest("/login");
  }

  const allowedRoleIds = getAssignedRoleIds(user);
  if (!allowedRoleIds.includes(roleId)) {
    await recordAuditEvent({
      session,
      request,
      action: "security.unauthorized_access",
      module: "dashboard",
      description: "User attempted to switch to an unassigned role.",
      status: "failure",
      metadata: { requestedRoleId: roleId },
    });
    return redirectFromRequest("/login/select-role?error=invalid-role");
  }

  const role = findRoleById(store, roleId);
  if (!role) {
    return redirectFromRequest("/login/select-role?error=invalid-role");
  }

  await createSession(user, roleId);
  await recordAuditEvent({
    session: { ...session, roleId: role.id, role },
    request,
    action: "auth.role.select",
    module: "dashboard",
    description: "User selected an active role.",
    metadata: { roleId },
  });
  return redirectFromRequest(getDefaultRouteForRole(role));
}

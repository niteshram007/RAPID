import { clearPendingAuth, clearSession, getSessionProfile } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const session = await getSessionProfile();
  await clearPendingAuth();
  await clearSession();
  if (session) {
    await recordAuditEvent({
      session,
      request,
      action: "auth.logout",
      module: "dashboard",
      description: "User signed out.",
    });
  }
  return redirectFromRequest("/");
}

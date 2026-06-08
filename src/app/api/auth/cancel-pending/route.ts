import { clearPendingAuth } from "@/lib/auth";

import { redirectFromRequest } from "../_shared";

export async function POST() {
  await clearPendingAuth();
  return redirectFromRequest("/login");
}

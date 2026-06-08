import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth";

export default async function PracticeHeadMasterDataPage() {
  await requirePermission("view_dashboard");
  redirect("/practice-head");
}

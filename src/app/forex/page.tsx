import { redirect } from "next/navigation";

import { AdminForexSettings } from "@/components/admin-forex-settings";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getSessionProfile } from "@/lib/auth";

export default async function ForexPage() {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1320px] space-y-6 px-4 py-6 lg:px-8">
      <WorkspacePageHeader
        eyebrow="Finance"
        title="Forex"
        description="Reference exchange rates, historical lookups, and finance conversion support for RAPID reporting."
      />
      <AdminForexSettings />
    </main>
  );
}

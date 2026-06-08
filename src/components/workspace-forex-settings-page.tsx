"use client";

import { ForexSettingsPanel } from "@/components/admin-forex-settings";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export function WorkspaceForexSettingsPage({
  eyebrow = "Settings",
}: {
  eyebrow?: string;
}) {
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow={eyebrow}
        title="Forex Rate Settings"
        description="Manage reference exchange rates, currency conversion, and historical forex lookup for revenue reporting."
      />
      <ForexSettingsPanel />
    </div>
  );
}

"use client";

import { useTheme } from "@/components/ui/theme-provider";
import { Button } from "@/components/ui/button";

export function AppearanceSettings() {
  const { theme, toggle } = useTheme();
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border px-3 py-2">
        <p className="text-sm font-medium">Appearance</p>
        <p className="mb-2 text-xs text-muted-foreground">Light / Dark mode</p>
        <Button variant="outline" size="sm" onClick={toggle}>
          Current: {theme}. Toggle
        </Button>
      </div>
    </div>
  );
}

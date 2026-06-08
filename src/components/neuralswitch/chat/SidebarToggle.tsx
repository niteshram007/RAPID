"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/neuralswitch/ui/button";

export function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} title={collapsed ? "Open sidebar" : "Close sidebar"}>
      {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </Button>
  );
}

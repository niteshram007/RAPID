"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext } from "react";

import { DrillDownContext } from "@/lib/drilldown";

type DrillDownApi = {
  openDrillDown: (context: DrillDownContext) => void;
  closeDrillDown: () => void;
  isOpen: boolean;
  activeContext: DrillDownContext | null;
};

const DrillDownContextStore = createContext<DrillDownApi | null>(null);

export function DrillDownProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  function resolveWorkspaceDrillDownPath(currentPath: string) {
    const normalized = currentPath || "";
    if (normalized.startsWith("/executive")) {
      return "/executive/drilldown";
    }
    if (normalized.startsWith("/bdm")) {
      return "/bdm/drilldown";
    }
    if (normalized.startsWith("/geo-head")) {
      return "/geo-head/drilldown";
    }
    if (normalized.startsWith("/practice-head")) {
      return "/practice-head/drilldown";
    }
    if (normalized.startsWith("/buh")) {
      return "/buh/drilldown";
    }
    return "/drilldown";
  }

  function openDrillDown(context: DrillDownContext) {
    const encoded = encodeURIComponent(JSON.stringify(context));
    const targetPath = resolveWorkspaceDrillDownPath(pathname);
    router.push(`${targetPath}?context=${encoded}`);
  }

  function closeDrillDown() {
    router.back();
  }

  return (
    <DrillDownContextStore.Provider value={{ openDrillDown, closeDrillDown, isOpen: false, activeContext: null }}>
      {children}
    </DrillDownContextStore.Provider>
  );
}

export function useDrillDown() {
  const value = useContext(DrillDownContextStore);
  if (!value) {
    throw new Error("useDrillDown must be used within DrillDownProvider.");
  }
  return value;
}

"use client";

import { useEffect } from "react";

const WORKSPACE_STORAGE_KEYS = [
  "rapid-analytics-kiosk-v2",
  "rapid-global-slicer-v2",
  "rapid-sw-reloaded",
] as const;

export function AuthStorageReset() {
  useEffect(() => {
    for (const key of WORKSPACE_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }

    for (const key of Object.keys(window.sessionStorage)) {
      if (
        key.startsWith("rapid:comparison:") ||
        key.startsWith("rapid-workspace-greeting:")
      ) {
        window.sessionStorage.removeItem(key);
      }
    }
  }, []);

  return null;
}

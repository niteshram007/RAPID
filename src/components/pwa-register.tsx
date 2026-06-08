"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const unregisterStaleWorkers = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith("rapid-"))
              .map((cacheName) => window.caches.delete(cacheName)),
          );
        }
      } catch {
        // Ignore cleanup failures; the app should continue to load normally.
      }
    };

    void unregisterStaleWorkers();

    return undefined;
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SESSION_STORAGE_KEY = "rapid-activity-session";
const INACTIVITY_LIMIT_MS = 120 * 60 * 1000;

function resolveSessionId() {
  if (typeof window === "undefined") {
    return "";
  }
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const next =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `rapid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

async function postActivity(url: string, payload: Record<string, unknown>, keepalive = false) {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      keepalive,
      body: JSON.stringify(payload),
    });
  } catch {
    // Activity tracking should stay silent if the network is temporarily unavailable.
  }
}

export function WorkspaceActivityTracker() {
  const pathname = usePathname();
  const sessionIdRef = useRef<string>("");
  const inactivityTimerRef = useRef<number | null>(null);
  const signingOutRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = resolveSessionId();
  }, []);

  useEffect(() => {
    const sessionId = sessionIdRef.current || resolveSessionId();
    if (!sessionId) {
      return;
    }

    const clearInactivityTimer = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };

    const signOutForInactivity = async () => {
      if (signingOutRef.current) {
        return;
      }
      signingOutRef.current = true;
      clearInactivityTimer();
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      await postActivity(
        "/api/activity/close",
        {
          sessionId,
          path: pathname,
          metadata: {
            reason: "inactivity_timeout",
          },
        },
        true,
      );
      await fetch("/api/auth/sign-out", {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      }).catch(() => null);
      window.location.replace("/login?status=session-timeout");
    };

    const restartInactivityTimer = () => {
      if (signingOutRef.current) {
        return;
      }
      clearInactivityTimer();
      inactivityTimerRef.current = window.setTimeout(() => {
        void signOutForInactivity();
      }, INACTIVITY_LIMIT_MS);
    };

    const sendHeartbeat = (keepalive = false) =>
      postActivity(
        "/api/activity/heartbeat",
        {
          sessionId,
          path: pathname,
          metadata: {
            visibility: typeof document === "undefined" ? "unknown" : document.visibilityState,
          },
        },
        keepalive,
      );

    void sendHeartbeat();
    restartInactivityTimer();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
        restartInactivityTimer();
      }
    };

    const handlePageHide = () => {
      void postActivity(
        "/api/activity/close",
        {
          sessionId,
          path: pathname,
          metadata: {
            reason: "pagehide",
          },
        },
        true,
      );
    };

    const handleUserActivity = () => {
      restartInactivityTimer();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("mousemove", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });
    window.addEventListener("mousedown", handleUserActivity, { passive: true });
    window.addEventListener("touchstart", handleUserActivity, { passive: true });
    window.addEventListener("scroll", handleUserActivity, { passive: true });

    return () => {
      window.clearInterval(intervalId);
      clearInactivityTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("mousedown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
    };
  }, [pathname]);

  return null;
}

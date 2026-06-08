"use client";

import { LogOut } from "lucide-react";

type LogoutFormProps = {
  compact?: boolean;
  iconOnly?: boolean;
};

export function LogoutForm({ compact = false, iconOnly = false }: LogoutFormProps) {
  const handleSignOut = () => {
    if (typeof window === "undefined") {
      return;
    }
    const sessionId = window.sessionStorage.getItem("rapid-activity-session");
    if (!sessionId) {
      return;
    }
    window.sessionStorage.removeItem("rapid-activity-session");
    void fetch("/api/activity/close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify({
        sessionId,
        path: window.location.pathname,
        metadata: {
          reason: "sign_out",
        },
      }),
    }).catch(() => {
      // Sign-out should not fail if the tracking endpoint is unavailable.
    });
  };

  return (
    <form action="/api/auth/sign-out" method="post">
      <button
        type="submit"
        onClick={handleSignOut}
        className={
          iconOnly
            ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            : compact
              ? "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            : "rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        }
        title={iconOnly ? "Sign out" : undefined}
      >
        {iconOnly ? <LogOut className="h-4 w-4" /> : "Sign out"}
      </button>
    </form>
  );
}

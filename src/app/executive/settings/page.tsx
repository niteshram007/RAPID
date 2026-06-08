import { redirect } from "next/navigation";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { canAccessWorkspaceArea, getDefaultRouteForRole, requirePermission } from "@/lib/auth";
import { getAdminActivityOverview, type AdminActivityOverview } from "@/lib/backend-api";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No activity yet";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(Math.round(totalSeconds || 0), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function getAbsentDays(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return null;
  }
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) {
    return null;
  }
  const now = new Date();
  const diffMs = Math.max(now.getTime() - seen.getTime(), 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildUserTimeBreakdown(activity: AdminActivityOverview) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const byUser = new Map<string, { monthSeconds: number; yearSeconds: number }>();

  for (const session of activity.sessions) {
    const userId = String(session.userId ?? "").trim();
    if (!userId) {
      continue;
    }

    const stamp = session.lastSeenAt ?? session.startedAt ?? session.endedAt;
    if (!stamp) {
      continue;
    }
    const sessionDate = new Date(stamp);
    if (Number.isNaN(sessionDate.getTime())) {
      continue;
    }

    const seconds = Math.max(Math.round(Number(session.totalActiveSeconds ?? 0)), 0);
    const entry = byUser.get(userId) ?? { monthSeconds: 0, yearSeconds: 0 };
    if (sessionDate.getFullYear() === year) {
      entry.yearSeconds += seconds;
      if (sessionDate.getMonth() === month) {
        entry.monthSeconds += seconds;
      }
    }
    byUser.set(userId, entry);
  }

  return byUser;
}

export default async function ExecutiveSettingsPage() {
  const session = await requirePermission("view_dashboard");
  if (!canAccessWorkspaceArea(session.role, "executive")) {
    redirect(getDefaultRouteForRole(session.role));
  }

  const activity = await getAdminActivityOverview(500);
  const timeByUser = buildUserTimeBreakdown(activity);
  const averageYearSeconds =
    activity.users.length > 0
      ? Math.round(
          activity.users.reduce((total, user) => {
            const mapped = timeByUser.get(user.userId);
            return total + (mapped?.yearSeconds ?? user.totalActiveSeconds ?? 0);
          }, 0) / activity.users.length,
        )
      : 0;

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Settings"
        title="Executive live activity"
        description="Leadership activity monitoring with month and year time spent across scoped users."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Active now</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">{activity.summary.activeCount}</p>
          <p className="mt-2 text-sm text-slate-600">
            Seen within the last {activity.activeWithinMinutes} minutes
          </p>
        </article>
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Tracked users</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">{activity.summary.trackedUsers}</p>
          <p className="mt-2 text-sm text-slate-600">People with recent workspace sessions</p>
        </article>
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Average year time</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">{formatDuration(averageYearSeconds)}</p>
          <p className="mt-2 text-sm text-slate-600">Average active time per tracked user this year</p>
        </article>
      </section>

      <section className="surface-card px-6 py-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Live user activity
        </p>
        <TableFullscreenShell
          title="Live user activity"
          description="Open live user activity in a full-page table view."
          className="mt-4 rounded-2xl border border-slate-200"
        >
          <table className="min-w-[980px] border-collapse text-sm text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white">
              <tr>
                {[
                  "User",
                  "Role",
                  "Status",
                  "Time spent (month)",
                  "Time spent (year)",
                  "Last seen",
                  "Last seen days",
                ].map((header) => (
                  <th
                    key={header}
                    className="border-b border-white/10 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.users.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                    No tracked activity yet.
                  </td>
                </tr>
              ) : (
                activity.users.map((user, index) => {
                  const times = timeByUser.get(user.userId);
                  const monthSeconds = times?.monthSeconds ?? 0;
                  const yearSeconds = times?.yearSeconds ?? user.totalActiveSeconds;
                  const absentDays = getAbsentDays(user.lastSeenAt);
                  return (
                    <tr
                      key={user.userId}
                      className={`border-b border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-950">{user.userName}</p>
                        <p className="mt-1 text-xs text-slate-500">{user.userEmail || "-"}</p>
                      </td>
                      <td className="px-3 py-2.5">{user.roleName || user.roleId || "-"}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                            user.isActive
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {user.isActive ? "Active now" : "Offline"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{formatDuration(monthSeconds)}</td>
                      <td className="px-3 py-2.5">{formatDuration(yearSeconds)}</td>
                      <td className="px-3 py-2.5">{formatTimestamp(user.lastSeenAt)}</td>
                      <td className="px-3 py-2.5">{absentDays === null ? "-" : absentDays}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableFullscreenShell>
      </section>
    </>
  );
}

import { Clock3, UserRound, Users2 } from "lucide-react";

import { HolidayManager } from "@/components/holiday-manager";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import type { SessionProfile } from "@/lib/auth";
import type { AdminActivityOverview, AdminWorkingDays } from "@/lib/backend-api";

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "No recent activity";
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

export function WorkspaceProfilePage({
  session,
  activityOverview,
  workingDays,
}: {
  session: SessionProfile;
  activityOverview?: AdminActivityOverview | null;
  workingDays?: AdminWorkingDays | null;
}) {
  const showExecutiveView = session.role?.id === "executive";
  const showWorkingDaysCalendar =
    Boolean(workingDays) && !["bdm", "practice-head"].includes(session.role?.id ?? "");

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Profile"
        title="Profile and access"
        description="Signed-in account details and workspace access for your current role."
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="surface-card px-6 py-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Signed in user
              </p>
              <h3 className="mt-1 text-3xl font-semibold text-slate-950">{session.name}</h3>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
              <p className="text-sm text-slate-500">Email</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{session.email}</p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
              <p className="text-sm text-slate-500">Role</p>
              <p className="mt-2 text-base font-semibold text-slate-950">
                {session.role?.name ?? "Unassigned"}
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
              <p className="text-sm text-slate-500">Title</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{session.title}</p>
            </div>
          </div>
        </article>
        <article className="surface-card px-6 py-6 lg:px-8">
          <span className="section-kicker">
            <Clock3 className="h-4 w-4" />
            Access snapshot
          </span>
          <div className="mt-6 grid gap-4">
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
              <p className="text-sm text-slate-500">Workspace</p>
              <p className="mt-2 text-base font-semibold text-slate-950">
                {session.role?.name ?? "Workspace user"}
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-5">
              <p className="text-sm text-slate-500">Activity window</p>
              <p className="mt-2 text-base font-semibold text-slate-950">
                {activityOverview ? `${activityOverview.activeWithinMinutes} minutes` : "Not available"}
              </p>
            </div>
          </div>
        </article>
      </section>

      {showExecutiveView ? (
        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <article className="surface-card px-6 py-6 lg:px-8">
            <span className="section-kicker">
              <Users2 className="h-4 w-4" />
              Live activity
            </span>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-[20px] border border-slate-100 bg-white px-4 py-3.5">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Active now</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {activityOverview?.summary.activeCount ?? 0}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-100 bg-white px-4 py-3.5">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Tracked people</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {activityOverview?.summary.trackedUsers ?? 0}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-100 bg-white px-4 py-3.5">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Open sessions</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {(activityOverview?.sessions ?? []).filter((entry) => entry.isActive).length}
                </p>
              </div>
            </div>
          </article>

          <article className="surface-card px-6 py-6 lg:px-8">
            <span className="section-kicker">
              <Clock3 className="h-4 w-4" />
              Who is active
            </span>
            <div className="mt-6 space-y-3">
              {(activityOverview?.users ?? []).slice(0, 8).map((user) => (
                <div
                  key={user.userId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-100 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{user.userName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {user.roleName || user.roleId || "Team member"} | {user.lastPath || "-"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-slate-950">{formatDuration(user.totalActiveSeconds)}</p>
                    <p className="mt-1 text-slate-500">
                      {user.isActive ? "Active now" : formatTimestamp(user.lastSeenAt)}
                    </p>
                  </div>
                </div>
              ))}
              {(activityOverview?.users ?? []).length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/80 px-5 py-6 text-sm text-slate-500">
                  User activity will appear here after people start using the workspace.
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {showWorkingDaysCalendar && workingDays ? (
        <HolidayManager
          months={workingDays.months}
          initialRows={workingDays.rows}
          editable={false}
        />
      ) : null}
    </>
  );
}

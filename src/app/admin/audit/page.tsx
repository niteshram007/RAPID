import Link from "next/link";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getAdminActivityOverview, getAdminAuditLogs } from "@/lib/backend-api";

function formatTime(value: string | null) {
  if (!value) {
    return "-";
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

function formatAction(action: string) {
  return action
    .split(/[._]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata ?? {}).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) {
    return "-";
  }
  return entries
    .slice(0, 4)
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim();
      const rendered = Array.isArray(value) ? value.join(", ") : String(value);
      return `${label}: ${rendered}`;
    })
    .join(" | ");
}

export default async function AdminAuditPage() {
  const [payload, activity] = await Promise.all([getAdminAuditLogs(1200), getAdminActivityOverview(700)]);

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Audit"
        title="Platform audit and session logs"
        description="Session history and explainable action logs are centralized here for admin review."
        actions={
          <Link
            href="/api/admin/audit/export-docx"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Export DOCX
          </Link>
        }
      />

      <section className="surface-card px-6 py-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Session log</p>
        <TableFullscreenShell
          title="Session log"
          description="Open the admin session history in a full-page table view."
          className="mt-4 rounded-2xl border border-slate-200"
        >
          <table className="min-w-[1020px] border-collapse text-sm text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white">
              <tr>
                {["User", "Role", "State", "Started", "Last seen", "Ended", "Time spent", "Page"].map((header) => (
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
              {activity.sessions.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                    No session logs recorded yet.
                  </td>
                </tr>
              ) : (
                activity.sessions.map((entry, index) => (
                  <tr
                    key={entry.sessionId}
                    className={`border-b border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                  >
                    <td className="px-3 py-2.5">{entry.userName}</td>
                    <td className="px-3 py-2.5">{entry.roleName || entry.roleId || "-"}</td>
                    <td className="px-3 py-2.5">{entry.isActive ? "Active" : "Closed"}</td>
                    <td className="px-3 py-2.5">{formatTime(entry.startedAt)}</td>
                    <td className="px-3 py-2.5">{formatTime(entry.lastSeenAt)}</td>
                    <td className="px-3 py-2.5">{formatTime(entry.endedAt)}</td>
                    <td className="px-3 py-2.5">{formatDuration(entry.totalActiveSeconds)}</td>
                    <td className="px-3 py-2.5">{entry.lastPath || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableFullscreenShell>
      </section>

      <section className="surface-card px-6 py-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Explainable audit log | Total logs: {payload.count}
        </p>
        <TableFullscreenShell
          title="Explainable audit log"
          description="Open the audit trail in a full-page table view."
          className="mt-4 rounded-2xl border border-slate-200"
        >
          <table className="min-w-[1150px] border-collapse text-sm text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white">
              <tr>
                {["Timestamp", "Actor", "Role", "Action", "Status", "Detail", "Metadata"].map((header) => (
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
              {payload.logs.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                    No logs recorded yet.
                  </td>
                </tr>
              ) : (
                payload.logs.map((log, index) => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                  >
                    <td className="px-3 py-2.5">{formatTime(log.createdAt)}</td>
                    <td className="px-3 py-2.5">{log.actorName || "-"}</td>
                    <td className="px-3 py-2.5">{log.actorRole || "-"}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{formatAction(log.action)}</td>
                    <td className="px-3 py-2.5">{log.status}</td>
                    <td className="px-3 py-2.5">{log.detail || "-"}</td>
                    <td className="px-3 py-2.5">{formatMetadata(log.metadata)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableFullscreenShell>
      </section>
    </>
  );
}

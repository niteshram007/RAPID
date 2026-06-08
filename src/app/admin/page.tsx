import Link from "next/link";
import { Users2 } from "lucide-react";

import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getAdminOverview } from "@/lib/backend-api";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminPage() {
  const overview = await getAdminOverview();
  const mapping = overview.budgetMapping;

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Overview"
        title="Platform operating summary"
        description="Compact admin control center for users, uploads, and settings."
        actions={
          <>
            <Link
              href="/admin/users"
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Manage users
            </Link>
            <Link
              href="/admin/upload"
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            >
              Upload workbook
            </Link>
            <Link
              href="/admin/master-data"
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            >
              Masterdata
            </Link>
            <Link
              href="/admin/projects"
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            >
              Project management
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Users</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">
            {overview.totals.users}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {overview.totals.activeUsers} active users
          </p>
        </article>
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Uploads</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">
            {overview.totals.uploads}
          </p>
          <p className="mt-2 text-sm text-slate-600">Tracked workbook uploads</p>
        </article>
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Roles</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">
            {overview.totals.roles}
          </p>
          <p className="mt-2 text-sm text-slate-600">Authority packs available</p>
        </article>
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Locations</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">
            {overview.totals.locations}
          </p>
          <p className="mt-2 text-sm text-slate-600">Geo + practice catalogs</p>
        </article>
        <article className="metric-chip">
          <p className="text-sm text-slate-500">Mapped Budget Rows</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">
            {overview.totals.mappedBudgetRows}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Coverage {mapping.summary.coveragePercent.toFixed(1)}%
          </p>
        </article>
      </section>

      <section className="surface-card px-6 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Budget Auto Mapping
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">
              OCN and Masterdata mapped records
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Latest batch: {mapping.financialYear ?? "N/A"} · Updated {formatTimestamp(mapping.updatedAt)}
            </p>
          </div>
          <Link
            href="/admin/master-data"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
          >
            Open Masterdata
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{mapping.summary.totalRows}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Mapped</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700">{mapping.summary.mappedRows}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Auto Enriched</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{mapping.summary.autoEnrichedRows}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Manual Approved</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{mapping.summary.manualApprovedRows}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Manual Review</p>
            <p className="mt-1 text-lg font-semibold text-amber-700">{mapping.summary.manualReviewRows}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Unmatched</p>
            <p className="mt-1 text-lg font-semibold text-rose-700">{mapping.summary.unmatchedRows}</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-3 py-2 font-semibold">Row</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Project</th>
                <th className="px-3 py-2 font-semibold">OCN</th>
                <th className="px-3 py-2 font-semibold">Emp ID</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 text-right font-semibold">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {mapping.mappedRows.length > 0 ? (
                mapping.mappedRows.map((row) => (
                  <tr key={`mapped-row-${row.rowNumber}`} className="border-t border-slate-100 bg-white">
                    <td className="px-3 py-2">{row.rowNumber}</td>
                    <td className="px-3 py-2">{row.customerName || "-"}</td>
                    <td className="px-3 py-2">{row.projectName || "-"}</td>
                    <td className="px-3 py-2">{row.ocnNumber || "-"}</td>
                    <td className="px-3 py-2">{row.empId || "-"}</td>
                    <td className="px-3 py-2">{row.matchStatus}</td>
                    <td className="px-3 py-2">{row.matchSource}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.matchConfidence.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-5 text-center text-slate-500" colSpan={8}>
                    No mapped rows available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-3 py-2 font-semibold">Row</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Project</th>
                <th className="px-3 py-2 font-semibold">Identifier</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Validation</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 text-right font-semibold">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {mapping.logicalMappings.length > 0 ? (
                mapping.logicalMappings.map((row) => (
                  <tr key={`logical-map-${row.rowNumber}`} className="border-t border-slate-100 bg-white">
                    <td className="px-3 py-2">{row.rowNumber}</td>
                    <td className="px-3 py-2">{row.customerName || "-"}</td>
                    <td className="px-3 py-2">{row.projectName || "-"}</td>
                    <td className="px-3 py-2">
                      {row.primaryIdentifierType || "-"}: {row.primaryIdentifierValue || "-"}
                    </td>
                    <td className="px-3 py-2">{row.matchStatus || "-"}</td>
                    <td className="px-3 py-2">
                      {row.validationStatus || "-"}
                      {row.validationMessage ? ` · ${row.validationMessage}` : ""}
                    </td>
                    <td className="px-3 py-2">{row.matchSource || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.matchConfidence.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-5 text-center text-slate-500" colSpan={8}>
                    No logical mappings available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Users2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recently updated users
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">
              Access movement snapshot
            </h3>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {overview.users.length > 0 ? (
            overview.users.map((user) => (
              <article
                key={user.id}
                className="rounded-[22px] border border-slate-100 bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">{user.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{user.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                    {user.roleId}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">
                    {user.geo}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                    {user.practice}
                  </span>
                  <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-violet-800">
                    {user.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-slate-600">
                  Last updated {formatTimestamp(user.updatedAt)}
                </p>
              </article>
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-5 py-6 text-sm leading-7 text-slate-600">
              User activity will appear here after the admin endpoints are in regular use.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

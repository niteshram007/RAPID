"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw } from "lucide-react";

type MappingTab = "customer" | "project" | "manual";

type MappingPayload = {
  financial_year: string;
  summary: {
    customer_group_count: number;
    project_group_count: number;
    manual_review_rows: number;
  };
  customer_groups: Array<{
    id: string;
    standard_customer_name: string;
    customer_group_key: string;
    customer_id: string;
    mapping_status: string;
    confidence: number;
    reference_type_used: string;
    reference_values: string;
    budget_customer_names: string[];
    actuals_customer_names: string[];
    number_of_budget_rows: number;
    number_of_actual_rows: number;
    last_updated: string | null;
  }>;
  project_groups: Array<{
    id: string;
    customer_mapping_id: string;
    standard_project_name: string;
    project_group_key: string;
    ocn_number: string;
    mapping_status: string;
    confidence: number;
    reference_values: string;
    budget_project_names: string[];
    actuals_project_names: string[];
    number_of_budget_rows: number;
    number_of_actual_rows: number;
    last_updated: string | null;
  }>;
  manual_review: Array<{
    row_number: number;
    ps_ms_budget: string;
    emp_id: string;
    ocn_number: string;
    budget_customer_name: string;
    suggested_standard_customer: string;
    budget_project_name: string;
    suggested_standard_project: string;
    match_source: string;
    match_reason: string;
    confidence: number;
    error_reason: string;
  }>;
};

export function MasterdataMappingWorkspace({
  financialYears,
  initialFinancialYear,
}: {
  financialYears: string[];
  initialFinancialYear: string;
}) {
  const [financialYear, setFinancialYear] = useState(initialFinancialYear);
  const [tab, setTab] = useState<MappingTab>("customer");
  const [busyId, setBusyId] = useState("");

  const query = useQuery({
    queryKey: ["masterdata-mapping-groups", financialYear],
    queryFn: async () => {
      const search = new URLSearchParams({ financialYear });
      const response = await fetch(`/api/masterdata/mapping-groups?${search.toString()}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as MappingPayload | { detail?: string } | null;
      if (!response.ok || !body || !("summary" in body)) {
        throw new Error(body && "detail" in body ? body.detail : "Unable to load mapping groups.");
      }
      return body;
    },
    refetchOnWindowFocus: false,
  });

  async function runAction(input: {
    entityType: "customer" | "project";
    action: string;
    mappingId: string;
    standardName?: string;
  }) {
    setBusyId(input.mappingId);
    try {
      const response = await fetch("/api/masterdata/mapping-groups/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error("Unable to save mapping action.");
      }
      await query.refetch();
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="surface-card space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Admin Masterdata
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
            Customer and project mapping groups
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={financialYear}
            onChange={(event) => setFinancialYear(event.target.value)}
            className="auth-input min-w-[170px]"
          >
            {financialYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading mapping groups...
          </span>
        </div>
      ) : query.isError || !query.data ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-sm text-rose-700">
          Unable to load mapping groups.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Customer Groups</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{query.data.summary.customer_group_count}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Groups</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{query.data.summary.project_group_count}</p>
            </article>
            <article className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Manual Review Queue</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">{query.data.summary.manual_review_rows}</p>
            </article>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("customer")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "customer" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              Customer Mapping Groups
            </button>
            <button
              type="button"
              onClick={() => setTab("project")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "project" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              Project Mapping Groups
            </button>
            <button
              type="button"
              onClick={() => setTab("manual")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "manual" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              Manual Review Queue
            </button>
          </div>

          {tab === "customer" ? (
            <div className="overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1300px] text-left text-xs text-slate-700">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-2">Standard Customer</th>
                    <th className="px-3 py-2">Group Key</th>
                    <th className="px-3 py-2">Aliases</th>
                    <th className="px-3 py-2">References</th>
                    <th className="px-3 py-2">Budget Rows</th>
                    <th className="px-3 py-2">Actual Rows</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.customer_groups.map((group, index) => (
                    <tr key={group.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2">{group.standard_customer_name}</td>
                      <td className="px-3 py-2">{group.customer_group_key}</td>
                      <td className="px-3 py-2">{group.budget_customer_names.join(", ")}</td>
                      <td className="px-3 py-2">{group.reference_values}</td>
                      <td className="px-3 py-2">{group.number_of_budget_rows}</td>
                      <td className="px-3 py-2">{group.number_of_actual_rows}</td>
                      <td className="px-3 py-2">{group.mapping_status}</td>
                      <td className="px-3 py-2">{group.confidence.toFixed(0)}%</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void runAction({ entityType: "customer", action: "approve", mappingId: group.id })
                            }
                            disabled={busyId === group.id}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runAction({ entityType: "customer", action: "manual_review", mappingId: group.id })
                            }
                            disabled={busyId === group.id}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const standardName = window.prompt("Edit standard customer name", group.standard_customer_name);
                              if (!standardName) return;
                              void runAction({
                                entityType: "customer",
                                action: "edit_name",
                                mappingId: group.id,
                                standardName,
                              });
                            }}
                            disabled={busyId === group.id}
                            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runAction({ entityType: "customer", action: "reject", mappingId: group.id })
                            }
                            disabled={busyId === group.id}
                            className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "project" ? (
            <div className="overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1300px] text-left text-xs text-slate-700">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-2">Standard Project</th>
                    <th className="px-3 py-2">Project Group Key</th>
                    <th className="px-3 py-2">Aliases</th>
                    <th className="px-3 py-2">References</th>
                    <th className="px-3 py-2">Budget Rows</th>
                    <th className="px-3 py-2">Actual Rows</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.project_groups.map((group, index) => (
                    <tr key={group.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2">{group.standard_project_name}</td>
                      <td className="px-3 py-2">{group.project_group_key}</td>
                      <td className="px-3 py-2">{group.budget_project_names.join(", ")}</td>
                      <td className="px-3 py-2">{group.reference_values}</td>
                      <td className="px-3 py-2">{group.number_of_budget_rows}</td>
                      <td className="px-3 py-2">{group.number_of_actual_rows}</td>
                      <td className="px-3 py-2">{group.mapping_status}</td>
                      <td className="px-3 py-2">{group.confidence.toFixed(0)}%</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void runAction({ entityType: "project", action: "approve", mappingId: group.id })
                            }
                            disabled={busyId === group.id}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runAction({ entityType: "project", action: "manual_review", mappingId: group.id })
                            }
                            disabled={busyId === group.id}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const standardName = window.prompt("Edit standard project name", group.standard_project_name);
                              if (!standardName) return;
                              void runAction({
                                entityType: "project",
                                action: "edit_name",
                                mappingId: group.id,
                                standardName,
                              });
                            }}
                            disabled={busyId === group.id}
                            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runAction({ entityType: "project", action: "reject", mappingId: group.id })
                            }
                            disabled={busyId === group.id}
                            className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "manual" ? (
            <div className="overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1300px] text-left text-xs text-slate-700">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">PS/MS</th>
                    <th className="px-3 py-2">Emp ID</th>
                    <th className="px-3 py-2">OCN</th>
                    <th className="px-3 py-2">Budget Customer</th>
                    <th className="px-3 py-2">Suggested Customer</th>
                    <th className="px-3 py-2">Budget Project</th>
                    <th className="px-3 py-2">Suggested Project</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.manual_review.map((row, index) => (
                    <tr key={`${row.row_number}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2">{row.row_number}</td>
                      <td className="px-3 py-2">{row.ps_ms_budget}</td>
                      <td className="px-3 py-2">{row.emp_id}</td>
                      <td className="px-3 py-2">{row.ocn_number}</td>
                      <td className="px-3 py-2">{row.budget_customer_name}</td>
                      <td className="px-3 py-2">{row.suggested_standard_customer}</td>
                      <td className="px-3 py-2">{row.budget_project_name}</td>
                      <td className="px-3 py-2">{row.suggested_standard_project}</td>
                      <td className="px-3 py-2">{row.match_reason || row.error_reason}</td>
                      <td className="px-3 py-2">{row.confidence.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

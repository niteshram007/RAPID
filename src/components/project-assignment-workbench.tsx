"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Building2,
  Layers3,
  LoaderCircle,
  Search,
  UserRound,
  Users,
} from "lucide-react";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type {
  ProjectAssignmentProjectRow,
  ProjectAssignmentWorkbench,
  ProjectReassignmentResponse,
} from "@/lib/rapid-revenue";

type ProjectAssignmentWorkbenchProps = {
  initial: ProjectAssignmentWorkbench;
  mode?: "projects" | "allocation-board";
};

type AllocationTokenKind = "bdm" | "practice_head" | "entity";
type AllocationToken = {
  kind: AllocationTokenKind;
  value: string;
  count: number;
};
type MovedAllocation = {
  recordId: number;
  label: string;
  from: string;
  effectiveMonth: string;
  bdm: string;
  practiceHead: string;
  entity: string;
};
type AllocationDragItem = {
  kind: AllocationTokenKind;
  value: string;
  sourceGeoHead: string;
};
type AllocationGroup = {
  geoHead: string;
  title: string;
  projectCount: number;
  tokens: Record<AllocationTokenKind, AllocationToken[]>;
  movedIn: MovedAllocation[];
};

const FALLBACK_MONTHS = [
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
  "Jan 2027",
  "Feb 2027",
  "Mar 2027",
];

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function incrementCounter(map: Map<string, number>, value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function serializeTokens(kind: AllocationTokenKind, map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([value, count]) => ({ kind, value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

function isOutgoingAssignment(project: ProjectAssignmentProjectRow) {
  return String(project.assignmentDirection ?? "").trim().toLowerCase() === "outgoing";
}

function isIncomingGeoHeadAssignment(project: ProjectAssignmentProjectRow) {
  return (
    String(project.assignmentType ?? "").trim().toLowerCase() === "geo_head" &&
    String(project.assignmentDirection ?? "").trim().toLowerCase() === "incoming"
  );
}

function buildAllocationGroups(
  projects: ProjectAssignmentProjectRow[],
  geoHeadOptions: string[],
): AllocationGroup[] {
  const groups = new Map<
    string,
    {
      geoHead: string;
      projectCount: number;
      bdms: Map<string, number>;
      practiceHeads: Map<string, number>;
      entities: Map<string, number>;
      movedIn: MovedAllocation[];
    }
  >();

  const ensureGroup = (geoHead: string) => {
    const key = geoHead.trim();
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const group = {
      geoHead: key,
      projectCount: 0,
      bdms: new Map<string, number>(),
      practiceHeads: new Map<string, number>(),
      entities: new Map<string, number>(),
      movedIn: [],
    };
    groups.set(key, group);
    return group;
  };

  geoHeadOptions.forEach((geoHead) => ensureGroup(geoHead));
  for (const project of projects) {
    const group = ensureGroup(project.geoHead);
    if (isOutgoingAssignment(project)) {
      continue;
    }
    group.projectCount += 1;
    incrementCounter(group.bdms, project.currentBdm);
    incrementCounter(group.practiceHeads, project.practiceHead);
    incrementCounter(group.entities, project.entity);
    if (isIncomingGeoHeadAssignment(project)) {
      group.movedIn.push({
        recordId: project.recordId,
        label: project.projectName || project.customerName || `Record ${project.recordId}`,
        from: project.assignmentFrom || "Previous Geo Head",
        effectiveMonth: project.assignmentEffectiveMonth || "",
        bdm: project.currentBdm,
        practiceHead: project.practiceHead,
        entity: project.entity,
      });
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      geoHead: group.geoHead,
      title: group.geoHead || "Unassigned",
      projectCount: group.projectCount,
      tokens: {
        bdm: serializeTokens("bdm", group.bdms),
        practice_head: serializeTokens("practice_head", group.practiceHeads),
        entity: serializeTokens("entity", group.entities),
      },
      movedIn: group.movedIn.sort((left, right) => left.label.localeCompare(right.label)),
    }))
    .sort((left, right) => {
      if (!left.geoHead) {
        return 1;
      }
      if (!right.geoHead) {
        return -1;
      }
      return left.geoHead.localeCompare(right.geoHead);
    });
}

function getTokenLabel(kind: AllocationTokenKind) {
  if (kind === "practice_head") {
    return "Practice Heads";
  }
  if (kind === "entity") {
    return "Entities";
  }
  return "BDMs";
}

function TokenIcon({ kind }: { kind: AllocationTokenKind }) {
  if (kind === "practice_head") {
    return <Users className="h-3.5 w-3.5" />;
  }
  if (kind === "entity") {
    return <Building2 className="h-3.5 w-3.5" />;
  }
  return <UserRound className="h-3.5 w-3.5" />;
}

export function ProjectAssignmentWorkbench({
  initial,
  mode = "projects",
}: ProjectAssignmentWorkbenchProps) {
  const [projects, setProjects] = useState(initial.projects);
  const [search, setSearch] = useState("");
  const [pendingRecordId, setPendingRecordId] = useState<number | null>(null);
  const [geoPendingRecordId, setGeoPendingRecordId] = useState<number | null>(null);
  const [allocationSavingKey, setAllocationSavingKey] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<AllocationDragItem | null>(null);
  const [dropGeoHead, setDropGeoHead] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const currentProjects = useMemo(
    () => projects.filter((project) => !isOutgoingAssignment(project)),
    [projects],
  );
  const bdmOptions = useMemo(
    () => uniqueSorted([...(initial.bdmOptions ?? []), ...currentProjects.map((project) => project.currentBdm)]),
    [currentProjects, initial.bdmOptions],
  );
  const geoHeadOptions = useMemo(
    () => uniqueSorted([...(initial.geoHeadOptions ?? []), ...currentProjects.map((project) => project.geoHead)]),
    [currentProjects, initial.geoHeadOptions],
  );
  const monthOptions = initial.monthOptions?.length ? initial.monthOptions : FALLBACK_MONTHS;

  const selectedAssignments = useMemo(
    () =>
      currentProjects.reduce<Record<number, string>>((accumulator, project) => {
        accumulator[project.recordId] = project.currentBdm || "";
        return accumulator;
      }, {}),
    [currentProjects],
  );
  const [draftAssignments, setDraftAssignments] = useState<Record<number, string>>(selectedAssignments);
  const [draftEffectiveMonths, setDraftEffectiveMonths] = useState<Record<number, string>>({});
  const selectedGeoAssignments = useMemo(
    () =>
      currentProjects.reduce<Record<number, string>>((accumulator, project) => {
        accumulator[project.recordId] = project.geoHead || "";
        return accumulator;
      }, {}),
    [currentProjects],
  );
  const [draftGeoAssignments, setDraftGeoAssignments] = useState<Record<number, string>>(selectedGeoAssignments);
  const [draftGeoEffectiveMonths, setDraftGeoEffectiveMonths] = useState<Record<number, string>>({});
  const [allocationEffectiveMonth, setAllocationEffectiveMonth] = useState(monthOptions[0] ?? "Apr 2026");

  const allocationGroups = useMemo(
    () => buildAllocationGroups(currentProjects, geoHeadOptions),
    [currentProjects, geoHeadOptions],
  );

  const visibleProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return currentProjects;
    }
    return currentProjects.filter((row) =>
      [
        row.customerName,
        row.projectName,
        row.msps,
        row.entity,
        row.practiceHead,
        row.geoHead,
        row.currentBdm,
        row.recordId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [currentProjects, search]);

  async function refreshWorkbench() {
    const response = await fetch("/api/revenue/project-assignment-requests", {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as ProjectAssignmentWorkbench | null;
    if (!response.ok || !body?.projects) {
      return;
    }
    setProjects(body.projects);
    setDraftAssignments(
      body.projects.reduce<Record<number, string>>((accumulator, project) => {
        accumulator[project.recordId] = project.currentBdm || "";
        return accumulator;
      }, {}),
    );
    setDraftGeoAssignments(
      body.projects.reduce<Record<number, string>>((accumulator, project) => {
        accumulator[project.recordId] = project.geoHead || "";
        return accumulator;
      }, {}),
    );
  }

  function summarizeResponse(response: ProjectReassignmentResponse) {
    if (response.message) {
      return response.message;
    }
    return `${response.createdRecords} new row(s) created and ${response.affectedRecords} existing row(s) closed from ${response.effectiveMonth}.`;
  }

  async function submitReassignment(
    payload: Record<string, string | number | undefined>,
    fallbackMessage: string,
  ) {
    const response = await fetch("/api/revenue/project-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as
      | (ProjectReassignmentResponse & { detail?: string })
      | null;
    if (!response.ok || !body?.status) {
      throw new Error(body?.detail ?? fallbackMessage);
    }
    await refreshWorkbench();
    setStatus({ tone: "success", text: summarizeResponse(body) });
  }

  async function applyProjectReassignment(recordId: number) {
    const project = projects.find((row) => row.recordId === recordId);
    const nextBdm = String(draftAssignments[recordId] ?? "").trim();
    const effectiveMonth = String(draftEffectiveMonths[recordId] ?? monthOptions[0] ?? "").trim();
    if (!project || !nextBdm || !effectiveMonth) {
      setStatus({ tone: "error", text: "Choose a project, new BDM, and effective month." });
      return;
    }
    if (nextBdm.toLowerCase() === project.currentBdm.trim().toLowerCase()) {
      setStatus({ tone: "error", text: "Choose a different BDM for reassignment." });
      return;
    }

    setPendingRecordId(recordId);
    setStatus(null);
    try {
      await submitReassignment(
        {
          assignmentType: "bdm",
          recordId,
          currentBdm: project.currentBdm,
          nextBdm,
          effectiveMonth,
        },
        "Unable to apply reassignment.",
      );
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to apply reassignment.",
      });
    } finally {
      setPendingRecordId(null);
    }
  }

  async function applyGeoHeadProjectReassignment(recordId: number) {
    const project = projects.find((row) => row.recordId === recordId);
    const nextGeoHead = String(draftGeoAssignments[recordId] ?? "").trim();
    const effectiveMonth = String(draftGeoEffectiveMonths[recordId] ?? monthOptions[0] ?? "").trim();
    if (!project || !nextGeoHead || !effectiveMonth) {
      setStatus({ tone: "error", text: "Choose a project, new Geo Head, and effective month." });
      return;
    }
    if (nextGeoHead.toLowerCase() === project.geoHead.trim().toLowerCase()) {
      setStatus({ tone: "error", text: "Choose a different Geo Head for reassignment." });
      return;
    }

    setGeoPendingRecordId(recordId);
    setStatus(null);
    try {
      await submitReassignment(
        {
          assignmentType: "geo_head",
          recordId,
          currentGeoHead: project.geoHead,
          nextGeoHead,
          effectiveMonth,
        },
        "Unable to apply Geo Head reassignment.",
      );
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to apply Geo Head reassignment.",
      });
    } finally {
      setGeoPendingRecordId(null);
    }
  }

  async function applyAllocationDrop(targetGeoHead: string) {
    const currentDragItem = dragItem;
    const currentGeoHead = String(currentDragItem?.sourceGeoHead ?? "").trim();
    const nextGeoHead = targetGeoHead.trim();
    const effectiveMonth = allocationEffectiveMonth.trim();
    const value = String(currentDragItem?.value ?? "").trim();
    if (!currentDragItem || !currentGeoHead || !nextGeoHead || !value || !effectiveMonth) {
      setStatus({ tone: "error", text: "Choose a source owner, target Geo Head, and effective month." });
      return;
    }
    if (currentGeoHead.toLowerCase() === nextGeoHead.toLowerCase()) {
      return;
    }

    const savingKey = `${currentDragItem.kind}:${currentGeoHead}:${value}:${nextGeoHead}`;
    setAllocationSavingKey(savingKey);
    setStatus(null);
    try {
      await submitReassignment(
        {
          assignmentType: "geo_head",
          currentGeoHead,
          nextGeoHead,
          effectiveMonth,
          currentBdm: currentDragItem.kind === "bdm" ? value : undefined,
          practiceHead: currentDragItem.kind === "practice_head" ? value : undefined,
          entity: currentDragItem.kind === "entity" ? value : undefined,
        },
        "Unable to apply Geo Head allocation.",
      );
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to apply Geo Head allocation.",
      });
    } finally {
      setAllocationSavingKey(null);
      setDragItem(null);
      setDropGeoHead(null);
    }
  }

  function renderAllocationTokens(group: AllocationGroup, kind: AllocationTokenKind) {
    const tokens = group.tokens[kind];
    if (tokens.length === 0) {
      return <p className="px-2 py-1.5 text-xs text-slate-400">None</p>;
    }
    return tokens.map((token) => {
      const savingKey = `${token.kind}:${group.geoHead}:${token.value}`;
      return (
        <button
          key={`${group.geoHead}-${token.kind}-${token.value}`}
          type="button"
          draggable={Boolean(group.geoHead) && !allocationSavingKey}
          onDragStart={() =>
            setDragItem({
              kind: token.kind,
              value: token.value,
              sourceGeoHead: group.geoHead,
            })
          }
          onDragEnd={() => {
            setDragItem(null);
            setDropGeoHead(null);
          }}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-left text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!group.geoHead || Boolean(allocationSavingKey)}
        >
          <TokenIcon kind={token.kind} />
          <span className="min-w-0 flex-1 truncate">{token.value}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            {token.count}
          </span>
          {allocationSavingKey?.startsWith(savingKey) ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : null}
        </button>
      );
    });
  }

  return (
    <div className="space-y-5">
      <section className="surface-card px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Project Management
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              {mode === "allocation-board" ? "Geo Head Allocation Board" : "Project Level Mapping"}
            </h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search project, customer, or owner"
              className="h-10 w-72 rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none"
            />
          </div>
        </div>
      </section>

      {status ? (
        <div
          className={`rounded-[18px] border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {status.text}
        </div>
      ) : null}

      {mode === "allocation-board" ? (
        <section className="surface-card px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Allocation Board
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                Geo Heads
              </h3>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Allocation Month
              <select
                value={allocationEffectiveMonth}
                onChange={(event) => setAllocationEffectiveMonth(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700"
              >
                {monthOptions.map((month) => (
                  <option key={`allocation-month-${month}`} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {allocationGroups.map((group) => {
              const isDropTarget =
                dragItem !== null &&
                Boolean(group.geoHead) &&
                dragItem.sourceGeoHead.toLowerCase() !== group.geoHead.toLowerCase();
              return (
                <div
                  key={group.geoHead || "unassigned"}
                  onDragOver={(event) => {
                    if (isDropTarget) {
                      event.preventDefault();
                      setDropGeoHead(group.geoHead);
                    }
                  }}
                  onDragLeave={() => setDropGeoHead(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (isDropTarget) {
                      void applyAllocationDrop(group.geoHead);
                    }
                  }}
                  className={`min-h-[260px] rounded-[20px] border p-4 transition ${
                    dropGeoHead === group.geoHead
                      ? "border-sky-300 bg-sky-50"
                      : "border-slate-200 bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-950">{group.title}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {group.projectCount.toLocaleString("en-US")} projects
                      </p>
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                      <Layers3 className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {(["bdm", "practice_head", "entity"] as const).map((kind) => (
                      <div key={`${group.geoHead}-${kind}`} className="rounded-xl bg-white/70 p-2">
                        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {getTokenLabel(kind)}
                        </p>
                        <div className="space-y-2">{renderAllocationTokens(group, kind)}</div>
                      </div>
                    ))}
                  </div>
                  {group.movedIn.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                        Moved in
                      </p>
                      <div className="mt-2 space-y-2">
                        {group.movedIn.slice(0, 5).map((item) => (
                          <div key={`${group.geoHead}-moved-${item.recordId}`} className="rounded-lg bg-white/80 px-2 py-2 text-xs text-slate-700">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate font-semibold text-slate-950">{item.label}</span>
                              {item.effectiveMonth ? (
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  {item.effectiveMonth}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              From {item.from} - {item.bdm || "No BDM"} - {item.practiceHead || "No Practice Head"} - {item.entity || "No Entity"}
                            </p>
                          </div>
                        ))}
                        {group.movedIn.length > 5 ? (
                          <p className="px-1 text-[11px] font-semibold text-amber-800">
                            +{(group.movedIn.length - 5).toLocaleString("en-US")} more moved rows
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {mode === "projects" ? (
        <TableFullscreenShell
          title="Project reassignment"
          description="Clear project-level mapping for BDM and Geo Head."
          className="rounded-[20px] border border-slate-200 bg-white"
        >
          <table className="min-w-[1860px] text-left text-sm text-slate-700">
            <thead className="sticky top-0 z-20 bg-slate-950 text-white">
              <tr>
                {[
                  "Customer Name",
                  "Project Name",
                  "MS/PS",
                  "Entity",
                  "Practice Head",
                  "Current Geo Head",
                  "Current BDM",
                  "New BDM",
                  "BDM Month",
                  "BDM Action",
                  "New Geo Head",
                  "Geo Month",
                  "Geo Action",
                ].map((header) => (
                  <th key={header} className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((row, index) => {
                const draftBdm = draftAssignments[row.recordId] ?? row.currentBdm;
                const draftGeoHead = draftGeoAssignments[row.recordId] ?? row.geoHead;
                return (
                  <tr
                    key={row.recordId}
                    className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"}`}
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-950">{row.customerName}</td>
                    <td className="px-3 py-2.5">{row.projectName || "-"}</td>
                    <td className="px-3 py-2.5">{row.msps || "-"}</td>
                    <td className="px-3 py-2.5">{row.entity || "-"}</td>
                    <td className="px-3 py-2.5">{row.practiceHead || "-"}</td>
                    <td className="px-3 py-2.5">{row.geoHead || "-"}</td>
                    <td className="px-3 py-2.5">{row.currentBdm || "-"}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={draftBdm}
                        onChange={(event) =>
                          setDraftAssignments((current) => ({
                            ...current,
                            [row.recordId]: event.target.value,
                          }))
                        }
                        className="h-9 min-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                      >
                        {bdmOptions.map((option) => (
                          <option key={`${row.recordId}-bdm-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={draftEffectiveMonths[row.recordId] ?? monthOptions[0]}
                        onChange={(event) =>
                          setDraftEffectiveMonths((current) => ({
                            ...current,
                            [row.recordId]: event.target.value,
                          }))
                        }
                        className="h-9 min-w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                      >
                        {monthOptions.map((month) => (
                          <option key={`${row.recordId}-bdm-month-${month}`} value={month}>
                            {month}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void applyProjectReassignment(row.recordId)}
                        disabled={pendingRecordId === row.recordId}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingRecordId === row.recordId ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        )}
                        Move BDM
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={draftGeoHead}
                        onChange={(event) =>
                          setDraftGeoAssignments((current) => ({
                            ...current,
                            [row.recordId]: event.target.value,
                          }))
                        }
                        className="h-9 min-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                      >
                        {geoHeadOptions.map((option) => (
                          <option key={`${row.recordId}-geo-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={draftGeoEffectiveMonths[row.recordId] ?? monthOptions[0]}
                        onChange={(event) =>
                          setDraftGeoEffectiveMonths((current) => ({
                            ...current,
                            [row.recordId]: event.target.value,
                          }))
                        }
                        className="h-9 min-w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                      >
                        {monthOptions.map((month) => (
                          <option key={`${row.recordId}-geo-month-${month}`} value={month}>
                            {month}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void applyGeoHeadProjectReassignment(row.recordId)}
                        disabled={geoPendingRecordId === row.recordId}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {geoPendingRecordId === row.recordId ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        )}
                        Move Geo
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFullscreenShell>
      ) : null}
    </div>
  );
}

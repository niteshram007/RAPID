"use client";

import { useMemo, useState } from "react";

import { createUserAction } from "@/app/admin/actions";
import type { Role, UserRecord } from "@/lib/rbac-store";

type AdminUserCreateFormProps = {
  roles: Role[];
  users: UserRecord[];
  revenueNameOptions?: {
    bdm: string[];
    "practice-head": string[];
    "geo-head": string[];
  };
  scopeOptions?: {
    bdms: string[];
    geoHeads: string[];
    practiceHeads: string[];
    entities: string[];
    verticals: string[];
  };
};

const ACCESS_ROLE_ORDER = [
  "executive",
  "bdm",
  "practice-head",
  "geo-head",
  "buh",
  "superuser",
] as const;

function NameSuggestionInput({
  label,
  name,
  options,
  listId,
  placeholder,
}: {
  label: string;
  name: string;
  options: string[];
  listId: string;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        list={listId}
        className="auth-input"
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {options.map((value) => (
          <option key={`${listId}-${value}`} value={value} />
        ))}
      </datalist>
    </label>
  );
}

function ScopeChecklist({
  title,
  name,
  options,
}: {
  title: string;
  name: string;
  options: string[];
}) {
  return (
    <fieldset className="rounded-[20px] border border-slate-200 bg-white px-3 py-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </legend>
      <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {options.map((value) => (
          <label
            key={`${name}-${value}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            <input type="checkbox" name={name} value={value} className="h-4 w-4 rounded" />
            <span className="truncate">{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AccessScopePanel({
  title,
  description,
  prefix,
  scopeOptions,
}: {
  title: string;
  description: string;
  prefix: "geoHeadScope" | "buhScope";
  scopeOptions: NonNullable<AdminUserCreateFormProps["scopeOptions"]>;
}) {
  return (
    <details open className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
      <summary className="cursor-pointer list-none">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </summary>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ScopeChecklist title="BDM" name={`${prefix}Bdms`} options={scopeOptions.bdms} />
        <ScopeChecklist title="Geo Head" name={`${prefix}GeoHeads`} options={scopeOptions.geoHeads} />
        <ScopeChecklist title="Practice Head" name={`${prefix}PracticeHeads`} options={scopeOptions.practiceHeads} />
        <ScopeChecklist title="Entity" name={`${prefix}Entities`} options={scopeOptions.entities} />
        <ScopeChecklist title="Vertical" name={`${prefix}Verticals`} options={scopeOptions.verticals} />
      </div>
    </details>
  );
}

export function AdminUserCreateForm({
  roles,
  revenueNameOptions,
  scopeOptions,
}: AdminUserCreateFormProps) {
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const orderedRoles = useMemo(() => {
    return [...roles].sort((left, right) => {
      const leftIndex = ACCESS_ROLE_ORDER.indexOf(left.id as (typeof ACCESS_ROLE_ORDER)[number]);
      const rightIndex = ACCESS_ROLE_ORDER.indexOf(right.id as (typeof ACCESS_ROLE_ORDER)[number]);
      const normalizedLeft = leftIndex === -1 ? ACCESS_ROLE_ORDER.length : leftIndex;
      const normalizedRight = rightIndex === -1 ? ACCESS_ROLE_ORDER.length : rightIndex;
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }
      return left.name.localeCompare(right.name);
    });
  }, [roles]);

  const hasBdm = selectedRoleIds.includes("bdm");
  const hasPracticeHead = selectedRoleIds.includes("practice-head");
  const hasGeoHead = selectedRoleIds.includes("geo-head");
  const hasBuh = selectedRoleIds.includes("buh");

  return (
    <form action={createUserAction} className="mt-4 space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Full name
          <input name="name" className="auth-input" placeholder="Full name" required />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Work email
          <input
            name="email"
            type="email"
            className="auth-input"
            placeholder="name@mindteck.com"
            required
          />
        </label>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-slate-950">Assigned roles</p>
          <p className="mt-1 text-sm text-slate-600">
            Roles are fixed after creation. Geo Head and BUH access are allocated below.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {orderedRoles.map((role) => {
            const checked = selectedRoleIds.includes(role.id);
            return (
              <label
                key={role.id}
                className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-3 py-3 transition ${
                  checked
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  name="roleIds"
                  value={role.id}
                  checked={checked}
                  onChange={(event) => {
                    setSelectedRoleIds((current) => {
                      if (event.target.checked) {
                        return [...new Set([...current, role.id])];
                      }
                      return current.filter((item) => item !== role.id);
                    });
                  }}
                  className="mt-1 h-4 w-4 rounded"
                />
                <span className="grid gap-1">
                  <span className="text-sm font-semibold">{role.name}</span>
                  <span className={`text-xs ${checked ? "text-white/75" : "text-slate-500"}`}>
                    {role.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {hasBdm || hasPracticeHead || hasGeoHead ? (
        <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 lg:grid-cols-3">
          {hasBdm ? (
            <NameSuggestionInput
              label="BDM mapped name"
              name="bdm"
              options={revenueNameOptions?.bdm ?? []}
              listId="create-bdm-name-options"
              placeholder="Pick from budget or enter a new BDM name"
            />
          ) : null}

          {hasPracticeHead ? (
            <NameSuggestionInput
              label="Practice Head mapped name"
              name="practiceHead"
              options={revenueNameOptions?.["practice-head"] ?? []}
              listId="create-practice-head-name-options"
              placeholder="Pick from budget or enter a new practice head"
            />
          ) : null}

          {hasGeoHead ? (
            <NameSuggestionInput
              label="Geo Head mapped name"
              name="geoHead"
              options={revenueNameOptions?.["geo-head"] ?? []}
              listId="create-geo-head-name-options"
              placeholder="Pick from budget or enter a new geo head"
            />
          ) : null}
        </div>
      ) : null}

      {hasGeoHead && scopeOptions ? (
        <AccessScopePanel
          title="Geo Head access allocation"
          description="Select the BDM, Geo Head, Practice Head, Entity, and Vertical values visible inside the Geo Head workspace."
          prefix="geoHeadScope"
          scopeOptions={scopeOptions}
        />
      ) : null}

      {hasBuh && scopeOptions ? (
        <AccessScopePanel
          title="BUH access allocation"
          description="Select the exact BDM, Geo Head, Practice Head, Entity, and Vertical values this BUH can review."
          prefix="buhScope"
          scopeOptions={scopeOptions}
        />
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="auth-button-primary h-11 px-5">
          Create account
        </button>
      </div>
    </form>
  );
}

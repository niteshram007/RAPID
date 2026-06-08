import { Trash2, UserCog, Users2 } from "lucide-react";

import {
  deleteUserAction,
  issueTemporaryPasswordAction,
  resetUserTotpAction,
  updateUserAccessAction,
} from "@/app/admin/actions";
import { AdminUserCreateForm } from "@/components/admin-user-create-form";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { requirePermission } from "@/lib/auth";
import { getRevenueNameOptions } from "@/lib/backend-api";
import { getAssignedRoleIds, readStore } from "@/lib/rbac-store";
import { getRapidRevenueSlicerOptions } from "@/lib/rapid-revenue-server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ScopeOptions = {
  bdms: string[];
  geoHeads: string[];
  practiceHeads: string[];
  entities: string[];
  verticals: string[];
};

const pageMessages = {
  "user-created": {
    tone: "success",
    message: "User account created successfully.",
  },
  "user-updated": {
    tone: "success",
    message: "User access updated.",
  },
  "temporary-password-issued": {
    tone: "success",
    message: "Temporary password updated.",
  },
  "weak-temp-password": {
    tone: "error",
    message: "Temporary password must meet the RAPID password policy.",
  },
  "mfa-reset": {
    tone: "success",
    message: "TOTP reset. User must verify a fresh authenticator code at next sign-in.",
  },
  "user-deleted": {
    tone: "success",
    message: "User deleted successfully.",
  },
  "missing-user-fields": {
    tone: "error",
    message: "Name, email, and at least one role are required.",
  },
  "user-exists": {
    tone: "error",
    message: "A user with that email already exists.",
  },
  "invalid-role": {
    tone: "error",
    message: "One or more selected roles could not be found.",
  },
  "assignment-failed": {
    tone: "error",
    message: "The selected user or role could not be found.",
  },
  "temporary-password-failed": {
    tone: "error",
    message: "Provide a valid temporary password and target user.",
  },
  "mfa-reset-failed": {
    tone: "error",
    message: "Unable to reset TOTP for the selected user.",
  },
  "delete-user-failed": {
    tone: "error",
    message: "The selected user could not be found for deletion.",
  },
  "cannot-disable-self": {
    tone: "error",
    message: "You cannot deactivate the currently signed-in admin account.",
  },
  "cannot-delete-self": {
    tone: "error",
    message: "You cannot delete the account currently signed in.",
  },
  "preserve-own-access": {
    tone: "error",
    message: "You cannot remove your own user-management access while signed in.",
  },
  "preserve-admin-coverage": {
    tone: "error",
    message:
      "Keep at least one active user with admin access so the platform remains manageable.",
  },
  "missing-buh-scope": {
    tone: "error",
    message: "BUH accounts must include at least one Entity, Vertical, Geo Head, Practice Head, and BDM.",
  },
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseScopeValues(value: string | null | undefined) {
  return String(value ?? "")
    .split(/[\n,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatScopeSummary(values: string[]) {
  return values.length > 0 ? `${values.length} selected` : "None selected";
}

function ScopeCheckboxGroup({
  title,
  name,
  options,
  selectedValues,
  userId,
}: {
  title: string;
  name: string;
  options: string[];
  selectedValues: string[];
  userId: string;
}) {
  return (
    <fieldset className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </legend>
      <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {options.map((value) => (
          <label
            key={`${userId}-${name}-${value}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={selectedValues.includes(value)}
              className="h-4 w-4 rounded"
            />
            <span className="truncate">{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NameMappingField({
  label,
  name,
  defaultValue,
  options,
  listId,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
  listId: string;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("manage_users");
  const [store, revenueNameOptions, scopeOptions] = await Promise.all([
    readStore(),
    getRevenueNameOptions(),
    getRapidRevenueSlicerOptions(),
  ]);
  const query = await searchParams;
  const feedbackKey =
    resolveQueryValue(query.status) ?? resolveQueryValue(query.error);
  const feedback = feedbackKey
    ? pageMessages[feedbackKey as keyof typeof pageMessages]
    : null;
  const availableScopeOptions: ScopeOptions = {
    bdms: scopeOptions.bdms ?? [],
    geoHeads: scopeOptions.geoHeads ?? [],
    practiceHeads: scopeOptions.practiceHeads ?? [],
    entities: scopeOptions.entities ?? [],
    verticals: scopeOptions.verticals ?? [],
  };
  const scopedUsers = store.users.map((user) => ({
    user,
    assignedRoleIds: getAssignedRoleIds(user),
    selectedGeoHeadBdms: parseScopeValues(user.geoHeadScopeBdms),
    selectedGeoHeadGeoHeads: parseScopeValues(user.geoHeadScopeGeoHeads),
    selectedGeoHeadPracticeHeads: parseScopeValues(user.geoHeadScopePracticeHeads),
    selectedGeoHeadEntities: parseScopeValues(user.geoHeadScopeEntities),
    selectedGeoHeadVerticals: parseScopeValues(user.geoHeadScopeVerticals),
    selectedBuhBdms: parseScopeValues(user.buhScopeBdms),
    selectedBuhGeoHeads: parseScopeValues(user.buhScopeGeoHeads),
    selectedBuhPracticeHeads: parseScopeValues(user.buhScopePracticeHeads),
    selectedBuhEntities: parseScopeValues(user.buhScopeEntities),
    selectedBuhVerticals: parseScopeValues(user.buhScopeVerticals),
  }));

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Users"
        title="Access control"
        description="Create invite-only accounts and keep user administration short, scoped, and easy to maintain."
      />

      {feedback ? (
        <div
          className={`rounded-[18px] border px-4 py-3 text-sm ${
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="surface-card px-5 py-5 lg:px-6">
        <span className="section-kicker">
          <Users2 className="h-4 w-4" />
          Create account
        </span>
        <AdminUserCreateForm
          roles={store.roles}
          users={store.users}
          revenueNameOptions={revenueNameOptions}
          scopeOptions={availableScopeOptions}
        />
        <p className="mt-2 text-xs font-medium text-slate-500">
          Admin creates the account shell. Users complete password, email OTP, and Microsoft TOTP during first sign-in.
        </p>
      </section>

      <section className="surface-card px-5 py-5 lg:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <UserCog className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Existing users
            </p>
            <h3 className="text-lg font-semibold text-slate-950">Compact access cards</h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {scopedUsers.map(
            ({
              user,
              assignedRoleIds,
              selectedGeoHeadBdms,
              selectedGeoHeadGeoHeads,
              selectedGeoHeadPracticeHeads,
              selectedGeoHeadEntities,
              selectedGeoHeadVerticals,
              selectedBuhBdms,
              selectedBuhGeoHeads,
              selectedBuhPracticeHeads,
              selectedBuhEntities,
              selectedBuhVerticals,
            }) => {
              const assignedRoles = assignedRoleIds
                .map((roleId) => store.roles.find((role) => role.id === roleId))
                .filter((role): role is NonNullable<typeof role> => Boolean(role));
              const hasGeoHeadRole = assignedRoleIds.includes("geo-head");
              const hasBuhRole = assignedRoleIds.includes("buh");
              const hasScopedAccess = hasGeoHeadRole || hasBuhRole;
              const hasMappedNames =
                hasScopedAccess &&
                (assignedRoleIds.includes("bdm") ||
                  assignedRoleIds.includes("practice-head") ||
                  assignedRoleIds.includes("geo-head"));

              return (
                <article
                  key={user.id}
                  className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{user.name}</p>
                      <p className="text-sm text-slate-600">{user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {user.active ? "Active" : "Inactive"}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                        {user.onboardingCompleted ? "Onboarded" : "Pending"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignedRoles.map((role) => (
                      <span
                        key={`${user.id}-${role.id}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {role.name}
                      </span>
                    ))}
                  </div>

                  {hasScopedAccess ? (
                    <form action={updateUserAccessAction} className="mt-4 space-y-3">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="active" value={user.active ? "on" : ""} />
                      {assignedRoleIds.map((roleId) => (
                        <input
                          key={`${user.id}-role-${roleId}`}
                          type="hidden"
                          name="roleIds"
                          value={roleId}
                        />
                      ))}

                      {hasMappedNames ? (
                        <details className="rounded-[20px] border border-slate-200 bg-slate-50/90 px-4 py-3">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                            Mapped names
                          </summary>
                          <div className="mt-3 grid gap-3 lg:grid-cols-3">
                            {assignedRoleIds.includes("bdm") ? (
                              <NameMappingField
                                label="BDM mapped name"
                                name="bdm"
                                defaultValue={user.bdm}
                                options={revenueNameOptions.bdm}
                                listId={`bdm-name-${user.id}`}
                                placeholder="Budget BDM name"
                              />
                            ) : null}

                            {assignedRoleIds.includes("practice-head") ? (
                              <NameMappingField
                                label="Practice Head mapped name"
                                name="practiceHead"
                                defaultValue={user.practiceHead}
                                options={revenueNameOptions["practice-head"]}
                                listId={`practice-head-name-${user.id}`}
                                placeholder="Budget practice head"
                              />
                            ) : null}

                            {assignedRoleIds.includes("geo-head") ? (
                              <NameMappingField
                                label="Geo Head mapped name"
                                name="geoHead"
                                defaultValue={user.geoHead}
                                options={revenueNameOptions["geo-head"]}
                                listId={`geo-head-name-${user.id}`}
                                placeholder="Budget geo head"
                              />
                            ) : null}
                          </div>
                        </details>
                      ) : null}

                      {hasGeoHeadRole ? (
                        <details className="rounded-[20px] border border-slate-200 bg-slate-50/90 px-4 py-3">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                            Geo Head constraints
                            <span className="ml-2 text-xs font-medium text-slate-500">
                              {[
                                `BDM: ${formatScopeSummary(selectedGeoHeadBdms)}`,
                                `Geo Head: ${formatScopeSummary(selectedGeoHeadGeoHeads)}`,
                                `Practice Head: ${formatScopeSummary(selectedGeoHeadPracticeHeads)}`,
                                `Entity: ${formatScopeSummary(selectedGeoHeadEntities)}`,
                                `Vertical: ${formatScopeSummary(selectedGeoHeadVerticals)}`,
                              ].join(" | ")}
                            </span>
                          </summary>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <ScopeCheckboxGroup
                              title="BDM"
                              name="geoHeadScopeBdms"
                              options={availableScopeOptions.bdms}
                              selectedValues={selectedGeoHeadBdms}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Geo Head"
                              name="geoHeadScopeGeoHeads"
                              options={availableScopeOptions.geoHeads}
                              selectedValues={selectedGeoHeadGeoHeads}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Practice Head"
                              name="geoHeadScopePracticeHeads"
                              options={availableScopeOptions.practiceHeads}
                              selectedValues={selectedGeoHeadPracticeHeads}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Entity"
                              name="geoHeadScopeEntities"
                              options={availableScopeOptions.entities}
                              selectedValues={selectedGeoHeadEntities}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Vertical"
                              name="geoHeadScopeVerticals"
                              options={availableScopeOptions.verticals}
                              selectedValues={selectedGeoHeadVerticals}
                              userId={user.id}
                            />
                          </div>
                        </details>
                      ) : null}

                      {hasBuhRole ? (
                        <details className="rounded-[20px] border border-slate-200 bg-slate-50/90 px-4 py-3">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                            BUH constraints
                            <span className="ml-2 text-xs font-medium text-slate-500">
                              {[
                                `BDM: ${formatScopeSummary(selectedBuhBdms)}`,
                                `Geo Head: ${formatScopeSummary(selectedBuhGeoHeads)}`,
                                `Practice Head: ${formatScopeSummary(selectedBuhPracticeHeads)}`,
                                `Entity: ${formatScopeSummary(selectedBuhEntities)}`,
                                `Vertical: ${formatScopeSummary(selectedBuhVerticals)}`,
                              ].join(" | ")}
                            </span>
                          </summary>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <ScopeCheckboxGroup
                              title="BDM"
                              name="buhScopeBdms"
                              options={availableScopeOptions.bdms}
                              selectedValues={selectedBuhBdms}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Geo Head"
                              name="buhScopeGeoHeads"
                              options={availableScopeOptions.geoHeads}
                              selectedValues={selectedBuhGeoHeads}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Practice Head"
                              name="buhScopePracticeHeads"
                              options={availableScopeOptions.practiceHeads}
                              selectedValues={selectedBuhPracticeHeads}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Entity"
                              name="buhScopeEntities"
                              options={availableScopeOptions.entities}
                              selectedValues={selectedBuhEntities}
                              userId={user.id}
                            />
                            <ScopeCheckboxGroup
                              title="Vertical"
                              name="buhScopeVerticals"
                              options={availableScopeOptions.verticals}
                              selectedValues={selectedBuhVerticals}
                              userId={user.id}
                            />
                          </div>
                        </details>
                      ) : null}

                      <div className="flex justify-end">
                        <button type="submit" className="auth-button-primary h-10 px-4">
                          Save access
                        </button>
                      </div>
                    </form>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={issueTemporaryPasswordAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <input
                        type="password"
                        name="temporaryPassword"
                        className="h-10 min-w-52 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none"
                        placeholder="Temporary password"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-900"
                      >
                        Set password
                      </button>
                    </form>

                    <form action={resetUserTotpAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        Reset TOTP
                      </button>
                    </form>

                    <form action={deleteUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </form>
                  </div>
                </article>
              );
            },
          )}
        </div>

        <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Signed in as {session.email}. Roles stay fixed after creation, while Geo Head and BUH constraints can be updated from the collapsed access sections.
        </div>
      </section>
    </>
  );
}

"use server";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionProfile, requirePermission } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import {
  findRoleById,
  findUserByEmail,
  findUserById,
  getAssignedRoleIds,
  hasPermission,
  nextRoleColor,
  normalizeScopeSelection,
  readStore,
  slugifyRoleName,
  writeStore,
  type PermissionId,
  type RbacStore,
} from "@/lib/rbac-store";
import {
  createTotpSecret,
  hashPassword,
  validatePasswordPolicy,
} from "@/lib/security";

function isChecked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

const ROLE_PRIORITY = [
  "superuser",
  "executive",
  "bdm",
  "geo-head",
  "practice-head",
  "buh",
] as const;

function sortRoleIds(roleIds: string[]) {
  return [...roleIds].sort((left, right) => {
    const leftIndex = ROLE_PRIORITY.indexOf(left as (typeof ROLE_PRIORITY)[number]);
    const rightIndex = ROLE_PRIORITY.indexOf(right as (typeof ROLE_PRIORITY)[number]);
    const normalizedLeft = leftIndex === -1 ? ROLE_PRIORITY.length : leftIndex;
    const normalizedRight = rightIndex === -1 ? ROLE_PRIORITY.length : rightIndex;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return left.localeCompare(right);
  });
}

function getRoleIdsFromFormData(formData: FormData) {
  return sortRoleIds(
    Array.from(
      new Set(
        formData
          .getAll("roleIds")
          .map(String)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ),
  );
}

function canManageUsers(store: RbacStore, roleIds: string[]) {
  return roleIds.some((roleId) => hasPermission(findRoleById(store, roleId), "manage_users"));
}

function activeAdminCount(store: RbacStore) {
  return store.users.filter(
    (user) => user.active && canManageUsers(store, getAssignedRoleIds(user)),
  ).length;
}

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
const ADMIN_USERS_PATH = "/admin/users";

function getMultiValueField(formData: FormData, name: string) {
  return formData.getAll(name).map(String).map((value) => value.trim()).filter(Boolean);
}

function buildAssignedRoleTitle(roleIds: string[], store: RbacStore) {
  const roleNames = roleIds
    .map((roleId) => findRoleById(store, roleId)?.name ?? "")
    .filter(Boolean);
  return roleNames.join(" / ");
}

function hasRole(roleIds: string[], roleId: string) {
  return roleIds.includes(roleId);
}

function resolveMappedRoleName(inputValue: FormDataEntryValue | null, fallbackValue: string) {
  const normalized = typeof inputValue === "string" ? inputValue.trim() : "";
  return normalized || fallbackValue.trim();
}

function resolveAdminUploadReturnPath(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw.startsWith("/admin/upload")) {
    return "/admin/upload";
  }
  return raw;
}

async function requestBackend(path: string, init: RequestInit) {
  const session = await getSessionProfile();
  const response = await fetch(`${BACKEND_API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: session ? buildBackendAuthHeaders(session, init.headers) : init.headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;

    throw new Error(payload?.detail ?? "backend-request-failed");
  }

  return response;
}

export async function createRoleAction(formData: FormData) {
  const session = await requirePermission("manage_roles");

  const store = await readStore();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const roleId = slugifyRoleName(name);

  if (!name || !roleId) {
    redirect(`${ADMIN_USERS_PATH}?error=missing-role-name`);
  }

  if (
    store.roles.some(
      (role) =>
        role.id === roleId || role.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    redirect(`${ADMIN_USERS_PATH}?error=role-exists`);
  }

  const permissions = Array.from(
    new Set(
      formData
        .getAll("permissions")
        .map(String)
        .filter(Boolean),
    ),
  ) as PermissionId[];

  if (permissions.length === 0) {
    redirect(`${ADMIN_USERS_PATH}?error=missing-permission`);
  }

  const geos = normalizeScopeSelection(
    formData.getAll("geos").map(String),
    store.catalogs.geos,
  );
  const practices = normalizeScopeSelection(
    formData.getAll("practices").map(String),
    store.catalogs.practices,
  );

  store.roles.push({
    id: roleId,
    name,
    description:
      description || "Custom authority pack created from the superuser dashboard.",
    kind: "custom",
    color: nextRoleColor(store.roles.length),
    permissions,
    geos,
    practices,
  });

  await writeStore(store);
  await recordAuditEvent({
    session,
    action: "admin.role.create",
    module: "users",
    description: `Created role ${name}.`,
    metadata: { roleId, permissions },
  });
  revalidatePath(ADMIN_USERS_PATH);
  redirect(`${ADMIN_USERS_PATH}?status=role-created`);
}

export async function createUserAction(formData: FormData) {
  const session = await requirePermission("manage_users");

  const store = await readStore();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleIds = getRoleIdsFromFormData(formData);
  const geo = String(formData.get("geo") ?? "Global");
  const practice = String(formData.get("practice") ?? "Portfolio");
  const resolvedBdmName = resolveMappedRoleName(formData.get("bdm"), name);
  const resolvedGeoHeadName = resolveMappedRoleName(formData.get("geoHead"), name || geo);
  const resolvedPracticeHeadName = resolveMappedRoleName(formData.get("practiceHead"), name || practice);
  const geoHeadScopeBdms = getMultiValueField(formData, "geoHeadScopeBdms");
  const geoHeadScopeGeoHeads = getMultiValueField(formData, "geoHeadScopeGeoHeads");
  const geoHeadScopePracticeHeads = getMultiValueField(formData, "geoHeadScopePracticeHeads");
  const geoHeadScopeEntities = getMultiValueField(formData, "geoHeadScopeEntities");
  const geoHeadScopeVerticals = getMultiValueField(formData, "geoHeadScopeVerticals");
  const buhScopeBdms = getMultiValueField(formData, "buhScopeBdms");
  const buhScopeGeoHeads = getMultiValueField(formData, "buhScopeGeoHeads");
  const buhScopePracticeHeads = getMultiValueField(formData, "buhScopePracticeHeads");
  const buhScopeEntities = getMultiValueField(formData, "buhScopeEntities");
  const buhScopeVerticals = getMultiValueField(formData, "buhScopeVerticals");

  if (!name || !email || roleIds.length === 0) {
    redirect(`${ADMIN_USERS_PATH}?error=missing-user-fields`);
  }

  if (findUserByEmail(store, email)) {
    redirect(`${ADMIN_USERS_PATH}?error=user-exists`);
  }

  const roles = roleIds
    .map((roleId) => findRoleById(store, roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));

  if (roles.length !== roleIds.length) {
    redirect(`${ADMIN_USERS_PATH}?error=invalid-role`);
  }

  if (
    hasRole(roleIds, "buh") &&
    (buhScopeBdms.length === 0 ||
      buhScopeGeoHeads.length === 0 ||
      buhScopePracticeHeads.length === 0 ||
      buhScopeEntities.length === 0 ||
      buhScopeVerticals.length === 0)
  ) {
    redirect(`${ADMIN_USERS_PATH}?error=missing-buh-scope`);
  }

  const bdm = hasRole(roleIds, "bdm") ? resolvedBdmName : resolvedBdmName || "";
  const geoHead = hasRole(roleIds, "geo-head") ? resolvedGeoHeadName : resolvedGeoHeadName || geo;
  const practiceHead = hasRole(roleIds, "practice-head")
    ? resolvedPracticeHeadName
    : resolvedPracticeHeadName || practice;
  const hasGeoHeadScopedAttributes =
    geoHeadScopeBdms.length > 0 ||
    geoHeadScopePracticeHeads.length > 0 ||
    geoHeadScopeEntities.length > 0 ||
    geoHeadScopeVerticals.length > 0;
  const resolvedGeoHeadScopeGeoHeads = geoHeadScopeGeoHeads.length > 0
    ? geoHeadScopeGeoHeads.join(", ")
    : hasRole(roleIds, "geo-head") && hasGeoHeadScopedAttributes
      ? "ALL"
      : [geoHead].filter(Boolean).join(", ");
  const now = new Date().toISOString();

  const newUserId = randomUUID();
  store.users.push({
    id: newUserId,
    name,
    email,
    passwordHash: "",
    passwordSalt: "",
    passwordResetRequired: false,
    temporaryPasswordIssuedAt: null,
    lastPasswordChangedAt: null,
    title: buildAssignedRoleTitle(roleIds, store),
    roleId: roleIds[0],
    roleIds,
    geo,
    practice,
    bdm,
    geoHead,
    practiceHead,
    entities: "",
    verticals: "",
    geoHeadScopeBdms: geoHeadScopeBdms.join(", "),
    geoHeadScopeGeoHeads: resolvedGeoHeadScopeGeoHeads,
    geoHeadScopePracticeHeads: geoHeadScopePracticeHeads.join(", "),
    geoHeadScopeEntities: geoHeadScopeEntities.join(", "),
    geoHeadScopeVerticals: geoHeadScopeVerticals.join(", "),
    buhScopeBdms: buhScopeBdms.join(", "),
    buhScopeGeoHeads: buhScopeGeoHeads.join(", "),
    buhScopePracticeHeads: buhScopePracticeHeads.join(", "),
    buhScopeEntities: buhScopeEntities.join(", "),
    buhScopeVerticals: buhScopeVerticals.join(", "),
    mobileNumber: "",
    active: true,
    adminCreated: true,
    onboardingCompleted: false,
    onboardingStartedAt: null,
    emailVerifiedAt: null,
    mfaRequired: true,
    totpEnabled: false,
    totpSecret: null,
    totpSetupRequired: true,
    lastTotpVerifiedAt: null,
    pendingEmailOtpHash: null,
    pendingEmailOtpSalt: null,
    pendingEmailOtpExpiresAt: null,
    pendingEmailOtpPurpose: null,
    pendingEmailOtpSentAt: null,
    pendingProfileName: null,
    pendingMobileNumber: null,
    pendingPasswordHash: null,
    pendingPasswordSalt: null,
    createdAt: now,
    updatedAt: now,
  });

  await writeStore(store);
  await recordAuditEvent({
    session,
    action: "admin.user.create",
    module: "users",
    description: `Created user ${email}.`,
    metadata: { targetUserId: newUserId, targetEmail: email, roleIds },
  });
  revalidatePath(ADMIN_USERS_PATH);
  redirect(`${ADMIN_USERS_PATH}?status=user-created`);
}

export async function updateUserAccessAction(formData: FormData) {
  const session = await requirePermission("manage_users");
  const store = await readStore();
  const userId = String(formData.get("userId") ?? "");
  const roleIds = getRoleIdsFromFormData(formData);
  const active = isChecked(formData, "active");
  const geoHeadScopeBdms = getMultiValueField(formData, "geoHeadScopeBdms");
  const geoHeadScopeGeoHeads = getMultiValueField(formData, "geoHeadScopeGeoHeads");
  const geoHeadScopePracticeHeads = getMultiValueField(formData, "geoHeadScopePracticeHeads");
  const geoHeadScopeEntities = getMultiValueField(formData, "geoHeadScopeEntities");
  const geoHeadScopeVerticals = getMultiValueField(formData, "geoHeadScopeVerticals");
  const buhScopeBdms = getMultiValueField(formData, "buhScopeBdms");
  const buhScopeGeoHeads = getMultiValueField(formData, "buhScopeGeoHeads");
  const buhScopePracticeHeads = getMultiValueField(formData, "buhScopePracticeHeads");
  const buhScopeEntities = getMultiValueField(formData, "buhScopeEntities");
  const buhScopeVerticals = getMultiValueField(formData, "buhScopeVerticals");

  const user = findUserById(store, userId);
  const roles = roleIds
    .map((roleId) => findRoleById(store, roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));

  if (!user || roles.length !== roleIds.length || roleIds.length === 0) {
    redirect(`${ADMIN_USERS_PATH}?error=assignment-failed`);
  }

  if (user.id === session.userId && !active) {
    redirect(`${ADMIN_USERS_PATH}?error=cannot-disable-self`);
  }

  if (
    user.id === session.userId &&
    !canManageUsers(store, roleIds)
  ) {
    redirect(`${ADMIN_USERS_PATH}?error=preserve-own-access`);
  }

  const userCurrentlyAdmin = user.active && canManageUsers(store, getAssignedRoleIds(user));
  const nextIsAdmin = active && canManageUsers(store, roleIds);

  if (userCurrentlyAdmin && !nextIsAdmin && activeAdminCount(store) <= 1) {
    redirect(`${ADMIN_USERS_PATH}?error=preserve-admin-coverage`);
  }

  if (
    hasRole(roleIds, "buh") &&
    (buhScopeBdms.length === 0 ||
      buhScopeGeoHeads.length === 0 ||
      buhScopePracticeHeads.length === 0 ||
      buhScopeEntities.length === 0 ||
      buhScopeVerticals.length === 0)
  ) {
    redirect(`${ADMIN_USERS_PATH}?error=missing-buh-scope`);
  }

  user.roleId = roleIds[0];
  user.roleIds = roleIds;
  const bdmInput = formData.get("bdm");
  const geoHeadInput = formData.get("geoHead");
  const practiceHeadInput = formData.get("practiceHead");
  user.active = active;
  user.title = buildAssignedRoleTitle(roleIds, store);
  const resolvedBdmName = resolveMappedRoleName(bdmInput, user.bdm || user.name);
  const resolvedGeoHeadName = resolveMappedRoleName(geoHeadInput, user.geoHead || user.name || user.geo);
  const resolvedPracticeHeadName = resolveMappedRoleName(
    practiceHeadInput,
    user.practiceHead || user.name || user.practice,
  );
  user.bdm = hasRole(roleIds, "bdm") ? resolvedBdmName : resolvedBdmName || user.bdm;
  user.geoHead = hasRole(roleIds, "geo-head")
    ? resolvedGeoHeadName
    : resolvedGeoHeadName || user.geoHead || user.geo;
  user.practiceHead = hasRole(roleIds, "practice-head")
    ? resolvedPracticeHeadName
    : resolvedPracticeHeadName || user.practiceHead || user.practice;
  const hasGeoHeadScopedAttributes =
    geoHeadScopeBdms.length > 0 ||
    geoHeadScopePracticeHeads.length > 0 ||
    geoHeadScopeEntities.length > 0 ||
    geoHeadScopeVerticals.length > 0;
  user.entities = "";
  user.verticals = "";
  user.geoHeadScopeBdms = geoHeadScopeBdms.join(", ");
  user.geoHeadScopeGeoHeads = geoHeadScopeGeoHeads.length > 0
    ? geoHeadScopeGeoHeads.join(", ")
    : hasRole(roleIds, "geo-head") && hasGeoHeadScopedAttributes
      ? "ALL"
      : (hasRole(roleIds, "geo-head") ? [user.geoHead || user.name] : []).join(", ");
  user.geoHeadScopePracticeHeads = geoHeadScopePracticeHeads.join(", ");
  user.geoHeadScopeEntities = geoHeadScopeEntities.join(", ");
  user.geoHeadScopeVerticals = geoHeadScopeVerticals.join(", ");
  user.buhScopeBdms = buhScopeBdms.join(", ");
  user.buhScopeGeoHeads = buhScopeGeoHeads.join(", ");
  user.buhScopePracticeHeads = buhScopePracticeHeads.join(", ");
  user.buhScopeEntities = buhScopeEntities.join(", ");
  user.buhScopeVerticals = buhScopeVerticals.join(", ");
  user.mfaRequired = true;
  user.updatedAt = new Date().toISOString();

  if (user.onboardingCompleted) {
    user.totpSecret = user.totpSecret ?? createTotpSecret();
    user.totpSetupRequired = !user.totpEnabled;
  } else {
    user.totpEnabled = false;
    user.totpSecret = null;
    user.totpSetupRequired = true;
    user.lastTotpVerifiedAt = null;
  }

  await writeStore(store);
  await recordAuditEvent({
    session,
    action: "admin.user.update_access",
    module: "users",
    description: `Updated access for ${user.email}.`,
    metadata: { targetUserId: user.id, targetEmail: user.email, roleIds, active },
  });
  revalidatePath(ADMIN_USERS_PATH);
  redirect(`${ADMIN_USERS_PATH}?status=user-updated`);
}

export async function issueTemporaryPasswordAction(formData: FormData) {
  const session = await requirePermission("manage_users");

  const store = await readStore();
  const userId = String(formData.get("userId") ?? "");
  const password = String(
    formData.get("temporaryPassword") ?? formData.get("password") ?? "",
  );
  const user = findUserById(store, userId);

  if (!user || !password) {
    redirect(`${ADMIN_USERS_PATH}?error=temporary-password-failed`);
  }

  if (validatePasswordPolicy(password)) {
    redirect(`${ADMIN_USERS_PATH}?error=weak-temp-password`);
  }

  const hashedPassword = await hashPassword(password);
  const now = new Date().toISOString();

  user.passwordHash = hashedPassword.hash;
  user.passwordSalt = hashedPassword.salt;
  user.passwordResetRequired = true;
  user.temporaryPasswordIssuedAt = now;
  user.updatedAt = now;

  await writeStore(store);
  await recordAuditEvent({
    session,
    action: "admin.user.password_reset_issue",
    module: "users",
    description: `Issued temporary password for ${user.email}.`,
    metadata: { targetUserId: user.id, targetEmail: user.email },
  });
  revalidatePath(ADMIN_USERS_PATH);
  redirect(`${ADMIN_USERS_PATH}?status=temporary-password-issued`);
}

export async function resetUserTotpAction(formData: FormData) {
  const session = await requirePermission("manage_users");

  const store = await readStore();
  const userId = String(formData.get("userId") ?? "");
  const user = findUserById(store, userId);

  if (!user) {
    redirect(`${ADMIN_USERS_PATH}?error=mfa-reset-failed`);
  }

  user.totpEnabled = false;
  user.totpSecret = user.mfaRequired ? createTotpSecret() : null;
  user.totpSetupRequired = user.mfaRequired;
  user.lastTotpVerifiedAt = null;
  user.updatedAt = new Date().toISOString();

  await writeStore(store);
  await recordAuditEvent({
    session,
    action: "admin.user.totp_reset",
    module: "users",
    description: `Reset TOTP for ${user.email}.`,
    metadata: { targetUserId: user.id, targetEmail: user.email },
  });
  revalidatePath(ADMIN_USERS_PATH);
  redirect(`${ADMIN_USERS_PATH}?status=mfa-reset`);
}

export async function deleteUserAction(formData: FormData) {
  const session = await requirePermission("manage_users");

  const store = await readStore();
  const userId = String(formData.get("userId") ?? "");
  const user = findUserById(store, userId);

  if (!user) {
    redirect(`${ADMIN_USERS_PATH}?error=delete-user-failed`);
  }

  if (user.id === session.userId) {
    redirect(`${ADMIN_USERS_PATH}?error=cannot-delete-self`);
  }

  if (user.active && canManageUsers(store, getAssignedRoleIds(user)) && activeAdminCount(store) <= 1) {
    redirect(`${ADMIN_USERS_PATH}?error=preserve-admin-coverage`);
  }

  store.users = store.users.filter((candidate) => candidate.id !== user.id);

  await writeStore(store);
  await recordAuditEvent({
    session,
    action: "admin.user.delete",
    module: "users",
    description: `Deleted user ${user.email}.`,
    metadata: { targetUserId: user.id, targetEmail: user.email },
  });
  revalidatePath(ADMIN_USERS_PATH);
  redirect(`${ADMIN_USERS_PATH}?status=user-deleted`);
}

export async function uploadFinancialWorkbookAction(formData: FormData) {
  const session = await requirePermission("upload_data");

  const financialYear = String(formData.get("financialYear") ?? "");
  const datasetType = String(formData.get("datasetType") ?? "financial_workbook")
    .trim()
    .toLowerCase();
  const workbook = formData.get("workbook");
  const returnPath = resolveAdminUploadReturnPath(formData.get("returnPath"));

  if (
    !(workbook instanceof File) ||
    workbook.size === 0 ||
    !financialYear ||
    !datasetType
  ) {
    redirect(`${returnPath}?error=missing-upload-fields`);
  }

  const payload = new FormData();
  payload.append("financial_year", financialYear);
  payload.append("dataset_type", datasetType);
  payload.append("workbook", workbook);
  payload.append("actor_user_id", session.userId);
  payload.append("actor_name", session.name);
  payload.append("actor_role", session.role?.id ?? "");

  try {
    await requestBackend("/api/admin/uploads", {
      method: "POST",
      body: payload,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? encodeURIComponent(error.message.slice(0, 240)) : "";

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("financial year")
    ) {
      redirect(`${returnPath}?error=invalid-financial-year${detail ? `&detail=${detail}` : ""}`);
    }

    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes("excel") ||
        error.message.toLowerCase().includes("workbook") ||
        error.message.toLowerCase().includes("file") ||
        error.message.toLowerCase().includes("csv") ||
        error.message.toLowerCase().includes("formula"))
    ) {
      redirect(`${returnPath}?error=invalid-upload-file${detail ? `&detail=${detail}` : ""}`);
    }

    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes("postgresql") ||
        error.message.toLowerCase().includes("database") ||
        error.message.toLowerCase().includes("headers"))
    ) {
      redirect(`${returnPath}?error=upload-failed${detail ? `&detail=${detail}` : ""}`);
    }

    redirect(`${returnPath}?error=upload-failed${detail ? `&detail=${detail}` : ""}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/forecast");
  revalidatePath("/admin/master-data");
  revalidatePath("/admin/users");
  revalidatePath("/admin/upload");
  revalidatePath("/admin/upload/budget");
  revalidatePath("/admin/upload/actuals");
  revalidatePath("/admin/upload/global-revenue");
  revalidatePath("/executive");
  revalidatePath("/executive/slicer");
  revalidatePath("/executive/master-data");
  revalidatePath("/bdm");
  revalidatePath("/bdm/slicer");
  revalidatePath("/bdm/analytics-kiosk");
  revalidatePath("/geo-head");
  revalidatePath("/geo-head/slicer");
  revalidatePath("/geo-head/analytics-kiosk");
  revalidatePath("/practice-head");
  revalidatePath("/practice-head/slicer");
  revalidatePath("/practice-head/analytics-kiosk");
  redirect(`${returnPath}?status=upload-complete`);
}

export async function deleteUploadedWorkbookAction(formData: FormData) {
  const session = await requirePermission("upload_data");

  const uploadId = String(formData.get("uploadId") ?? "").trim();
  const returnPath = resolveAdminUploadReturnPath(formData.get("returnPath"));
  if (!uploadId) {
    redirect(`${returnPath}?error=missing-upload-id`);
  }

  try {
    const search = new URLSearchParams({
      actorUserId: session.userId,
      actorName: session.name,
      actorRole: session.role?.id ?? "",
    });
    await requestBackend(`/api/admin/uploads/${encodeURIComponent(uploadId)}?${search.toString()}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("not found")
    ) {
      redirect(`${returnPath}?error=upload-not-found`);
    }
    redirect(`${returnPath}?error=upload-delete-failed`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/forecast");
  revalidatePath("/admin/master-data");
  revalidatePath("/admin/users");
  revalidatePath("/admin/upload");
  revalidatePath("/admin/upload/budget");
  revalidatePath("/admin/upload/actuals");
  revalidatePath("/admin/upload/global-revenue");
  revalidatePath("/executive");
  revalidatePath("/executive/slicer");
  revalidatePath("/bdm");
  revalidatePath("/bdm/slicer");
  revalidatePath("/bdm/analytics-kiosk");
  revalidatePath("/geo-head");
  revalidatePath("/geo-head/slicer");
  revalidatePath("/geo-head/analytics-kiosk");
  revalidatePath("/practice-head");
  revalidatePath("/practice-head/slicer");
  revalidatePath("/practice-head/analytics-kiosk");
  redirect(`${returnPath}?status=upload-deleted`);
}

export async function updatePlatformSettingsAction(formData: FormData) {
  await requirePermission("manage_users");

  const localLlmBaseUrl = String(formData.get("localLlmBaseUrl") ?? "").trim();
  const localLlmPlatformBaseUrl = String(
    formData.get("localLlmPlatformBaseUrl") ?? "",
  ).trim();
  const localLlmApiKey = String(formData.get("localLlmApiKey") ?? "").trim();
  const localLlmModel = String(formData.get("localLlmModel") ?? "").trim();
  const defaultFinancialYear = String(
    formData.get("defaultFinancialYear") ?? "",
  ).trim();
  const localLlmTemperature = Number(formData.get("localLlmTemperature") ?? 0.2);
  const localLlmEnabled = isChecked(formData, "localLlmEnabled");
  const showRestrictedRoleBudgets = isChecked(formData, "showRestrictedRoleBudgets");

  if (!localLlmBaseUrl || !localLlmModel || !defaultFinancialYear) {
    redirect("/admin/settings?error=missing-settings-fields");
  }

  try {
    await requestBackend("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        localLlmEnabled,
        localLlmBaseUrl,
        localLlmPlatformBaseUrl,
        localLlmApiKey,
        localLlmModel,
        localLlmTemperature,
        defaultFinancialYear,
        showRestrictedRoleBudgets,
      }),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes("financial year") ||
        error.message.toLowerCase().includes("between 0 and 1") ||
        error.message.toLowerCase().includes("complete"))
    ) {
      redirect("/admin/settings?error=invalid-settings");
    }

    redirect("/admin/settings?error=settings-failed");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/executive");
  redirect("/admin/settings?status=settings-saved");
}

export async function updateForecastControlAction(formData: FormData) {
  await requirePermission("manage_users");

  const lockinDate = String(formData.get("lockinDate") ?? "").trim();
  const lockoutDate = String(formData.get("lockoutDate") ?? "").trim();
  const lockinDay = lockinDate ? Number(lockinDate.slice(-2)) : Number(formData.get("lockinDay") ?? 1);
  const lockoutDay = lockoutDate ? Number(lockoutDate.slice(-2)) : Number(formData.get("lockoutDay") ?? 10);
  const rolloutStartMonth = String(formData.get("rolloutStartMonth") ?? "").trim();

  if (!lockinDate || !lockoutDate || !Number.isFinite(lockinDay) || !Number.isFinite(lockoutDay) || !rolloutStartMonth) {
    redirect("/admin/forecast?error=invalid-forecast-control");
  }

  try {
    await requestBackend("/api/admin/forecast-control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lockinDay,
        lockoutDay,
        lockinDate,
        lockoutDate,
        rolloutStartMonth,
        updatedBy: "admin-forecast-control",
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? encodeURIComponent(error.message.slice(0, 240)) : "";
    redirect(`/admin/forecast?error=forecast-control-save-failed${detail ? `&detail=${detail}` : ""}`);
  }

  revalidatePath("/admin/forecast");
  revalidatePath("/bdm/forecast/ms");
  revalidatePath("/bdm/forecast/ps");
  revalidatePath("/practice-head/forecast/ms");
  revalidatePath("/practice-head/forecast/ps");
  revalidatePath("/executive/forecast");
  redirect("/admin/forecast?status=forecast-control-saved");
}

export async function clearRecordedForecastAction() {
  const session = await requirePermission("manage_users");

  try {
    await requestBackend("/api/admin/forecast/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: session.userId,
        userName: session.name,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? encodeURIComponent(error.message.slice(0, 240)) : "";
    redirect(`/admin/forecast?error=forecast-reset-failed${detail ? `&detail=${detail}` : ""}`);
  }

  revalidatePath("/bdm/forecast/ms");
  revalidatePath("/bdm/forecast/ps");
  revalidatePath("/practice-head/forecast/ms");
  revalidatePath("/practice-head/forecast/ps");
  revalidatePath("/executive/forecast");
  revalidatePath("/geo-head/forecast");
  redirect("/admin/forecast?status=forecast-reset");
}

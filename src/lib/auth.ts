import { cookies, headers } from "next/headers";
import { createHmac, randomBytes } from "crypto";
import { redirect } from "next/navigation";

import {
  findRoleById,
  findUserById,
  getAssignedRoleIds,
  hasPermission,
  isRoleFamily,
  readStore,
  type PermissionId,
  type Role,
  type UserRecord,
} from "@/lib/rbac-store";

const SESSION_COOKIE = "rapid_session";
const PENDING_AUTH_COOKIE = "rapid_pending_auth";
const COOKIE_SECURE_ENV = process.env.RAPID_COOKIE_SECURE?.trim().toLowerCase();
const DEFAULT_SESSION_SECRET = "rapid-local-dev-session-secret-change-me";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const SESSION_REFRESH_THRESHOLD_SECONDS = Math.max(
  Number(process.env.RAPID_SESSION_REFRESH_THRESHOLD_SECONDS ?? 60 * 60 * 4),
  60,
);
const PENDING_AUTH_MAX_AGE_SECONDS = 60 * 15;

export type SessionPayload = {
  userId: string;
  roleId: string;
  name: string;
  email: string;
  title: string;
  sessionId?: string;
  issuedAt?: number;
  expiresAt?: number;
};

export type PendingAuthPayload = {
  userId: string;
  issuedAt: number;
  expiresAt?: number;
};

export type SessionProfile = SessionPayload & {
  role: Role | null;
  user: UserRecord | null;
  availableRoles: Role[];
};

export type PendingAuthProfile = {
  user: UserRecord;
  role: Role | null;
};

export type RevenueAccessScope = {
  routeBase: "/executive" | "/bdm" | "/geo-head" | "/practice-head" | "/buh";
  financialYears: string[];
  practiceHeads: string[];
  geoHeads: string[];
  bdms: string[];
  entities: string[];
  verticals: string[];
};
export type WorkspaceArea = "admin" | "executive" | "bdm" | "geo-head" | "practice-head" | "buh";

function parseScopeValues(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }

  const unique = new Map<string, string>();
  for (const item of value.split(/[\n,;|]/)) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    if (normalized.toLowerCase() === "all") {
      return [];
    }
    const key = normalized.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values());
}

function expandPersonScopeValues(values: string[], sessionName: string, email: string) {
  const unique = new Map<string, string>();

  function add(candidate: string | null | undefined) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  values.forEach((value) => {
    add(value);
    const parts = value
      .split(/[\s._-]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      add(parts[0]);
    }
  });

  add(sessionName);
  const sessionNameParts = sessionName
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sessionNameParts.length > 0) {
    add(sessionNameParts[0]);
  }

  const localPart = String(email || "").split("@")[0] ?? "";
  add(localPart);
  const localParts = localPart
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (localParts.length > 0) {
    add(localParts[0]);
  }

  return Array.from(unique.values());
}

function isGenericScopeValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "global" || normalized === "portfolio" || normalized === "";
}

function getSessionSecret() {
  return (
    process.env.RAPID_SESSION_SECRET?.trim() ||
    process.env.RAPID_BACKEND_SHARED_SECRET?.trim() ||
    DEFAULT_SESSION_SECRET
  );
}

function signEncodedPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("hex");
}

function encodePayload<T>(payload: T) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}

function decodePayload<T>(rawValue: string) {
  const [encodedPayload, signature] = rawValue.split(".");
  const isSigned = Boolean(encodedPayload && signature);

  if (isSigned && signature !== signEncodedPayload(encodedPayload)) {
    return null;
  }

  if (!isSigned && process.env.RAPID_ALLOW_LEGACY_SESSION_COOKIES === "false") {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(isSigned ? encodedPayload : rawValue, "base64url").toString("utf8"),
    ) as T & { expiresAt?: number };

    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null;
    }

    return payload as T;
  } catch {
    return null;
  }
}

function buildSessionExpiryPayload(payload: SessionPayload): SessionPayload {
  const now = Date.now();
  return {
    ...payload,
    sessionId: payload.sessionId || randomBytes(16).toString("hex"),
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

function shouldRefreshSession(expiresAt?: number) {
  if (!expiresAt) {
    return true;
  }
  return expiresAt - Date.now() <= SESSION_REFRESH_THRESHOLD_SECONDS * 1000;
}

async function shouldUseSecureCookie() {
  if (COOKIE_SECURE_ENV === "true") {
    return true;
  }

  if (COOKIE_SECURE_ENV === "false") {
    return false;
  }

  const headerStore = await headers();
  const proto = (headerStore.get("x-forwarded-proto") ?? "").toLowerCase();
  return proto.includes("https");
}

export async function createSession(user: UserRecord, activeRoleId?: string) {
  const cookieStore = await cookies();
  const secure = await shouldUseSecureCookie();
  const assignedRoleIds = getAssignedRoleIds(user);
  const resolvedRoleId =
    assignedRoleIds.find((roleId) => roleId === activeRoleId) ??
    assignedRoleIds[0] ??
    user.roleId;

  const nextPayload = buildSessionExpiryPayload({
    userId: user.id,
    roleId: resolvedRoleId,
    name: user.name,
    email: user.email,
    title: user.title,
    sessionId: randomBytes(16).toString("hex"),
  });

  cookieStore.set(
    SESSION_COOKIE,
    encodePayload<SessionPayload>(nextPayload),
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      priority: "high",
    },
  );
}

export async function refreshSessionLifetime(currentSession: SessionPayload) {
  if (!shouldRefreshSession(currentSession.expiresAt)) {
    return { refreshed: false as const, expiresAt: currentSession.expiresAt ?? null };
  }

  const cookieStore = await cookies();
  const secure = await shouldUseSecureCookie();
  const nextPayload = buildSessionExpiryPayload({
    ...currentSession,
    sessionId: currentSession.sessionId || randomBytes(16).toString("hex"),
  });

  cookieStore.set(SESSION_COOKIE, encodePayload<SessionPayload>(nextPayload), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });

  return { refreshed: true as const, expiresAt: nextPayload.expiresAt ?? null };
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function createPendingAuth(user: UserRecord) {
  const cookieStore = await cookies();
  const secure = await shouldUseSecureCookie();

  cookieStore.set(
    PENDING_AUTH_COOKIE,
    encodePayload<PendingAuthPayload>({
      userId: user.id,
      issuedAt: Date.now(),
      expiresAt: Date.now() + PENDING_AUTH_MAX_AGE_SECONDS * 1000,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: PENDING_AUTH_MAX_AGE_SECONDS,
      priority: "high",
    },
  );
}

export async function clearPendingAuth() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_AUTH_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(SESSION_COOKIE)?.value;

  if (!rawValue) {
    return null;
  }

  const payload = decodePayload<SessionPayload>(rawValue);

  if (!payload?.userId || !payload.roleId || !payload.email) {
    return null;
  }

  return payload;
}

export async function getPendingAuth() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(PENDING_AUTH_COOKIE)?.value;

  if (!rawValue) {
    return null;
  }

  const payload = decodePayload<PendingAuthPayload>(rawValue);

  if (!payload?.userId || !payload.issuedAt) {
    return null;
  }

  return payload;
}

export async function getSessionProfile(): Promise<SessionProfile | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const store = await readStore();
  const user = findUserById(store, session.userId);
  const assignedRoleIds = user ? getAssignedRoleIds(user) : [];
  const availableRoles = assignedRoleIds
    .map((roleId) => findRoleById(store, roleId))
    .filter((role): role is Role => Boolean(role));
  const activeRoleId =
    assignedRoleIds.find((roleId) => roleId === session.roleId) ??
    availableRoles[0]?.id ??
    user?.roleId ??
    null;
  const role = activeRoleId ? findRoleById(store, activeRoleId) : null;

  if (!user || !user.active || !role) {
    return null;
  }

  return {
    ...session,
    roleId: activeRoleId,
    role,
    user,
    availableRoles,
  };
}

export async function getPendingAuthProfile(): Promise<PendingAuthProfile | null> {
  const pendingAuth = await getPendingAuth();

  if (!pendingAuth) {
    return null;
  }

  const store = await readStore();
  const user = findUserById(store, pendingAuth.userId);
  const role = user
    ? findRoleById(store, getAssignedRoleIds(user)[0] ?? user.roleId)
    : null;

  if (!user || !user.active) {
    return null;
  }

  return {
    user,
    role,
  };
}

export function getDefaultRouteForRole(role: Role | null) {
  if (!role) {
    return "/login";
  }

  if (role.id === "superuser") {
    return "/admin";
  }

  if (hasPermission(role, "manage_users") || hasPermission(role, "manage_roles")) {
    return "/admin";
  }

  if (role.id === "bdm") {
    return "/bdm";
  }

  if (role.id === "geo-head") {
    return "/geo-head";
  }

  if (role.id === "practice-head") {
    return "/practice-head";
  }

  if (role.id === "buh") {
    return "/buh";
  }

  if (hasPermission(role, "view_dashboard")) {
    return "/executive";
  }

  return "/login?error=no-access";
}

export function canAccessWorkspaceArea(role: Role | null, area: WorkspaceArea) {
  if (!role) {
    return false;
  }

  if (role.id === "superuser") {
    return true;
  }

  if (area === "admin") {
    return (
      hasPermission(role, "manage_users") ||
      hasPermission(role, "manage_roles")
    );
  }

  if (area === "executive") {
    return isRoleFamily(role, "executive");
  }

  if (area === "bdm") {
    return isRoleFamily(role, "bdm");
  }

  if (area === "geo-head") {
    return isRoleFamily(role, "geo-head");
  }

  if (area === "practice-head") {
    return isRoleFamily(role, "practice-head");
  }

  return isRoleFamily(role, "buh");
}

export function canAccessRevenueWorkspace(role: Role | null) {
  return (
    canAccessWorkspaceArea(role, "executive") ||
    canAccessWorkspaceArea(role, "bdm") ||
    canAccessWorkspaceArea(role, "geo-head") ||
    canAccessWorkspaceArea(role, "practice-head") ||
    canAccessWorkspaceArea(role, "buh")
  );
}

export function getWorkspaceRouteBase(role: Role | null): RevenueAccessScope["routeBase"] {
  if (isRoleFamily(role, "bdm")) {
    return "/bdm";
  }
  if (isRoleFamily(role, "geo-head")) {
    return "/geo-head";
  }
  if (isRoleFamily(role, "practice-head")) {
    return "/practice-head";
  }
  if (isRoleFamily(role, "buh")) {
    return "/buh";
  }
  return "/executive";
}

export function getRevenueAccessScope(session: SessionProfile): RevenueAccessScope {
  const routeBase = getWorkspaceRouteBase(session.role);
  const user = session.user;
  const scope: RevenueAccessScope = {
    routeBase,
    financialYears: [],
    practiceHeads: [],
    geoHeads: [],
    bdms: [],
    entities: [],
    verticals: [],
  };

  if (!user || !session.role) {
    return scope;
  }

  if (session.role.id === "bdm") {
    const configuredBdms = parseScopeValues(user.bdm);
    const baseValues =
      configuredBdms.length > 0
        ? configuredBdms
        : parseScopeValues(user.name);
    scope.bdms = expandPersonScopeValues(baseValues, user.name, user.email);
    return scope;
  }

  if (session.role.id === "geo-head") {
    const configuredGeoHeads = parseScopeValues(
      user.geoHeadScopeGeoHeads || user.geoHead || user.geo,
    ).filter((value) => !isGenericScopeValue(value));
    scope.bdms = parseScopeValues(user.geoHeadScopeBdms);
    scope.practiceHeads = parseScopeValues(user.geoHeadScopePracticeHeads);
    scope.entities = parseScopeValues(user.geoHeadScopeEntities);
    scope.verticals = parseScopeValues(user.geoHeadScopeVerticals);
    scope.geoHeads =
      configuredGeoHeads.length > 0
        ? expandPersonScopeValues(configuredGeoHeads, user.name, user.email)
        : [];

    const hasMappedDataScope =
      scope.bdms.length > 0 ||
      scope.practiceHeads.length > 0 ||
      scope.entities.length > 0 ||
      scope.verticals.length > 0;
    if (scope.geoHeads.length === 0 && !hasMappedDataScope) {
      scope.geoHeads = expandPersonScopeValues(parseScopeValues(user.name), user.name, user.email);
    }
    return scope;
  }

  if (session.role.id === "practice-head") {
    const configuredPracticeHeads = parseScopeValues(user.practiceHead || user.practice);
    const baseValues =
      configuredPracticeHeads.length > 0 &&
      !configuredPracticeHeads.every((value) => isGenericScopeValue(value))
        ? configuredPracticeHeads
        : parseScopeValues(user.name);
    scope.practiceHeads = expandPersonScopeValues(baseValues, user.name, user.email);
    return scope;
  }

  if (session.role.id === "buh") {
    scope.bdms = parseScopeValues(user.buhScopeBdms || user.bdm);
    scope.geoHeads = parseScopeValues(user.buhScopeGeoHeads || user.geoHead || user.geo);
    scope.practiceHeads = parseScopeValues(user.buhScopePracticeHeads || user.practiceHead || user.practice);
    scope.entities = parseScopeValues(user.buhScopeEntities || user.entities);
    scope.verticals = parseScopeValues(user.buhScopeVerticals || user.verticals);
    return scope;
  }

  if (session.role.permissions.includes("submit_forecast")) {
    scope.bdms = expandPersonScopeValues(parseScopeValues(user.name), user.name, user.email);
    return scope;
  }

  return scope;
}

export async function requirePermission(permission: PermissionId) {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login");
  }

  if (!hasPermission(session.role, permission)) {
    redirect(getDefaultRouteForRole(session.role));
  }

  return session;
}

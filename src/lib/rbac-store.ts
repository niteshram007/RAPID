import { promises as fs } from "fs";
import path from "path";

import { createTotpSecret, hashPassword, verifyPassword } from "@/lib/security";

export type PermissionId =
  | "view_dashboard"
  | "upload_data"
  | "manage_roles"
  | "manage_users"
  | "export_reports"
  | "configure_alerts"
  | "submit_forecast";

export type ScopeValue = "ALL" | string;

export type CatalogAction = {
  id: PermissionId;
  label: string;
  description: string;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  kind: "system" | "custom";
  color: string;
  permissions: PermissionId[];
  geos: ScopeValue[];
  practices: ScopeValue[];
};

export type EmailOtpPurpose = "onboarding" | "totp-reset" | "account-recovery";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  passwordResetRequired: boolean;
  temporaryPasswordIssuedAt: string | null;
  lastPasswordChangedAt: string | null;
  title: string;
  roleId: string;
  roleIds: string[];
  geo: string;
  practice: string;
  bdm: string;
  geoHead: string;
  practiceHead: string;
  entities: string;
  verticals: string;
  geoHeadScopeBdms: string;
  geoHeadScopeGeoHeads: string;
  geoHeadScopePracticeHeads: string;
  geoHeadScopeEntities: string;
  geoHeadScopeVerticals: string;
  buhScopeBdms: string;
  buhScopeGeoHeads: string;
  buhScopePracticeHeads: string;
  buhScopeEntities: string;
  buhScopeVerticals: string;
  mobileNumber: string;
  active: boolean;
  adminCreated: boolean;
  onboardingCompleted: boolean;
  onboardingStartedAt: string | null;
  emailVerifiedAt: string | null;
  mfaRequired: boolean;
  totpEnabled: boolean;
  totpSecret: string | null;
  totpSetupRequired: boolean;
  lastTotpVerifiedAt: string | null;
  pendingEmailOtpHash: string | null;
  pendingEmailOtpSalt: string | null;
  pendingEmailOtpExpiresAt: string | null;
  pendingEmailOtpPurpose: EmailOtpPurpose | null;
  pendingEmailOtpSentAt: string | null;
  pendingProfileName: string | null;
  pendingMobileNumber: string | null;
  pendingPasswordHash: string | null;
  pendingPasswordSalt: string | null;
  createdAt: string;
  updatedAt: string;
  password?: string;
};

export type RbacStore = {
  catalogs: {
    geos: string[];
    practices: string[];
    actions: CatalogAction[];
  };
  roles: Role[];
  users: UserRecord[];
};

type RawStore = Partial<RbacStore>;

type RawUserRecord = Partial<UserRecord> & {
  password?: string;
};

const STORE_PATH = path.join(process.cwd(), "data", "rbac-store.json");
const STORE_CACHE_TTL_MS = Math.max(
  Number(process.env.RBAC_STORE_CACHE_TTL_MS ?? 2000),
  0,
);

let storeCache: { store: RbacStore; expiresAt: number } | null = null;

const ROLE_COLORS = [
  "from-cyan-500 to-sky-400",
  "from-indigo-500 to-blue-500",
  "from-emerald-500 to-teal-400",
  "from-fuchsia-500 to-rose-400",
  "from-amber-500 to-orange-400",
];

const SYSTEM_ACTIONS: CatalogAction[] = [
  {
    id: "view_dashboard",
    label: "View dashboard",
    description: "Open the protected revenue workspace and portfolio visuals.",
  },
  {
    id: "upload_data",
    label: "Upload data",
    description: "Upload Excel workbooks into the platform data store.",
  },
  {
    id: "manage_roles",
    label: "Manage roles",
    description: "Create roles and define what each access pack can do.",
  },
  {
    id: "manage_users",
    label: "Manage users",
    description: "Create users, assign credentials, and control who can access the system.",
  },
  {
    id: "export_reports",
    label: "Export reports",
    description: "Download packs and share snapshots with leadership.",
  },
  {
    id: "configure_alerts",
    label: "Configure alerts",
    description: "Set up notification rules and exception watchlists.",
  },
  {
    id: "submit_forecast",
    label: "Submit forecast",
    description: "Update monthly BDM forecast submissions before the cut-off date.",
  },
];

const SYSTEM_ROLES: Role[] = [
  {
    id: "superuser",
    name: "Superuser",
    description: "Full control over users, access, roles, MFA, and the platform setup.",
    kind: "system",
    color: "from-slate-950 to-slate-700",
    permissions: [
      "view_dashboard",
      "upload_data",
      "manage_roles",
      "manage_users",
      "export_reports",
      "configure_alerts",
      "submit_forecast",
    ],
    geos: ["ALL"],
    practices: ["ALL"],
  },
  {
    id: "executive",
    name: "Executive",
    description: "Full revenue visibility across every geography and practice.",
    kind: "system",
    color: "from-sky-500 to-cyan-400",
    permissions: ["view_dashboard", "upload_data", "export_reports", "configure_alerts"],
    geos: ["ALL"],
    practices: ["ALL"],
  },
  {
    id: "bdm",
    name: "BDM",
    description: "Own-book view with access to monthly forecast submission.",
    kind: "system",
    color: "from-emerald-500 to-teal-400",
    permissions: ["view_dashboard", "export_reports", "submit_forecast"],
    geos: ["ALL"],
    practices: ["ALL"],
  },
  {
    id: "geo-head",
    name: "Geo Head",
    description: "Region and geo leadership view without Neural Switch.",
    kind: "system",
    color: "from-indigo-500 to-blue-500",
    permissions: ["view_dashboard", "export_reports", "configure_alerts"],
    geos: ["ALL"],
    practices: ["ALL"],
  },
  {
    id: "practice-head",
    name: "Practice Head",
    description: "Practice leadership workspace without Neural Switch.",
    kind: "system",
    color: "from-amber-500 to-orange-400",
    permissions: ["view_dashboard", "export_reports", "configure_alerts"],
    geos: ["ALL"],
    practices: ["ALL"],
  },
  {
    id: "buh",
    name: "BUH",
    description: "Business unit head workspace scoped by entity, vertical, geo head, practice head, and BDM.",
    kind: "system",
    color: "from-cyan-600 to-teal-500",
    permissions: ["view_dashboard", "export_reports", "configure_alerts"],
    geos: ["ALL"],
    practices: ["ALL"],
  },
];

function buildDefaultStore(): RbacStore {
  return {
    catalogs: {
      geos: [],
      practices: [],
      actions: [...SYSTEM_ACTIONS],
    },
    roles: [...SYSTEM_ROLES],
    users: [],
  };
}

async function ensureStoreFile() {
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(
      STORE_PATH,
      `${JSON.stringify(buildDefaultStore(), null, 2)}\n`,
      "utf8",
    );
  }
}

function serializeStore(store: RbacStore): RbacStore {
  return {
    ...store,
    users: store.users.map((user) => {
      const nextUser = { ...user };
      delete nextUser.password;
      return nextUser;
    }),
  };
}

function cloneStore(store: RbacStore): RbacStore {
  if (typeof structuredClone === "function") {
    return structuredClone(store);
  }

  return JSON.parse(JSON.stringify(store)) as RbacStore;
}

function normalizeActions(actions: CatalogAction[] | undefined) {
  const normalized = [...(actions ?? [])];
  for (const action of SYSTEM_ACTIONS) {
    if (!normalized.some((entry) => entry.id === action.id)) {
      normalized.push(action);
    }
  }
  return normalized;
}

async function normalizeUserRecord(rawUser: RawUserRecord, index: number) {
  const fallbackTimestamp = new Date().toISOString();
  const hadTotpHistory = rawUser.lastTotpVerifiedAt != null;
  const hasPasswordCredentials = Boolean(rawUser.passwordHash && rawUser.passwordSalt);
  const onboardingCompleted =
    rawUser.onboardingCompleted ?? (hasPasswordCredentials || Boolean(rawUser.password));
  const requestedRoleIds = Array.isArray(rawUser.roleIds) ? rawUser.roleIds : [];
  const normalizedRoleIds = Array.from(
    new Set(
      [...requestedRoleIds, rawUser.roleId ?? "executive"]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
  const roleIds = normalizedRoleIds.length > 0 ? normalizedRoleIds : ["executive"];
  const user: UserRecord = {
    id: rawUser.id ?? `user-${index + 1}`,
    name: rawUser.name ?? "New User",
    email: rawUser.email?.trim().toLowerCase() ?? "",
    passwordHash: rawUser.passwordHash ?? "",
    passwordSalt: rawUser.passwordSalt ?? "",
    passwordResetRequired: rawUser.passwordResetRequired ?? false,
    temporaryPasswordIssuedAt: rawUser.temporaryPasswordIssuedAt ?? null,
    lastPasswordChangedAt:
      rawUser.lastPasswordChangedAt ?? rawUser.updatedAt ?? rawUser.createdAt ?? null,
    title: rawUser.title ?? "Team Member",
    roleId: roleIds[0] ?? "executive",
    roleIds,
    geo: rawUser.geo ?? "Global",
    practice: rawUser.practice ?? "Portfolio",
    bdm: rawUser.bdm ?? rawUser.name ?? "",
    geoHead: rawUser.geoHead ?? rawUser.geo ?? "",
    practiceHead: rawUser.practiceHead ?? rawUser.practice ?? "",
    entities: rawUser.entities ?? "",
    verticals: rawUser.verticals ?? "",
    geoHeadScopeBdms: rawUser.geoHeadScopeBdms ?? rawUser.bdm ?? "",
    geoHeadScopeGeoHeads: rawUser.geoHeadScopeGeoHeads ?? rawUser.geoHead ?? rawUser.geo ?? "",
    geoHeadScopePracticeHeads: rawUser.geoHeadScopePracticeHeads ?? "",
    geoHeadScopeEntities: rawUser.geoHeadScopeEntities ?? rawUser.entities ?? "",
    geoHeadScopeVerticals: rawUser.geoHeadScopeVerticals ?? rawUser.verticals ?? "",
    buhScopeBdms: rawUser.buhScopeBdms ?? rawUser.bdm ?? "",
    buhScopeGeoHeads: rawUser.buhScopeGeoHeads ?? rawUser.geoHead ?? rawUser.geo ?? "",
    buhScopePracticeHeads: rawUser.buhScopePracticeHeads ?? "",
    buhScopeEntities: rawUser.buhScopeEntities ?? rawUser.entities ?? "",
    buhScopeVerticals: rawUser.buhScopeVerticals ?? rawUser.verticals ?? "",
    mobileNumber: rawUser.mobileNumber ?? "",
    active: rawUser.active ?? true,
    adminCreated: rawUser.adminCreated ?? true,
    onboardingCompleted,
    onboardingStartedAt: rawUser.onboardingStartedAt ?? null,
    emailVerifiedAt: rawUser.emailVerifiedAt ?? (onboardingCompleted ? rawUser.updatedAt ?? rawUser.createdAt ?? fallbackTimestamp : null),
    mfaRequired: rawUser.mfaRequired ?? true,
    totpEnabled: rawUser.totpEnabled ?? false,
    totpSecret: rawUser.totpSecret ?? null,
    totpSetupRequired:
      rawUser.totpSetupRequired ?? (rawUser.mfaRequired ? !rawUser.totpEnabled : false),
    lastTotpVerifiedAt: null,
    pendingEmailOtpHash: rawUser.pendingEmailOtpHash ?? null,
    pendingEmailOtpSalt: rawUser.pendingEmailOtpSalt ?? null,
    pendingEmailOtpExpiresAt: rawUser.pendingEmailOtpExpiresAt ?? null,
    pendingEmailOtpPurpose: rawUser.pendingEmailOtpPurpose ?? null,
    pendingEmailOtpSentAt: rawUser.pendingEmailOtpSentAt ?? null,
    pendingProfileName: rawUser.pendingProfileName ?? null,
    pendingMobileNumber: rawUser.pendingMobileNumber ?? null,
    pendingPasswordHash: rawUser.pendingPasswordHash ?? null,
    pendingPasswordSalt: rawUser.pendingPasswordSalt ?? null,
    createdAt: rawUser.createdAt ?? fallbackTimestamp,
    updatedAt: rawUser.updatedAt ?? rawUser.createdAt ?? fallbackTimestamp,
    password: rawUser.password,
  };

  let changed = false;

  if ((!user.passwordHash || !user.passwordSalt) && rawUser.password) {
    const hashedPassword = await hashPassword(rawUser.password);
    user.passwordHash = hashedPassword.hash;
    user.passwordSalt = hashedPassword.salt;
    changed = true;
  }

  if (user.onboardingCompleted && user.mfaRequired && !user.totpSecret) {
    user.totpSecret = createTotpSecret();
    user.totpSetupRequired = true;
    changed = true;
  }

  if (!user.onboardingCompleted) {
    user.totpEnabled = false;
    user.totpSecret = null;
    user.totpSetupRequired = user.mfaRequired;
    user.lastTotpVerifiedAt = null;
  }

  if (!user.mfaRequired) {
    user.totpEnabled = false;
    user.totpSecret = null;
    user.totpSetupRequired = false;
    user.lastTotpVerifiedAt = null;
  }

  if (user.password) {
    changed = true;
  }
  if (hadTotpHistory) {
    changed = true;
  }

  return {
    user,
    changed,
  };
}

export async function readStore(): Promise<RbacStore> {
  if (storeCache && Date.now() < storeCache.expiresAt) {
    return cloneStore(storeCache.store);
  }

  await ensureStoreFile();
  const raw = JSON.parse(await fs.readFile(STORE_PATH, "utf8")) as RawStore;
  const roles = [...(raw.roles ?? [])];
  const users = [];
  let changed = false;

  for (const systemRole of SYSTEM_ROLES) {
    if (!roles.some((role) => role.id === systemRole.id)) {
      roles.push(systemRole);
      changed = true;
    }
  }

  for (const [index, rawUser] of (raw.users ?? []).entries()) {
    const normalized = await normalizeUserRecord(rawUser, index);
    users.push(normalized.user);
    changed = changed || normalized.changed;
  }

  const store: RbacStore = {
    catalogs: {
      geos: raw.catalogs?.geos ?? [],
      practices: raw.catalogs?.practices ?? [],
      actions: normalizeActions(raw.catalogs?.actions),
    },
    roles,
    users,
  };

  const serializedStore = serializeStore(store);

  if (changed) {
    await fs.writeFile(
      STORE_PATH,
      `${JSON.stringify(serializedStore, null, 2)}\n`,
      "utf8",
    );
  }

  storeCache = {
    store: serializedStore,
    expiresAt: Date.now() + STORE_CACHE_TTL_MS,
  };

  return cloneStore(serializedStore);
}

export async function writeStore(store: RbacStore) {
  const serializedStore = serializeStore(store);
  await fs.writeFile(
    STORE_PATH,
    `${JSON.stringify(serializedStore, null, 2)}\n`,
    "utf8",
  );
  storeCache = {
    store: serializedStore,
    expiresAt: Date.now() + STORE_CACHE_TTL_MS,
  };
}

export function hasPermission(role: Role | null, permission: PermissionId) {
  return role?.permissions.includes(permission) ?? false;
}

export function findRoleById(store: RbacStore, roleId: string) {
  return store.roles.find((role) => role.id === roleId) ?? null;
}

export function findUserById(store: RbacStore, userId: string) {
  return store.users.find((user) => user.id === userId) ?? null;
}

export function findUserByEmail(store: RbacStore, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return store.users.find((user) => user.email === normalizedEmail) ?? null;
}

export function getAssignedRoleIds(user: UserRecord) {
  return Array.from(
    new Set(
      [user.roleId, ...(user.roleIds ?? [])]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export async function verifyUserPassword(user: UserRecord, password: string) {
  if (!user.passwordHash || !user.passwordSalt) {
    return false;
  }

  return verifyPassword({
    password,
    passwordHash: user.passwordHash,
    passwordSalt: user.passwordSalt,
  });
}

export function slugifyRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeScopeSelection(
  values: string[],
  catalog: string[],
): ScopeValue[] {
  if (values.includes("ALL") || values.length === 0) {
    return ["ALL"];
  }

  const uniqueValues = Array.from(
    new Set(values.filter((value) => catalog.includes(value))),
  );

  return uniqueValues.length > 0 ? uniqueValues : ["ALL"];
}

export function formatScopeLabel(scope: ScopeValue[]) {
  if (scope.includes("ALL")) {
    return "All";
  }

  return scope.join(", ");
}

export function nextRoleColor(roleCount: number) {
  return ROLE_COLORS[roleCount % ROLE_COLORS.length];
}

export function isRoleFamily(
  role: Role | null,
  roleId: "superuser" | "executive" | "bdm" | "geo-head" | "practice-head" | "buh",
) {
  return role?.id === roleId;
}

export async function ensureUserTotpSecret(userId: string) {
  const store = await readStore();
  const user = findUserById(store, userId);

  if (!user) {
    return null;
  }

  if (!user.totpSecret) {
    user.totpSecret = createTotpSecret();
    user.totpSetupRequired = user.mfaRequired;
    user.updatedAt = new Date().toISOString();
    await writeStore(store);
  }

  return user;
}

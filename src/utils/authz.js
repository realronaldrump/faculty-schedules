export const USER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  DISABLED: "disabled",
};

export const DEFAULT_ROLES = ["admin", "staff", "faculty"];
const ALLOWED_ROLES = new Set(DEFAULT_ROLES);

const PAGE_ID_ALIASES = {
  "people/people-directory": "people/directory",
  "scheduling/faculty-schedules": "scheduling/faculty",
  "scheduling/room-schedules": "scheduling/rooms",
  "scheduling/student-schedules": "scheduling/student-workers",
  "analytics/course-management": "data/schedule-data",
  "analytics/program-management": "people/programs",
  "tools/import-wizard": "data/import-wizard",
  "tools/crn-tools": "data/crn-tools",
  "tools/data-hygiene": "admin/data-hygiene",
  "tools/room-grid-generator": "scheduling/rooms",
  "tools/outlook-export": "scheduling/rooms",
  "administration/app-settings": "admin/settings",
  "administration/access-control": "admin/access-control",
  "resources/baylor-acronyms": "help/acronyms",
  "resources/baylor-systems": "help/baylor-systems",
};

export const normalizePageId = (pageId) => {
  if (!pageId || typeof pageId !== "string") return pageId;
  const trimmed = pageId.trim();
  if (!trimmed) return trimmed;
  const base = trimmed.replace(/^\/+/, "").split(/[?#]/)[0];
  return PAGE_ID_ALIASES[base] || base;
};

const normalizePagePermissions = (pages) => {
  if (!pages || typeof pages !== "object") return {};
  const normalized = {};
  Object.entries(pages).forEach(([key, value]) => {
    const normalizedKey = normalizePageId(key);
    if (!normalizedKey) return;
    if (value === true) {
      normalized[normalizedKey] = true;
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) {
      normalized[normalizedKey] = Boolean(value);
    }
  });
  return normalized;
};

export const normalizeRoleList = (roles) => {
  if (Array.isArray(roles)) {
    return roles.filter((role) => role && ALLOWED_ROLES.has(role));
  }
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter(
      (key) => roles[key] && ALLOWED_ROLES.has(key),
    );
  }
  if (typeof roles === "string" && roles.trim()) {
    const trimmed = roles.trim();
    return ALLOWED_ROLES.has(trimmed) ? [trimmed] : [];
  }
  return [];
};

export const resolveUserStatus = (profile) => {
  if (!profile) return null;
  if (profile.disabled === true) return USER_STATUS.DISABLED;
  const status = profile.status;
  if (status === USER_STATUS.DISABLED) return USER_STATUS.DISABLED;
  if (status === USER_STATUS.PENDING) return USER_STATUS.PENDING;
  if (status === USER_STATUS.ACTIVE) return USER_STATUS.ACTIVE;
  const roles = normalizeRoleList(profile.roles);
  if (roles.length === 0) return USER_STATUS.PENDING;
  return USER_STATUS.ACTIVE;
};

export const isUserAdmin = (profile) =>
  normalizeRoleList(profile?.roles).includes("admin");

export const isUserActive = (profile) =>
  resolveUserStatus(profile) === USER_STATUS.ACTIVE;

export const isUserPending = (profile) =>
  resolveUserStatus(profile) === USER_STATUS.PENDING;

export const isUserDisabled = (profile) =>
  resolveUserStatus(profile) === USER_STATUS.DISABLED;

export const normalizeRolePermissions = (raw) => {
  const input = raw || {};
  const roleKeys = new Set(DEFAULT_ROLES);
  const normalized = {};

  roleKeys.forEach((role) => {
    const value = input[role];
    if (value && typeof value === "object") {
      normalized[role] = {
        pages: normalizePagePermissions(value.pages),
        actions:
          value.actions && typeof value.actions === "object"
            ? { ...value.actions }
            : {},
      };
    } else {
      normalized[role] = { pages: {}, actions: {} };
    }
  });

  if (!normalized.admin) normalized.admin = { pages: {} };
  if (
    !normalized.admin.pages ||
    Object.keys(normalized.admin.pages).length === 0
  ) {
    normalized.admin.pages = { "*": true };
  }

  return normalized;
};

export const canAccessPage = ({ userProfile, rolePermissions, pageId }) => {
  if (!pageId) return false;
  if (!userProfile) return false;
  const normalizedId = normalizePageId(pageId);
  if (!normalizedId) return false;
  const rawId =
    typeof pageId === "string"
      ? pageId.replace(/^\/+/, "").split(/[?#]/)[0]
      : pageId;
  const pageIds =
    rawId && rawId !== normalizedId ? [normalizedId, rawId] : [normalizedId];
  if (isUserAdmin(userProfile)) return true;
  if (!isUserActive(userProfile)) return false;

  const userPerm =
    userProfile.permissions &&
    pageIds.find((pid) =>
      Object.prototype.hasOwnProperty.call(userProfile.permissions, pid),
    );
  if (userPerm) {
    return Boolean(userProfile.permissions[userPerm]);
  }

  if (!rolePermissions) {
    console.warn("[authz] canAccessPage called without rolePermissions");
    return false;
  }
  const normalized = normalizeRolePermissions(rolePermissions);
  const roles = normalizeRoleList(userProfile.roles);
  for (const role of roles) {
    const rp = normalized[role] || { pages: {} };
    const pages = rp.pages || {};
    if (pages["*"] === true) return true;
    if (pageIds.some((pid) => pages[pid] === true)) return true;
  }
  return false;
};

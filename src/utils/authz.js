export const USER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  DISABLED: "disabled",
};

export const DEFAULT_ROLES = ["admin", "staff", "faculty"];
const ALLOWED_ROLES = new Set(DEFAULT_ROLES);

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
        pages:
          value.pages && typeof value.pages === "object"
            ? { ...value.pages }
            : {},
      };
    } else {
      normalized[role] = { pages: {} };
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
  if (isUserAdmin(userProfile)) return true;
  if (!isUserActive(userProfile)) return false;

  const userPerm =
    userProfile.permissions &&
    Object.prototype.hasOwnProperty.call(userProfile.permissions, pageId)
      ? Boolean(userProfile.permissions[pageId])
      : undefined;
  if (typeof userPerm === "boolean") return userPerm;

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
    if (pages[pageId] === true) return true;
  }
  return false;
};
